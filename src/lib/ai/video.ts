import "server-only";
import { ProviderError } from "./types";
import { apiKey } from "@/lib/context";

/**
 * Image-to-video for "AI clips": animates a finished panel. Expensive, so it is always
 * opt-in per shot; shots without a clip get free camera motion in the Movie player.
 *
 * Note: OpenAI's Sora 2 / Videos API was shut down on 2026-09-24, so clips go through
 * fal.ai, which serves Kling, Seedance, Wan and other image-to-video models behind one key.
 */
export interface VideoProvider {
  readonly id: string;
  readonly model: string;
  animate(req: { image: Buffer; prompt: string; seconds: number; aspectRatio: "16:9" | "9:16" | "1:1" }): Promise<Buffer>;
}

type FalStatus = { status: string; status_url?: string; response_url?: string; request_id?: string; logs?: unknown };

/** fal.ai queue API: submit → poll status → fetch result → download the MP4. */
export class FalVideo implements VideoProvider {
  readonly id = "fal";
  constructor(readonly model: string) {}

  private headers() {
    return { Authorization: `Key ${apiKey("FAL_KEY")}`, "Content-Type": "application/json" };
  }

  async animate(req: { image: Buffer; prompt: string; seconds: number; aspectRatio: "16:9" | "9:16" | "1:1" }) {
    const submit = await fetch(`https://queue.fal.run/${this.model}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        prompt: req.prompt,
        // fal accepts data URIs for image inputs, so nothing needs to be hosted publicly.
        image_url: `data:image/png;base64,${req.image.toString("base64")}`,
        // Field names differ slightly by model; unknown ones are ignored.
        duration: String(req.seconds <= 5 ? 5 : 10),
        aspect_ratio: req.aspectRatio,
      }),
    });
    if (!submit.ok) throw new ProviderError("fal", `${submit.status} ${(await submit.text()).slice(0, 400)}`, submit.status);
    const job = (await submit.json()) as FalStatus;
    const statusUrl = job.status_url ?? `https://queue.fal.run/${this.model}/requests/${job.request_id}/status`;
    const resultUrl = job.response_url ?? `https://queue.fal.run/${this.model}/requests/${job.request_id}`;

    const deadline = Date.now() + 15 * 60 * 1000;
    for (;;) {
      if (Date.now() > deadline) throw new ProviderError("fal", "Timed out after 15 minutes");
      await new Promise((r) => setTimeout(r, 5000));
      const s = await fetch(statusUrl, { headers: this.headers() });
      if (!s.ok) throw new ProviderError("fal", `status ${s.status} ${(await s.text()).slice(0, 300)}`, s.status);
      const st = (await s.json()) as FalStatus;
      if (st.status === "COMPLETED") break;
      if (st.status === "FAILED" || st.status === "ERROR") throw new ProviderError("fal", "Video generation failed");
    }
    const r = await fetch(resultUrl, { headers: this.headers() });
    if (!r.ok) throw new ProviderError("fal", `result ${r.status} ${(await r.text()).slice(0, 300)}`, r.status);
    const out = (await r.json()) as { video?: { url?: string }; videos?: Array<{ url?: string }> };
    const url = out.video?.url ?? out.videos?.[0]?.url;
    if (!url) throw new ProviderError("fal", "No video in result");
    const mp4 = await fetch(url);
    if (!mp4.ok) throw new ProviderError("fal", `download ${mp4.status}`);
    return Buffer.from(await mp4.arrayBuffer());
  }
}
