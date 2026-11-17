"use client";

import { toast } from "sonner";
import { useProject } from "@/store/project-store";

/** Ask the browser for an image file. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Sketch-to-image: upload a rough sketch as the shot's layout and redraw from it. */
export async function uploadLayout(shotId: string, file: File) {
  const store = useProject.getState();
  useProject.setState((s) =>
    s.bundle
      ? { bundle: { ...s.bundle, shots: s.bundle.shots.map((x) => (x.id === shotId ? { ...x, imageStatus: "generating" } : x)) } }
      : s,
  );
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/shots/${shotId}/layout`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) {
    toast.error(data.error);
    return store.refresh();
  }
  toast("Turning your sketch into a clean panel…");
  void store.refresh();
}

export async function clearLayout(shotId: string) {
  await fetch(`/api/shots/${shotId}/layout`, { method: "DELETE" });
  useProject.setState((s) =>
    s.bundle ? { bundle: { ...s.bundle, shots: s.bundle.shots.map((x) => (x.id === shotId ? { ...x, layoutUrl: null } : x)) } } : s,
  );
}

/** Replace the panel with an uploaded image as-is. */
export async function replaceImage(shotId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/shots/${shotId}/image`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) return toast.error(data.error);
  useProject.getState().setShotImage(shotId, data);
  void useProject.getState().refresh(); // picks up the new take
}

export async function saveEditedImage(shotId: string, dataUrl: string, useAsLayout: boolean) {
  const res = await fetch(`/api/shots/${shotId}/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, useAsLayout }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  useProject.getState().setShotImage(shotId, data);
  void useProject.getState().refresh(); // picks up the new take
}

/** Switch a shot back (or forward) to another of its pictures. */
export async function pickTake(shotId: string, takeId: string) {
  const res = await fetch(`/api/shots/${shotId}/takes/${takeId}`, { method: "POST" });
  if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't switch pictures");
  await useProject.getState().refresh();
}

/** Open a shot's details: the side list on desktop, a bottom sheet on phones. */
export function openShot(shotId: string) {
  useProject.getState().select(shotId);
  window.dispatchEvent(new CustomEvent("sf:open-shot", { detail: shotId }));
}


/** Switch a character back (or forward) to another of their drawings. */
export async function pickSheet(characterId: string, takeId: string) {
  const res = await fetch(`/api/characters/${characterId}/sheet/takes/${takeId}`, { method: "POST" });
  if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't switch drawings");
  await useProject.getState().refresh();
}
