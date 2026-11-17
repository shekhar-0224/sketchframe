"use client";

import { useEffect, useRef } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare, Plus } from "lucide-react";
import type { CharacterView, ShotView } from "@/lib/data";
import type { Scene } from "@/lib/db/schema";
import { plainSize } from "@/lib/vocab";
import { Button, Spinner, Stamp, cn } from "@/components/ui";
import { useProject } from "@/store/project-store";
import { ShotEditor } from "./shot-editor";

export function ShotList({ shots, scenes, characters }: { shots: ShotView[]; scenes: Scene[]; characters: CharacterView[] }) {
  const { reorder, addShot } = useProject();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sceneById = new Map(scenes.map((s) => [s.id, s]));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = shots.map((s) => s.id);
    reorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))), String(active.id));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2.5">
        <h2 className="text-[13px] font-bold tracking-tight">
          Shot list <span className="ml-1 font-mono text-[11px] font-normal text-graphite">{shots.length}</span>
        </h2>
        <Button size="sm" variant="ghost" onClick={() => addShot()}>
          <Plus className="h-3.5 w-3.5" /> Shot
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol>
              {shots.map((s, i) => {
                const newScene = i === 0 || shots[i - 1].sceneId !== s.sceneId;
                const scene = s.sceneId ? sceneById.get(s.sceneId) : null;
                return (
                  <li key={s.id}>
                    {newScene && (
                      <div className="sticky top-0 z-10 border-b border-rule bg-paper-2/95 px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-wide text-ink uppercase backdrop-blur">
                        {scene ? `${scene.position + 1}. ${scene.heading}` : "Unassigned"}
                      </div>
                    )}
                    <ShotRow shot={s} index={i} characters={characters} />
                  </li>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
        {shots.length === 0 && (
          <p className="px-4 py-10 text-center font-hand text-lg text-graphite">No shots yet — add one, or break down a script.</p>
        )}
      </div>
    </div>
  );
}

function ShotRow({ shot, index, characters }: { shot: ShotView; index: number; characters: CharacterView[] }) {
  const selected = useProject((s) => s.selectedShotId === shot.id);
  const select = useProject((s) => s.select);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: shot.id });
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rowRef.current = el;
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "border-b border-rule transition-colors",
        selected ? "bg-card shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-card/70",
        isDragging && "relative z-20 opacity-80 shadow-lift",
      )}
    >
      <div className="flex cursor-pointer items-start gap-2 px-2 py-2" onClick={() => select(selected ? null : shot.id)}>
        <button {...attributes} {...listeners} className="mt-0.5 cursor-grab text-pencil hover:text-ink active:cursor-grabbing" aria-label="Drag to reorder" onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="w-6 shrink-0 pt-px text-right font-hand text-[17px] leading-5 font-bold text-accent">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <Stamp>{plainSize(shot.shotSize)}</Stamp>
            <span className="truncate font-mono text-[10.5px] text-graphite">
              {shot.cameraAngle} · {shot.cameraMove} · {shot.duration}s
            </span>
          </div>
          <p className={cn("text-[13px] leading-snug text-ink", !selected && "line-clamp-2")}>{shot.action || <em className="text-pencil">No action yet</em>}</p>
          {shot.dialogue && !selected && (
            <p className="mt-0.5 flex items-start gap-1 truncate font-hand text-[14px] leading-tight text-graphite">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="truncate">{shot.speaker ? `${shot.speaker}: ` : ""}{shot.dialogue}</span>
            </p>
          )}
        </div>
        <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded-[3px] border border-rule bg-paper-2">
          {shot.imageStatus === "generating" ? (
            <span className="sketching flex h-full items-center justify-center"><Spinner className="h-3 w-3" /></span>
          ) : shot.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : shot.imageStatus === "error" ? (
            <span className="flex h-full items-center justify-center text-[10px] font-bold text-accent">!</span>
          ) : null}
        </div>
      </div>
      {selected && <ShotEditor shot={shot} characters={characters} />}
    </div>
  );
}
