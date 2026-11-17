"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { ShotView } from "@/lib/data";
import { Button, Input, Label, Textarea, api, cn } from "@/components/ui";
import { plainSize } from "@/lib/vocab";
import { useProject } from "@/store/project-store";
import { Tip } from "./tip";

/**
 * Step 2 — "Check your story": the breakdown laid out scene by scene so the writer can fix
 * anything the AI got wrong before a single picture is drawn.
 */
export function BreakdownReview() {
  const router = useRouter();
  const bundle = useProject((s) => s.bundle)!;
  const { updateShot, deleteShot, addShot } = useProject.getState();
  const { project, scenes, shots, characters } = bundle;
  const [busy, setBusy] = useState(false);
  const base = `/p/${project.id}`;

  const byScene = scenes.map((sc) => ({ scene: sc, shots: shots.filter((s) => s.sceneId === sc.id) }));
  const loose = shots.filter((s) => !s.sceneId || !scenes.some((sc) => sc.id === s.sceneId));
  if (loose.length) byScene.push({ scene: { id: "", heading: "Other shots", summary: "", position: scenes.length } as never, shots: loose });

  async function approve() {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { reviewed: true } });
      await useProject.getState().refresh();
      router.push(`${base}/characters`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-28">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-[26px]">Check your story</h1>
        <p className="mt-1 text-[14.5px] text-graphite">
          Here&apos;s your story, shot by shot. Read it through and tap any shot to fix it. Nothing gets drawn until you say it looks good.
        </p>

        <Tip id="check" className="mt-4">
          Read your story shot by shot. Tap any shot to fix it. When it all looks right, press <b>Looks good</b>.
        </Tip>

        <section className="paper-card mt-5 p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <h2 className="text-[17px]">
              {characters.length ? `We found ${characters.length} character${characters.length > 1 ? "s" : ""}` : "No characters found"}
            </h2>
          </div>
          {characters.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {characters.map((c) => (
                <li key={c.id} className="line-clamp-2 text-[13.5px]">
                  <b>{c.name}</b> <span className="text-graphite">— {c.description || "no description yet"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-graphite">That&apos;s fine for scenery-only stories. You can add characters on the next step.</p>
          )}
          <p className="mt-2 text-[12px] text-graphite">You can rename them or change how they look on the next step, before they&apos;re drawn.</p>
        </section>

        {byScene.map(({ scene, shots: list }, si) => (
          <section key={scene.id || "other"} className="mt-6">
            <h2 className="font-mono text-[12.5px] font-semibold tracking-wide uppercase">
              Scene {si + 1} · {scene.heading}
            </h2>
            {scene.summary && <p className="mt-0.5 text-[13px] text-graphite">{scene.summary}</p>}
            <ol className="mt-2 space-y-1">
              {list.map((s) => (
                <ShotRow
                  key={s.id}
                  shot={s}
                  number={shots.indexOf(s) + 1}
                  characters={characters}
                  onChange={(patch) => updateShot(s.id, patch)}
                  onDelete={() => confirm(`Remove shot ${shots.indexOf(s) + 1}?`) && deleteShot(s.id)}
                />
              ))}
            </ol>
            {list.length > 0 && (
              <button
                onClick={() => addShot({ afterShotId: list[list.length - 1].id })}
                className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-graphite hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" /> Add a shot to this scene
              </button>
            )}
          </section>
        ))}
      </div>

      {/* The one decision on this page. */}
      <div className="fixed inset-x-0 bottom-[64px] z-20 border-t-2 border-ink bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => router.push(`${base}/script`)}>
            <RotateCcw className="h-4 w-4" /> Change the story
          </Button>
          <Button variant="ink" size="lg" onClick={approve} loading={busy} disabled={!shots.length}>
            Looks good — draw my characters <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShotRow({
  shot,
  number,
  characters,
  onChange,
  onDelete,
}: {
  shot: ShotView;
  number: number;
  characters: { id: string; name: string }[];
  onChange: (patch: Partial<ShotView>) => void;
  onDelete: () => void;
}) {
  // Read first: most shots are fine, so the fields only open for the one being fixed.
  const [editing, setEditing] = useState(false);
  const cast = characters.filter((c) => shot.characterIds.includes(c.id));

  if (!editing)
    return (
      <li>
        <button
          onClick={() => setEditing(true)}
          className="group flex w-full items-start gap-3 rounded-[5px] border-[1.5px] border-transparent p-2.5 text-left transition hover:border-ink hover:bg-card"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink font-display text-[13px]">{number}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] leading-snug">{shot.action || <em className="text-pencil">Nothing happens yet</em>}</span>
            {shot.dialogue && (
              <span className="mt-1 block font-hand text-[16px] leading-tight">
                {shot.speaker && <b>{shot.speaker.toUpperCase()}: </b>}“{shot.dialogue}”
              </span>
            )}
            {cast.length > 0 && <span className="mt-1 block text-[12px] text-graphite">{cast.map((c) => c.name).join(", ")}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1 pt-1 text-[12.5px] font-semibold text-graphite group-hover:text-ink">
            <Pencil className="h-3.5 w-3.5" /> <span className="max-sm:sr-only">Fix</span>
          </span>
        </button>
      </li>
    );

  return (
    <li className="paper-card p-3 shadow-[3px_3px_0_0_var(--ink)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink font-display text-[13px]">{number}</span>
        <span className="font-mono text-[11px] text-graphite uppercase">
          {plainSize(shot.shotSize)} · {shot.cameraAngle}
        </span>
        <button onClick={onDelete} className="ml-auto text-graphite hover:text-ink" aria-label={`Remove shot ${number}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <label className="block">
        <Label>What happens</Label>
        <Textarea rows={2} value={shot.action} onChange={(e) => onChange({ action: e.target.value })} className="text-[14px]" autoFocus />
      </label>
      <div className="mt-2 grid grid-cols-[120px_1fr] gap-2">
        <label>
          <Label>Who talks</Label>
          <Input value={shot.speaker} onChange={(e) => onChange({ speaker: e.target.value })} placeholder="nobody" className="h-9" />
        </label>
        <label>
          <Label>What they say</Label>
          <Input value={shot.dialogue} onChange={(e) => onChange({ dialogue: e.target.value })} placeholder="(no words)" className="h-9" />
        </label>
      </div>
      {characters.length > 0 && (
        <div className="mt-2">
          <Label>Who&apos;s in this shot</Label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {characters.map((c) => {
              const on = shot.characterIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => onChange({ characterIds: on ? shot.characterIds.filter((x) => x !== c.id) : [...shot.characterIds, c.id] })}
                  aria-pressed={on}
                  className={cn("key h-8 px-3 text-[13px] font-semibold", on && "key-dark key-down")}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={() => setEditing(false)}>
          <Check className="h-3.5 w-3.5" /> Done
        </Button>
      </div>
    </li>
  );
}
