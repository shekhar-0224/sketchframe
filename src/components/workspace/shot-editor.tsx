"use client";

import { useState } from "react";
import { ChevronDown, Sparkles, X } from "lucide-react";
import type { CharacterView, ShotView } from "@/lib/data";
import { CAMERA_ANGLES, CAMERA_MOVES, SHOT_SIZES } from "@/lib/vocab";
import { TIER_LABEL, autoTier, type TierOverride } from "@/lib/tiers";
import { Button, Input, Label, SuggestInput, Textarea, cn } from "@/components/ui";
import { useProject } from "@/store/project-store";
import { primaryRef } from "./cast-bar";
import { clearLayout } from "./actions";

/** Inline editor for the selected shot. Every field autosaves (debounced). */
export function ShotEditor({ shot, characters }: { shot: ShotView; characters: CharacterView[] }) {
  const updateShot = useProject((s) => s.updateShot);
  const generate = useProject((s) => s.generate);
  // Rarely-touched fields live behind "More options" so the editor stays readable.
  const [more, setMore] = useState(false);
  const set = (patch: Parameters<typeof updateShot>[1]) => updateShot(shot.id, patch);


  const toggleCast = (id: string) =>
    set({ characterIds: shot.characterIds.includes(id) ? shot.characterIds.filter((x) => x !== id) : [...shot.characterIds, id] });

  return (
    <div className="space-y-3 border-t border-dashed border-rule bg-card px-3 pt-3 pb-3.5" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <Label>Size</Label>
          <SuggestInput value={shot.shotSize} onChange={(v) => set({ shotSize: v })} options={SHOT_SIZES} className="h-8 px-2 text-[13px]" />
        </label>
        <label>
          <Label>Angle</Label>
          <SuggestInput value={shot.cameraAngle} onChange={(v) => set({ cameraAngle: v })} options={CAMERA_ANGLES} className="h-8 px-2 text-[13px]" />
        </label>
        <label>
          <Label>Move</Label>
          <SuggestInput value={shot.cameraMove} onChange={(v) => set({ cameraMove: v })} options={CAMERA_MOVES} className="h-8 px-2 text-[13px]" />
        </label>
      </div>

      <label className="block">
        <Label>What happens</Label>
        <Textarea rows={3} value={shot.action} onChange={(e) => set({ action: e.target.value })} className="text-[13px]" />
      </label>

      <div className="grid grid-cols-[110px_1fr] gap-2">
        <label>
          <Label>Who talks</Label>
          <Input
            list="sf-speakers"
            value={shot.speaker}
            onChange={(e) => set({ speaker: e.target.value })}
            className="h-8 px-2 text-[13px]"
          />
          <datalist id="sf-speakers">
            {characters.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </label>
        <label>
          <Label>What they say</Label>
          <Textarea rows={2} value={shot.dialogue} onChange={(e) => set({ dialogue: e.target.value })} className="font-hand text-[15px] leading-snug" />
        </label>
      </div>

      {characters.length > 0 && (
        <div>
          <Label>Who&apos;s in this shot</Label>
          <div className="flex flex-wrap gap-1.5">
            {characters.map((c) => {
              const on = shot.characterIds.includes(c.id);
              const ref = primaryRef(c);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCast(c.id)}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-full border-[1.5px] pr-2 pl-0.5 text-[12px] font-semibold transition",
                    on ? "border-ink bg-highlight/70" : "border-rule bg-card text-graphite hover:border-ink",
                  )}
                  aria-pressed={on}
                >
                  <span className="h-5 w-5 overflow-hidden rounded-full border border-rule bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {ref && <img src={ref.url} alt="" className="h-full w-full object-cover object-top" />}
                  </span>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-[12.5px] font-semibold text-graphite hover:text-ink" aria-expanded={more}>
        <ChevronDown className={cn("h-3.5 w-3.5 transition", !more && "-rotate-90")} /> More options
        <span className="hidden font-normal sm:inline">· notes, timing, drawing model, extra direction</span>
      </button>

      {more && (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_84px] gap-2">
            <label>
              <Label>Notes</Label>
              <Input value={shot.notes} onChange={(e) => set({ notes: e.target.value })} className="h-8 px-2 text-[13px]" placeholder="Lighting, staging…" />
            </label>
            <label>
              <Label>Seconds</Label>
              <Input
                type="number"
                min={0.5}
                max={60}
                step={0.5}
                value={shot.duration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 0.25 && v <= 60) set({ duration: v });
                }}
                className="h-8 px-2 font-mono text-[13px]"
              />
            </label>
          </div>

          <div>
            <Label>Drawing model</Label>
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              {(["auto", "cast", "filler"] as TierOverride[]).map((t) => (
                <button
                  key={t}
                  onClick={() => set({ tier: t })}
                  aria-pressed={shot.tier === t}
                  className={cn("key h-7 px-2.5 text-[12px] font-semibold", shot.tier === t && "key-dark key-down")}
                >
                  {t === "auto" ? `Auto · ${TIER_LABEL[autoTier(shot.shotSize, shot.characterIds.length)]}` : TIER_LABEL[t]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-graphite">Best for faces; Cheap for wides, inserts and empty sets. Auto decides from shot size + cast.</p>
          </div>

          <label className="block">
            <Label>Extra drawing direction</Label>
            <Textarea
              rows={2}
              value={shot.promptExtra}
              onChange={(e) => set({ promptExtra: e.target.value })}
              className="text-[13px]"
              placeholder="e.g. rain on the window, Tom half in shadow, shallow focus"
            />
          </label>

        </div>
      )}

      {shot.layoutUrl && (
        <div className="flex items-center gap-2 rounded-[5px] border border-dashed border-ink bg-paper-2 p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.layoutUrl} alt="" className="h-10 w-16 rounded-[3px] border border-rule bg-white object-cover" />
          <span className="flex-1 text-[12px] text-blue">Layout sketch guides this shot&apos;s composition</span>
          <Button variant="ghost" size="icon" onClick={() => clearLayout(shot.id)} title="Stop using this layout">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <Button variant="primary" className="w-full" onClick={() => generate(shot.id)} loading={shot.imageStatus === "generating"}>
        <Sparkles className="h-4 w-4" /> {shot.imageUrl ? "Redraw this shot" : "Draw this shot"}
      </Button>
    </div>
  );
}
