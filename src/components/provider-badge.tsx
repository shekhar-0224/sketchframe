"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, KeyRound, LogOut, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Modal, api, cn } from "./ui";

type Provider = "auto" | "openai" | "gemini" | "ollama" | "free" | "mock";
type Speech = "auto" | "browser" | "openai" | "sarvam" | "elevenlabs";
type PresetId = "free" | "budget" | "balanced" | "best";
type Option = { id: string; note: string };
type Settings = {
  preset: PresetId | "custom";
  textProvider: Provider;
  imageProvider: Provider;
  openaiTextModel: string;
  ollamaTextModel: string;
  openaiSheetModel: string;
  openaiCastModel: string;
  openaiFillerModel: string;
  openaiImageQuality: "low" | "medium" | "high";
  geminiTextModel: string;
  geminiImageModel: string;
  speechProvider: Speech;
  openaiTtsModel: string;
  sarvamModel: string;
  sarvamLanguage: string;
  elevenlabsModel: string;
  videoModel: string;
};
type Payload = {
  settings: Settings;
  active: { text: Exclude<Provider, "auto">; image: Exclude<Provider, "auto">; speech: Exclude<Speech, "auto"> };
  keys: { openai: boolean; gemini: boolean; sarvam: boolean; elevenlabs: boolean; fal: boolean };
  localModel: string | null;
  presets: Record<PresetId, { title: string; blurb: string; cost: string }>;
  /** Present when the server lends its OpenAI key: starter drawings left for this user. */
  starter: { left: number; perUser: number; siteLeftToday: number } | null;
  /** Only the owner sees model pickers and keys; everyone else sees the free plan. */
  owner: boolean;
  options: Record<string, Option[]>;
};

const PRESET_ORDER: PresetId[] = ["free", "budget", "balanced", "best"];
const SPEECH: { id: Speech; label: string; key?: keyof Payload["keys"]; note: string }[] = [
  { id: "browser", label: "Browser (free)", note: "preview only" },
  { id: "openai", label: "OpenAI", key: "openai", note: "~1¢/scene, takes acting notes" },
  { id: "sarvam", label: "Sarvam", key: "sarvam", note: "Indian English + Hindi, Tamil…" },
  { id: "elevenlabs", label: "ElevenLabs", key: "elevenlabs", note: "most natural, free tier" },
];

/** Header key: shows the current preset; opens the settings panel. */
export function ProviderBadge() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api<Payload>("/api/settings").then(setData).catch(() => {}), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return null;
  // Only talk about starter drawings when pictures actually use them.
  const label = !data.owner
    ? "Free plan"
    : data.starter && data.active.image === "openai"
    ? data.starter.left > 0
      ? `${data.starter.left} free HD drawings today`
      : "Free AI"
    : data.settings.preset === "custom"
      ? "Custom"
      : data.presets[data.settings.preset].title;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="key flex h-8 items-center gap-1.5 px-2.5 font-mono text-[11px] font-semibold uppercase"
        title={`AI settings — ${label}`}
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">AI: {label}</span>
      </button>
      {open &&
        (data.owner ? (
          <SettingsModal data={data} onSaved={setData} onClose={() => setOpen(false)} />
        ) : (
          <PlanModal data={data} onClose={() => setOpen(false)} />
        ))}
    </>
  );
}

/** What everyone but the owner sees: the free plan, and paid plans "coming soon". */
function PlanModal({ data, onClose }: { data: Payload; onClose: () => void }) {
  const left = data.active.image === "openai" ? data.starter?.left : undefined;
  return (
    <Modal open onClose={onClose} title="Your plan" className="max-w-md">
      <div className="space-y-4 p-5">
        <section className="key key-dark key-down flex flex-col items-start gap-1 p-4 text-left">
          <span className="font-display text-[20px] leading-none">Free</span>
          <span className="text-[13px] text-white/80">
            Everything included — sharp drawings, character voices and the movie. No card, no keys.
          </span>
          {left !== undefined && (
            <span className="mt-1 font-mono text-[11px] font-semibold">
              {left > 0 ? `${left} drawings left today` : "Today’s drawings are used up — back tomorrow (simpler drawings until then)"}
            </span>
          )}
        </section>
        <section className="key flex flex-col items-start gap-1 p-4 text-left opacity-70">
          <span className="flex w-full items-center justify-between">
            <span className="font-display text-[20px] leading-none">Paid plans</span>
            <span className="rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-[10px] text-white uppercase">Coming soon</span>
          </span>
        </section>
      </div>
      <div className="flex items-center justify-between gap-3 border-t-2 border-ink bg-paper-2 px-5 py-3">
        <SignOut />
        <Button variant="ink" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

function SettingsModal({ data, onSaved, onClose }: { data: Payload; onSaved: (p: Payload) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function put(body: Partial<Settings> | { preset: PresetId }, what: string) {
    setBusy(what);
    try {
      onSaved(await api<Payload>("/api/settings", { method: "PUT", json: body }));
      toast.success("Saved — applies to the next thing you generate");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const s = data.settings;
  return (
    <Modal open onClose={onClose} title="AI settings" className="max-w-3xl">
      <div className="space-y-6 p-5">
        {/* 1. Presets */}
        <section>
          <h3 className="mb-2 text-[17px]">How much should SketchFrame spend?</h3>
          <div className="grid grid-cols-2 gap-2.5 pb-1 sm:grid-cols-4">
            {PRESET_ORDER.map((id) => {
              const p = data.presets[id];
              const on = s.preset === id;
              const needsKey = id !== "free" && !data.keys.openai && !data.keys.gemini;
              return (
                <button
                  key={id}
                  onClick={() => put({ preset: id }, id)}
                  disabled={!!busy || needsKey}
                  className={cn("key flex min-h-[132px] flex-col items-start gap-1 p-3 text-left disabled:opacity-40", on && "key-dark key-down")}
                  title={needsKey ? "Needs an OpenAI or Gemini key in .env.local" : undefined}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="font-display text-[17px] leading-none">{p.title}</span>
                    {id === "balanced" && <span className={cn("rounded-[2px] px-1 font-mono text-[9px] uppercase", on ? "bg-white text-ink" : "bg-ink text-white")}>pick</span>}
                  </span>
                  <span className={cn("font-mono text-[11px] font-semibold", on ? "text-white" : "text-ink")}>{p.cost}</span>
                  <span className={cn("text-[11.5px] leading-snug", on ? "text-white/75" : "text-graphite")}>{p.blurb}</span>
                </button>
              );
            })}
          </div>
          {s.preset === "custom" && <p className="mt-2 text-[12px] text-graphite">You&apos;re on a custom setup (changed under Advanced). Pick a preset to reset.</p>}
        </section>

        {/* 2. Plain-English summary */}
        <section className="rounded-[4px] border-2 border-ink bg-paper-2 p-3">
          <Label>What runs right now</Label>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <Row k="Reading the script" v={describeText(data)} />
            <Row k="Character sheets" v={describeImage(data, s.openaiSheetModel)} />
            <Row k="Panels with faces" v={describeImage(data, s.openaiCastModel)} />
            <Row k="Backgrounds & wides" v={describeImage(data, s.openaiFillerModel)} />
            <Row k="Voices" v={describeSpeech(data)} />
            <Row k="AI animation" v={data.keys.fal ? `${s.videoModel.replace(/^fal-ai\//, "")} via fal.ai — only when you click “Animate”` : "off — add FAL_KEY to .env.local (Kling, Seedance…)"} />
          </dl>
        </section>

        {/* 3. Voice */}
        <section>
          <h3 className="mb-2 text-[17px]">Voices</h3>
          <div className="flex flex-wrap gap-2 pb-1">
            {SPEECH.map((v) => {
              const missing = v.key && !data.keys[v.key];
              const on = data.active.speech === v.id && (s.speechProvider === v.id || s.speechProvider === "auto");
              return (
                <button
                  key={v.id}
                  disabled={!!busy || !!missing}
                  onClick={() => put({ speechProvider: v.id }, "speech")}
                  className={cn("key flex flex-col items-start px-3 py-1.5 text-left disabled:opacity-40", on && "key-dark key-down")}
                  title={missing ? `Add ${v.key!.toUpperCase()}_API_KEY to .env.local to enable` : undefined}
                >
                  <span className="text-[13px] font-semibold">{v.label}</span>
                  <span className={cn("text-[10.5px]", on ? "text-white/70" : "text-graphite")}>{missing ? "no key yet" : v.note}</span>
                </button>
              );
            })}
          </div>
          {data.active.speech === "sarvam" && (
            <div className="mt-3 flex items-center gap-2">
              <Label className="mb-0">Language</Label>
              <select
                value={s.sarvamLanguage}
                onChange={(e) => put({ sarvamLanguage: e.target.value }, "speech")}
                className="rounded-[3px] border-[1.5px] border-ink bg-card px-2 py-1 text-[13px]"
              >
                {data.options.sarvamLanguage.map((o) => (
                  <option key={o.id} value={o.id}>{o.note}</option>
                ))}
              </select>
            </div>
          )}
          <p className="mt-2 text-[11.5px] text-graphite">Pick each character&apos;s voice on the Movie tab.</p>
        </section>

        <YourKeys onChanged={async () => onSaved(await api<Payload>("/api/settings"))} />

        <Advanced data={data} onSave={(patch) => put(patch, "advanced")} saving={busy === "advanced"} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t-2 border-ink bg-paper-2 px-5 py-3">
        <SignOut />
        <Button variant="ink" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-graphite">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </>
  );
}

function describeText(d: Payload) {
  const s = d.settings;
  switch (d.active.text) {
    case "ollama":
      return `${s.ollamaTextModel} on this Mac — free${d.localModel === s.ollamaTextModel ? "" : " (not downloaded yet!)"}`;
    case "openai":
      return `OpenAI ${s.openaiTextModel}`;
    case "gemini":
      return `Gemini ${s.geminiTextModel}`;
    case "free":
      return "Free AI — no key needed";
    default:
      return "offline parser (screenplay format only)";
  }
}

function describeImage(d: Payload, openaiModel: string) {
  if (d.active.image === "openai" && d.starter)
    return d.starter.left > 0
      ? `OpenAI ${openaiModel} — ${d.starter.left} of ${d.starter.perUser} free HD drawings left today, then Free AI`
      : "Free AI (today’s HD drawings used up — back tomorrow, or add your own key)";
  if (d.active.image === "openai") return `OpenAI ${openaiModel} · ${d.settings.openaiImageQuality} quality`;
  if (d.active.image === "gemini") return `Gemini ${d.settings.geminiImageModel}`;
  if (d.active.image === "free") return "Free AI sketches";
  return "offline placeholder stick figures";
}

function describeSpeech(d: Payload) {
  const s = d.settings;
  switch (d.active.speech) {
    case "openai":
      return `OpenAI ${s.openaiTtsModel}`;
    case "sarvam":
      return `Sarvam ${s.sarvamModel} · ${d.options.sarvamLanguage.find((o) => o.id === s.sarvamLanguage)?.note ?? s.sarvamLanguage}`;
    case "elevenlabs":
      return `ElevenLabs ${s.elevenlabsModel}`;
    default:
      return "browser voices — free, preview only";
  }
}

/** Every individual knob, folded away. Saving here switches the preset to "Custom". */
function Advanced({ data, onSave, saving }: { data: Payload; onSave: (p: Partial<Settings>) => void; saving: boolean }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(data.settings);
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));

  const select = (value: string, options: Option[] | undefined, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-[3px] border-[1.5px] border-ink bg-card px-2 py-1.5 font-mono text-[12.5px]">
      {[...new Set([value, ...(options ?? []).map((o) => o.id)])].map((id) => {
        const note = options?.find((o) => o.id === id)?.note;
        return <option key={id} value={id}>{id}{note ? ` — ${note}` : ""}</option>;
      })}
    </select>
  );
  const field = (label: string, el: React.ReactNode) => (
    <label className="block">
      <Label>{label}</Label>
      {el}
    </label>
  );
  const choice = <T extends string>(value: T, items: { id: T; label: string; disabled?: boolean }[], onChange: (v: T) => void) => (
    <div className="flex flex-wrap gap-1.5 pb-1">
      {items.map((it) => (
        <button key={it.id} disabled={it.disabled} onClick={() => onChange(it.id)} className={cn("key h-7 px-2.5 text-[12px] font-semibold disabled:opacity-40", value === it.id && "key-dark key-down")}>
          {it.label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="border-t-2 border-dashed border-ink/30 pt-4">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[14px] font-semibold" aria-expanded={open}>
        <ChevronDown className={cn("h-4 w-4 transition", !open && "-rotate-90")} /> Advanced — pick every model yourself
      </button>
      {open && (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            {field(
              "Script reading uses",
              choice(s.textProvider, [
                { id: "auto", label: "Auto" },
                { id: "ollama", label: "Ollama (free)", disabled: !data.localModel },
                { id: "openai", label: "OpenAI", disabled: !data.keys.openai },
                { id: "gemini", label: "Gemini", disabled: !data.keys.gemini },
                { id: "free", label: "Free AI" },
                { id: "mock", label: "Offline" },
              ], (v) => set({ textProvider: v })),
            )}
            {s.textProvider === "ollama" && field("Ollama model", select(s.ollamaTextModel, data.options.ollamaText, (v) => set({ ollamaTextModel: v })))}
            {(s.textProvider === "openai" || (s.textProvider === "auto" && data.keys.openai)) &&
              field("OpenAI text model", select(s.openaiTextModel, data.options.openaiText, (v) => set({ openaiTextModel: v })))}
            {field("Voice model (OpenAI)", select(s.openaiTtsModel, data.options.openaiTts, (v) => set({ openaiTtsModel: v })))}
            {field("Voice model (ElevenLabs)", select(s.elevenlabsModel, data.options.elevenlabsModel, (v) => set({ elevenlabsModel: v })))}
            {field("AI animation model (fal.ai)", select(s.videoModel, data.options.falVideo, (v) => set({ videoModel: v })))}
          </div>
          <div className="space-y-3">
            {field(
              "Drawings use",
              choice(s.imageProvider, [
                { id: "auto", label: "Auto" },
                { id: "openai", label: "OpenAI", disabled: !data.keys.openai },
                { id: "gemini", label: "Gemini", disabled: !data.keys.gemini },
                { id: "free", label: "Free AI" },
                { id: "mock", label: "Offline" },
              ], (v) => set({ imageProvider: v })),
            )}
            {field("Character sheets", select(s.openaiSheetModel, data.options.openaiImage, (v) => set({ openaiSheetModel: v })))}
            {field("Panels with faces", select(s.openaiCastModel, data.options.openaiImage, (v) => set({ openaiCastModel: v })))}
            {field("Backgrounds & wides", select(s.openaiFillerModel, data.options.openaiImage, (v) => set({ openaiFillerModel: v })))}
            {field(
              "Image quality",
              choice(s.openaiImageQuality, [
                { id: "low", label: "Low" },
                { id: "medium", label: "Medium" },
                { id: "high", label: "High" },
              ], (v) => set({ openaiImageQuality: v })),
            )}
          </div>
          <div className="sm:col-span-2 flex justify-end pb-1">
            <Button variant="primary" onClick={() => onSave(s)} loading={saving}>Save advanced settings</Button>
          </div>
        </div>
      )}
    </section>
  );
}

const KEY_INFO: Record<string, { label: string; what: string; url: string }> = {
  OPENAI_API_KEY: { label: "OpenAI", what: "sketches, script reading, voices", url: "https://platform.openai.com/api-keys" },
  GEMINI_API_KEY: { label: "Google Gemini", what: "sketches, script reading", url: "https://aistudio.google.com/apikey" },
  FAL_KEY: { label: "fal.ai", what: "AI animation (Kling, Seedance)", url: "https://fal.ai/dashboard/keys" },
  SARVAM_API_KEY: { label: "Sarvam", what: "Indian-language voices", url: "https://dashboard.sarvam.ai" },
  ELEVENLABS_API_KEY: { label: "ElevenLabs", what: "natural voices", url: "https://elevenlabs.io/app/settings/api-keys" },
};

type KeyRow = { name: string; last4: string | null; fromServer: boolean };

/** Bring-your-own keys: stored encrypted on your account; you pay your provider directly. */
function YourKeys({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<KeyRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<KeyRow[]>("/api/keys").then(setRows).catch(() => {});
  }, []);

  async function save(name: string, v: string | null) {
    setBusy(true);
    try {
      setRows(await api<KeyRow[]>("/api/keys", { method: "PUT", json: { name, value: v } }));
      setEditing(null);
      setValue("");
      toast.success(v ? "Key saved (encrypted)" : "Key removed");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 text-[17px]"><KeyRound className="h-4 w-4" /> Your API keys</h3>
      <p className="mb-2 text-[12px] text-graphite">Generation runs on your own accounts, so you pay the providers directly. Keys are encrypted and never shown again.</p>
      <div className="divide-y divide-rule rounded-[4px] border-2 border-ink">
        {(rows ?? []).map((k) => {
          const info = KEY_INFO[k.name];
          return (
            <div key={k.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-[150px] flex-1">
                <div className="text-[13px] font-semibold">{info?.label ?? k.name}</div>
                <div className="text-[11px] text-graphite">{info?.what}</div>
              </div>
              {editing === k.name ? (
                <form
                  className="flex flex-1 gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (value.trim()) void save(k.name, value.trim());
                  }}
                >
                  <Input type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste key" className="h-8 min-w-0 font-mono text-[12px]" />
                  <Button size="sm" variant="primary" loading={busy} type="submit">Save</Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <span className="font-mono text-[11.5px] text-graphite">
                    {k.last4 ? `••••${k.last4}` : k.fromServer ? "using server key" : "not set"}
                  </span>
                  <Button size="sm" onClick={() => setEditing(k.name)}>{k.last4 ? "Replace" : "Add"}</Button>
                  {k.last4 && <Button size="sm" variant="ghost" onClick={() => save(k.name, null)} disabled={busy}>Remove</Button>}
                  {info && !k.last4 && (
                    <a href={info.url} target="_blank" rel="noreferrer" className="text-[11.5px] text-graphite underline hover:text-ink">get one</a>
                  )}
                </>
              )}
            </div>
          );
        })}
        {!rows && <p className="px-3 py-2 text-[12px] text-graphite">Loading…</p>}
      </div>
    </section>
  );
}

function SignOut() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    api<{ email: string }>("/api/auth/me").then((m) => setEmail(m.email)).catch(() => {});
  }, []);
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] text-graphite">
      <span className="truncate">{email ? `Signed in as ${email}` : ""}</span>
      <button
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.replace("/login");
        }}
        className="flex shrink-0 items-center gap-1 underline hover:text-ink"
      >
        <LogOut className="h-3 w-3" /> Sign out
      </button>
    </div>
  );
}
