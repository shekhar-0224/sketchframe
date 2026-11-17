"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { cn } from "@/components/ui";

const KEY = (id: string) => `sf-tip-${id}`;

/**
 * A first-visit hint, shown once per browser and gone after "Got it". Storage can be blocked
 * (private windows), so a failed read just shows the tip and a failed write is ignored.
 */
export function Tip({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY(id)) === "1";
    } catch {}
    // Read after mount so server and client render the same HTML.
    if (!seen) setShow(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [id]);
  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY(id), "1");
    } catch {}
  };
  return (
    <div role="note" className={cn("flex items-start gap-2.5 rounded-[5px] border-2 border-ink bg-highlight/40 px-3 py-2.5 text-[13.5px] shadow-[3px_3px_0_0_var(--ink)]", className)}>
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 leading-snug">{children}</p>
      <button onClick={dismiss} className="key h-8 shrink-0 px-3 text-[12.5px] font-semibold">
        Got it
      </button>
    </div>
  );
}
