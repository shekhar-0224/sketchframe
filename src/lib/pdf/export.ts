import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import type { ProjectBundle } from "@/lib/data";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { readImage } from "@/lib/storage";
import { abbr } from "@/lib/vocab";

const INK = rgb(0.11, 0.1, 0.09);
const GRAPHITE = rgb(0.38, 0.36, 0.33);
const RED = rgb(0.78, 0.22, 0.16);
const RULE = rgb(0.82, 0.8, 0.75);
const PAPER = rgb(0.985, 0.98, 0.965);

// Landscape A4 in points.
const W = 842;
const H = 595;
const M = 36;

function safe(font: PDFFont, text: string) {
  const ok = new Set(font.getCharacterSet());
  return [...text.replace(/\s+/g, " ")].map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, text: string, size: number, width: number, maxLines: number) {
  const words = safe(font, text).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,3}$/, "...");
    return cut;
  }
  return lines;
}

function paper(page: PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
}

function footer(page: PDFPage, font: PDFFont, title: string, n: number) {
  page.drawLine({ start: { x: M, y: 26 }, end: { x: W - M, y: 26 }, thickness: 0.5, color: RULE });
  page.drawText(safe(font, `${title}  ·  SketchFrame`), { x: M, y: 14, size: 8, font, color: GRAPHITE });
  page.drawText(String(n), { x: W - M - 10, y: 14, size: 8, font, color: GRAPHITE });
}

function fit(img: PDFImage, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height);
  return { width: img.width * s, height: img.height * s };
}

export async function buildStoryboardPdf(bundle: ProjectBundle) {
  const db = await getDb();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${bundle.project.title} — Storyboard`);
  pdf.setCreator("SketchFrame");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const title = bundle.project.title;
  let pageNo = 1;

  const imgCache = new Map<string, PDFImage>();
  const embed = async (rel: string | null) => {
    if (!rel) return null;
    if (!imgCache.has(rel)) imgCache.set(rel, await pdf.embedPng(await readImage(rel)));
    return imgCache.get(rel)!;
  };
  const shotRows = await db.select().from(schema.shots).where(eq(schema.shots.projectId, bundle.project.id));
  const pathById = new Map(shotRows.map((s) => [s.id, s.imagePath]));
  const refRows = await db.select().from(schema.referenceImages).where(eq(schema.referenceImages.projectId, bundle.project.id));

  // Cover
  {
    const p = pdf.addPage([W, H]);
    paper(p);
    p.drawText("STORYBOARD", { x: M, y: H - 70, size: 11, font: bold, color: RED });
    p.drawText(safe(bold, title), { x: M, y: H - 110, size: 34, font: bold, color: INK });
    wrap(regular, bundle.project.logline, 13, W - 2 * M, 3).forEach((l, i) =>
      p.drawText(l, { x: M, y: H - 140 - i * 18, size: 13, font: regular, color: GRAPHITE }),
    );
    const total = bundle.shots.reduce((a, s) => a + s.duration, 0);
    p.drawText(
      safe(mono, `${bundle.scenes.length} scenes  /  ${bundle.shots.length} shots  /  ${Math.round(total)}s  /  ${bundle.project.aspectRatio}`),
      { x: M, y: H - 210, size: 10, font: mono, color: INK },
    );
    // Cast strip with locked front views.
    p.drawText("CAST", { x: M, y: H - 260, size: 10, font: bold, color: RED });
    let x = M;
    for (const c of bundle.characters.slice(0, 8)) {
      const front = refRows.filter((r) => r.characterId === c.id && (r.kind === "upload" || r.kind === "front")).at(-1);
      const img = await embed(front?.path ?? null);
      p.drawRectangle({ x, y: H - 430, width: 88, height: 150, borderColor: RULE, borderWidth: 0.8, color: rgb(1, 1, 1) });
      if (img) {
        const d = fit(img, 82, 120);
        p.drawImage(img, { x: x + (88 - d.width) / 2, y: H - 400 + (120 - d.height) / 2 + 2, ...d });
      }
      p.drawText(safe(bold, c.name.toUpperCase()).slice(0, 16), { x: x + 4, y: H - 422, size: 8, font: bold, color: INK });
      x += 98;
    }
    footer(p, regular, title, pageNo++);
  }

  // Storyboard pages: 3 x 2 grid.
  const cols = 3;
  const rows = 2;
  const cellW = (W - 2 * M - (cols - 1) * 18) / cols;
  const cellH = (H - 2 * M - 30 - (rows - 1) * 16) / rows;
  const sceneById = new Map(bundle.scenes.map((s) => [s.id, s]));
  for (let i = 0; i < bundle.shots.length; i += cols * rows) {
    const p = pdf.addPage([W, H]);
    paper(p);
    const first = bundle.shots[i];
    p.drawText(safe(bold, title), { x: M, y: H - M + 4, size: 10, font: bold, color: INK });
    const sc = first.sceneId ? sceneById.get(first.sceneId) : null;
    if (sc) p.drawText(safe(mono, sc.heading).slice(0, 80), { x: M + 200, y: H - M + 4, size: 9, font: mono, color: GRAPHITE });

    for (let k = 0; k < cols * rows && i + k < bundle.shots.length; k++) {
      const shot = bundle.shots[i + k];
      const cx = M + (k % cols) * (cellW + 18);
      const top = H - M - 16 - Math.floor(k / cols) * (cellH + 16);
      const frameH = cellW * (9 / 16);
      p.drawRectangle({ x: cx, y: top - frameH, width: cellW, height: frameH, color: rgb(1, 1, 1), borderColor: INK, borderWidth: 1.2 });
      const img = await embed(pathById.get(shot.id) ?? null);
      if (img) {
        const d = fit(img, cellW - 2, frameH - 2);
        p.drawImage(img, { x: cx + (cellW - d.width) / 2, y: top - frameH + (frameH - d.height) / 2, ...d });
      }
      const y0 = top - frameH - 13;
      p.drawText(String(i + k + 1), { x: cx, y: y0, size: 11, font: bold, color: RED });
      p.drawText(safe(mono, `${abbr(shot.shotSize)} · ${shot.cameraAngle} · ${shot.cameraMove} · ${shot.duration}s`).slice(0, 60), {
        x: cx + 22, y: y0, size: 7.5, font: mono, color: GRAPHITE,
      });
      let y = y0 - 12;
      for (const l of wrap(regular, shot.action, 8, cellW, 3)) {
        p.drawText(l, { x: cx, y, size: 8, font: regular, color: INK });
        y -= 10;
      }
      if (shot.dialogue) {
        for (const l of wrap(bold, `${shot.speaker ? shot.speaker.toUpperCase() + ": " : ""}"${shot.dialogue}"`, 8, cellW, 2)) {
          p.drawText(l, { x: cx, y, size: 8, font: bold, color: INK });
          y -= 10;
        }
      }
    }
    footer(p, regular, title, pageNo++);
  }

  // Shot list table.
  const colX = [M, M + 30, M + 90, M + 175, M + 255, M + 540, M + 730];
  const heads = ["#", "SIZE", "ANGLE", "MOVE", "ACTION", "DIALOGUE", "SEC"];
  let p: PDFPage | null = null;
  let y = 0;
  const newPage = () => {
    if (p) footer(p, regular, title, pageNo++);
    p = pdf.addPage([W, H]);
    paper(p);
    p.drawText("SHOT LIST", { x: M, y: H - M, size: 12, font: bold, color: RED });
    heads.forEach((h, i) => p!.drawText(h, { x: colX[i], y: H - M - 24, size: 8, font: bold, color: GRAPHITE }));
    y = H - M - 34;
  };
  newPage();
  let lastScene: string | null = null;
  for (const [i, s] of bundle.shots.entries()) {
    const action = wrap(regular, s.action, 8, 275, 4);
    const dlg = wrap(regular, s.dialogue ? `${s.speaker ? s.speaker + ": " : ""}${s.dialogue}` : "", 8, 180, 4);
    const sceneChange = s.sceneId !== lastScene;
    const h = Math.max(action.length, dlg.length, 1) * 10 + 8 + (sceneChange ? 18 : 0);
    if (y - h < 40) newPage();
    const page = p!;
    if (sceneChange) {
      const sc = s.sceneId ? sceneById.get(s.sceneId) : null;
      page.drawText(safe(mono, sc?.heading ?? "UNASSIGNED").slice(0, 100), { x: M, y: y - 10, size: 8.5, font: mono, color: INK });
      y -= 18;
      lastScene = s.sceneId;
    }
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.4, color: RULE });
    const cells = [String(i + 1), abbr(s.shotSize), s.cameraAngle, s.cameraMove];
    cells.forEach((c, ci) => page.drawText(safe(regular, c).slice(0, 18), { x: colX[ci], y: y - 9, size: 8, font: ci ? regular : bold, color: INK }));
    action.forEach((l, li) => page.drawText(l, { x: colX[4], y: y - 9 - li * 10, size: 8, font: regular, color: INK }));
    dlg.forEach((l, li) => page.drawText(l, { x: colX[5], y: y - 9 - li * 10, size: 8, font: regular, color: INK }));
    page.drawText(String(s.duration), { x: colX[6], y: y - 9, size: 8, font: regular, color: INK });
    y -= h - (sceneChange ? 18 : 0);
  }
  if (p) footer(p, regular, title, pageNo++);

  return pdf.save();
}
