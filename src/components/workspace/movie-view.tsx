"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Link2, Mic, Pause, Play, Repeat, SkipBack, Sparkles, Subtitles, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { ShotView } from "@/lib/data";
import { CAMERA_MOVES } from "@/lib/vocab";
import { EFFECTS, effectsFor, type EffectId } from "@/lib/effects";
import { MovieEngine, exportMovie, type MovieShot } from "@/lib/movie/engine";
import { prepareDepth } from "@/lib/movie/depth-client";
import { Button, Label, Spinner, api, cn } from "@/components/ui";
import { useProject } from "@/store/project-store";
import { Tip } from "./tip";

type VoiceInfo = {
  provider: "browser" | "openai" | "sarvam" | "elevenlabs";
  voices: { id: string; label: string; gender: "female" | "male" | "neutral"; note?: string }[];
  assignments: Record<string, string>;
  stale: number;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const norm = (s: string) => s.trim().toUpperCase().replace(/\s*\(.*\)\s*$/, "");

/**
 * The comic movie: free camera motion on every panel, character voices, optional AI clips,
 * and a one-click export. The right-hand rail leads with Export; tweaks sit behind tabs.
 */
export function MovieView() {
  const bundle = useProject((s) => s.bundle)!;
  const { refresh, updateShot } = useProject.getState();
  const { project, shots, characters, scenes } = bundle;
  const sceneOf = useCallback((id: string | null) => scenes.find((x) => x.id === id), [scenes]);
  const shotEffects = useCallback(
    (s: ShotView) => {
      const sc = sceneOf(s.sceneId);
      return effectsFor(s, sc ? `${sc.heading}\n${sc.summary}` : "");
    },
    [sceneOf],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [voiceInfo, setVoiceInfo] = useState<VoiceInfo | null>(null);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [clock, setClock] = useState(0);
  const [exporting, setExporting] = useState<number | null>(null);
  const [tab, setTab] = useState<"voices" | "motion" | "animate" | null>(null);
  const tRef = useRef(0);
  const audio = useRef<{ ctx: AudioContext | null; sources: AudioBufferSourceNode[] }>({ ctx: null, sources: [] });
  const spokenRef = useRef(-1);

  const portrait = project.aspectRatio === "9:16";
  const W = portrait ? 720 : 1280;
  const H = portrait ? 1280 : 720;

  const loadVoices = useCallback(() => api<VoiceInfo>(`/api/projects/${project.id}/voices`).then(setVoiceInfo).catch(() => {}), [project.id]);
  useEffect(() => {
    void loadVoices();
  }, [loadVoices, shots.length]);

  // Gender per speaker, for free browser voices.
  const genderOf = useCallback(
    (speaker: string) => {
      const c = characters.find((x) => norm(x.name) === norm(speaker) || norm(x.name).split(" ")[0] === norm(speaker).split(" ")[0]);
      const v = c && voiceInfo?.voices.find((x) => x.id === voiceInfo.assignments[c.id]);
      return v?.gender ?? "neutral";
    },
    [characters, voiceInfo],
  );

  const movieShots: MovieShot[] = useMemo(
    () =>
      shots.map((s) => ({
        id: s.id,
        sceneId: s.sceneId,
        duration: s.duration,
        cameraMove: s.cameraMove,
        speaker: s.speaker,
        dialogue: s.dialogue,
        imageUrl: s.imageUrl,
        clipUrl: s.clipStatus === "ready" ? s.clipUrl : null,
        audioUrl: s.audioStatus === "ready" || s.audioStatus === "stale" ? s.audioUrl : null,
        voiceGender: genderOf(s.speaker),
        depthUrl: s.depthUrl,
        effects: shotEffects(s),
        interior: /^\s*INT\b/i.test(sceneOf(s.sceneId)?.heading ?? ""),
      })),
    [shots, genderOf, shotEffects, sceneOf],
  );

  // Depth maps power the free 2.5D motion. They're computed here in the browser (free,
  // no server model) for any panel that doesn't have one yet, one at a time.
  const needsDepth = shots.filter((s) => s.imageUrl && !s.depthUrl);
  const missingDepth = needsDepth.length;
  const depthKey = needsDepth.map((s) => `${s.id}:${s.imageVersion}`).join(",");
  const depthRun = useRef<string | null>(null);
  const [depthError, setDepthError] = useState<string | null>(null);
  useEffect(() => {
    if (!depthKey || depthRun.current === depthKey) return;
    depthRun.current = depthKey;
    void (async () => {
      try {
        for (const s of needsDepth) await prepareDepth({ id: s.id, imageUrl: s.imageUrl!, imageVersion: s.imageVersion });
        setDepthError(null);
      } catch (e) {
        setDepthError((e as Error).message);
      }
      await refresh();
    })();
  }, [depthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const engine = useMemo(() => new MovieEngine(W, H), [W, H]);
  useEffect(() => () => engine.dispose(), [engine]);

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) engine.draw(ctx, Math.min(tRef.current, Math.max(0, engine.total - 0.001)), { captions });
  }, [engine, captions]);
  useEffect(paint, [paint]);

  useEffect(() => {
    engine.setShots(movieShots);
    void engine.load(audio.current.ctx ?? undefined).then(paint);
  }, [engine, movieShots, paint]);

  const stopAudio = () => {
    audio.current.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    audio.current.sources = [];
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  };

  /** Schedule every voice line from time t (Web Audio keeps them sample-accurate). */
  const startAudio = async (t: number) => {
    stopAudio();
    const ctx = (audio.current.ctx ??= new AudioContext());
    if (ctx.state === "suspended") await ctx.resume();
    await engine.load(ctx);
    const now = ctx.currentTime + 0.05;
    engine.shots.forEach((s, i) => {
      const buf = engine.audioFor(s.id);
      if (!buf) return;
      const offset = t - engine.starts[i];
      if (offset >= buf.duration) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      if (offset >= 0) src.start(now, offset);
      else src.start(now - offset);
      audio.current.sources.push(src);
    });
    return now;
  };

  // Play loop: clock follows the audio context so voices and picture never drift.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let cancelled = false;
    void (async () => {
      const from = tRef.current >= engine.total - 0.05 ? 0 : tRef.current;
      const t0 = (await startAudio(from)) - from;
      const ctx = audio.current.ctx!;
      const step = () => {
        if (cancelled) return;
        let t = ctx.currentTime - t0;
        if (t >= engine.total) {
          if (loop) {
            void startAudio(0);
            tRef.current = 0;
            setPlaying(false);
            requestAnimationFrame(() => setPlaying(true));
            return;
          }
          t = engine.total;
          setPlaying(false);
        }
        tRef.current = t;
        engine.syncVideos(t, true);
        paint();
        const i = engine.indexAt(t);
        // Free browser voices: speak each line as its shot starts (preview only).
        const s = engine.shots[i];
        if (voiceInfo?.provider === "browser" && s?.dialogue && spokenRef.current !== i && t - engine.starts[i] < 0.5) {
          spokenRef.current = i;
          speakBrowser(s.dialogue, s.voiceGender ?? "neutral");
        }
        setSelected(i);
        setClock(t);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stopAudio();
      engine.syncVideos(tRef.current, false);
      spokenRef.current = -1;
    };
  }, [playing, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = (i: number) => {
    const idx = Math.max(0, Math.min(shots.length - 1, i));
    setPlaying(false);
    setSelected(idx);
    tRef.current = engine.starts[idx] ?? 0;
    setClock(tRef.current);
    engine.syncVideos(tRef.current, false);
    requestAnimationFrame(paint);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === "ArrowRight") seek(selected + 1);
      if (e.key === "ArrowLeft") seek(selected - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function recordVoices(force = false) {
    try {
      const { queued, provider } = await api<{ queued: string[]; provider: string }>(`/api/projects/${project.id}/voices`, {
        method: "POST",
        json: { force },
      });
      if (provider === "browser") toast("Using free browser voices — they play live in preview. Exported videos will be silent.");
      else if (!queued.length) toast("All lines are already recorded.");
      else toast(`Recording ${queued.length} line${queued.length > 1 ? "s" : ""}…`);
      await refresh();
      void loadVoices();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function animate(shot: ShotView) {
    if (!confirm(`Animate shot ${shots.indexOf(shot) + 1} with AI? Costs real money on your fal.ai account (roughly 20¢–$1 per clip depending on model) and takes a few minutes.`)) return;
    try {
      await api(`/api/shots/${shot.id}/clip`, { method: "POST" });
      toast("Animating — keep working, it shows up here when done.");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function removeClip(shot: ShotView) {
    await api(`/api/shots/${shot.id}/clip`, { method: "DELETE" }).catch((e) => toast.error(e.message));
    await refresh();
  }

  async function doExport() {
    if (typeof MediaRecorder === "undefined") return toast.error("This browser can't record video.");
    setPlaying(false);
    setExporting(0);
    try {
      const exportEngine = new MovieEngine(W, H);
      exportEngine.setShots(movieShots);
      const { blob, ext } = await exportMovie(exportEngine, { captions, onProgress: setExporting });
      exportEngine.dispose();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.title}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Exported ${ext.toUpperCase()}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  }

  if (!shots.length) return <div className="flex h-full items-center justify-center font-display text-2xl text-graphite">No shots yet — break down a script first.</div>;

  const shot = shots[selected] ?? shots[0];
  const lines = shots.filter((s) => s.dialogue.trim());
  const recorded = lines.filter((s) => s.audioStatus === "ready").length;
  const recording = shots.some((s) => s.audioStatus === "generating");
  const staleCount = shots.filter((s) => s.audioStatus === "stale").length + (voiceInfo?.stale ?? 0);
  const clips = shots.filter((s) => s.clipStatus === "ready").length;
  const browserVoices = voiceInfo?.provider === "browser";
  // Same sum the engine uses, but computed in render so the label updates the moment a shot is resized.
  const totalSecs = shots.reduce((t, x) => t + Math.max(0.5, x.duration), 0);
  const needVoices = lines.length > 0 && !!voiceInfo && !browserVoices && (recorded < lines.length || staleCount > 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="flex min-w-0 shrink-0 flex-col lg:min-h-0 lg:flex-1">
        {/* Stage */}
        <div className="flex items-center justify-center bg-ink p-2 sm:p-4 lg:min-h-0 lg:flex-1">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onClick={() => setPlaying((p) => !p)}
            className="max-h-full max-w-full cursor-pointer border-2 border-white/20 bg-black"
            style={{ aspectRatio: `${W} / ${H}` }}
          />
        </div>

        {/* Transport */}
        <div className="flex flex-wrap items-center gap-2 border-y-2 border-ink bg-paper px-4 py-2.5">
          <Button size="icon" onClick={() => seek(0)} aria-label="Back to start"><SkipBack className="h-4 w-4" /></Button>
          <Button variant="ink" onClick={() => setPlaying((p) => !p)} className="w-28" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "Pause" : "Play"}
          </Button>
          <span className="font-mono text-xs">{fmt(clock)} / {fmt(totalSecs)}</span>
          <span className="flex-1" />
          <button onClick={() => setCaptions((c) => !c)} className={cn("key flex h-8 items-center gap-1.5 px-2.5 text-[12px] font-semibold", captions && "key-dark key-down")} aria-pressed={captions}>
            <Subtitles className="h-3.5 w-3.5" /> Captions
          </button>
          <button onClick={() => setLoop((l) => !l)} className={cn("key flex h-8 items-center gap-1.5 px-2.5 text-[12px] font-semibold", loop && "key-dark key-down")} aria-pressed={loop}>
            <Repeat className="h-3.5 w-3.5" /> Loop
          </button>
        </div>

        {/* Timeline */}
        <Timeline shots={shots} selected={selected} total={totalSecs} onSeek={seek} onDuration={(id, duration) => updateShot(id, { duration })} />
      </div>

      {/* One job here: export. Voices, motion and AI moves are optional tweaks behind tabs. */}
      <aside className="w-full shrink-0 space-y-4 border-t-2 border-ink bg-paper p-4 lg:w-[340px] lg:overflow-y-auto lg:border-t-0 lg:border-l-2">
        <h2 className="text-xl">Make it a movie</h2>
        <Tip id="movie">Press <b>Play</b> to watch your movie. When you like it, press <b>Export movie</b> to save it.</Tip>

        {needVoices && (
          <div className="paper-card space-y-2 p-3">
            <p className="text-[13px]">
              {staleCount && recorded ? `${staleCount} changed line${staleCount > 1 ? "s" : ""} need new voices.` : `Give your characters voices first (${recorded} of ${lines.length} lines done).`}
            </p>
            <Button variant="primary" className="w-full" onClick={() => recordVoices(false)} loading={recording} disabled={recording}>
              <Mic className="h-4 w-4" /> {recorded === 0 ? "Record the voices" : `Re-record ${staleCount}`}
            </Button>
          </div>
        )}

        <div>
          <Button variant={needVoices ? "outline" : "primary"} size="lg" className="w-full" onClick={doExport} loading={exporting !== null} disabled={exporting !== null}>
            {exporting !== null ? `Recording ${Math.round(exporting * 100)}%` : <><Download className="h-4 w-4" /> Export movie</>}
          </Button>
          <p className="mt-2 text-[11.5px] text-graphite">
            Takes as long as the movie ({fmt(totalSecs)}): it plays once while it records, with voices and captions.
          </p>
          <ShareControl projectId={project.id} token={project.shareToken} onChange={refresh} />
        </div>

        <div className="border-t-2 border-dashed border-ink/30 pt-4">
          <Label>Fine-tune (optional)</Label>
          <div className="flex gap-1.5" role="tablist">
            {([
              ["voices", "Voices"],
              ["motion", "Motion"],
              ["animate", "Really move"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(tab === id ? null : id)}
                className={cn("key h-8 flex-1 px-2 text-[12.5px] font-semibold", tab === id && "key-dark key-down")}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "voices" && (
            <div className="mt-3 space-y-2">
              <p className="text-[12.5px] text-graphite">
                {lines.length === 0
                  ? "Nobody talks in this story."
                  : browserVoices
                    ? `${lines.length} lines use free browser voices (heard in the preview, not in exports).`
                    : `${recorded} of ${lines.length} lines recorded.`}
              </p>
              {voiceInfo && lines.length > 0 && <VoiceCast info={voiceInfo} onChange={loadVoices} />}
            </div>
          )}

          {tab === "motion" && (
            <div className="mt-3 space-y-2.5">
              <p className="text-[12.5px] text-graphite">
                Your pictures gently move, like a camera drifting through them, with rain, fog and light taken from your story. Pick a shot in the strip to change it.
                {missingDepth > 0 && !depthError && (
                  <span className="mt-1 flex items-center gap-1.5 text-ink">
                    <Spinner className="h-3 w-3" /> Getting {missingDepth} picture{missingDepth > 1 ? "s" : ""} ready to move…
                  </span>
                )}
                {depthError && <span className="mt-1 block text-accent" title={depthError}>Couldn&apos;t add depth, so the pictures move flat instead.</span>}
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px]">Shot {selected + 1}</span>
                <select
                  value={shot.cameraMove}
                  onChange={(e) => updateShot(shot.id, { cameraMove: e.target.value })}
                  className="flex-1 rounded-[3px] border-[1.5px] border-ink bg-card px-2 py-1 text-[13px]"
                  aria-label="Camera move"
                >
                  {[...new Set([shot.cameraMove, ...CAMERA_MOVES])].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <EffectToggles shot={shot} active={shotEffects(shot)} onChange={(effects) => updateShot(shot.id, { effects })} />
            </div>
          )}

          {tab === "animate" && (
            <div className="mt-3 space-y-2.5">
              <p className="text-[12.5px] text-graphite">
                Turn one picture into a real moving shot. Save it for the big moments; the rest keep their gentle motion. {clips > 0 && `${clips} done so far.`}
              </p>
              {shot.clipStatus === "generating" ? (
                <p className="flex items-center gap-2 text-[13px]"><Spinner className="h-3.5 w-3.5" /> Animating shot {selected + 1}… (a few minutes)</p>
              ) : shot.clipStatus === "ready" ? (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => animate(shot)}><Sparkles className="h-3.5 w-3.5" /> Redo shot {selected + 1}</Button>
                  <Button size="sm" variant="ghost" onClick={() => removeClip(shot)} title="Back to gentle motion"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <Button size="sm" className="w-full" onClick={() => animate(shot)} disabled={!shot.imageUrl}>
                  <Sparkles className="h-3.5 w-3.5" /> Animate shot {selected + 1}
                </Button>
              )}
              {shot.clipStatus === "error" && <p className="text-[12px] text-accent">{shot.clipError}</p>}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Public read-only link to this movie (anyone with the link can watch). */
function ShareControl({ projectId, token, onChange }: { projectId: string; token: string | null; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/s/${token}` : null;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const res = await api<{ path?: string }>(`/api/projects/${projectId}/share`, { method: on ? "POST" : "DELETE" });
      await onChange();
      if (on && res.path) {
        await navigator.clipboard?.writeText(`${window.location.origin}${res.path}`).catch(() => {});
        toast.success("Share link copied — anyone with it can watch");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 space-y-2">
      {url ? (
        <>
          <div className="flex items-center gap-1.5">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-[3px] border-[1.5px] border-ink bg-card px-2 py-1.5 font-mono text-[11px]" aria-label="Share link" />
            <Button size="icon" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Copied"))} aria-label="Copy link">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <button onClick={() => toggle(false)} disabled={busy} className="text-[11.5px] text-graphite underline hover:text-ink">Stop sharing</button>
        </>
      ) : (
        <Button className="w-full" onClick={() => toggle(true)} loading={busy}>
          <Link2 className="h-3.5 w-3.5" /> Get a share link
        </Button>
      )}
    </div>
  );
}

/** Weather/light chips for the selected shot. Auto-detected until the user touches one. */
function EffectToggles({ shot, active, onChange }: { shot: ShotView; active: EffectId[]; onChange: (e: string[] | null) => void }) {
  const auto = shot.effects === null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="mb-0">Effects</Label>
        {auto ? (
          <span className="font-mono text-[10px] text-graphite uppercase">auto from script</span>
        ) : (
          <button onClick={() => onChange(null)} className="font-mono text-[10px] uppercase underline">reset to auto</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 pb-1">
        {EFFECTS.map((e) => {
          const on = active.includes(e.id);
          return (
            <button
              key={e.id}
              onClick={() => onChange(on ? active.filter((x) => x !== e.id) : [...active, e.id])}
              aria-pressed={on}
              className={cn("key h-7 px-2 text-[11.5px] font-semibold", on && "key-dark key-down")}
            >
              {e.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="flex h-4 min-w-4 items-center justify-center rounded-[2px] bg-ink px-0.5 font-mono text-[9px] font-bold text-white">{children}</span>;
}

/** Who speaks with which voice — change it inline and hear a sample. */
function VoiceCast({ info, onChange }: { info: VoiceInfo; onChange: () => void }) {
  const characters = useProject((s) => s.bundle!.characters);
  const updateCharacter = useProject((s) => s.updateCharacter);
  const [busy, setBusy] = useState<string | null>(null);

  async function preview(id: string) {
    if (info.provider === "browser") {
      const c = characters.find((x) => x.id === id)!;
      const v = info.voices.find((x) => x.id === info.assignments[id]);
      return speakBrowser(`Hi, I'm ${c.name.toLowerCase()}.`, v?.gender ?? "neutral");
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/characters/${id}/voice-preview`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1.5 pt-1">
      <Label>Cast voices</Label>
      {characters.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5">
          <span className="w-20 truncate text-[12px] font-semibold">{c.name}</span>
          <select
            value={info.assignments[c.id] ?? ""}
            onChange={async (e) => {
              await updateCharacter(c.id, { voice: e.target.value });
              onChange();
            }}
            className="min-w-0 flex-1 rounded-[3px] border-[1.5px] border-ink/50 bg-card px-1.5 py-1 text-[12px]"
          >
            {info.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {v.note ?? v.gender}
              </option>
            ))}
          </select>
          <button onClick={() => preview(c.id)} className="key flex h-7 w-7 items-center justify-center" title="Hear this voice" aria-label={`Hear ${c.name}`}>
            {busy === c.id ? <Spinner className="h-3 w-3" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      ))}
      <p className="text-[11px] text-graphite">Changing a voice marks that character&apos;s lines for re-recording.</p>
    </div>
  );
}

function speakBrowser(text: string, gender: "female" | "male" | "neutral") {
  if (typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  const pick = voices.find((v) => (gender === "female" ? /female|samantha|victoria|karen|zira|susan/i : /male|daniel|alex|fred|david|tom/i).test(v.name));
  if (pick) u.voice = pick;
  u.pitch = gender === "female" ? 1.15 : gender === "male" ? 0.85 : 1;
  speechSynthesis.speak(u);
}


/**
 * Picture row + voice row. Tap a shot to jump there; drag its right edge to change how long it
 * stays on screen (half-second steps). The voice row shows each spoken line under its shot.
 */
function Timeline({
  shots,
  selected,
  total,
  onSeek,
  onDuration,
}: {
  shots: ShotView[];
  selected: number;
  total: number;
  onSeek: (i: number) => void;
  onDuration: (id: string, seconds: number) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; dur: number; startX: number; start: number; pxPerSec: number } | null>(null);
  const durOf = (s: ShotView) => (drag?.id === s.id ? drag.dur : s.duration);

  const down = (s: ShotView) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const col = e.currentTarget.parentElement!.getBoundingClientRect();
    setDrag({ id: s.id, dur: s.duration, startX: e.clientX, start: s.duration, pxPerSec: col.width / s.duration });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const raw = drag.start + (e.clientX - drag.startX) / drag.pxPerSec;
    const dur = Math.min(15, Math.max(1, Math.round(raw * 2) / 2));
    if (dur !== drag.dur) setDrag({ ...drag, dur });
  };
  const up = () => {
    if (drag && drag.dur !== drag.start) onDuration(drag.id, drag.dur);
    setDrag(null);
  };

  return (
    <div className="no-scrollbar overflow-x-auto bg-paper px-4 py-3">
      <div className="flex gap-1" style={{ minWidth: `${Math.max(100, total * 2.2)}%` }}>
        {shots.map((s, i) => {
          const dur = durOf(s);
          const voice = s.dialogue.trim();
          const long = !!s.audioSeconds && s.audioSeconds > dur + 0.05;
          return (
            <div key={s.id} className="relative flex min-w-[52px] flex-col gap-1" style={{ flexGrow: dur, flexBasis: 0 }}>
              <button
                onClick={() => onSeek(i)}
                className={cn(
                  "relative h-[60px] overflow-hidden rounded-[3px] border-2 bg-white text-left",
                  i === selected ? "border-ink shadow-[0_3px_0_0_var(--ink)]" : "border-ink/30 hover:border-ink",
                )}
                title={`${i + 1}: ${s.action}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.imageUrl && <img src={s.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <span className="absolute top-0.5 left-0.5 flex gap-0.5">
                  {s.clipStatus === "ready" && <Badge>AI</Badge>}
                  {s.clipStatus === "generating" && <Badge><Spinner className="h-2.5 w-2.5" /></Badge>}
                </span>
                <span className="absolute bottom-0.5 left-0.5 rounded-[2px] bg-card px-1 font-mono text-[9.5px]">{i + 1} · {dur}s</span>
              </button>
              {/* Voice row: one bar per spoken line, as wide as the recording (when there is one). */}
              <div className="h-5">
                {voice && (
                  <span
                    className={cn(
                      "flex h-full items-center gap-1 overflow-hidden rounded-[3px] px-1 font-mono text-[9.5px] whitespace-nowrap",
                      s.audioStatus === "ready" ? "bg-ink text-white" : "border border-dashed border-ink/50 text-graphite",
                      long && "outline-2 outline-accent",
                    )}
                    style={{ width: s.audioSeconds ? `${Math.min(100, (s.audioSeconds / dur) * 100)}%` : "100%" }}
                    title={long ? `The line runs ${s.audioSeconds!.toFixed(1)}s, longer than the shot. Drag the shot wider.` : `${s.speaker || "Voice"}: ${voice}`}
                  >
                    <Mic className="h-2.5 w-2.5 shrink-0" /> {s.speaker || "voice"}{s.audioStatus === "stale" && " · changed"}
                  </span>
                )}
              </div>
              <span
                role="slider"
                aria-label={`Length of shot ${i + 1}`}
                aria-valuemin={1}
                aria-valuemax={15}
                aria-valuenow={dur}
                tabIndex={0}
                onKeyDown={(e) => {
                  const d = e.key === "ArrowRight" ? 0.5 : e.key === "ArrowLeft" ? -0.5 : 0;
                  if (d) onDuration(s.id, Math.min(15, Math.max(1, s.duration + d)));
                }}
                onPointerDown={down(s)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                className="absolute top-0 -right-1 z-10 flex h-[60px] w-3 cursor-ew-resize touch-none items-center justify-center"
                title="Drag to make this shot longer or shorter"
              >
                <span className={cn("h-7 w-1 rounded-full", drag?.id === s.id ? "bg-accent" : "bg-ink/40")} />
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-graphite">Drag the edge of a shot to change how long it lasts.</p>
    </div>
  );
}
