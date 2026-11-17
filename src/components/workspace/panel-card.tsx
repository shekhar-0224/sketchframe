"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Brush, ChevronLeft, ChevronRight, Copy, Download, Images, ImageUp, Layers, Pencil, PenTool, RefreshCw, Trash2, Wand2 } from "lucide-react";
import type { CharacterView, ShotView } from "@/lib/data";
import type { Scene } from "@/lib/db/schema";
import { aspectToCss, plainSize } from "@/lib/vocab";
import { Button, Menu, Modal, Stamp, cn, type MenuItem } from "@/components/ui";
import { useProject } from "@/store/project-store";
import { openShot, pickImage, pickTake, replaceImage, uploadLayout } from "./actions";

type Props = {
  shot: ShotView;
  index: number;
  scene: Scene | null;
  sceneStart: boolean;
  aspect: string;
  characters: CharacterView[];
  onEdit: (shot: ShotView) => void;
  compact?: boolean;
};

/** "openai:gpt-image-1.5" → "1.5", "openai:gpt-image-1-mini" → "mini". */
function shortModel(m: string) {
  if (m === "you") return "edited";
  const id = m.split(":").pop() ?? m;
  if (id.includes("mini")) return "mini";
  return id.replace(/^gpt-image-/, "img ").replace(/^gemini-/, "");
}

export function PanelCard({ shot, index, scene, sceneStart, aspect, characters, onEdit, compact }: Props) {
  const selected = useProject((s) => s.selectedShotId === shot.id);
  const { select, generate, deleteShot, addShot } = useProject.getState();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id });
  const cast = characters.filter((c) => shot.characterIds.includes(c.id));
  const missingSheets = cast.filter((c) => !c.references.length);
  const generating = shot.imageStatus === "generating";
  const takes = shot.takes ?? [];
  const [comparing, setComparing] = useState(false);

  // Two obvious actions on the card; everything else lives in the "⋯" menu.
  const more: MenuItem[] = [
    { label: "Draw 3 versions to pick from", icon: Layers, onSelect: () => generate(shot.id, 3), disabled: generating },
    ...(takes.length > 1 ? [{ label: `See all ${takes.length} versions`, icon: Images, onSelect: () => setComparing(true) }] : []),
    { label: "Draw on it", icon: Brush, onSelect: () => onEdit(shot), disabled: !shot.imageUrl },
    { label: "Use my own sketch", icon: PenTool, onSelect: async () => { const f = await pickImage(); if (f) uploadLayout(shot.id, f); } },
    { label: "Replace picture", icon: ImageUp, onSelect: async () => { const f = await pickImage(); if (f) replaceImage(shot.id, f); } },
    { label: "Copy this shot", icon: Copy, onSelect: () => addShot({ duplicateOf: shot.id }) },
    {
      label: "Download picture",
      icon: Download,
      disabled: !shot.imageUrl,
      onSelect: () => {
        const a = document.createElement("a");
        a.href = `${shot.imageUrl!.split("?")[0]}?download=${encodeURIComponent(`panel-${index + 1}.png`)}`;
        a.click();
      },
    },
    "divider",
    { label: "Delete shot", icon: Trash2, danger: true, onSelect: () => confirm(`Delete shot ${index + 1}?`) && deleteShot(shot.id) },
  ];

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => select(shot.id)}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-[6px] border-[1.5px] bg-card transition-shadow",
        selected ? "border-ink shadow-[3px_4px_0_0_var(--accent)]" : "border-ink/80 shadow-lift hover:shadow-[2px_3px_0_0_var(--ink)]",
        isDragging && "z-30 rotate-[0.6deg] opacity-90",
        compact ? "w-[300px] shrink-0" : "",
      )}
    >
      {sceneStart && scene && (
        <div className="truncate border-b border-dashed border-rule px-2.5 pt-1.5 pb-1 font-mono text-[10px] font-semibold tracking-wide text-blue uppercase">
          Sc {scene.position + 1} · {scene.heading}
        </div>
      )}
      <header {...attributes} {...listeners} className="flex cursor-grab items-center gap-2 px-2.5 py-1.5 active:cursor-grabbing">
        <span className="font-hand text-xl leading-none font-bold text-accent">{index + 1}</span>
        <Stamp>{plainSize(shot.shotSize)}</Stamp>
        <span className="min-w-0 flex-1" title={`${shot.shotSize} · ${shot.cameraAngle} · ${shot.cameraMove}`} />
        <span className="font-mono text-[11px] text-graphite">{shot.duration}s</span>
      </header>

      <div className="relative mx-2.5 overflow-hidden rounded-[3px] border-[1.5px] border-ink bg-white" style={{ aspectRatio: aspectToCss(aspect) }}>
        {shot.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.imageUrl}
            alt={`Panel ${index + 1}: ${shot.action}`}
            className={cn("h-full w-full object-cover transition", generating && "opacity-40 blur-[1px]")}
            draggable={false}
          />
        )}
        {generating && (
          <div className="sketching absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="rounded-full border-[1.5px] border-ink bg-card px-2.5 py-0.5 font-hand text-[15px]">drawing…</span>
            {missingSheets.length > 0 && (
              <span className="rounded bg-card/90 px-2 text-[11px] text-graphite">drawing {missingSheets.map((c) => c.name).join(", ")} first</span>
            )}
          </div>
        )}
        {!shot.imageUrl && !generating && shot.imageStatus !== "error" && (
          <button
            onClick={(e) => { e.stopPropagation(); generate(shot.id); }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-graphite transition hover:bg-paper hover:text-ink"
          >
            <Wand2 className="h-5 w-5" />
            <span className="font-hand text-[16px]">draw this shot</span>
          </button>
        )}
        {shot.imageStatus === "error" && !generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper-2/95 p-3 text-center">
            <AlertTriangle className="h-5 w-5 text-accent" />
            <p className="line-clamp-3 text-[11.5px] text-accent-ink">{shot.imageError}</p>
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); generate(shot.id); }}>Try again</Button>
          </div>
        )}
        {shot.layoutUrl && !generating && (
          <span className="absolute top-1.5 left-1.5"><Stamp tone="blue">from sketch</Stamp></span>
        )}
        {selected && !generating && <TakeSwitcher shotId={shot.id} takes={shot.takes ?? []} />}
      </div>

      <div className="flex-1 px-2.5 pt-2 pb-2.5">
        <p className="line-clamp-2 text-[12.5px] leading-snug">{shot.action}</p>
        {shot.dialogue && (
          <p className="mt-1 line-clamp-2 font-hand text-[15px] leading-tight text-ink">
            {shot.speaker && <span className="font-bold">{shot.speaker.toUpperCase()}: </span>}“{shot.dialogue}”
          </p>
        )}
        {cast.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cast.map((c) => (
              <span key={c.id} className={cn("rounded-full border px-1.5 text-[10px] font-semibold", c.references.length ? "border-ink/60" : "border-dashed border-pencil text-graphite")}>
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tools only for the picked card, so ten cards don't shout thirty buttons. */}
      {selected && (
      <footer className="flex items-center gap-2 border-t border-dashed border-rule px-2.5 pt-2 pb-2.5" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" className="h-9 flex-1" onClick={() => generate(shot.id)} disabled={generating}>
          {shot.imageUrl ? <RefreshCw className={cn("h-3.5 w-3.5", generating && "animate-spin")} /> : <Wand2 className="h-3.5 w-3.5" />}
          {generating ? "Drawing…" : shot.imageUrl ? "Redraw" : "Draw"}
        </Button>
        <Button size="sm" className="h-9 flex-1" onClick={() => openShot(shot.id)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        <Menu items={more} label="More options" note={shot.lastModel && shot.imageUrl ? `drawn by ${shortModel(shot.lastModel)}` : undefined} />
      </footer>
      )}
      <Modal open={comparing} onClose={() => setComparing(false)} title={`Shot ${index + 1}: pick a version`} wide sheet>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3" onClick={(e) => e.stopPropagation()}>
          {takes.map((t, i) => (
            <button
              key={t.id}
              onClick={() => {
                if (!t.current) void pickTake(shot.id, t.id);
                setComparing(false);
              }}
              className={cn("overflow-hidden rounded-[4px] border-2 bg-white text-left", t.current ? "border-ink shadow-[3px_3px_0_0_var(--accent)]" : "border-ink/30 hover:border-ink")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url} alt={`Version ${i + 1}`} className="w-full object-cover" style={{ aspectRatio: aspectToCss(aspect) }} />
              <span className="block px-2 py-1 text-[12px] font-semibold">{t.current ? `Version ${i + 1} · on the board` : `Version ${i + 1}`}</span>
            </button>
          ))}
        </div>
      </Modal>
    </article>
  );
}

/** "‹ 2 of 3 ›" over the picture: redrawing keeps the old pictures, so nothing is ever lost. */
function TakeSwitcher({ shotId, takes }: { shotId: string; takes: ShotView["takes"] }) {
  const at = takes.findIndex((t) => t.current);
  if (takes.length < 2 || at < 0) return null;
  const go = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    void pickTake(shotId, takes[i].id);
  };
  return (
    <div className="absolute right-1.5 bottom-1.5 flex items-center rounded-full border-[1.5px] border-ink bg-card text-[12px] font-semibold shadow-[2px_2px_0_0_var(--ink)]">
      <button onClick={go(at - 1)} disabled={at === 0} className="flex h-8 w-8 items-center justify-center disabled:opacity-30" aria-label="Earlier picture">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-0.5 whitespace-nowrap">{at + 1} of {takes.length}</span>
      <button onClick={go(at + 1)} disabled={at === takes.length - 1} className="flex h-8 w-8 items-center justify-center disabled:opacity-30" aria-label="Later picture">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
