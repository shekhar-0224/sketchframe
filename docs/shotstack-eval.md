# Shotstack evaluation

_Research only, 2026-10-28. No API calls were made and no key was used. Sources are linked inline._

## 1. What it is
Shotstack is a **cloud video editing and rendering API**: you POST a JSON timeline of tracks, clips and assets, and it returns an MP4, GIF, WebM, MP3 or still image (PNG/JPG). It is not a generative model. A separate "Create API" sends generation requests on to other providers, paid with the same credits ([generative AI guide](https://shotstack.io/docs/guide/generating-assets/generative-ai.md)):
- **Text-to-image:** Nano Banana 2, GPT Image
- **Image/text-to-video:** Seedance, Wan, Gemini Omni Flash
- **TTS:** ElevenLabs, MiniMax, Amazon Polly. **Music:** ElevenLabs Music.
- **Captions:** "Rich Captions" built from SRT/VTT, or auto-transcribed from a clip, including generated speech ([rich captions](https://shotstack.io/docs/guide/architecting-an-application/rich-captions.md)).
- **Avatars:** the current docs don't mention them. Older pages listed HeyGen and D-ID, but those pages now return 404.

## 2. Fit for SketchFrame
**(a) Now: B&W sketch and comic panels. Not a fit.** Shotstack could render a page as a single-frame PNG, placing panel images plus `rich-text` boxes where the balloons go. But it has **no PDF output**, no balloon or tail shapes (only text and HTML-ish boxes), and every page would be a paid network round trip. We already have everything this needs:
- `sharp` is already in [storage.ts](../src/lib/storage.ts), which does greyscale and grain.
- `pdf-lib` is already in [export route](../src/app/api/projects/[id]/export/route.ts) → `src/lib/pdf/export.ts`.

Laying pages out in HTML/SVG (balloons as SVG paths with editable text), then rasterising with `sharp` and placing the result into `pdf-lib`, is free and instant. It also keeps the balloon text editable in our own model, which plan step 5 requires. The Shotstack route would cost money, be slower, and give us less control.

**(b) Later: assembling the movie. A plausible fit, but not clearly better than what we have.** Shotstack covers the whole list: Ken Burns (`zoomIn`/`slideLeft`… with Slow/Fast variants), transitions (`fade`, `wipe`, `zoom`…), audio tracks, music and captions, all rendered server-side to a real MP4. Compared with the alternatives:
- **Our engine** ([engine.ts](../src/lib/movie/engine.ts)): renders on a canvas and records with MediaRecorder. It's free and matches the preview exactly, including depth parallax, weather overlays and paper grain. Its weaknesses: it records in real time, the output depends on the browser (WebM on some), and the tab must stay open. Shotstack can't reproduce our depth parallax or overlays, so switching means a *different-looking* film than the preview.
- **Server ffmpeg:** cheapest per minute, but it needs a binary and long runtimes. That's awkward on Vercel functions, which have size and time limits, so it's better on a worker such as Fly or Render.
- **Remotion:** React compositions, so the preview player and the export share the same code, which is closest to how we work now. Remotion Lambda renders in parallel on our own AWS account for cents per minute. Larger companies need a paid licence.

## 3. Cost ([pricing](https://shotstack.io/pricing/))
- **Model:** credits. On pay-as-you-go, 1 credit = 1 rendered minute, billed by the second, rounded down. Plans render more minutes per credit: 1.25 on Starter up to 4 on Volume. AI generation uses the same credits.
- **Plans:**
  - PAYG: $10 for 50 minutes, which is **$0.20/min**
  - Starter: $39/mo for 250 minutes (≈ $0.16/min)
  - Pro: $99/mo for 750 minutes
  - Scale: $199/mo
- **Free:** 10 credits at sign-up, valid 30 days. The sandbox (`stage`) needs at least 1 credit, **watermarks every render**, and caps renders at 10 minutes ([limitations](https://shotstack.io/docs/guide/architecting-an-application/limitations.md)).
- **1-minute film:** about **$0.16–0.20 to render**. TTS or images generated through Shotstack would cost credits on top. For comparison, our browser export costs $0.

## 4. Practicalities
- **Speed:** "approximately 20 seconds per minute of video", and slower with effects ([limitations](https://shotstack.io/docs/guide/architecting-an-application/limitations.md)). Rate limits are 300 edit requests per minute in production.
- **Webhooks:** yes, an optional `callback` URL is called when a render completes or fails ([API ref](https://shotstack.io/docs/api/)). This suits Vercel: submit, return, then handle the callback in a route.
- **Vercel:** works well. There's no ffmpeg and no long function, but assets must sit at public URLs. Our blobs are *private* and served by `/api/files`, so we'd need signed or temporary public URLs.
- **Lock-in:** high for the timeline. The JSON schema is proprietary, effects are a fixed set, and `title`/`html` assets are already deprecated in favour of `rich-text`. Our own effects (depth parallax, overlays) can't be expressed in it.
- **Resolution:** up to 1080p on PAYG/Starter, and 4K (3840 px per side) on Pro and above. GIFs max out at 1920 px.
- **Changelog:** `shotstack.io/changelog` returns 404 and the docs index doesn't link one, so I couldn't check recent changes.

## 5. Verdict: **skip for now, and maybe revisit when the movie work restarts**
- **Now:** skip. It adds nothing for comic pages or PDF that `sharp` + SVG/HTML + `pdf-lib` don't already do for free.
- **Later:** if the in-browser export becomes the pain point (speed, MP4 compatibility, the tab having to stay open), compare two options first:
  1. **Remotion** (Lambda or a worker): keeps preview and export as one codebase, and our custom effects survive.
  2. **ffmpeg on a small worker** (Fly/Render): the cheapest option at scale.

  Pick Shotstack only if we're willing to drop parallax and overlays for its stock Ken Burns in return for zero infrastructure. At about $0.20/min, cost is not the blocker.
