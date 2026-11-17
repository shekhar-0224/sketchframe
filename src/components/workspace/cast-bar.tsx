"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { CharacterView } from "@/lib/data";
import { VIEW_LABEL } from "@/lib/vocab";
import { Spinner, cn } from "@/components/ui";

export function primaryRef(c: CharacterView) {
  return c.references.find((r) => r.kind === "upload") ?? c.references.find((r) => r.kind === "front") ?? c.references[0];
}

/** Always-visible cast strip: the model sheets every panel is conditioned on. */
export function CastBar({ characters, projectId }: { characters: CharacterView[]; projectId: string }) {
  const [hover, setHover] = useState<string | null>(null);
  if (!characters.length) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10.5px] tracking-[0.08em] text-graphite uppercase">Cast</span>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto py-1">
        {characters.map((c) => {
          const ref = primaryRef(c);
          return (
            <div key={c.id} className="relative" onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
              <Link
                href={`/p/${projectId}/characters#${c.id}`}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border-[1.5px] bg-card pr-2.5 pl-0.5 text-[12px] font-semibold transition hover:shadow-ink-sm",
                  ref ? "border-ink" : "border-dashed border-pencil text-graphite",
                )}
                title={ref ? `${c.name} — sheet attached to every panel` : `${c.name} — no sheet yet (drawn automatically before their first panel)`}
              >
                <span className="h-7 w-7 overflow-hidden rounded-full border border-rule bg-paper">
                  {c.sheetStatus === "generating" ? (
                    <span className="flex h-full items-center justify-center"><Spinner className="h-3 w-3" /></span>
                  ) : ref ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ref.url} alt="" className="h-full w-full object-cover object-top" />
                  ) : null}
                </span>
                {c.name}
                {c.locked && <Lock className="h-3 w-3 text-accent" />}
              </Link>
              {hover === c.id && c.references.length > 0 && (
                <div className="paper-card absolute top-11 left-0 z-30 flex gap-1.5 p-2 shadow-[3px_4px_0_0_var(--ink)]">
                  {c.references.map((r) => (
                    <figure key={r.id} className="w-24">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="" className="aspect-square w-full rounded-[3px] border border-rule bg-white object-contain" />
                      <figcaption className="mt-0.5 text-center font-mono text-[9.5px] text-graphite uppercase">{VIEW_LABEL[r.kind]}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
