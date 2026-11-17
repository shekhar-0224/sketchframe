"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Subtitles, Volume2, VolumeX } from "lucide-react";
import { MovieEngine, type MovieShot } from "@/lib/movie/engine";
import { cn } from "@/components/ui";

/**
 * Read-only comic-movie player for share links and the landing-page demo. Starts muted
 * (browsers block autoplay with sound); one click turns the voices on.
 */
export function PublicPlayer({
  shots,
  aspectRatio,
  autoplay = false,
  loop = false,
  className,
}: {
  shots: MovieShot[];
  aspectRatio: string;
  autoplay?: boolean;
  loop?: boolean;
  className?: string;
}) {
  const portrait = aspectRatio === "9:16";
  const W = portrait ? 720 : 1280;
  const H = portrait ? 1280 : 720;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useMemo(() => {
    const e = new MovieEngine(W, H);
    e.setShots(shots);
    return e;
  }, [shots, W, H]);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const tRef = useRef(0);
  const audio = useRef<{ ctx: AudioContext | null; sources: AudioBufferSourceNode[] }>({ ctx: null, sources: [] });

  useEffect(() => {
    let alive = true;
    void engine.load().then(() => {
      if (!alive) return;
      setReady(true);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) engine.draw(ctx, 0, { captions: true });
      if (autoplay) setPlaying(true);
    });
    return () => {
      alive = false;
      engine.dispose();
    };
  }, [engine, autoplay]);

  const stopAudio = () => {
    audio.current.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    audio.current.sources = [];
  };

  const startAudio = async (from: number) => {
    stopAudio();
    const ctx = (audio.current.ctx ??= new AudioContext());
    if (ctx.state === "suspended") await ctx.resume();
    await engine.load(ctx);
    const now = ctx.currentTime + 0.05;
    engine.shots.forEach((s, i) => {
      const buf = engine.audioFor(s.id);
      if (!buf) return;
      const offset = from - engine.starts[i];
      if (offset >= buf.duration) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(offset >= 0 ? now : now - offset, Math.max(0, offset));
      audio.current.sources.push(src);
    });
  };

  useEffect(() => {
    if (!playing || !ready) return;
    let frame = 0;
    const startedAt = performance.now() - tRef.current * 1000;
    if (sound) void startAudio(tRef.current);
    const step = () => {
      let t = (performance.now() - startedAt) / 1000;
      if (t >= engine.total) {
        if (!loop) {
          tRef.current = 0;
          setPlaying(false);
          setProgress(0);
          return;
        }
        // Restart the loop (and its audio) from the top.
        tRef.current = 0;
        setPlaying(false);
        requestAnimationFrame(() => setPlaying(true));
        return;
      }
      t = Math.max(0, t);
      tRef.current = t;
      engine.syncVideos(t, true);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) engine.draw(ctx, t, { captions });
      setProgress(t / engine.total);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      stopAudio();
      engine.syncVideos(tRef.current, false);
    };
  }, [playing, ready, sound, captions, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSound = () => {
    setSound((s) => !s);
    if (!playing) setPlaying(true);
  };

  return (
    <div className={cn("overflow-hidden rounded-[4px] border-2 border-ink bg-black shadow-[6px_6px_0_0_var(--ink)]", className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={() => setPlaying((p) => !p)}
          className="block w-full cursor-pointer"
          style={{ aspectRatio: `${W} / ${H}` }}
        />
        {!playing && ready && (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/25"
            aria-label="Play"
          >
            <span className="key key-dark flex h-16 w-16 items-center justify-center rounded-full">
              <Play className="h-7 w-7 translate-x-0.5" />
            </span>
          </button>
        )}
        {!ready && <div className="absolute inset-0 flex items-center justify-center font-display text-white">loading…</div>}
      </div>
      <div className="flex items-center gap-2 border-t-2 border-ink bg-paper px-3 py-2">
        <button onClick={() => setPlaying((p) => !p)} className="key key-dark flex h-8 w-8 items-center justify-center" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-ink bg-card">
          <div className="h-full bg-ink" style={{ width: `${progress * 100}%` }} />
        </div>
        <button onClick={toggleSound} className={cn("key flex h-8 items-center gap-1.5 px-2.5 text-[12px] font-semibold", sound && "key-dark key-down")} aria-pressed={sound}>
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{sound ? "Sound on" : "Play with sound"}</span>
        </button>
        <button onClick={() => setCaptions((c) => !c)} className={cn("key flex h-8 w-8 items-center justify-center", captions && "key-dark key-down")} aria-pressed={captions} aria-label="Captions">
          <Subtitles className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
