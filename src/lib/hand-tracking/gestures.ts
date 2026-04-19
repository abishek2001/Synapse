/**
 * Gesture detection from MediaPipe hand landmarks (21 landmarks per hand).
 *
 * Designed for AFK canvas control — the user reads the canvas and steers it
 * with their hands while voice handles questions. The state machine prizes
 * stability over snappy response: every gesture transition is gated through a
 * temporal majority filter so a single mis-classified frame can't flicker the
 * cursor between modes mid-action.
 *
 * Landmark indices (mirrored to feel natural in the camera preview):
 *   0  wrist
 *   4  thumb tip            5  index MCP
 *   8  index tip            6  index PIP
 *   12 middle tip           9  middle MCP
 *   16 ring tip             13 ring MCP
 *   20 pinky tip            17 pinky MCP
 *
 * Gestures emitted:
 *   point     – only index extended  → precise cursor (no action)
 *   openPalm  – all four long fingers extended → idle / cursor visible
 *   pinch     – thumb tip near index tip (palm/fist agnostic) → click / drag
 *   fist      – all four long fingers curled, thumb in → pan canvas
 *   peace     – index + middle extended, others curled → zoom mode
 *   none      – hand not visible / unrecognised pose
 */

export interface Point { x: number; y: number; z: number }

export type Gesture = "none" | "point" | "openPalm" | "pinch" | "fist" | "peace";

export interface HandFrame {
  gesture: Gesture;
  /** Cursor position in normalised [0..1] camera coords. Always the index tip
   *  (or the pinch midpoint if pinching) — NEVER varies with gesture so the
   *  cursor stays put across gesture transitions. */
  cursor: { x: number; y: number };
  /** Normalised thumb-index distance, used by callers that want to render a
   *  pinch-strength halo. */
  pinchDist: number;
  /** Normalised distance from wrist to middle MCP — proxy for hand size,
   *  useful to make thresholds independent of how close to the camera. */
  handScale: number;
  /** True if a hand was found. */
  visible: boolean;
}

// ── Tunables ────────────────────────────────────────────────────────────────

/** Pinch threshold as a fraction of hand scale. ON < threshold; OFF > release.
 *  Hysteresis prevents pinch flicker when the fingers are right at the limit. */
const PINCH_ON  = 0.45;
const PINCH_OFF = 0.65;

/** Pose history depth — how many recent frames we average to suppress jitter.
 *  Pinch is checked separately with hysteresis so it stays snappy. */
const HISTORY = 5;
const MAJORITY = 3; // ≥3 of last 5 frames must agree before we transition

// ── Helpers ─────────────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Is a finger "extended"? Compare distance(tip→wrist) vs distance(pip→wrist).
 *  Tips of extended fingers sit further from the wrist than the PIP joint.
 *  Using wrist as reference (instead of MCP) is more robust because the MCP
 *  is on the same line as PIP/TIP for curled fingers, which produces noisy
 *  ratios. */
function fingerExtended(tip: Point, pip: Point, wrist: Point): boolean {
  return dist(tip, wrist) > dist(pip, wrist) * 1.08;
}

/** Thumb extended check is different — thumb bends sideways, not down.
 *  We measure thumb tip distance from index MCP relative to thumb-CMC's
 *  distance. Thumb is "in" (folded across palm) when its tip is closer to
 *  the index MCP than its own base. */
function thumbExtended(landmarks: Point[]): boolean {
  const thumbTip  = landmarks[4];
  const thumbIp   = landmarks[3];
  const indexMcp  = landmarks[5];
  const wrist     = landmarks[0];
  // Use the wrist→thumb-tip distance vs wrist→IP distance.
  return dist(thumbTip, wrist) > dist(thumbIp, wrist) * 1.05
    && dist(thumbTip, indexMcp) > dist(thumbIp, indexMcp) * 0.85;
}

// ── Per-hand classifier ─────────────────────────────────────────────────────

/** Classify a single frame's pose without considering history.
 *  History/hysteresis is layered on top by HandStateMachine. */
function classifyFrame(landmarks: Point[]): { gesture: Gesture; pinchDist: number; handScale: number; pinching: boolean; cursor: { x: number; y: number } } {
  const wrist     = landmarks[0];
  const middleMcp = landmarks[9];
  const handScale = Math.max(dist(wrist, middleMcp), 1e-6);

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const pinchDistRaw = dist(thumbTip, indexTip);
  const pinchNorm    = pinchDistRaw / handScale;

  const indexUp  = fingerExtended(landmarks[8],  landmarks[6],  wrist);
  const middleUp = fingerExtended(landmarks[12], landmarks[10], wrist);
  const ringUp   = fingerExtended(landmarks[16], landmarks[14], wrist);
  const pinkyUp  = fingerExtended(landmarks[20], landmarks[18], wrist);
  const thumbUp  = thumbExtended(landmarks);

  // Cursor — index tip when not pinching, midpoint of thumb-index when pinching
  // (matches the visual centre of the user's pinch gesture).
  const pinching = pinchNorm < PINCH_ON;
  const cursor = pinching
    ? { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 }
    : { x: indexTip.x, y: indexTip.y };

  // Pinch beats every other classification — even if the user is also showing
  // an "open palm" silhouette, fingertips touching ⇒ they want to grab.
  if (pinching) {
    return { gesture: "pinch", pinchDist: pinchNorm, handScale, pinching, cursor };
  }

  // Peace sign — index + middle up, ring + pinky down (thumb either way)
  if (indexUp && middleUp && !ringUp && !pinkyUp) {
    return { gesture: "peace", pinchDist: pinchNorm, handScale, pinching, cursor };
  }

  // Open palm — all four long fingers up
  if (indexUp && middleUp && ringUp && pinkyUp) {
    return { gesture: "openPalm", pinchDist: pinchNorm, handScale, pinching, cursor };
  }

  // Pure point — only index up
  if (indexUp && !middleUp && !ringUp && !pinkyUp) {
    return { gesture: "point", pinchDist: pinchNorm, handScale, pinching, cursor };
  }

  // Fist — no long fingers up. Thumb may be tucked or wrapped.
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    return { gesture: "fist", pinchDist: pinchNorm, handScale, pinching, cursor };
  }

  // Anything else — treat as a "point" so the cursor stays controllable while
  // the user transitions between poses (e.g. half-open palm). Better UX than
  // dropping to "none" and losing the cursor mid-motion.
  return { gesture: "point", pinchDist: pinchNorm, handScale, pinching, cursor };
}

// ── State machine ───────────────────────────────────────────────────────────

/** Per-hand state machine — applies temporal majority filtering on top of
 *  raw classification so transient mis-classifications don't flicker the
 *  emitted gesture. Pinch is exempt from the filter (handled with its own
 *  hysteresis at the classifier level) to keep clicks snappy. */
export class HandStateMachine {
  private history: Gesture[] = [];
  private current: Gesture = "none";
  private wasPinching = false;

  reset() {
    this.history = [];
    this.current = "none";
    this.wasPinching = false;
  }

  step(landmarks: Point[] | null): HandFrame {
    if (!landmarks || landmarks.length < 21) {
      this.history.push("none");
      if (this.history.length > HISTORY) this.history.shift();
      this.current = "none";
      this.wasPinching = false;
      return {
        gesture: "none",
        cursor: { x: 0, y: 0 },
        pinchDist: 1,
        handScale: 0,
        visible: false,
      };
    }

    const raw = classifyFrame(landmarks);

    // Pinch hysteresis — once pinching, require fingers to spread further
    // than PINCH_OFF before releasing.
    let resolvedGesture = raw.gesture;
    if (this.wasPinching) {
      if (raw.pinchDist < PINCH_OFF) {
        resolvedGesture = "pinch";
      } else {
        this.wasPinching = false;
        // Re-classify without forcing pinch — but use raw to pick base pose
        resolvedGesture = raw.gesture === "pinch" ? "openPalm" : raw.gesture;
      }
    } else if (raw.gesture === "pinch") {
      this.wasPinching = true;
    }

    // Push into majority-filter history (pinch exempt — instant transitions)
    this.history.push(resolvedGesture);
    if (this.history.length > HISTORY) this.history.shift();

    let next: Gesture;
    if (resolvedGesture === "pinch" || this.current === "pinch") {
      // Pinch transitions are instant in both directions
      next = resolvedGesture;
    } else {
      // Majority vote across history — only switch when ≥MAJORITY agree
      const counts: Record<string, number> = {};
      for (const g of this.history) counts[g] = (counts[g] ?? 0) + 1;
      const [topGesture, topCount] = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])[0] as [Gesture, number];
      next = topCount >= MAJORITY ? topGesture : this.current;
      if (next === "none" && resolvedGesture !== "none") next = this.current;
    }

    this.current = next;

    return {
      gesture: next,
      cursor: raw.cursor,
      pinchDist: raw.pinchDist,
      handScale: raw.handScale,
      visible: true,
    };
  }
}

// ── Two-hand combined gesture ───────────────────────────────────────────────

export interface TwoHandFrame {
  /** True when both hands are simultaneously pinching — used by the overlay
   *  to enter a multi-touch-style pinch-zoom + pan mode. */
  bothPinching: boolean;
  /** Distance between the two pinch points, in normalised camera units.
   *  Defined only when both hands are visible. */
  spread: number;
  /** Midpoint between the two pinch points in normalised camera units.
   *  Defined only when both hands are visible. */
  mid: { x: number; y: number };
}

export function combineHands(left: HandFrame | null, right: HandFrame | null): TwoHandFrame | null {
  if (!left?.visible || !right?.visible) return null;
  const spread = Math.hypot(left.cursor.x - right.cursor.x, left.cursor.y - right.cursor.y);
  const mid = {
    x: (left.cursor.x + right.cursor.x) / 2,
    y: (left.cursor.y + right.cursor.y) / 2,
  };
  return {
    bothPinching: left.gesture === "pinch" && right.gesture === "pinch",
    spread,
    mid,
  };
}

// ── Backwards-compat shim ───────────────────────────────────────────────────
// Older callers imported a stateless `detectGesture` and a `resetGestureState`.
// Keep them exported (delegating to a singleton machine) so existing imports
// don't break during the refactor.

export type GestureType = Gesture;
export interface GestureResult {
  gesture: GestureType;
  cursor: { x: number; y: number };
  pinchDistance: number;
  confidence: number;
}

const legacyMachine = new HandStateMachine();

export function detectGesture(landmarks: Point[]): GestureResult {
  const f = legacyMachine.step(landmarks);
  return {
    gesture: f.gesture,
    cursor: f.cursor,
    pinchDistance: f.pinchDist,
    confidence: f.visible ? 0.9 : 0,
  };
}

export function resetGestureState(): void {
  legacyMachine.reset();
}
