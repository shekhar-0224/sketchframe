"use client";

/**
 * Depth estimation in the browser (Depth Anything v2 small via transformers.js).
 * Free for everyone and keeps the ONNX runtime + 26 MB model out of the server bundle.
 * The library loads from the CDN on first use; the model is cached by the browser.
 */
const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const MODEL = "onnx-community/depth-anything-v2-small";
const MAX = 768;

type Depth = { data: Uint8Array; width: number; height: number; channels: number };
type Pipe = (url: string) => Promise<{ depth: Depth }>;

let pipePromise: Promise<Pipe> | null = null;

function loadPipe(): Promise<Pipe> {
  return (pipePromise ??= (async () => {
    const t = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ LIB);
    t.env.allowLocalModels = false;
    const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
    try {
      return (await t.pipeline("depth-estimation", MODEL, gpu ? { device: "webgpu", dtype: "fp32" } : { dtype: "q8" })) as Pipe;
    } catch {
      // WebGPU can be listed but unusable (old drivers); WebAssembly always works.
      return (await t.pipeline("depth-estimation", MODEL, { dtype: "q8" })) as Pipe;
    }
  })().catch((err) => {
    pipePromise = null;
    throw err;
  }));
}

/** Grayscale depth (near = white) as a PNG blob, downscaled and softened for parallax. */
export async function estimateDepth(imageUrl: string): Promise<Blob> {
  const pipe = await loadPipe();
  const { depth } = await pipe(new URL(imageUrl, location.href).href);
  const raw = document.createElement("canvas");
  raw.width = depth.width;
  raw.height = depth.height;
  const img = raw.getContext("2d")!.createImageData(depth.width, depth.height);
  for (let i = 0, p = 0; i < depth.width * depth.height; i++, p += depth.channels) {
    const v = depth.data[p];
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  raw.getContext("2d")!.putImageData(img, 0, 0);

  const s = Math.min(1, MAX / Math.max(depth.width, depth.height));
  const out = document.createElement("canvas");
  out.width = Math.round(depth.width * s);
  out.height = Math.round(depth.height * s);
  const ctx = out.getContext("2d")!;
  // A slight blur hides seams where foreground and background slide apart.
  ctx.filter = "blur(1px)";
  ctx.drawImage(raw, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"));
}

/** Compute and store depth for a shot's current panel. */
export async function prepareDepth(shot: { id: string; imageUrl: string; imageVersion: number }) {
  const blob = await estimateDepth(shot.imageUrl);
  const form = new FormData();
  form.append("file", blob, "depth.png");
  form.append("version", String(shot.imageVersion));
  const res = await fetch(`/api/shots/${shot.id}/depth`, { method: "POST", body: form });
  if (!res.ok && res.status !== 409) throw new Error((await res.json().catch(() => ({}))).error || `Depth upload failed (${res.status})`);
}
