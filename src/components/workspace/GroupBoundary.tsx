"use client";

import { estimateElemH, type CanvasGroup, type CanvasElement } from "@/store/canvas";
import { useUIStore } from "@/store/ui";

const PAD_X = 14;
const PAD_TOP = 26;
const PAD_BOTTOM = 14;

interface Props {
  group: CanvasGroup;
  elements: CanvasElement[];
  hasSelectedMember: boolean;
  isHovered: boolean;
}

export default function GroupBoundary({ group, elements, hasSelectedMember, isHovered }: Props) {
  const { darkMode } = useUIStore();

  if (elements.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.w);
    maxY = Math.max(maxY, el.y + (el.h ?? estimateElemH(el.type)));
  }

  const x = minX - PAD_X;
  const y = minY - PAD_TOP;
  const w = maxX - minX + PAD_X * 2;
  const h = maxY - minY + PAD_TOP + PAD_BOTTOM;

  const bgColor = darkMode
    ? group.color.replace(/[\d.]+\)$/, "0.07)")
    : group.color;

  const borderColor = hasSelectedMember || isHovered
    ? "rgba(124,58,237,0.35)"
    : darkMode
      ? "rgba(255,255,255,0.04)"
      : "rgba(0,0,0,0.05)";

  const labelBg   = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const labelText = darkMode ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)";

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: x, top: y, width: w, height: h,
        backgroundColor: bgColor,
        borderRadius: 28,
        border: `1.5px solid ${borderColor}`,
        zIndex: 0,
        transition: "border-color 0.15s",
      }}
    >
      <div className="absolute top-3 left-4">
        <span
          className="px-2.5 py-0.5 rounded-full inline-block"
          style={{
            backgroundColor: labelBg,
            color: labelText,
            fontFamily: "var(--font-caveat), 'Segoe Print', Georgia, serif",
            fontSize: 13, fontWeight: 600, letterSpacing: "0.01em",
          }}
        >
          {group.name}
        </span>
      </div>
    </div>
  );
}

/** Compute the world-space bounding box for a group */
export function computeGroupBounds(groupId: string, elements: CanvasElement[]) {
  const members = elements.filter((e) => e.groupId === groupId);
  if (members.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of members) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.w);
    maxY = Math.max(maxY, el.y + (el.h ?? estimateElemH(el.type)));
  }

  return {
    x: minX - PAD_X,
    y: minY - PAD_TOP,
    w: maxX - minX + PAD_X * 2,
    h: maxY - minY + PAD_TOP + PAD_BOTTOM + 10,
  };
}
