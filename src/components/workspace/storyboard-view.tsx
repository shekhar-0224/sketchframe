"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Check, Columns3, LayoutGrid, Plus, RefreshCw, Sparkles } from "lucide-react";
import type { ShotView } from "@/lib/data";
import { Button, Menu, Modal, Spinner, cn } from "@/components/ui";
import { useProject } from "@/store/project-store";
import { CastBar } from "./cast-bar";
import { PanelCard } from "./panel-card";
import { PanelEditor } from "./panel-editor";
import { ShotList } from "./shot-list";
import { ShotEditor } from "./shot-editor";
import { Tip } from "./tip";

/** Main screen: editable shot list on the left, sketch panels on the right. */
export function StoryboardView() {
  const bundle = useProject((s) => s.bundle)!;
  const { reorder, generateMany, addShot } = useProject.getState();
  const [layout, setLayout] = useState<"grid" | "strip">("grid");
  const [editing, setEditing] = useState<ShotView | null>(null);
  const selectedId = useProject((s) => s.selectedShotId);
  // First visit with the cast ready and nothing drawn yet: start drawing the panels (once).
  const autoDrew = useRef(false);
  useEffect(() => {
    const b = useProject.getState().bundle;
    if (autoDrew.current || !b || !b.shots.length) return;
    if (b.shots.some((s) => s.imageUrl || s.imageStatus === "generating" || s.imageStatus === "error")) return;
    autoDrew.current = true;
    void generateMany();
  }, [generateMany]);

  // Phones: tapping "Edit" opens the shot's details as a bottom sheet (the side list is hidden).
  const [sheetId, setSheetId] = useState<string | null>(null);
  useEffect(() => {
    const open = (e: Event) => {
      if (window.matchMedia("(min-width: 1024px)").matches) return;
      setSheetId((e as CustomEvent<string>).detail);
    };
    window.addEventListener("sf:open-shot", open);
    return () => window.removeEventListener("sf:open-shot", open);
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { shots, scenes, characters, project } = bundle;
  const sheetShot = sheetId ? shots.find((s) => s.id === sheetId) ?? null : null;
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const missing = shots.filter((s) => s.imageStatus !== "ready" && s.imageStatus !== "generating").length;
  const drawing = shots.filter((s) => s.imageStatus === "generating").length;
  const done = shots.filter((s) => s.imageStatus === "ready").length;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = shots.map((s) => s.id);
    reorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))), String(active.id));
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="hidden shrink-0 border-ink bg-paper lg:block lg:h-full lg:w-[372px] lg:border-r-[1.5px]">
        <ShotList shots={shots} scenes={scenes} characters={characters} />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-paper/80 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            {/* Only a real job gets the dark button; otherwise just say where things stand. */}
            {missing ? (
              <Button variant="primary" size="sm" className="h-9" onClick={() => generateMany()}>
                <Sparkles className="h-3.5 w-3.5" /> Draw {missing === shots.length ? "all" : `${missing} more`}
              </Button>
            ) : (
              <span className="flex h-9 items-center gap-1.5 text-[13.5px] font-semibold">
                {drawing ? <><Spinner className="h-3.5 w-3.5" /> Drawing… {done} of {shots.length}</> : <><Check className="h-4 w-4" strokeWidth={3} /> All {shots.length} drawn</>}
              </span>
            )}
          </div>
          {missing > 0 && (
            <span className="hidden font-mono text-[11px] text-graphite sm:inline">
              {done}/{shots.length} drawn{drawing ? ` · ${drawing} drawing` : ""}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <CastBar characters={characters} projectId={project.id} />
          </div>
          {/* Rare board-wide options live in one menu. */}
          <Menu
            down
            label="Board options"
            items={[
              { label: layout === "grid" ? "Show as a strip" : "Show as a grid", icon: layout === "grid" ? Columns3 : LayoutGrid, onSelect: () => setLayout(layout === "grid" ? "strip" : "grid") },
              { label: "Add a shot", icon: Plus, onSelect: () => addShot() },
              "divider",
              {
                label: "Redraw every picture",
                icon: RefreshCw,
                disabled: !shots.length || drawing > 0,
                onSelect: () => generateMany({ force: true }), // old pictures stay as takes, so no warning needed
              },
            ]}
          />
        </div>
        {shots.length > 0 && (
          <Tip id="board" className="mx-4 mt-3">
            Redrawing never loses a picture. Tap a picture, then use its ‹ › arrows to go back to an earlier one, or pick <b>Draw 3 versions</b> in its ⋯ menu.
          </Tip>
        )}
        {shots.length > 0 && !selectedId && (
          <p className="border-b border-dashed border-rule bg-paper px-4 py-1.5 text-[12.5px] text-graphite">Tap a picture to redraw or change it.</p>
        )}

        <div className={cn("min-h-0 flex-1", layout === "grid" ? "overflow-y-auto" : "overflow-x-auto overflow-y-hidden")}>
          {shots.length === 0 ? (
            <EmptyBoard projectId={project.id} hasScript={!!project.scriptText.trim()} onAdd={() => addShot()} />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={shots.map((s) => s.id)} strategy={layout === "grid" ? rectSortingStrategy : horizontalListSortingStrategy}>
                <div
                  className={cn(
                    layout === "grid"
                      ? "grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-5 p-5"
                      : "flex h-full items-start gap-4 p-5",
                  )}
                >
                  {shots.map((s, i) => (
                    <PanelCard
                      key={s.id}
                      shot={s}
                      index={i}
                      scene={s.sceneId ? sceneById.get(s.sceneId) ?? null : null}
                      sceneStart={i === 0 || shots[i - 1].sceneId !== s.sceneId}
                      aspect={project.aspectRatio}
                      characters={characters}
                      onEdit={setEditing}
                      compact={layout === "strip"}
                    />
                  ))}
                  <button
                    onClick={() => addShot()}
                    className={cn(
                      "flex min-h-[180px] items-center justify-center gap-2 rounded-[6px] border-2 border-dashed border-pencil text-graphite transition hover:border-ink hover:text-ink",
                      layout === "strip" && "h-[260px] w-[200px] shrink-0",
                    )}
                  >
                    <Plus className="h-4 w-4" /> <span className="font-hand text-lg">add a shot</span>
                  </button>
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </section>

      <Modal open={!!sheetShot} onClose={() => setSheetId(null)} title={sheetShot ? `Shot ${shots.indexOf(sheetShot) + 1}` : ""} sheet>
        {sheetShot && <ShotEditor shot={sheetShot} characters={characters} />}
      </Modal>
      <PanelEditor key={editing?.id ?? "none"} shot={editing} index={editing ? shots.findIndex((s) => s.id === editing.id) : 0} onClose={() => setEditing(null)} />
    </div>
  );
}

function EmptyBoard({ projectId, hasScript, onAdd }: { projectId: string; hasScript: boolean; onAdd: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-hand text-3xl">An empty pad.</p>
      <p className="max-w-sm text-sm text-graphite">
        {hasScript ? "Break your script down and the shots appear here." : "Write your story first and the shots appear here."}
      </p>
      <Link href={`/p/${projectId}/script`}><Button variant="ink" size="lg">Go to the script</Button></Link>
      <button onClick={onAdd} className="text-[13px] text-graphite underline hover:text-ink">or add a shot by hand</button>
    </div>
  );
}
