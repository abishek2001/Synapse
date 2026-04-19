"use client";

import {
  estimateElemH,
  visualCounterScale,
  type CanvasGroup,
  type CanvasElement,
} from "@/store/canvas";
import { useUIStore } from "@/store/ui";

// Padding values are in screen pixels at 1× zoom. They get counter-scaled by
// the same factor as the artifacts inside, so once the canvas zooms past
// `VISUAL_SCALE_CAP` (artifacts stop growing) the padding shrinks in world
// coords proportionally and the on-screen padding stays a constant ~20px.
// Without this, zooming in past the cap kept inflating the violet wrapper
// while the content inside stayed the same size — the "huge box around
// frozen content" bug from the screenshots.
const PAD_X = 20;
const PAD_TOP = 52;
const PAD_BOTTOM = 20;

/** Visual world-space right/bottom edges of an element, accounting for counter-scale. */
function visualEdges(el: CanvasElement, canvasScale: number): { right: number; bottom: number } {
  const counterScale = visualCounterScale(canvasScale, el.birthScale ?? 1);
  return {
    right:  el.x + el.w * counterScale,
    bottom: el.y + (el.h ?? estimateElemH(el.type)) * counterScale,
  };
}

/** Counter-scale applied to the boundary's padding so it shrinks in world
 *  coords once artifacts have hit their visual cap. Uses the smallest member's
 *  birthScale (= the largest counter-scale) so the padding never lags behind
 *  the content. */
function paddingCounterScale(elements: CanvasElement[], canvasScale: number): number {
  let cs = 1;
  for (const el of elements) {
    cs = Math.min(cs, visualCounterScale(canvasScale, el.birthScale ?? 1));
  }
  return cs;
}

interface Props {
  group: CanvasGroup;
  elements: CanvasElement[];
  hasSelectedMember: boolean;
  isHovered: boolean;
  canvasScale: number;
}

export default function GroupBoundary({ group, elements, hasSelectedMember, isHovered, canvasScale }: Props) {
  const { darkMode } = useUIStore();

  if (elements.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const { right, bottom } = visualEdges(el, canvasScale);
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  const padCS = paddingCounterScale(elements, canvasScale);
  const padX = PAD_X * padCS;
  const padTop = PAD_TOP * padCS;
  const padBottom = PAD_BOTTOM * padCS;

  const x = minX - padX;
  const y = minY - padTop;
  const w = maxX - minX + padX * 2;
  const h = maxY - minY + padTop + padBottom;

  // Counter-scale label font so it stays at natural size regardless of zoom,
  // matching the same logic ElementCard applies to artifact content.
  const labelCounterScale = canvasScale > 1 ? 1 / canvasScale : 1;
  const labelFontSize = 15 * labelCounterScale;
  const labelPadTop = 14 * labelCounterScale;
  const labelPadLeft = 20 * labelCounterScale;

  const bgColor = darkMode
    ? group.color.replace(/[\d.]+\)$/, "0.07)")
    : group.color;

  const borderColor = hasSelectedMember || isHovered
    ? "rgba(124,58,237,0.35)"
    : darkMode
      ? "rgba(255,255,255,0.04)"
      : "rgba(0,0,0,0.05)";

  const labelText = darkMode ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";

  // Border radius + thickness live inside the world-space transform, so
  // they'd visually balloon at high zoom without counter-scaling. `padCS`
  // returns 1 below the cap (design values render as-is) and `cap/canvasScale`
  // above (radius / thickness shrink in world coords so the on-screen size
  // stays proportional to the frozen padding).
  const renderedRadius = 28 * padCS;
  const renderedBorder = 1.5 * padCS;

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: x, top: y, width: w, height: h,
        backgroundColor: bgColor,
        borderRadius: renderedRadius,
        border: `${renderedBorder}px solid ${borderColor}`,
        zIndex: 0,
        transition: "border-color 0.15s",
      }}
    >
      <div
        className="absolute overflow-hidden"
        style={{ top: labelPadTop, left: labelPadLeft, right: labelPadLeft }}
      >
        <span
          style={{
            display: "block",
            color: labelText,
            fontFamily: "var(--font-caveat), 'Segoe Print', Georgia, serif",
            fontSize: labelFontSize,
            fontWeight: 700,
            letterSpacing: "0.01em",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {group.name}
        </span>
      </div>
    </div>
  );
}

/** Dashed "Generating…" boundary shown around in-flight pending elements while
 *  the AI streams a new module. Replaced by a real `GroupBoundary` once the
 *  stream completes and the elements are properly grouped. */
export function PendingGroupBoundary({
  elements,
  title,
  canvasScale,
}: {
  elements: CanvasElement[];
  title: string | null;
  canvasScale: number;
}) {
  const { darkMode } = useUIStore();
  if (elements.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const { right, bottom } = visualEdges(el, canvasScale);
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  const padCS = paddingCounterScale(elements, canvasScale);
  const padX = PAD_X * padCS;
  const padTop = PAD_TOP * padCS;
  const padBottom = PAD_BOTTOM * padCS;

  const x = minX - padX;
  const y = minY - padTop;
  const w = maxX - minX + padX * 2;
  const h = maxY - minY + padTop + padBottom;

  const labelCounterScale = canvasScale > 1 ? 1 / canvasScale : 1;
  const labelFontSize = 13 * labelCounterScale;
  const labelPadTop = 14 * labelCounterScale;
  const labelPadLeft = 20 * labelCounterScale;

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: x, top: y, width: w, height: h,
        backgroundColor: darkMode ? "rgba(124,58,237,0.04)" : "rgba(124,58,237,0.025)",
        borderRadius: 28 * padCS,
        border: `${1.5 * padCS}px dashed ${darkMode ? "rgba(167,139,250,0.5)" : "rgba(124,58,237,0.4)"}`,
        zIndex: 0,
      }}
    >
      <div
        className="absolute flex items-center gap-2 overflow-hidden"
        style={{ top: labelPadTop, left: labelPadLeft, right: labelPadLeft }}
      >
        {/* Tiny pulsing dot */}
        <span
          className="inline-block rounded-full"
          style={{
            width: 6 * labelCounterScale,
            height: 6 * labelCounterScale,
            backgroundColor: "rgb(124,58,237)",
            animation: "pendingModulePulse 1.2s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            display: "block",
            color: darkMode ? "rgba(167,139,250,0.9)" : "rgba(124,58,237,0.85)",
            fontFamily: "var(--font-caveat), 'Segoe Print', Georgia, serif",
            fontWeight: 700,
            fontSize: labelFontSize,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title ? `Generating: ${title}` : "Generating module…"}
        </span>
      </div>
      {/* Pulse keyframes (scoped via tag injection — cheap & component-local). */}
      <style>{`@keyframes pendingModulePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }`}</style>
    </div>
  );
}

/** Compute the visual world-space bounding box for a group.
 *  Pass canvasScale so zoom-to-group targets the actual visible area. */
export function computeGroupBounds(groupId: string, elements: CanvasElement[], canvasScale = 1) {
  const members = elements.filter((e) => e.groupId === groupId);
  if (members.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of members) {
    const { right, bottom } = visualEdges(el, canvasScale);
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  const padCS = paddingCounterScale(members, canvasScale);
  const padX = PAD_X * padCS;
  const padTop = PAD_TOP * padCS;
  const padBottom = PAD_BOTTOM * padCS;

  return {
    x: minX - padX,
    y: minY - padTop,
    w: maxX - minX + padX * 2,
    h: maxY - minY + padTop + padBottom + 10,
  };
}
