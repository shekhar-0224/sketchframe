"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clapperboard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Logo, Spinner, Stamp, api } from "@/components/ui";
import { ProviderBadge } from "@/components/provider-badge";
import { GuestBanner } from "@/components/guest-banner";
import { NewProjectDialog } from "./new-project-dialog";

type Row = {
  id: string;
  title: string;
  logline: string;
  status: string;
  updatedAt: number;
  shotCount: number;
  cover: string | null;
};

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return new Date(t).toLocaleDateString();
};

export function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<Row[]>("/api/projects").then(setRows).catch((e) => toast.error(e.message));
  }, []);

  async function remove(id: string, title: string) {
    if (!confirm(`Delete “${title}” and all of its panels? This can't be undone.`)) return;
    setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    await api(`/api/projects/${id}`, { method: "DELETE" }).catch((e) => toast.error(e.message));
  }

  return (
    <>
    <GuestBanner />
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <div className="flex items-center gap-3">
          <ProviderBadge />
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New story
          </Button>
        </div>
      </header>

      <section className="paper-card mt-6 mb-12 overflow-hidden shadow-[6px_6px_0_0_var(--ink)]">
        <div className="titlebar flex h-8 items-center justify-center border-b-2 border-ink">
          <span className="bg-card px-3 font-display text-[15px] leading-none">Welcome.sfx</span>
        </div>
        <div className="px-6 py-9 sm:px-10">
          <p className="font-display text-lg text-graphite">&gt; for writers, artists &amp; directors_</p>
          <h1 className="mt-2 max-w-3xl text-[40px] leading-[1.02] sm:text-[64px]">
            Turn words into an <span className="scribble">animated comic</span>.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-graphite">
            Paste a script or an idea. SketchFrame draws it, keeps your characters looking the same, gives them voices and makes it move.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 pb-1">
            <Button variant="ink" size="lg" onClick={() => setOpen(true)}>
              <Clapperboard className="h-4 w-4" /> Make a new story
            </Button>
          </div>
        </div>
      </section>

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold tracking-tight">Your stories</h2>
        {rows && <span className="font-mono text-xs text-graphite">{rows.length} projects</span>}
      </div>

      {!rows ? (
        <div className="flex justify-center py-16 text-graphite">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-pencil py-16 text-graphite transition hover:border-ink hover:text-ink"
        >
          <span className="font-hand text-2xl">Nothing here yet. Make your first story →</span>
        </button>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id} className="group relative">
              <Link href={`/p/${p.id}`} className="paper-card block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[3px_5px_0_0_var(--ink)]">
                <div className="aspect-video border-b-[1.5px] border-ink bg-paper-2">
                  {p.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center font-hand text-lg text-pencil">no panels yet</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[17px] font-bold tracking-tight">{p.title}</h3>
                    {p.status === "breaking_down" && <Stamp tone="blue">breaking down</Stamp>}
                  </div>
                  <p className="mt-1 line-clamp-2 min-h-[2.5em] text-[13px] text-graphite">{p.logline || "—"}</p>
                  <div className="mt-3 flex justify-between font-mono text-[11px] text-pencil">
                    <span>{p.shotCount} shots</span>
                    <span>{ago(p.updatedAt)}</span>
                  </div>
                </div>
              </Link>
              <button
                onClick={() => remove(p.id, p.title)}
                className="absolute top-2 right-2 rounded border border-ink bg-card p-1.5 text-graphite opacity-0 transition group-hover:opacity-100 hover:text-accent focus:opacity-100"
                aria-label={`Delete ${p.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <NewProjectDialog open={open} onClose={() => setOpen(false)} />
    </div>
    </>
  );
}
