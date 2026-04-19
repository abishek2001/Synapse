"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { HelpCircle, StickyNote, Type, Maximize2, Trash2, type LucideIcon } from "lucide-react";
import { useCanvasStore, ELEM_WIDTHS } from "@/store/canvas";
import { useUIStore } from "@/store/ui";

const STICKY_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];

interface CanvasContextMenuProps {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  targetModuleId?: string; // group id when right-clicking inside a group
  onClose: () => void;
  onSetTool: (tool: "text" | "sticky") => void;
  onExpandModule: (id: string) => void;
}

export default function CanvasContextMenu({
  screenX,
  screenY,
  worldX,
  worldY,
  targetModuleId,
  onClose,
  onSetTool,
  onExpandModule,
}: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { groups, elements, addUserAnnotation, ungroupElements } = useCanvasStore();
  const { openDoubtPopup, darkMode } = useUIStore();

  const group = targetModuleId ? groups.find((g) => g.id === targetModuleId) : null;

  const menuBg     = darkMode ? "#12121f" : "#ffffff";
  const menuBorder = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const itemText   = darkMode ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.60)";
  const itemHoverBg = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const labelColor = darkMode ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)";
  const dividerColor = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => window.addEventListener("mousedown", onClick), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const menuW = 200;
  const x = Math.min(screenX, window.innerWidth - menuW - 8);
  const y = Math.min(screenY, window.innerHeight - 220 - 8);

  const Item = ({
    icon: Icon, label, onClick, danger,
  }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors rounded-lg"
      style={{ color: danger ? "#f87171" : itemText }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = danger ? "rgba(239,68,68,0.08)" : itemHoverBg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {label}
    </button>
  );

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[60] p-1 rounded-xl shadow-2xl"
      style={{ left: x, top: y, width: menuW, backgroundColor: menuBg, border: `1px solid ${menuBorder}` }}
    >
      {group ? (
        <>
          <div className="px-3 py-1.5 mb-1" style={{ borderBottom: `1px solid ${dividerColor}` }}>
            <span className="text-[10px] uppercase tracking-wider font-semibold truncate block" style={{ color: labelColor }}>
              {group.name}
            </span>
          </div>
          <Item
            icon={Maximize2}
            label="Zoom to group"
            onClick={() => onExpandModule(group.id)}
          />
          <Item
            icon={HelpCircle}
            label="Ask about this"
            onClick={() => openDoubtPopup(worldX, worldY, `Explain the concept "${group.name}" in detail`, group.id)}
          />
          <div className="h-px my-1" style={{ backgroundColor: dividerColor }} />
          <Item
            icon={Trash2}
            label="Delete group"
            onClick={() => {
              // Remove all elements in the group, then remove the group record
              const memberIds = elements.filter((e) => e.groupId === group.id).map((e) => e.id);
              memberIds.forEach((id) => useCanvasStore.getState().removeElement(id));
              ungroupElements(group.id);
            }}
            danger
          />
        </>
      ) : (
        <>
          <Item
            icon={HelpCircle}
            label="Ask a doubt here"
            onClick={() => openDoubtPopup(worldX, worldY)}
          />
          <Item
            icon={StickyNote}
            label="Add sticky note"
            onClick={() => {
              const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
              addUserAnnotation({
                id: `el-sticky-${Date.now()}`,
                type: "sticky",
                x: worldX, y: worldY,
                w: ELEM_WIDTHS.sticky,
                zIndex: elements.length + 10,
                createdAt: Date.now(),
                sticky: { content: "", color },
              });
            }}
          />
          <Item
            icon={Type}
            label="Add text"
            onClick={() => onSetTool("text")}
          />
        </>
      )}
    </motion.div>
  );
}
