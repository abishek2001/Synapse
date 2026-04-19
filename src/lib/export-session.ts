"use client";

import { useCanvasStore } from "@/store/canvas";
import { useSessionStore } from "@/store/session";
import type {
  FlashcardArtifact,
  NotationArtifact,
  GraphArtifact,
  VisualArtifact,
  LookupArtifact,
  SimulationArtifact,
  Render3DArtifact,
} from "@/lib/tools/types";

/**
 * Build a markdown study guide from the current canvas + transcript.
 * Walks the canvas in spatial order (top-down, then left-to-right within bands)
 * so the document mirrors the user's mental layout.
 */
export function buildStudyGuideMarkdown(): { filename: string; markdown: string } {
  const session = useSessionStore.getState();
  const canvas = useCanvasStore.getState();

  const title = session.canvasTitle || session.query || "Untitled Session";
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "session";
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `synapse-${safeTitle}-${dateStr}.md`;

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `*Exported from Synapse on ${new Date().toLocaleString()}*`,
  );
  if (session.persona) lines.push(`*Persona: ${session.persona}*`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 1) Sources
  if (session.files.length > 0 || session.urls.length > 0) {
    lines.push("## Sources");
    lines.push("");
    session.files.forEach((f) => lines.push(`- File: \`${f.name}\``));
    session.urls.forEach((u) => lines.push(`- URL: ${u}`));
    lines.push("");
  }

  // 2) Group elements by `groupId` and sort spatially
  const groups = [...canvas.groups].sort((a, b) => a.orderIndex - b.orderIndex);
  const ungrouped = canvas.elements.filter((e) => !e.groupId);

  if (groups.length > 0 || ungrouped.length > 0) {
    lines.push("## Canvas");
    lines.push("");
  }

  const renderElement = (el: typeof canvas.elements[number]) => {
    if (el.type === "text" && el.text) {
      const style = el.text.style;
      const prefix = style === "heading" ? "### " : style === "subheading" ? "#### " : "";
      lines.push(`${prefix}${el.text.content}`);
      lines.push("");
      return;
    }
    if (el.type === "sticky" && el.sticky) {
      lines.push(`> 📌 ${el.sticky.content}`);
      lines.push("");
      return;
    }
    if (el.type === "stroke") return; // drawings can't be exported as text

    const a = el.artifact;
    if (!a) return;

    lines.push(`### ${a.title}`);
    lines.push("");

    switch (a.type) {
      case "flashcard": {
        const fc = a as FlashcardArtifact;
        fc.cards.forEach((c, i) => {
          lines.push(`**Card ${i + 1}** — ${c.front}`);
          lines.push("");
          lines.push(`> ${c.back}`);
          lines.push("");
        });
        break;
      }
      case "notation": {
        const n = a as NotationArtifact;
        lines.push("```math");
        lines.push(n.latex);
        lines.push("```");
        if (n.annotation) {
          lines.push("");
          lines.push(`*${n.annotation}*`);
        }
        lines.push("");
        break;
      }
      case "graph": {
        const g = a as GraphArtifact;
        lines.push(`*${g.graph_type} plot*`);
        lines.push("");
        g.series.forEach((s) => {
          if (s.fn) lines.push(`- **${s.label}**: \`${s.fn}\``);
          else if (s.data) lines.push(`- **${s.label}**: ${s.data.length} data points`);
        });
        lines.push("");
        break;
      }
      case "visual": {
        const v = a as VisualArtifact;
        lines.push(`*${v.style} diagram*`);
        if (v.description) {
          lines.push("");
          lines.push(v.description);
        }
        lines.push("");
        break;
      }
      case "lookup": {
        const l = a as LookupArtifact;
        lines.push(`**Query:** ${l.query}`);
        lines.push("");
        l.results.forEach((r, i) => {
          lines.push(`${i + 1}. *${r.source}* — ${r.text}`);
        });
        lines.push("");
        break;
      }
      case "simulation": {
        const s = a as SimulationArtifact;
        lines.push(`*Interactive simulation: ${s.topic}*`);
        lines.push("");
        break;
      }
      case "render3d": {
        const r = a as Render3DArtifact;
        lines.push(`*3D visualization: ${r.topic}*`);
        lines.push("");
        break;
      }
      default:
        lines.push("");
        break;
    }

    if (a.citations && a.citations.length > 0) {
      lines.push("**Sources:**");
      a.citations.forEach((c) => {
        const ex = c.excerpt ? ` — "${c.excerpt.slice(0, 120)}"` : "";
        lines.push(`- ${c.source}${ex}`);
      });
      lines.push("");
    }
  };

  for (const g of groups) {
    lines.push(`### ${g.name}`);
    lines.push("");
    const members = canvas.elements
      .filter((e) => e.groupId === g.id)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const m of members) renderElement(m);
  }
  if (ungrouped.length > 0) {
    if (groups.length > 0) {
      lines.push("### Loose elements");
      lines.push("");
    }
    const sorted = [...ungrouped].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const m of sorted) renderElement(m);
  }

  // 3) Conversation transcript
  const dialog = session.messages.filter((m) => m.role === "user" || m.role === "tutor");
  if (dialog.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Conversation");
    lines.push("");
    for (const m of dialog) {
      const speaker = m.role === "user" ? "**You**" : "**Synapse**";
      const content = (m.content || "").trim();
      if (!content) continue;
      lines.push(`${speaker}: ${content}`);
      lines.push("");
    }
  }

  return { filename, markdown: lines.join("\n") };
}

export function downloadStudyGuide(): void {
  const { filename, markdown } = buildStudyGuideMarkdown();
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
