"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Download, FileText, Film, LayoutGrid, ListChecks, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { Button, Logo, Spinner, cn } from "@/components/ui";
import { ProviderBadge } from "@/components/provider-badge";
import { GuestBanner } from "@/components/guest-banner";
import { useProject } from "@/store/project-store";
import { STEPS, bestStep, stepFromPath, stepStates, type StepKey } from "@/lib/steps";

const ICONS: Record<StepKey, React.ElementType> = { script: FileText, review: ListChecks, cast: Users, board: LayoutGrid, movie: Film };

export function ProjectShell({ id, children }: { id: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { bundle, error, load, patchProject } = useProject();
  const [title, setTitle] = useState("");
  const [syncedTitle, setSyncedTitle] = useState<string | null>(null);
  if (bundle && bundle.project.title !== syncedTitle) {
    setSyncedTitle(bundle.project.title);
    setTitle(bundle.project.title);
  }

  useEffect(() => {
    void load(id);
  }, [id, load]);

  const router = useRouter();
  const base = `/p/${id}`;
  const states = bundle ? stepStates(bundle) : null;
  const current = stepFromPath(pathname, base);
  const go = (key: StepKey) => router.push(base + STEPS.find((s) => s.key === key)!.path);

  // Never leave someone on a step that can't work yet (e.g. an empty Board): send them to the right one.
  useEffect(() => {
    if (!states || bundle?.project.status === "breaking_down") return;
    if (!states[current].unlocked) router.replace(base + STEPS.find((s) => s.key === bestStep(states))!.path);
  }, [states?.[current].unlocked, current, bundle?.project.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the script finishes breaking down, move on to step 2 automatically.
  const prevStatus = useRef(bundle?.project.status);
  useEffect(() => {
    const status = bundle?.project.status;
    if (prevStatus.current === "breaking_down" && status === "idle" && bundle?.shots.length) {
      go("review");
    }
    prevStatus.current = status;
  }, [bundle?.project.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the last character finishes drawing on the Cast step, carry on to the board.
  const castDone = states ? states.cast.done : null;
  const prevCastDone = useRef(castDone);
  useEffect(() => {
    if (prevCastDone.current === false && castDone && current === "cast") go("board");
    prevCastDone.current = castDone;
  }, [castDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepLink = (key: StepKey, render: (active: boolean, locked: boolean) => React.ReactNode, className: (active: boolean, locked: boolean) => string) => {
    const step = STEPS.find((s) => s.key === key)!;
    const active = current === key;
    const locked = !!states && !states[key].unlocked;
    if (locked)
      return (
        <button key={key} onClick={() => toast(states![key].lockedReason ?? "Not ready yet")} className={className(false, true)} aria-disabled title={states![key].lockedReason}>
          {render(false, true)}
        </button>
      );
    return (
      <Link key={key} href={base + step.path} className={className(active, false)} aria-current={active ? "page" : undefined} title={step.label}>
        {render(active, false)}
      </Link>
    );
  };

  // The one obvious next move, shown when the following step is ready.
  const idx = STEPS.findIndex((s) => s.key === current);
  const nextStep = STEPS[idx + 1];
  // Check has its own "Looks good" button, so it never gets a second one.
  const showNext =
    !!states && !!nextStep && current !== "review" && states[nextStep.key].unlocked && states[current].done && bundle?.project.status !== "breaking_down";
  if (error)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <p className="font-hand text-2xl">{error}</p>
        <Link href="/" className="underline">Back to boards</Link>
      </div>
    );

  const p = bundle?.project;
  return (
    <div className="flex h-dvh flex-col">
      <GuestBanner />
      <header className="relative z-20 flex shrink-0 items-center gap-4 border-b-2 border-ink bg-paper px-3 py-2 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
          <Link href="/" aria-label="All boards" className="shrink-0">
            <Logo className="[&>span:last-child]:hidden xl:[&>span:last-child]:inline" />
          </Link>
          <span className="hidden h-5 w-px bg-rule sm:block" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== p?.title && patchProject({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full min-w-0 truncate rounded bg-transparent px-1 text-[15px] font-bold tracking-tight hover:bg-paper-2 focus:bg-card focus:outline-none md:w-[min(20vw,260px)]"
            aria-label="Project title"
          />
        </div>

        {/* Notebook-divider tabs sitting on the header rule. */}
        <nav className="no-scrollbar hidden min-w-0 flex-1 overflow-x-auto md:block">
          <div className="mx-auto flex w-max gap-1.5 pt-0.5 pb-1.5">
          {STEPS.map((t, i) =>
            stepLink(
              t.key,
              (active, locked) => (
                <>
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[11px] font-bold", active ? "border-white" : "border-ink")}>
                    {locked ? <Lock className="h-2.5 w-2.5" /> : states?.[t.key].done && !active ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                  </span>
                  {/* Narrow desktops: only the current step spells out its name. */}
                  <span className={cn(!active && "hidden lg:inline")}>{t.label}</span>
                </>
              ),
              (active, locked) =>
                cn("key flex h-8 items-center gap-1.5 px-2.5 text-[13px] font-semibold whitespace-nowrap", active && "key-dark key-down", locked && "opacity-45"),
            ),
          )}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-2 pb-1">
          <JobTray />
          <ProviderBadge />
          {/* The PDF is the board's printout, so it lives on the board only (Movie has its own export). */}
          {current === "board" && (
            <a href={`/api/projects/${id}/export`} aria-label="Download PDF">
              <Button size="sm" disabled={!bundle?.shots.length}>
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
            </a>
          )}
        </div>
      </header>

      {p?.status === "error" && p.statusError && (
        <div className="flex items-center gap-2 border-b border-accent bg-paper-2 px-5 py-2 text-[13px] text-accent-ink">
          <AlertTriangle className="h-4 w-4" /> Breakdown failed: {p.statusError}
          <Link href={`${base}/script`} className="ml-auto font-semibold underline">Fix script & retry</Link>
        </div>
      )}

      <main className={cn("relative min-h-0 flex-1", !showNext && "pb-[64px] md:pb-0")}>
        {!bundle ? (
          <div className="flex h-full items-center justify-center"><Spinner /></div>
        ) : p?.status === "breaking_down" ? (
          <BreakdownProgress />
        ) : (
          children
        )}
      </main>

      {/* The one obvious next move: a bar of its own, so it never covers the page. */}
      {showNext && (
        <div className="relative z-20 mb-[64px] shrink-0 border-t-2 border-ink bg-paper px-3 py-2.5 md:mb-0">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
            <span className="hidden items-center gap-1.5 text-[13.5px] text-graphite sm:flex">
              <Check className="h-4 w-4" strokeWidth={3} /> This step is done.
            </span>
            <button onClick={() => go(nextStep.key)} className="key key-dark flex h-11 items-center gap-2 px-5 text-[15px] font-semibold max-sm:w-full max-sm:justify-center">
              Next: {nextStep.next} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Phones: big labelled tabs at the bottom, within thumb reach. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Sections">
        {STEPS.map((t, i) => {
          const Icon = ICONS[t.key];
          return stepLink(
            t.key,
            (active, locked) => (
              <>
                {locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                <span>
                  {i + 1}. {t.short}
                </span>
              </>
            ),
            (active, locked) =>
              cn("flex h-[62px] flex-col items-center justify-center gap-1 text-[12px] font-semibold", active ? "bg-ink text-white" : "text-ink", locked && "opacity-40"),
          );
        })}
      </nav>
    </div>
  );
}

/** One small pill, on every step, for anything still drawing or recording; a toast when it all finishes. */
function JobTray() {
  const bundle = useProject((s) => s.bundle);
  const shots = bundle?.shots ?? [];
  const pictures = shots.filter((s) => s.imageStatus === "generating").length;
  const people = bundle?.characters.filter((c) => c.sheetStatus === "generating").length ?? 0;
  const voices = shots.filter((s) => s.audioStatus === "generating").length;
  const moves = shots.filter((s) => s.clipStatus === "generating").length;
  const total = pictures + people + voices + moves;

  const prev = useRef(total);
  useEffect(() => {
    if (prev.current > 0 && total === 0) toast.success("All done!");
    prev.current = total;
  }, [total]);

  if (!total) return null;
  const label = people
    ? `Drawing ${people} character${people > 1 ? "s" : ""}`
    : pictures
      ? `Drawing ${shots.filter((s) => s.imageStatus === "ready").length + 1} of ${shots.length}`
      : voices
        ? "Recording voices"
        : `Animating ${moves} shot${moves > 1 ? "s" : ""}`;
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-card px-2.5 text-[12px] font-semibold whitespace-nowrap" role="status">
      <Spinner className="h-3 w-3" /> <span className="max-sm:sr-only">{label}…</span>
    </span>
  );
}

/** The server reports no sub-steps, so show honest elapsed time instead of a made-up checklist. */
function BreakdownProgress() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <svg viewBox="0 0 64 64" className="pencil-wiggle h-16 w-16" aria-hidden>
        <path d="M10 54l6-16 30-30 10 10-30 30z" fill="var(--highlight)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M10 54l6-16 10 10z" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M40 14l10 10" stroke="var(--ink)" strokeWidth="2.5" />
      </svg>
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Breaking down your script…</h2>
        <p className="mt-1 text-sm text-graphite">
          We&apos;re finding the characters, scenes and shots. This usually takes 15–60 seconds, and keeps going if you leave.
        </p>
      </div>
      <div className="sketching h-3 w-56 rounded-full border-[1.5px] border-ink" role="progressbar" aria-label="Breaking down your script" />
      <p className="font-mono text-[12px] text-graphite">
        {secs}s{secs > 60 && " · taking a little longer than usual"}
      </p>
    </div>
  );
}
