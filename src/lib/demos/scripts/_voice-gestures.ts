import type { DemoModule } from "../types";

/** Shared "Take the wheel" module appended to topical demos (heart, black hole)
 *  to showcase the voice + hand-tracking control surface. The module:
 *
 *  1. Drops a hierarchy diagram naming the five gestures we recognise.
 *  2. Drops a flowchart of the most useful voice commands grouped by intent.
 *  3. Adds two "try this" sticky notes in the margin.
 *  4. Fires the `synapse:set_hand_tracking` and `synapse:show_help` side
 *     effects so the camera comes online and the gesture cheatsheet pops
 *     open the moment the module lands.
 *
 *  Per-topic flavour (the lead-in sentence, group title) is parameterised so
 *  the module sounds native to whichever demo it's appended to.
 */
export function voiceGesturesModule(topicLabel: string): DemoModule {
  return {
    title: "Take the wheel — voice & hands",
    writtenText:
      `Now that you've seen ${topicLabel}, drive Synapse yourself. ` +
      `Speak to it like a study partner ("zoom in", "fit all", "next module"), ` +
      `or steer the canvas with your hands — point to hover, pinch to grab, ` +
      `make a fist to pan, peace sign to zoom. We just turned your camera on ` +
      `and opened the cheatsheet. Try it: lift your hand and pinch.`,
    spokenText:
      `Now you drive. Try saying "fit all", "zoom in", or "next module". ` +
      `Or use your hands — pinch to grab, fist to pan, peace sign to zoom. ` +
      `Your camera is on and the cheatsheet is open.`,
    artifacts: [
      // ── 1. Gesture cheatsheet (hierarchy of the five gestures) ───────────
      {
        id: "vg-vis-gestures",
        type: "visual",
        title: "Five gestures",
        status: "rendered",
        description: "Recognised by the webcam.",
        style: "hierarchy",
        svgContent: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
          <rect x="100" y="6" width="120" height="26" rx="6" fill="#7c3aed" opacity="0.18" stroke="#7c3aed" stroke-width="1.4"/>
          <text x="160" y="23" text-anchor="middle" font-size="10" fill="#7c3aed" font-weight="700" font-family="system-ui,sans-serif">Hand gestures</text>

          <line x1="160" y1="32" x2="40"  y2="56" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
          <line x1="160" y1="32" x2="100" y2="56" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
          <line x1="160" y1="32" x2="160" y2="56" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
          <line x1="160" y1="32" x2="220" y2="56" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
          <line x1="160" y1="32" x2="280" y2="56" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>

          <rect x="6"   y="56" width="68" height="62" rx="6" fill="#0ea5e9" opacity="0.10" stroke="#0ea5e9" stroke-width="1"/>
          <text x="40"  y="74" text-anchor="middle" font-size="22">☝️</text>
          <text x="40"  y="94" text-anchor="middle" font-size="9" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Point</text>
          <text x="40"  y="108" text-anchor="middle" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Hover cursor</text>

          <rect x="80"  y="56" width="68" height="62" rx="6" fill="#10b981" opacity="0.10" stroke="#10b981" stroke-width="1"/>
          <text x="114" y="74" text-anchor="middle" font-size="22">🖐️</text>
          <text x="114" y="94" text-anchor="middle" font-size="9" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Open palm</text>
          <text x="114" y="108" text-anchor="middle" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Idle / ready</text>

          <rect x="156" y="56" width="68" height="62" rx="6" fill="#f59e0b" opacity="0.10" stroke="#f59e0b" stroke-width="1"/>
          <text x="190" y="74" text-anchor="middle" font-size="22">🤏</text>
          <text x="190" y="94" text-anchor="middle" font-size="9" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Pinch</text>
          <text x="190" y="108" text-anchor="middle" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Grab / click</text>

          <rect x="232" y="56" width="68" height="62" rx="6" fill="#b43040" opacity="0.10" stroke="#b43040" stroke-width="1"/>
          <text x="266" y="74" text-anchor="middle" font-size="22">✊</text>
          <text x="266" y="94" text-anchor="middle" font-size="9" fill="#b43040" font-weight="600" font-family="system-ui,sans-serif">Fist</text>
          <text x="266" y="108" text-anchor="middle" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Pan canvas</text>

          <line x1="160" y1="118" x2="160" y2="138" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
          <rect x="118" y="138" width="84" height="50" rx="6" fill="#ec4899" opacity="0.10" stroke="#ec4899" stroke-width="1"/>
          <text x="160" y="156" text-anchor="middle" font-size="22">✌️</text>
          <text x="160" y="174" text-anchor="middle" font-size="9" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">Peace</text>
          <text x="160" y="184" text-anchor="middle" font-size="6.5" fill="rgba(0,0,0,0.55)" font-family="system-ui,sans-serif">Zoom (move up/down)</text>
        </svg>`,
      },

      // ── 2. Voice command map (flowchart of intent groups) ────────────────
      {
        id: "vg-vis-voice",
        type: "visual",
        title: "Voice commands",
        status: "rendered",
        description: "Spoken phrases the canvas listens for.",
        style: "flowchart",
        svgContent: `<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
          <rect x="106" y="6" width="108" height="22" rx="5" fill="#7c3aed" opacity="0.18" stroke="#7c3aed" stroke-width="1.2"/>
          <text x="160" y="21" text-anchor="middle" font-size="9.5" fill="#7c3aed" font-weight="700" font-family="system-ui,sans-serif">🎙  Say it out loud</text>

          <line x1="160" y1="28" x2="60"  y2="50" stroke="#7c3aed" stroke-width="1" opacity="0.25"/>
          <line x1="160" y1="28" x2="160" y2="50" stroke="#7c3aed" stroke-width="1" opacity="0.25"/>
          <line x1="160" y1="28" x2="260" y2="50" stroke="#7c3aed" stroke-width="1" opacity="0.25"/>

          <rect x="14"  y="50" width="92" height="20" rx="4" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" stroke-width="1"/>
          <text x="60"  y="64" text-anchor="middle" font-size="8.5" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Zoom &amp; view</text>
          <text x="60"  y="80" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"zoom in"</text>
          <text x="60"  y="91" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"fit all"</text>
          <text x="60"  y="102" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"reset zoom"</text>

          <rect x="114" y="50" width="92" height="20" rx="4" fill="#10b981" opacity="0.15" stroke="#10b981" stroke-width="1"/>
          <text x="160" y="64" text-anchor="middle" font-size="8.5" fill="#10b981" font-weight="600" font-family="system-ui,sans-serif">Modules</text>
          <text x="160" y="80" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"next module"</text>
          <text x="160" y="91" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"go back"</text>
          <text x="160" y="102" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"module three"</text>

          <rect x="214" y="50" width="92" height="20" rx="4" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" stroke-width="1"/>
          <text x="260" y="64" text-anchor="middle" font-size="8.5" fill="#f59e0b" font-weight="600" font-family="system-ui,sans-serif">Speech</text>
          <text x="260" y="80" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"stop"</text>
          <text x="260" y="91" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"replay"</text>
          <text x="260" y="102" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"say it again"</text>

          <line x1="160" y1="118" x2="60"  y2="140" stroke="#7c3aed" stroke-width="1" opacity="0.25"/>
          <line x1="160" y1="118" x2="160" y2="140" stroke="#7c3aed" stroke-width="1" opacity="0.25"/>
          <line x1="160" y1="118" x2="260" y2="140" stroke="#7c3aed" stroke-width="1" opacity="0.25"/>

          <rect x="14"  y="140" width="92" height="20" rx="4" fill="#b43040" opacity="0.15" stroke="#b43040" stroke-width="1"/>
          <text x="60"  y="154" text-anchor="middle" font-size="8.5" fill="#b43040" font-weight="600" font-family="system-ui,sans-serif">Pan</text>
          <text x="60"  y="170" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"pan left"</text>
          <text x="60"  y="181" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"scroll down"</text>

          <rect x="114" y="140" width="92" height="20" rx="4" fill="#ec4899" opacity="0.15" stroke="#ec4899" stroke-width="1"/>
          <text x="160" y="154" text-anchor="middle" font-size="8.5" fill="#ec4899" font-weight="600" font-family="system-ui,sans-serif">Selection</text>
          <text x="160" y="170" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"select all"</text>
          <text x="160" y="181" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"deselect"</text>

          <rect x="214" y="140" width="92" height="20" rx="4" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1"/>
          <text x="260" y="154" text-anchor="middle" font-size="8.5" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Help</text>
          <text x="260" y="170" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"show gestures"</text>
          <text x="260" y="181" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.6)" font-family="system-ui,sans-serif">"undo"</text>

          <text x="160" y="206" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif" font-style="italic">Anything that isn't a navigation phrase falls through to the tutor as a question.</text>
        </svg>`,
      },

      // ── 3. Sample-card explainer with concrete try-it phrases ────────────
      {
        id: "vg-fc-try",
        type: "flashcard",
        title: "Try it now",
        status: "rendered",
        cards: [
          {
            front: "How do I navigate hands-free?",
            back: "Say \"next module\" or \"module three\". Or — once your hand is visible — pinch on a card and drag it. Make a fist and move your hand to pan the whole canvas.",
          },
          {
            front: "How do I zoom into something?",
            back: "Say \"zoom in\", \"zoom out\", or \"fit all\". With gestures: peace sign + move your hand up to zoom in, down to zoom out.",
          },
          {
            front: "How do I shut the tutor up?",
            back: "Just say \"stop\" — TTS halts immediately. Say \"replay\" or \"say it again\" to hear the last response again.",
          },
        ],
      },
    ],
    annotations: [
      {
        kind: "sticky",
        content: "Try saying:\n• \"fit all\"\n• \"next module\"\n• \"zoom in\"",
        anchor: "right",
        color: "#ddd6fe",
      },
      {
        kind: "sticky",
        content: "Hand on screen?\n→ pinch to grab\n→ fist to pan\n→ peace to zoom",
        anchor: "bottom-right",
        color: "#fef3c7",
      },
      {
        kind: "text",
        content: "👀 Watch the cheatsheet panel that just slid in.",
        anchor: "below",
        offsetY: -8,
      },
    ],
    sideEffects: {
      handTracking: true,
      showHelp: true,
    },
  };
}
