"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Lock, LockOpen, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { CharacterView } from "@/lib/data";
import { REFERENCE_VIEWS, VIEW_LABEL } from "@/lib/vocab";
import { Button, Input, Label, Modal, Spinner, Stamp, Textarea, api, cn } from "@/components/ui";
import { useProject } from "@/store/project-store";
import { pickImage, pickSheet } from "./actions";

/** Character bible: editable visual description + locked multi-view model sheets. */
export function CharactersView() {
  const bundle = useProject((s) => s.bundle)!;
  const [adding, setAdding] = useState(false);
  const { characters, shots } = bundle;
  const missing = characters.filter((c) => !c.references.some((r) => r.kind === "front") && c.sheetStatus !== "generating");
  const drawingCount = characters.filter((c) => c.sheetStatus === "generating").length;

  // Characters are drawn first: arriving here starts drawing anyone who isn't drawn yet (once).
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !bundle.project.reviewedAt) return;
    const todo = missing.filter((c) => !c.locked && c.sheetStatus !== "error");
    if (!todo.length) return;
    started.current = true;
    todo.forEach((c) => void useProject.getState().generateSheet(c.id));
  }, [missing.length, bundle.project.reviewedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-extrabold tracking-tight">Your cast</h1>
          {missing.length > 0 && (
            <Button size="sm" onClick={() => missing.forEach((c) => !c.locked && useProject.getState().generateSheet(c.id))}>
              <Sparkles className="h-3.5 w-3.5" /> Draw {missing.length === characters.length ? "everyone" : `${missing.length} more`}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add someone
          </Button>
        </div>
        <p className="mb-6 max-w-2xl text-sm text-graphite">
          Each character is drawn once, so they look the same in every picture. Happy with how someone looks? Press Lock so they stay that way.
        </p>
        {drawingCount > 0 && (
          <div className="mb-5 flex items-center gap-2 rounded-[4px] border-2 border-ink bg-paper-2 px-3 py-2 text-[13.5px]">
            <Spinner className="h-4 w-4" /> Drawing {drawingCount} character{drawingCount > 1 ? "s" : ""}… the board opens when everyone is drawn.
          </div>
        )}

        {characters.length === 0 ? (
          <p className="py-16 text-center font-hand text-2xl text-graphite">No characters yet. Add one, or go to the next step.</p>
        ) : (
          <div className="space-y-5">
            {characters.map((c) => (
              <CharacterCard key={c.id} c={c} appearances={shots.filter((s) => s.characterIds.includes(c.id)).length} />
            ))}
          </div>
        )}
      </div>
      <AddCharacter open={adding} onClose={() => setAdding(false)} projectId={bundle.project.id} />
    </div>
  );
}

function CharacterCard({ c, appearances }: { c: CharacterView; appearances: number }) {
  const { updateCharacter, generateSheet, refresh } = useProject.getState();
  const [desc, setDesc] = useState(c.description);
  const [name, setName] = useState(c.name);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [syncedDesc, setSyncedDesc] = useState(c.description);
  if (c.description !== syncedDesc) {
    setSyncedDesc(c.description);
    setDesc(c.description);
  }

  const generating = c.sheetStatus === "generating";
  const uploads = c.references.filter((r) => r.kind === "upload");
  const hasSheet = c.references.some((r) => r.kind === "front");

  async function upload() {
    const f = await pickImage();
    if (!f) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`/api/characters/${c.id}/references`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error);
      await refresh();
      toast.success(`Photo added — ${hasSheet ? "press Redraw to match it" : "press Draw to use it"}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeRef(id: string) {
    try {
      await api(`/api/references/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${c.name} from the cast? Their sheets are deleted and they're removed from ${appearances} shots.`)) return;
    await api(`/api/characters/${c.id}`, { method: "DELETE" }).catch((e) => toast.error(e.message));
    await refresh();
  }

  return (
    <article id={c.id} className={cn("paper-card scroll-mt-4 overflow-hidden", c.locked && "shadow-[3px_4px_0_0_var(--accent)]")}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-3 border-t-[1.5px] border-ink p-4 lg:border-t-0 lg:border-r-[1.5px]">
          <div className="flex items-center gap-2">
            <input
              value={name}
              disabled={c.locked}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== c.name && updateCharacter(c.id, { name: name.trim() })}
              className="min-w-0 flex-1 rounded bg-transparent text-xl font-extrabold tracking-tight uppercase hover:bg-paper-2 focus:bg-paper-2 focus:outline-none disabled:hover:bg-transparent"
              aria-label="Character name"
            />
            <select
              value={c.role}
              onChange={(e) => updateCharacter(c.id, { role: e.target.value })}
              className="rounded border border-rule bg-card px-1.5 py-0.5 font-mono text-[11px] uppercase"
            >
              <option value="lead">lead</option>
              <option value="supporting">supporting</option>
              <option value="minor">minor</option>
            </select>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-graphite">
            <span>{appearances} shots</span>·
            {c.locked ? <Stamp tone="accent"><Lock className="h-2.5 w-2.5" /> locked</Stamp> : hasSheet ? <Stamp tone="soft">sheet ready</Stamp> : <Stamp tone="soft">no sheet</Stamp>}
          </div>
          <label className="block">
            <Label>What they look like</Label>
            <Textarea
              rows={6}
              value={desc}
              disabled={c.locked}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() => desc !== c.description && updateCharacter(c.id, { description: desc })}
              placeholder="Age, build, face, hair, wardrobe, signature props…"
              className="text-[13px]"
            />
          </label>
          {c.personality && <p className="text-[12px] text-graphite"><span className="font-semibold text-ink">Personality:</span> {c.personality}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant={hasSheet ? "outline" : "primary"}
              onClick={() => generateSheet(c.id)}
              disabled={c.locked || generating}
              loading={generating}
              title={c.locked ? "Unlock to redraw" : undefined}
            >
              <Sparkles className="h-3.5 w-3.5" /> {hasSheet ? "Redraw" : "Draw"}
            </Button>
            <Button size="sm" onClick={upload} loading={uploading} disabled={c.locked}>
              <ImagePlus className="h-3.5 w-3.5" /> Use a photo
            </Button>
            <Button
              size="sm"
              variant={c.locked ? "ink" : "outline"}
              onClick={() => updateCharacter(c.id, { locked: !c.locked })}
              disabled={!c.locked && !hasSheet && !uploads.length}
              aria-pressed={c.locked}
            >
              {c.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />} {c.locked ? "Locked" : "Lock"}
            </Button>
            <Button size="icon" variant="ghost" onClick={remove} disabled={c.locked} aria-label={`Delete ${c.name}`} className="ml-auto hover:text-accent">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {c.sheetStatus === "error" && <p className="text-[12px] text-accent">{c.sheetError}</p>}
        </div>

        {/* Turnaround strip */}
        <div className="order-first bg-[linear-gradient(var(--rule)_1px,transparent_1px)] bg-[size:100%_28px] p-4 lg:order-none">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Only show angles that exist (or are being drawn); empty slots read as failures. */}
            {REFERENCE_VIEWS.filter((v) => v === "front" || generating || c.references.some((r) => r.kind === v)).map((v) => {
              const ref = c.references.find((r) => r.kind === v);
              return (
                <figure key={v}>
                  <button
                    onClick={() => ref && setZoom(ref.url)}
                    className={cn(
                      "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[4px] border-[1.5px] bg-white",
                      ref ? "border-ink" : "border-dashed border-pencil",
                    )}
                  >
                    {generating ? (
                      <span className="sketching flex h-full w-full items-center justify-center"><Spinner /></span>
                    ) : ref ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ref.url} alt={`${c.name} ${VIEW_LABEL[v]}`} className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-hand text-pencil">{VIEW_LABEL[v].toLowerCase()}</span>
                    )}
                  </button>
                  <figcaption className="mt-1 text-center font-mono text-[10px] tracking-wide text-graphite uppercase">{VIEW_LABEL[v]}</figcaption>
                </figure>
              );
            })}
          </div>
          {!generating && <SheetSwitcher c={c} />}
          {uploads.length > 0 && (
            <div className="mt-4">
              <Label>Your photos · followed first</Label>
              <div className="flex flex-wrap gap-2">
                {uploads.map((u) => (
                  <div key={u.id} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.url} alt="" onClick={() => setZoom(u.url)} className="h-24 w-24 cursor-zoom-in rounded-[4px] border-[1.5px] border-blue bg-white object-cover" />
                    {!c.locked && (
                      <button onClick={() => removeRef(u.id)} className="absolute -top-1.5 -right-1.5 hidden rounded-full border border-ink bg-card p-0.5 group-hover:block" aria-label="Remove reference">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Modal open={!!zoom} onClose={() => setZoom(null)} title={c.name} wide>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {zoom && <img src={zoom} alt="" className="mx-auto max-h-[80dvh] bg-white object-contain" />}
      </Modal>
    </article>
  );
}

function AddCharacter({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/characters`, { method: "POST", json: { name, description } });
      await useProject.getState().refresh();
      setName("");
      setDescription("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add character">
      <div className="space-y-3 p-5">
        <label className="block"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="block">
          <Label>Visual description</Label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Age, build, face, hair, wardrobe, props" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!name.trim()}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}

/** "‹ Drawing 2 of 3 ›": redrawing keeps earlier sheets, so a worse redraw is one tap from undone. */
function SheetSwitcher({ c }: { c: CharacterView }) {
  const takes = c.sheetTakes ?? [];
  const at = takes.findIndex((t) => t.current);
  if (takes.length < 2 || at < 0) return null;
  const go = (i: number) => () => void pickSheet(c.id, takes[i].id);
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex items-center rounded-full border-[1.5px] border-ink bg-card text-[12.5px] font-semibold" title={c.locked ? "Unlock to switch drawings" : undefined}>
        <button onClick={go(at - 1)} disabled={c.locked || at === 0} className="flex h-8 w-8 items-center justify-center disabled:opacity-30" aria-label="Earlier drawing">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-0.5 whitespace-nowrap">Drawing {at + 1} of {takes.length}</span>
        <button onClick={go(at + 1)} disabled={c.locked || at === takes.length - 1} className="flex h-8 w-8 items-center justify-center disabled:opacity-30" aria-label="Later drawing">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <span className="hidden text-[11.5px] text-graphite sm:inline">Earlier drawings are kept.</span>
    </div>
  );
}
