"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Label, Textarea, api } from "@/components/ui";
import { useProject } from "@/store/project-store";

export function ScriptView() {
  const bundle = useProject((s) => s.bundle)!;
  const { patchProject, refresh } = useProject.getState();
  const { project, scenes, shots } = bundle;
  const [text, setText] = useState(project.scriptText);
  const [logline, setLogline] = useState(project.logline);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(saveTimer.current);
    if (text === project.scriptText) return;
    saveTimer.current = setTimeout(() => patchProject({ scriptText: text }), 700);
    return () => clearTimeout(saveTimer.current);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  async function breakdown() {
    if (shots.length && !confirm(`Re-run the breakdown? This replaces all ${shots.length} shots (characters and their sheets are kept).`)) return;
    setRunning(true);
    try {
      clearTimeout(saveTimer.current);
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { scriptText: text } });
      await api(`/api/projects/${project.id}/breakdown`, { method: "POST" });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function onFile(f: File) {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/parse-script", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error);
    setText(data.text);
    toast.success(`Loaded ${f.name}`);
  }

  const counts = new Map<string, number>();
  shots.forEach((s) => s.sceneId && counts.set(s.sceneId, (counts.get(s.sceneId) ?? 0) + 1));

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-xl font-extrabold tracking-tight">Script</h1>
            <input ref={fileRef} type="file" accept=".txt,.pdf,.docx,.fountain,.fdx,.md" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-3.5 w-3.5" /> Import file
            </Button>
            <Button size="sm" variant="primary" onClick={breakdown} loading={running} disabled={!text.trim()}>
              <Wand2 className="h-3.5 w-3.5" /> {shots.length ? "Re-run breakdown" : "Break down into shots"}
            </Button>
          </div>
          <label className="mb-4 block">
            <Label>Logline</Label>
            <input
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              onBlur={() => logline !== project.logline && patchProject({ logline })}
              placeholder="One sentence: who wants what, and what's in the way."
              className="w-full border-b-[1.5px] border-rule bg-transparent pb-1 font-hand text-lg focus:border-ink focus:outline-none"
            />
          </label>
          {/* A sheet of script paper. */}
          <div className="paper-card relative px-6 py-8 sm:px-14">
            <span className="absolute top-0 bottom-0 left-8 hidden w-px bg-rule sm:block" aria-hidden />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={"INT. LOCATION - DAY\n\nAction lines describe what we see.\n\nCHARACTER\nDialogue goes here."}
              className="min-h-[65dvh] resize-none border-0 bg-transparent p-0 font-mono text-[13px] leading-[1.75] focus:border-0"
            />
          </div>
          <p className="mt-2 text-right font-mono text-[11px] text-pencil">{text.split(/\s+/).filter(Boolean).length} words · autosaved</p>
        </div>
      </div>
      <aside className="shrink-0 border-t-[1.5px] border-ink bg-paper p-4 lg:w-[300px] lg:overflow-y-auto lg:border-t-0 lg:border-l-[1.5px]">
        <Label>Scene breakdown</Label>
        {scenes.length === 0 ? (
          <p className="mt-2 text-sm text-graphite">No scenes yet. Run the breakdown to generate scenes and a shot list.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {scenes.map((s) => (
              <li key={s.id} className="rounded-[5px] border border-rule bg-card p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold uppercase">{s.position + 1}. {s.heading}</span>
                  <span className="shrink-0 font-mono text-[10px] text-graphite">{counts.get(s.id) ?? 0} shots</span>
                </div>
                {s.summary && <p className="mt-1 line-clamp-3 text-[12px] text-graphite">{s.summary}</p>}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
