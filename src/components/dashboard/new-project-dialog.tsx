"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Lightbulb, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Modal, Spinner, Textarea, api, cn } from "@/components/ui";
import { ASPECT_RATIOS } from "@/lib/vocab";

type Mode = "paste" | "upload" | "idea" | "poem";

const MODES: { id: Mode; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "paste", label: "Paste script", icon: PenLine, hint: "Screenplay or story text" },
  { id: "upload", label: "Upload file", icon: FileUp, hint: "TXT, PDF, DOCX, Fountain, FDX" },
  { id: "idea", label: "Type an idea", icon: Lightbulb, hint: "A premise — we'll draft the pages" },
];

const SAMPLE_POEM = `The lighthouse keeper climbs at dusk,
his lantern swinging like a heart.
Below, the sea forgets the shore
and every ship forgets its chart.

He lights the glass for no one now —
the last boat left a year ago —
but still the beam goes sweeping out
to tell the dark that someone's home.`;

const SAMPLE = `INT. NIGHT DINER - 2 AM

Rain streaks the windows. MAYA (30s, cropped silver hair, oversized bomber jacket) slides into a booth across from OLD TOM (70s, wiry, flat cap, cardigan with elbow patches).

MAYA
You said you'd never come back here.

OLD TOM
I said a lot of things.

Tom pushes a battered envelope across the table. Maya doesn't touch it.

EXT. DINER PARKING LOT - CONTINUOUS

Maya bursts out into the rain, envelope in hand. Headlights sweep across her face.`;

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [aspect, setAspect] = useState<string>("16:9");
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File) {
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/parse-script", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setText(data.text);
      setFileName(f.name);
      if (!title) setTitle(data.name);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const p = await api<{ id: string }>("/api/projects", {
        method: "POST",
        json: {
          title: title.trim() || "Untitled board",
          mode: mode === "idea" ? "idea" : mode === "poem" ? "poem" : "script",
          text,
          aspectRatio: aspect,
        },
      });
      router.push(`/p/${p.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New story" className="max-w-2xl">
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-2.5 pb-1 sm:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "key p-3 text-left",
                mode === m.id && "key-dark key-down",
              )}
            >
              <m.icon className="mb-2 h-4 w-4" />
              <div className="text-[13px] font-bold">{m.label}</div>
              <div className={cn("mt-0.5 text-[11px] leading-snug", mode === m.id ? "text-white/70" : "text-graphite")}>{m.hint}</div>
            </button>
          ))}
        </div>

        <label className="block">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Night Diner" autoFocus />
        </label>

        {mode === "upload" && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.pdf,.docx,.fountain,.fdx,.md,text/plain,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              className="flex w-full flex-col items-center gap-1 rounded-[5px] border-2 border-dashed border-pencil bg-paper py-8 text-graphite transition hover:border-ink hover:text-ink"
            >
              {parsing ? <Spinner /> : <FileUp className="h-5 w-5" />}
              <span className="text-sm font-semibold">{fileName ?? "Drop a script here or click to browse"}</span>
              <span className="text-xs">TXT · PDF · DOCX · Fountain · FDX</span>
            </button>
          </div>
        )}

        {(mode === "paste" || (mode === "upload" && text) || mode === "idea" || mode === "poem") && (
          <label className="block">
            <div className="flex items-end justify-between">
              <Label>{mode === "idea" ? "Your idea" : mode === "poem" ? "Your poem or lyrics" : mode === "upload" ? "Extracted text (editable)" : "Script"}</Label>
              {mode === "poem" && !text && (
                <button className="mb-1 font-hand text-sm text-blue hover:underline" onClick={() => { setText(SAMPLE_POEM); if (!title) setTitle("The Keeper"); }}>
                  try a sample poem
                </button>
              )}
              {mode === "paste" && !text && (
                <button className="mb-1 font-hand text-sm text-blue hover:underline" onClick={() => { setText(SAMPLE); if (!title) setTitle("The Night Diner"); }}>
                  try a sample scene
                </button>
              )}
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={mode === "idea" ? 4 : 11}
              className={mode === "idea" ? "" : mode === "poem" ? "font-serif text-[14px] leading-relaxed italic" : "font-mono text-[12.5px]"}
              placeholder={
                mode === "idea"
                  ? "A retired lighthouse keeper discovers the light has been signalling someone across the sea…"
                  : "INT. NIGHT DINER - 2 AM\n\nMAYA slides into the booth…"
              }
            />
          </label>
        )}

        <div>
          <Label>Frame</Label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {ASPECT_RATIOS.map((a) => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                className={cn(
                  "key h-7 px-2.5 font-mono text-xs",
                  aspect === a && "key-dark key-down",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t-2 border-ink bg-paper-2 px-5 py-3">
        <p className="text-xs text-graphite">
          {mode === "poem" ? "Each stanza becomes a scene, each line a narrated shot." : "We find the characters, scenes and shots for you."}
        </p>
        <Button variant="primary" onClick={create} loading={busy} disabled={!text.trim()}>
          Break it down
        </Button>
      </div>
    </Modal>
  );
}
