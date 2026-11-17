"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, Feather, KeyRound, Layers, Mic, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Button, Logo, api } from "@/components/ui";
import { PublicPlayer } from "@/components/movie/public-player";
import type { MovieShot } from "@/lib/movie/engine";
import { effectsFor } from "@/lib/effects";

type DemoShot = Omit<MovieShot, "effects"> & { effects: null; scene: string; action: string; notes: string; promptExtra: string };
type Demo = { title: string; logline: string; aspectRatio: string; shots: DemoShot[] };

const STEPS = [
  { t: "Script", d: "Paste a script or an idea — or upload a file." },
  { t: "Cast", d: "Your characters are drawn once, so they look the same in every picture." },
  { t: "Board", d: "Every shot becomes a black-and-white pencil sketch you can redraw." },
  { t: "Movie", d: "Voices, motion, rain and light — then download or share it." },
];

const FEATURES = [
  { icon: Users, t: "Characters stay on-model", d: "Every panel is drawn from each character's locked front/¾/side sheet." },
  { icon: Layers, t: "Free camera motion", d: "Depth-aware parallax, rain, neon flicker, headlight sweeps — computed in your browser." },
  { icon: Mic, t: "Real voices", d: "A voice per character, plus a narrator. OpenAI, Sarvam (Hindi, Tamil…) or ElevenLabs." },
  { icon: Feather, t: "Hand-drawn look", d: "Clean pencil-and-ink sketches on white paper, never colour or photo-real." },
  { icon: Sparkles, t: "AI animation when it matters", d: "Turn key panels into real moving shots with Kling or Seedance." },
  { icon: KeyRound, t: "Free while we grow", d: "No card, no keys, no setup. Paid plans are coming soon." },
];

/** Public front door: show the product working before asking for anything. */
export function Landing() {
  const router = useRouter();
  const [demo, setDemo] = useState<Demo | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch("/demo/demo.json").then((r) => r.json()).then(setDemo).catch(() => {});
  }, []);

  async function tryFree() {
    setStarting(true);
    try {
      await api("/api/auth/guest", { method: "POST" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(false);
    }
  }

  const shots: MovieShot[] | null = demo
    ? demo.shots.map((s) => ({ ...s, effects: effectsFor(s, s.scene) }))
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <div className="flex items-center gap-2 pb-1">
          <Link href="/login" className="key flex h-9 items-center px-3.5 text-[13px] font-semibold">Sign in</Link>
          <Button variant="ink" onClick={tryFree} loading={starting}>Try free</Button>
        </div>
      </header>

      <section className="grid items-center gap-10 py-8 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="font-display text-lg text-graphite">&gt; for writers, artists &amp; directors_</p>
          <h1 className="mt-2 text-[40px] leading-[1.02] sm:text-[58px]">
            Turn words into an <span className="scribble">animated comic</span> movie.
          </h1>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-graphite">
            Paste a script or a one-line idea. SketchFrame storyboards it, keeps your characters on-model, gives them voices,
            and brings every panel to life.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 pb-1">
            <Button variant="ink" size="lg" onClick={tryFree} loading={starting}>
              <Clapperboard className="h-4 w-4" /> Try it free — no signup
            </Button>
            <Link href="/login" className="key flex h-11 items-center px-5 text-[15px] font-semibold">Sign in</Link>
          </div>
          <p className="mt-3 text-[12.5px] text-graphite">Free tier works without any account or AI keys. Sign in any time to keep your boards.</p>
        </div>
        <div>
          {shots ? (
            <PublicPlayer shots={shots} aspectRatio={demo!.aspectRatio} autoplay loop />
          ) : (
            <div className="aspect-video rounded-[4px] border-2 border-ink bg-black" />
          )}
          <p className="mt-2 text-center font-mono text-[11px] text-graphite uppercase">
            Live demo · {demo?.title ?? "loading"} · {demo?.shots.length ?? 9} shots, drawn and voiced by SketchFrame
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="mb-4 text-[26px]">How it works</h2>
        {/* Plain numbered steps (deliberately not keycaps: they aren't buttons). */}
        <ol className="grid gap-5 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex gap-3 sm:flex-col">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink font-display text-[16px]">{i + 1}</span>
              <span>
                <span className="block text-[16px] font-semibold">{s.t}</span>
                <span className="mt-0.5 block text-[13.5px] leading-snug text-graphite">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.t} className="paper-card p-4">
            <f.icon className="mb-2 h-5 w-5" />
            <h3 className="text-[17px]">{f.t}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-graphite">{f.d}</p>
          </article>
        ))}
      </section>

      <section className="paper-card mt-14 flex flex-col items-start justify-between gap-4 p-6 shadow-[6px_6px_0_0_var(--ink)] sm:flex-row sm:items-center">
        <div>
          <h2 className="text-[24px]">Your first film is a paste away.</h2>
          <p className="mt-1 text-[14px] text-graphite">No card, no signup. Try the sample scene or bring your own pages.</p>
        </div>
        <Button variant="ink" size="lg" onClick={tryFree} loading={starting}>Start free</Button>
      </section>
    </div>
  );
}
