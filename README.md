# SketchFrame

**Script, poem or idea in → animated comic movie out.**

SketchFrame breaks text into a shot list and draws locked character model sheets. It then sketches every panel with the cast kept on-model, gives characters voices, and adds free 2.5D motion with weather and light. Export the result as a video or PDF, or share it with a public link.

- **Users:** see [USER_GUIDE.md](USER_GUIDE.md).
- **Developers:** this file.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # every key is optional
npm run dev                  # http://localhost:3000
```

- **Free tier:** with no keys at all, the free tier runs end to end. You get the built-in script parser, placeholder sketches, browser voices and free 2.5D motion.
- **Sign-in locally:** the 6-digit code is printed in the server terminal when `RESEND_API_KEY` isn't set.
- **Owner locally:** with no `OWNER_EMAIL`, everyone who signs in on this machine is the owner and can use the `.env` keys.
- **Database:** migrations in `drizzle/` run automatically on first request.
- **Free local script reading:** install [Ollama](https://ollama.com), run `ollama pull qwen3:8b`, then pick the **Free** preset.

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint (keep both clean) |
| `npm run db:generate` | New migration after editing `src/lib/db/schema.ts` |

Stack:
- **Framework:** Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, Zustand.
- **Database:** Drizzle + libSQL (SQLite locally, Turso in production).
- **Files:** `sharp` for images, `pdf-lib` for PDF export, Vercel Blob in production.

> Next 16 differs from older versions. Read `node_modules/next/dist/docs/` before using framework APIs (see `AGENTS.md`).

---

## How it works

```
text ──► breakdown ──► characters ──► sheets ──► panels ──► depth ──► voices ──► movie
(script/   (LLM or      (visual       (front/¾/   (sheets     (browser,  (TTS per   (canvas: 2.5D +
 poem/      heuristic)   bible)        side/expr)  attached)   free)      line)      effects + captions)
 idea)
```

The UI walks users through five locked steps (`lib/steps.ts`): **Script → Check → Cast → Board → Movie**. After the breakdown, the user reviews and edits it on `/p/:id/breakdown`; approving sets `projects.reviewed_at`, which unlocks Cast. Cast auto-draws missing sheets, the Board unlocks only once every character has a front (or uploaded) reference and auto-draws on first visit, and the Movie unlocks after one panel. Re-running the breakdown clears `reviewed_at`.

1. **Breakdown** (`lib/pipeline/breakdown.ts`) turns text into scenes, shots and characters as JSON validated with zod. Poems use `POEM_SYSTEM`: stanzas become scenes, lines become `NARRATOR` shots. With no text model, `heuristic-breakdown.ts` parses screenplay format and poems offline. Ideas are first expanded into a script.
2. **Character sheets** (`lib/pipeline/references.ts`). The front view is drawn first, conditioned on the user's upload if any. The ¾, side and expressions views are then conditioned on that front view. Locked characters are never redrawn.
3. **Panels** (`lib/pipeline/panel.ts`). `ensureSheets()` runs first, so a panel is never drawn without its cast references. Labelled references go to the image model, plus an optional layout sketch.
4. **Cost tiers** (`lib/tiers.ts`):
   - **sheet:** best model.
   - **cast:** best model, for faces readable (medium, close-up, two-shot, over-the-shoulder).
   - **filler:** cheapest model, for establishing, wide, insert or no-cast shots.
   - References are still sent on cheap panels. Each shot has an Auto/Best/Cheap override, and `shots.lastModel` records which model drew it.
5. **Depth** (`lib/movie/depth-client.ts`). Depth Anything v2 runs **in the browser** through transformers.js from a CDN, using WebGPU or WASM. The PNG is uploaded to `POST /api/shots/:id/depth`. Keeping it client-side keeps ONNX out of the serverless bundle.
6. **Voices** (`lib/pipeline/voice.ts`, `lib/ai/speech.ts`):
   - Each dialogue line becomes WAV. Each character gets a voice inferred from their description; users can change it.
   - The shot stretches to fit its line.
   - `audioKey` (hash of text + voice + style) detects stale audio.
   - Narration uses a storyteller voice.
7. **Movie engine** (`lib/movie/engine.ts`). One renderer drives the player, the export (canvas + MediaRecorder + Web Audio → MP4/WebM), the share page and the landing demo. Per shot:
   - AI clip if present; otherwise WebGL depth parallax along the camera move (`parallax.ts`).
   - Weather/light overlays (`overlays.ts`, auto-detected by `lib/effects.ts`).
   - Paper grain + vignette, captions (verse style for narration), dissolves within a scene, dip to black between scenes.
8. **AI clips (optional)** (`lib/pipeline/clip.ts`): image-to-video through fal.ai (Kling, Seedance). OpenAI's Sora API was shut down on 2026-09-24.

Long jobs (breakdown, sheets, panels, voices, clips):
- They return `202` immediately and keep running via `background()` → `next/server` `after()`. Routes set `maxDuration = 300`.
- The client polls while anything is `generating`, and unsaved edits are overlaid on poll results.
- Stale jobs (lost to a restart) are marked failed by `recoverStale()`.

## AI providers

Every pipeline talks to interfaces, not vendors:
- `TextProvider` / `ImageProvider` (`lib/ai/types.ts`)
- `SpeechProvider` (`lib/ai/speech.ts`)
- `VideoProvider` (`lib/ai/video.ts`)

`lib/ai/registry.ts` maps the current user's settings to an implementation.

| Kind | Implementations |
| --- | --- |
| Text | OpenAI (`gpt-5-nano` default), Gemini, Ollama (free, local, OpenAI-compatible), heuristic (`mock`) |
| Image | OpenAI (`gpt-image-1.5` / `gpt-image-1-mini`, with an `input_fidelity` fallback), Gemini (interleaved labelled refs), procedural mock |
| Speech | OpenAI `gpt-4o-mini-tts` (acting directions), Sarvam `bulbul:v2` (Indian languages), ElevenLabs, browser (free, preview-only) |
| Video | fal.ai queue API (Kling, Seedance…) |

To add a provider, write one class and add one line in the registry. **Presets** (`lib/settings.ts` → `presetPatch`): Free / Budget / Balanced / Best, with every knob available under *Advanced* in the Settings modal.

## Accounts, guests, sharing

- **Login:** **Continue with Google** (`lib/google.ts`, a plain OAuth code flow with a `state` cookie), or email + 6-digit code sent via Resend or Gmail SMTP (`lib/email.ts`). Both end in `userForVerifiedEmail()` + `createSession()`, with `sessions` stored as hashed tokens (`lib/auth.ts`). Every API route goes through `handle()` (`lib/api.ts`). It requires a user, runs inside their `RequestContext` (keys + settings, `lib/context.ts`), and resolves resources via `lib/access.ts` (`ownProject`, `ownShot`…). A foreign id is a 404.
- **Bring your own keys:** `user_keys` are AES-256-GCM encrypted with `SKETCHFRAME_SECRET`. Only the owner (`OWNER_EMAIL`) falls back to the server's `.env` keys.
- **Guests ("Try free"):** `POST /api/auth/guest` creates an anonymous user (`users.guest`) with a session. Guests are never the owner, so they only get free providers or keys they add. On sign-in, `adoptGuest()` moves their boards, settings and keys into the real account.
- **Share links:** `projects.share_token` → `/s/<token>`, a public read-only player. Files are served through `/api/share/<token>/f/...`, limited to that project's `panels`, `depth`, `voices` and `clips` folders (character sheets and layouts stay private).
- **Public pages** (`src/proxy.ts`): `/` (landing when signed out, dashboard when signed in), `/s/*` and `/demo/*`. Everything else redirects to `/login` without a session cookie. The landing demo is static (`public/demo/demo.json` + assets), so it costs nothing to serve.

## Data model (`src/lib/db/schema.ts`)

| Table | Key columns |
| --- | --- |
| `users`, `sessions`, `login_codes` | `users.guest`; `sessions.token_hash` |
| `user_keys`, `user_settings` | Encrypted BYO keys; settings JSON (preset + models) |
| `projects` | `user_id`, `share_token`, `script_text`, `source_kind` (`script` / `idea` / `poem`), `aspect_ratio`, `status` |
| `characters` | Visual `description`, `locked`, `voice`, `voice_style`, `sheet_status` |
| `reference_images` | `kind`: front / three_quarter / side / expressions / upload |
| `scenes` | `heading`, `summary`, `position` |
| `shots` | Camera fields, `action`, `speaker`, `dialogue`, `duration`, `character_ids`, `tier`, `effects` (null = auto)<br>Image: `image_path`, `image_version`, `layout_path`, `last_model`<br>Depth: `depth_path`, `depth_version`<br>Audio: `audio_path`, `audio_seconds`, `audio_key`, `audio_status`<br>Clip: `clip_path`, `clip_status` |

Files live under `<projectId>/<folder>/<id>.<ext>` (`panels`, `characters/<cid>`, `layouts`, `depth`, `voices`, `clips`): in `data/files` locally, Vercel Blob in production (`lib/storage.ts`).

## API

All routes need a session except the ones marked **public**.

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/request` · `verify` · `guest` · `logout`, `GET /api/auth/google` · `google/callback` (public), `GET /api/auth/me` | Email code, Google sign-in, try as guest, who am I |
| `GET/PUT /api/settings`, `GET/PUT /api/keys` | Preset/models; bring-your-own keys |
| `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` | Boards |
| `POST /api/projects/:id/breakdown` · `generate` · `shots` · `shots/reorder` · `characters` | Pipeline + editing |
| `GET/POST /api/projects/:id/voices` | Voice cast + record stale lines |
| `POST/DELETE /api/projects/:id/share`, `GET /api/projects/:id/export` | Share link; PDF |
| `PATCH/DELETE /api/shots/:id`, `POST .../generate` · `voice` · `depth`, `POST/DELETE .../image` · `layout` · `clip` | Per-shot actions |
| `PATCH/DELETE /api/characters/:id`, `POST .../sheet` · `references` · `voice-preview`, `DELETE /api/references/:id` | Cast |
| `POST /api/parse-script` | TXT/PDF/DOCX/Fountain/FDX → text |
| `GET /api/files/...`; **public** `GET /api/share/:token/f/...` | Files |

## Project layout

```
src/
  app/                    pages: / (landing|dashboard), /login, /s/[token], /p/[id]/{,script,characters,movie}; api/*
  components/
    ui.tsx                keycap Button, Modal (+ bottom sheet), Menu, Stamp…
    landing/              public landing page
    dashboard/            story list, new-story dialog (script/upload/idea/poem/blank)
    workspace/            shell (bottom tabs on mobile), board, panel card, shot editor, cast, movie tab
    movie/public-player   share page + landing demo player
  lib/
    ai/                   types, registry, prompts, speech, video, providers/{openai,gemini,mock}
    pipeline/             breakdown (+heuristic), references, panel, voice, clip, jobs
    movie/                engine, parallax (WebGL), overlays, depth-client
    auth, access, context, api, settings, share, storage, data, effects, tiers, vocab
drizzle/                  SQL migrations (generated)
public/demo/              landing-page demo movie (static)
```

## Conventions

- **Server code** uses `import "server-only"`. Provider keys come from `apiKey()` (the user's context), never directly from `process.env`.
- **Files** go through `lib/storage.ts`; never use `fs` or `DATA_DIR` paths in routes, because production uses Blob.
- **Background work** goes through `background()`, which carries the user context into `after()`.
- **UI** uses the 1-bit "keycap" design: colours are tokens in `globals.css`, and controls use `.key` / `.key-dark`. Keep frames uncluttered: two primary actions plus a `⋯` `Menu`.

## Deploy

Live: **https://sketchframe-sigma.vercel.app**. Hosted on Vercel, with Turso for the database and private Vercel Blob for files. Every environment variable is listed in `.env.example` under *Hosting / accounts*.

```bash
vercel deploy --prod
```

**How each piece works in production:**
- **Database:** `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set on the project. Migrations in `drizzle/` run automatically on the first request after a deploy (`next.config.ts` bundles that folder into every function). If these are missing on Vercel, the app refuses to start rather than writing to a temporary disk.
- **Files:** with a Blob store connected (`BLOB_READ_WRITE_TOKEN`), files are stored as *private* blobs. They are only served through `/api/files/<projectId>/…`, which checks ownership, or through `/api/share/<token>/…` for shared boards.
- **Security:** `SKETCHFRAME_SECRET` encrypts users' API keys (AES-256-GCM) and signs login codes. Rotating it invalidates every saved key.
- **Owner:** `OWNER_EMAIL` may use the server's own provider keys and inherits boards created before accounts existed. Everyone else, guests included, is on the **free plan**: with `SHARE_SERVER_KEYS=true` they borrow the server's `SHARED_KEYS` (default `OPENAI_API_KEY`), always with the default model setup. Pictures are capped by `STARTER_IMAGES_PER_USER` (per person per UTC day) and `STARTER_DAILY_IMAGES` (site-wide per day), counted in `usage_counters`. Script reading and voices have site-wide daily ceilings too (`SHARED_DAILY_TEXT_CALLS`, `SHARED_DAILY_VOICE_CALLS`); over them text uses the free tier and voices fall back to the browser. Over an image cap, or if the key fails or the safety filter blocks a picture, drawing falls back to the keyless free tier (Pollinations). Settings for non-owners show only "Free" and "Paid plans — coming soon"; `PUT /api/settings` is owner-only.
- **Email:** `RESEND_API_KEY` plus `AUTH_EMAIL_FROM` send login codes. Without them, email sign-in returns a clear error on Vercel; guest mode still works.
- **Background work:** generation runs via `after()` inside the same function, with `maxDuration = 300` on the generation routes. Concurrency limits and de-duplication apply per instance.
- **Protection:** Vercel Deployment Protection is limited to preview deployments, so the production URL is public.

## Credits

The pipeline ideas (labelled reference sheets, turnaround-first consistency) were inspired by [AIComicBuilder](https://github.com/LingyiChen-AI/AIComicBuilder) (Apache-2.0). No code was copied.
