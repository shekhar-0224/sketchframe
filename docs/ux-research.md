# SketchFrame UX research: making it less overwhelming

_28 Oct 2026. Read-only audit. Guest run of the sample scene "The Night Diner" (10 shots, 2 characters) on the live site at 1024×768 and 375×812._

Screenshots are in the shared notes folder, not the repo:
`~/Library/Application Support/Claude/side-session-notes/local_8439f172-9c7f-4008-99c4-bcd109831ba6/ux-shots/` (`01`–`13`, referenced below as **[s05]** and so on).

---

## TL;DR

The 5-step path is the right skeleton, and it's better than most competitors. Some of the steps feel heavy for three reasons:

1. **Everything is open at once.** Check shows 30 editable fields. Each Board card has 3 buttons. Movie shows 40 controls, including 22 voice options.
2. **More than one "next" button.** The floating "Next" button, the step's own big button and the header "Export PDF" button compete with each other. On a phone, the floating button sits on top of the Check step's own button.
3. **Engineering words.** "2.5D", "depth layers", "26 MB model", "Kling / Seedance via fal.ai", "Drawing model: Cast/Filler", "EST/MS/MCU".

The best apps (Canva, CapCut, Descript, LTX) follow one rule: **one main action per screen, details only for what you've selected, and advanced options one tap away.**

---

## 1. How the leading apps keep it simple

| App | Onboarding | Actions visible at once | Progressive disclosure | Timeline / shot list | Regenerate / variations | AI job progress | Mobile |
|---|---|---|---|---|---|---|---|
| **CapCut** | Opens on a blank project with "New project", templates second | ~8 bottom tools | Selecting a clip **swaps** the bottom bar for clip tools (split, speed, delete) | Big-thumb filmstrip timeline is the main surface | "Try again" on AI effects, result replaces in place | Inline % ring on the clip | Mobile-first: preview top, timeline middle, tool bar bottom |
| **Descript** | Picks one template, then drops you into a doc | Doc + 1 sidebar ("Underlord") | Edit the text and the video follows; effects sit in a right panel that only opens on selection | Script *is* the timeline; the classic timeline is collapsible | Underlord proposes, you accept or undo | Per-task inline spinner + toast | Desktop-only |
| **Runway** | Gallery of tools, prompt box front and centre | Prompt + ~4 chips | Settings in a collapsed "⚙" popover | Separate editor; generation is a feed | Every run adds to a **history feed** of takes, nothing is overwritten | Queue card with status and an estimate | Responsive web, iOS app |
| **Pika** | One prompt box, presets as chips | Prompt + 3–4 effect chips | Almost none: deliberately tiny | None | "Retry" / "Remix" on each result card | Card shows "Generating…" placeholder in feed | Mobile app is primary |
| **Kling (web)** | Prompt + image drop | Prompt + model/duration/ratio | Advanced (negative prompt, CFG) collapsed | None (assets list) | Generates 1–4 variants side-by-side | Queue list with queued → running → done, notifications | Web + app |
| **LTX Studio** | Script/idea → auto storyboard in one go | Shot grid + one inspector | Shot inspector only for the selected shot; "Elements" (characters) are global | Storyboard grid ↔ timeline | Per-shot "regenerate" with a version strip; Retake for segments | Per-shot shimmer placeholders while the board renders | Desktop |
| **Boords** | Template project with sample frames | Grid + a small toolbar | Frame detail opens in a side panel | Grid, then an animatic with timing | AI frame "regenerate"; Character Guidelines | Inline per-frame | Read-only on phone |
| **Storyboarder** | Blank board, shot generator optional | Many (pro tool) | Little: a power-user tool | Board strip + timeline at bottom | n/a (drawing) | n/a | Desktop |
| **Krock** | CSV / script → board | Grid + review comments | Comments/annotations in a side panel | Frames grouped into sequences, versions | Regenerate single frames | Inline | Web |
| **Canva** | "What will you design?" + templates | Left rail of ~8 icons, one panel open at a time | Context toolbar at the top changes with the selection | Pages strip at bottom (and video timeline) | Magic tools offer 4 variants as tiles | Shimmer tiles | Excellent mobile: bottom toolbar, sheets |
| **Figma** | Template / blank file | Small toolbar; properties panel | Right panel shows only what applies to the selection | Layers / pages | n/a | n/a | View/comment on phone |

**Patterns worth copying**

- **One main button per screen** (Canva's "Share", CapCut's "Export", Pika's "Generate"). Everything else is outlined or tucked away.
- **Contextual tools.** Tools appear when something is selected (CapCut, Canva, Figma), never on every item at once.
- **Takes, not overwrites.** Runway, LTX and Kling keep earlier generations as a strip of versions, so "Redraw" is never scary and never needs a `confirm()`.
- **Honest progress for long jobs.** Queued → drawing → done shows on the item itself, plus a single global counter. Toasts or notifications appear when a job finishes off-screen.
- **Phone = preview + strip + bottom bar.** CapCut and Canva put the content on top, a filmstrip in the middle, and **one** bottom bar whose content changes with the selection.
- **Empty states that do the work.** "Try a sample" (SketchFrame already does this well in New story).

---

## 2. Top 10 SketchFrame UX problems (ranked)

| # | Problem | Evidence |
|---|---|---|
| **1** | **Two "next" buttons on top of each other.** After a step is done, the floating "Next: …" button (`fixed bottom-[76px]`) shows *as well as* the step's own CTA. On a phone at Check, it covers "Looks good — draw my characters". At Cast it covers the first character's drawing. | **[s12]**, **[s13]**; `workspace/project-shell.tsx:80`, `:157-164`; `breakdown-review.tsx:99-108` |
| **2** | **Check shows the whole breakdown as an open form.** 10 shots × (action textarea + speaker + dialogue + cast chips + delete) = 30 fields, 44 clickables, a page 3,646 px tall. A 5-year-old (or anyone) just wants to read the story and say "yes". | **[s05]**; `breakdown-review.tsx:113-172` |
| **3** | **Movie step is a control panel.** 40 controls: two 11-option voice selects, a camera-move select, 6 effect toggles, Animate, Export, Share, Captions and Loop. The copy is engineering-speak ("Free 2.5D motion… depth layers…", "first time downloads a 26 MB model", "Kling / Seedance via fal.ai"). | **[s09]**, **[s10]**; `movie-view.tsx:357-424` |
| **4** | **Header crowding and unlabeled icons.** At 1024 px the step tabs get cut off ("Stor…"). On a phone the header is logo + truncated title ("The Nig…") + two unlabeled icon buttons (provider ⚙ and download). The guest banner takes another ~90 px. About 30% of a 812 px phone screen is chrome. | **[s07]**, **[s11]**; `project-shell.tsx:92-138`, `components/guest-banner.tsx` |
| **5** | **"Export PDF" is a dark main button on every step,** even Script and Movie. On Movie it competes with "Export movie". | **[s09]**; `project-shell.tsx:132-136` |
| **6** | **Every board panel shows 3 actions + a ⋯ menu.** The Redraw/Draw button is dark (primary) on every card, so 10 primary buttons compete. The top bar adds "Draw all", "Redraw all", a progress count, a cast strip and Grid/Timeline toggles. Editing can happen in three places: the inline list editor, the card's "Edit", and "Draw on it". | **[s07]**, **[s08]**; `panel-card.tsx:141-150`, `storyboard-view.tsx:68-104` |
| **7** | **Redraw overwrites with no history.** Redraw, Redraw all and Redraw sheet throw away the old picture (guarded by `confirm()`). This makes people afraid to experiment, which is the opposite of how Runway, LTX and Kling handle it. | `storyboard-view.tsx:78`, `panel-card.tsx:142`, `characters-view.tsx:158-167` |
| **8** | **Labels don't match.** The same step is called "Characters" / "Cast" / "Your cast", and "Storyboard" / "Board" / "Draw the board". Buttons say "Draw", "Sketch", "Redraw sheet" and "sketch this shot". Shot sizes show as jargon stamps (EST, MS, MCU, 2S, INS). The landing page still says "animated comic", which clashes with the black-and-white cinematic direction. | **[s01]**, **[s02]**; `lib/steps.ts:12-17`, `panel-card.tsx:79`, `shot-editor.tsx:166` |
| **9** | **Cast puts the form before the picture.** On a phone you see name, role select, a 6-row description textarea and 4 buttons before you see the drawing. Three dashed empty slots (¾, side, expressions) look like missing or failed work. "Add character" is the darkest button on the page, though it's the least likely action. | **[s06]**, **[s13]**; `characters-view.tsx:33-43`, `:119-214` |
| **10** | **Progress and auto-advance are uneven.** The breakdown has a fake 4-step ticker (it advances on a 2.6 s timer whatever the server is doing). Cast and Board show progress, but nothing tells you when the job finishes while you're on another step. The Movie stage showed "shot 1 – not drawn yet" while the filmstrip below already had shot 1 drawn, and the stage was blank black on a phone before Play. | **[s04]**, **[s09]**, **[s10]**; `project-shell.tsx:197-217` |

Honourable mentions: the board's empty state offers 3 buttons ("Go to script", "Add shot", "Cast") at `storyboard-view.tsx:163-167`. Destructive actions use native `confirm()` throughout. The "Lock" concept on characters needs explaining ("Happy with someone? Press Lock").

What already works well: "Try a sample scene" in New story **[s03]**, the strict step locks with reasons, auto-drawing on arrival at Cast and Board, the shimmering "sketching…" panels, and the phone bottom tab bar.

---

## 3. Prioritised fix list

### Quick wins (≤1 day each, mostly copy and CSS) — done 28 Oct 2026

All seven are implemented except the ⋯ header menu: the PDF button now appears on Board only instead, and "Redraw all" became a ghost button.

1. **One "next" button only.** Hide the floating Next button on steps that have their own CTA (Check, Movie). On the others, show it in a sticky bottom bar *instead of* floating over content, and pad the page content by its height. → fixes #1. `project-shell.tsx:80,157`
2. **Demote secondary buttons.** Only one dark button per screen: Check = "Looks good", Cast = "Next", Board = "Draw all" until done, then "Next", Movie = "Export movie". Card Redraw → outline. "Add character" → ghost/link. "Export PDF" → move into a header "Share / Export" menu. → #5, #6, #9
3. **Rewrite the jargon.** Motion: "Your pictures gently move, with rain and light from your story." Drop the "26 MB" and "fal.ai" text. AI animation → "Make this shot really move (takes a few minutes)". Shot stamps → plain words ("Wide", "Close-up") or icons with a tooltip. Use one word per concept (Characters / Board / Draw). Change the landing copy from "comic" to "black-and-white film". → #3, #8
4. **Hide empty turnaround slots.** Show only the views that exist, plus a small "+ more angles" chip. Put the drawing first on phones (`order-first`). → #9
5. **Phone header.** Merge the guest banner into a slim one-line bar or into the ⋯ menu after the first visit. Give the icons text labels or move them into a single ⋯ menu. Let the title use the freed space. → #4
6. **Fix the 1024 px tab overflow:** show only numbers and icons below `xl`, with the label for the current step only. → #4
7. **Real breakdown progress.** Drive the 4 ticks from server status, or show an indeterminate bar plus "about 30 s". → #10

### Medium (2–5 days) — done 28 Oct 2026

All four are implemented with no new dependencies. Check edits inline rather than in a sheet. Voice pickers stay as native dropdowns, with shorter option labels.

8. **Check = read mode by default.** Show each shot as one readable sentence plus a tiny thumbnail placeholder. Tapping opens that shot's fields in a bottom sheet (phone) or inline (desktop). Keep "Looks good" sticky. → #2
9. **Board: contextual tools.** Cards show only the picture, the number and the action text. Tap a card and a single tool bar (Redraw · Edit words · Draw on it · ⋯) appears at the bottom on phones or as a floating bar on desktop, CapCut/Canva-style. Remove the duplicate Edit path: on desktop the side list *is* the editor, on phones a sheet. Move Grid/Timeline and "Redraw all" into ⋯. → #6
10. **Movie: three-tab sheet instead of a long aside.** Tabs Voices · Motion · Animate, closed by default under the player. The main surface is Play + filmstrip + one **Export** button. Voice pickers: one row per character with the voice name and a ▶, which opens a picker sheet. Show the poster frame on the stage before Play. → #3, #10
11. **Background job tray.** One small "Drawing 4/10 ●" pill in the header, visible on every step, with a toast when the jobs finish. → #10

### Bigger changes (1–2 weeks)

12. *(Board pictures done 28 Oct 2026, via the `shot_takes` table, `lib/takes.ts` and a ‹ n of m › switcher on the selected card. Character sheets too, via the `sheet_takes` table and a "Drawing n of m" switcher on the Cast card.)* **Takes / version history** for panels and character sheets. Redraw adds a take. A small ‹ 2/3 › control on the card switches between them. Remove `confirm()` from Redraw. This needs a `shot_images` table (or a JSON array) instead of the single `imageUrl`. → #7
13. *(Done: "Draw 3 versions to pick from" and "See all versions" in the card's ⋯ menu.)* **Optional variations.** "Show me 3" for a single panel, picked like Kling or Canva's Magic tiles, behind ⋯ to control cost.
14. *(Done for Movie: drag a shot's right edge or use the arrow keys, with a voice row underneath. Built by hand, with no timeline library. The Board strip view is unchanged.)* **Unified movie timeline.** Replace the Movie filmstrip and Board timeline mode with one real timeline component: drag to trim duration, voice clips on a lane below. See section 4.
15. *(Done: one-time tips on Check, Board and Movie in `workspace/tip.tsx`, with no driver.js.)* **First-run coach marks:** 3 bubbles max (Check → "Read it, then press Looks good"; Board → "Tap a picture to change it"; Movie → "Press Play"), shown once.

Suggested order: 1, 2, 3, 4, 5, then 8, 9, 10, then 12.

---

## 4. Tool and library picks

The current stack has Tailwind 4, hand-rolled `components/ui.tsx`, `@dnd-kit`, `sonner` and `lucide-react`. Picks are chosen to fit that stack, not replace it.

| Need | Package | Why it fits |
|---|---|---|
| Bottom sheets on phones (shot editor, Movie tabs, voice picker) | **`vaul`** | Native-feeling drag-to-dismiss drawer with snap points, unstyled and Tailwind-friendly, by the author of `sonner` (already used). Replaces the custom `Modal sheet` mode. |
| Accessible primitives (menus, tabs, popovers, tooltips) | **`@base-ui-components/react`** (or **`radix-ui`**) | Unstyled, so the vintage B&W "key" look stays yours. Fixes focus trapping and keyboard support in the hand-rolled `Menu`/`Modal`. Use shadcn/ui *only* as copy-paste recipes, not as a theme. |
| Motion (step transitions, card-to-sheet, take switcher, "drawn!" pop) | **`motion`** (formerly framer-motion; `motion/react`) | `layout` and `AnimatePresence` make the contextual toolbar and sheet transitions feel calm rather than jumpy. Supports `prefers-reduced-motion`. |
| Movie preview player | **`@remotion/player`** | Renders the animatic from React components with frame-accurate seeking. Could later replace the canvas engine and `MediaRecorder` export via `@remotion/renderer` / Lambda for reliable MP4. Check the licence: it's free for individuals and small companies only. |
| Timeline (durations, voice lane) | **`@xzdarcy/react-timeline-editor`** | Lightweight React timeline with draggable/resizable actions on rows. Good for "shots" + "voices" lanes without building a full NLE. |
| Destructive confirm and undo | **`sonner`** (already installed) | Replace `confirm()` with "Shot deleted · Undo" toasts, as Gmail and Canva do. No new dependency. |
| First-run coach marks | **`driver.js`** | ~5 kB, framework-free, easy to theme in B&W. Lighter than react-joyride. |
| Job state on the client | **`@tanstack/react-query`** | Polling with `refetchInterval` while any job is `generating`, cached bundles, and optimistic updates for shot edits. Removes the hand-written refresh calls. Optional: Zustand can stay for UI state. |
| Version history storage | none (schema change) | A `takes` table in Drizzle. No library needed. |

Avoid: full NLE kits (e.g. Twick, Designcombo) and heavy design systems (MUI, Chakra). They would bring back the overwhelm and fight the hand-made aesthetic.

---

### Sources

- LTX Studio: [features 2026](https://ltx.studio/blog/top-ltx-studio-features), [tutorial](https://ltx.studio/blog/ltx-studio-tutorial), [shot editor](https://website.ltx.studio/studio/platform/shot-video-editor), [CineD on editing](https://www.cined.com/ltx-studio-takes-its-next-big-step-editing/)
- Boords: [Boords AI generators roundup](https://boords.com/blog/the-6-best-ai-storyboard-generators), [Morphic: best AI storyboard tools 2026](https://morphic.com/resources/tools/best-ai-storyboard-tools), [Atlabs 2026](https://www.atlabs.ai/blog/5-best-ai-storyboard-generator-tools-in-2026)
- Krock: [ToolWorthy listing](https://www.toolworthy.ai/tool/krockio-storyboard-ai)
- Descript: [video editing](https://www.descript.com/video-editing), [Descript 101 transcript](https://gotranscript.com/public/descript-101-edit-videos-like-docs-with-built-in-ai)
- CapCut: [TechRadar review](https://www.techradar.com/pro/software-services/capcut-review), [Metricool tutorial](https://metricool.com/capcut-video-editing/)
- Kling / Runway / Pika: [Seedance on Kling waits](https://www.seedance.tv/blog/kling-ai-generation-taking-too-long), [Kling Elements, Pika mobile, Runway Frames](https://creativizeai.substack.com/p/weekly-ai-brief-kling-unveils-elements), [Kling alternatives (FR)](https://www.eesel.ai/fr/blog/kling-ai-alternatives)
- Storyboarder, Canva and Figma rows come from product knowledge, not a fresh hands-on session this time. Verify them before quoting externally.
