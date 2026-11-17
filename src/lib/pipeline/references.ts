import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { Character, ReferenceImage } from "@/lib/db/schema";
import { getImageProvider } from "@/lib/ai/registry";
import { artStyle, viewPrompt } from "@/lib/ai/prompts";
import type { LabeledImage } from "@/lib/ai/types";
import { readImage, saveImage } from "@/lib/storage";
import { REFERENCE_VIEWS, VIEW_LABEL } from "@/lib/vocab";
import { dedupe, withSlot } from "./jobs";
import { recordSheetTake } from "@/lib/takes";
import { usingSharedOpenAI } from "@/lib/usage";

const { characters, referenceImages } = schema;

export async function toLabeled(ref: ReferenceImage, name: string): Promise<LabeledImage> {
  return { label: `${name} — ${VIEW_LABEL[ref.kind] ?? ref.kind}`, data: await readImage(ref.path), mimeType: "image/png" };
}

async function refsFor(characterId: string) {
  const db = await getDb();
  return db.select().from(referenceImages).where(eq(referenceImages.characterId, characterId));
}

/**
 * Multi-view sketch reference sheet. The front view is drawn first (conditioned on
 * the user's upload if there is one) and becomes the anchor every other view —
 * and every panel — is conditioned on.
 */
export function generateSheet(characterId: string) {
  return dedupe(`sheet:${characterId}`, async () => {
    const db = await getDb();
    const [c] = await db.select().from(characters).where(eq(characters.id, characterId));
    if (!c) throw new Error("Character not found");
    await db
      .update(characters)
      .set({ sheetStatus: "generating", sheetError: null, updatedAt: Date.now() })
      .where(eq(characters.id, characterId));

    try {
      const provider = getImageProvider();
      const upload = (await refsFor(characterId)).filter((r) => r.kind === "upload").at(-1);
      const uploadImg = upload ? [await toLabeled(upload, c.name)] : [];

      const draw = (view: string, refs: LabeledImage[]) =>
        withSlot(() =>
          provider.generateImage({
            prompt: viewPrompt(c, view, refs.length > 0),
            tier: "sheet",
            references: refs,
            // Full-body turnarounds are tall; a square frame crops heads and feet.
            aspectRatio: view === "expressions" ? "16:9" : "9:16",
            meta: { kind: "sheet", title: c.name, subtitle: VIEW_LABEL[view], description: c.description },
          }),
        );

      const front = await draw("front", uploadImg);
      const frontImg: LabeledImage = { label: `${c.name} — Front`, data: front, mimeType: "image/png" };
      const others = await Promise.all(
        // Free tier: extra views can't use the front as a reference, so they'd be unrelated drawings.
        // Lent server key: the front view alone keeps panels on-model and saves starter drawings.
        REFERENCE_VIEWS.filter((v) => v !== "front" && provider.id !== "free" && !usingSharedOpenAI()).map(
          async (v) => [v, await draw(v, [...uploadImg, frontImg])] as const,
        ),
      );

      const old = await db
        .select()
        .from(referenceImages)
        .where(and(eq(referenceImages.characterId, characterId), ne(referenceImages.kind, "upload")));
      const views: { kind: string; path: string }[] = [];
      for (const [view, buf] of [["front", front] as const, ...others]) {
        const path = await saveImage(c.projectId, `characters/${characterId}`, buf, { maxSize: 1280, look: artStyle() });
        await db.insert(referenceImages).values({ id: nanoid(), projectId: c.projectId, characterId, kind: view, path });
        views.push({ kind: view, path });
      }
      if (old.length) await db.delete(referenceImages).where(inArray(referenceImages.id, old.map((o) => o.id)));
      // The old sheet's files stay: it's kept as a take the user can switch back to.
      await recordSheetTake(c, views, old.map((o) => ({ kind: o.kind, path: o.path })));
      await db.update(characters).set({ sheetStatus: "ready", updatedAt: Date.now() }).where(eq(characters.id, characterId));
    } catch (err) {
      await db
        .update(characters)
        .set({ sheetStatus: "error", sheetError: (err as Error).message.slice(0, 500), updatedAt: Date.now() })
        .where(eq(characters.id, characterId));
      throw err;
    }
  });
}

/** Make sure every character in a shot has a sheet before the panel is drawn. */
export async function ensureSheets(cast: Character[]) {
  await Promise.all(
    cast.map(async (c) => {
      const refs = await refsFor(c.id);
      if (refs.some((r) => r.kind === "front")) return;
      await generateSheet(c.id);
    }),
  );
}

/**
 * Which images condition a panel. User uploads first (they're the ground truth),
 * then front + ¾ turnaround, plus the expression sheet for tight shots.
 */
export async function panelReferences(cast: Character[], shotSize: string) {
  const tight = /close|insert/i.test(shotSize);
  const perChar = cast.length > 3 ? 2 : 3;
  const out: { ref: ReferenceImage; img: LabeledImage }[] = [];
  for (const c of cast.slice(0, 5)) {
    const refs = await refsFor(c.id);
    const order = ["upload", "front", tight ? "expressions" : "three_quarter", "three_quarter", "side"];
    const picked: ReferenceImage[] = [];
    for (const kind of order) {
      const r = refs.filter((x) => x.kind === kind).at(-1);
      if (r && !picked.includes(r) && picked.length < perChar) picked.push(r);
    }
    for (const r of picked) out.push({ ref: r, img: await toLabeled(r, c.name) });
  }
  return out.slice(0, 12);
}
