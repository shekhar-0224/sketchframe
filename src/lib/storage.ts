import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { del, get, list, put } from "@vercel/blob";
import { DATA_DIR } from "@/lib/db";

/**
 * File storage. The DB always stores a relative path like "<projectId>/panels/x.png".
 * Locally those live under data/files; on Vercel (a Blob store is connected) they are
 * *private* blobs at the same pathname. Either way they're served by /api/files, which
 * checks the signed-in user owns the project.
 */
export const FILES_DIR = path.join(DATA_DIR, "files");
export const BLOB = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

const TYPES: Record<string, string> = { png: "image/png", wav: "audio/wav", mp4: "video/mp4" };
export const contentTypeFor = (rel: string) => TYPES[rel.split(".").pop() ?? ""] ?? "application/octet-stream";

async function write(rel: string, data: Buffer) {
  if (BLOB) {
    await put(rel, data, { access: "private", contentType: contentTypeFor(rel), addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const abs = absPath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

/** Read a stored file into memory (images for AI references, PDF export…). */
export async function readFile(rel: string): Promise<Buffer> {
  if (!BLOB) return fs.readFile(absPath(rel));
  const res = await get(rel, { access: "private" });
  if (!res || !res.stream) throw new Error(`File not found: ${rel}`);
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

export function absPath(rel: string) {
  const abs = path.resolve(FILES_DIR, rel);
  if (!abs.startsWith(FILES_DIR + path.sep)) throw new Error("Invalid file path");
  return abs;
}

export function fileUrl(rel: string | null | undefined, version?: number) {
  if (!rel) return null;
  return `/api/files/${rel}${version ? `?v=${version}` : ""}`;
}

/** Normalise any incoming image (upload, AI output, canvas edit) to PNG and store it. */
export async function saveImage(
  projectId: string,
  folder: string,
  input: Buffer,
  opts?: { maxSize?: number; look?: "film" | "sketch" },
) {
  const rel = path.posix.join(projectId, folder, `${nanoid(12)}.png`);
  let img = sharp(input, { failOn: "none" }).rotate();
  if (opts?.maxSize) img = img.resize(opts.maxSize, opts.maxSize, { fit: "inside", withoutEnlargement: true });
  // Flatten transparency onto paper white so sketches never come back with black backgrounds.
  let out = await img.flatten({ background: "#ffffff" }).png().toBuffer();
  if (opts?.look) out = await monochrome(out, opts.look);
  await write(rel, out);
  return rel;
}

/**
 * AI output is never trusted to stay black and white: strip any colour, and for the film look
 * add a touch of contrast and the same fine grain everywhere so every frame reads as one film.
 */
async function monochrome(input: Buffer, look: "film" | "sketch") {
  const grey = sharp(input).greyscale();
  if (look === "sketch") return grey.toColourspace("srgb").png().toBuffer();
  const { width = 1024, height = 1024 } = await sharp(input).metadata();
  const grain = await sharp({ create: { width, height, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 14 } } })
    .greyscale()
    .png()
    .toBuffer();
  return sharp(await grey.linear(1.08, -10).toColourspace("srgb").png().toBuffer())
    .composite([{ input: grain, blend: "overlay" }])
    .greyscale()
    .toColourspace("srgb")
    .png()
    .toBuffer();
}

/** Store a non-image asset (voice WAV, video MP4) as-is. */
export async function saveFile(projectId: string, folder: string, data: Buffer, ext: "wav" | "mp4") {
  const rel = path.posix.join(projectId, folder, `${nanoid(12)}.${ext}`);
  await write(rel, data);
  return rel;
}

export const readImage = readFile;

export async function removeFile(rel: string | null | undefined) {
  if (!rel) return;
  if (BLOB) await del(rel).catch(() => {});
  else await fs.rm(absPath(rel), { force: true }).catch(() => {});
}

export async function removeProjectFiles(projectId: string) {
  if (BLOB) {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${projectId}/`, cursor });
      if (page.blobs.length) await del(page.blobs.map((b) => b.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return;
  }
  await fs.rm(path.join(FILES_DIR, projectId), { recursive: true, force: true }).catch(() => {});
}

export function dataUrlToBuffer(dataUrl: string) {
  const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("Expected a base64 image data URL");
  return Buffer.from(m[1], "base64");
}
