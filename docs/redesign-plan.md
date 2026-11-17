# SketchFrame — rescoped plan (step by step)

**Focus:** the best black-and-white sketches and comic panels from a script, with characters that look the same in every panel. Nothing else for now.

**Parked:** movie, motion, AI video, voices, poem and song modes, and the live-action "film" look. The code stays in place but is hidden from the UI.

**Look references:**
- *CEREAL!*: bold, simple, expressive characters
- *Aashiqana*: pencil and ink on white paper, with lots of white space

## Steps (one at a time, each must pass before the next)

### Step 1: Measure first (eval set + baseline)
- A fixed test set: 2 short scripts and 3 characters, about 12 panels.
- One command draws the whole set and saves a contact sheet.
- A vision model scores each panel on two things:
  - **Same character?** Face, hair and outfit compared with the character sheet, scored 1–5.
  - **On style?** Black-and-white ink sketch, no colour, no realism, scored 1–5.
- Record today's scores as the baseline.

**Done when:** we have a number for "how consistent are characters today".

### Step 2: Ink sketch style
- Write a new black-and-white "ink" style bible.
- Move to stronger reference sheets, borrowing what works in AIComicBuilder:
  - **one** image per character with 4 views (front, ¾, side, back)
  - framed waist-up, so faces are big
  - the character's name printed under it
  - a large face close-up
- Add a **location reference** per scene: an empty set with no people, attached to every panel in that scene, so backgrounds stay consistent.
- Attach the **previous panel in the same scene** as a reference, for continuity.
- Each shot lists **what it uses**: its characters, its location and its camera move, shown on the shot card (borrowed from Fringe).
- Compare the image models on the test set:
  - `gpt-image-1.5` (high quality)
  - Gemini image
  - FLUX Kontext
  - Seedream

Keep the winner.

**Done when:** the style and consistency scores clearly beat the baseline.

### Step 3: Pick-a-design + auto-check
- Each shot gets a one-line **beat**: the emotional turn, not only the action (for example "disinterest turns into real alarm"). Check shows the beats so the board reads like a story.
- **Approve before drawing:** show a plan ("here's what I'll draw: 12 panels, these characters, these locations") and draw only after the user approves. A note on one shot redraws only that shot and leaves cast, location and lines alone.
- The user picks 1 of 4 designs per character.
- Every panel is scored; off-model panels are redrawn automatically (up to 2×).
- Never fall back to a model that ignores the character sheets.

**Done when:** at least 90% of panels in the test set score 4+ on "same character".

### Step 4: Per-character LoRA (needs fal credits, about $20)
- From the chosen design, generate about 15 views.
- Keep only the views the check passes.
- Train a LoRA on them (about $2–3 per character).
- Draw panels with the LoRA.

**Done when:** consistency beats Step 3 on the test set.

### Step 5: Comic output
- Arrange panels into comic pages, with webtoon-style vertical scroll and print-style page grids.
- Add speech balloons and captions as editable text, not drawn by the AI.
- Export PNG and PDF.

### Step 6: Strip the UI to these steps only
Script → Check → Characters → Board → Comic, with one main button per screen.

### Later: Story Bible
- One place that keeps cast sheets, outfits, locations, style and tone for a story.
- A new chapter or episode reuses all of it without re-explaining (Fringe calls this the "Show Bible").

## Borrowed from Fringe (fringe.film), and what we skip
Fringe directs animated shows over chat, on paid video models (Seedance 2.5, Veo 3.1, Kling) at $49–$199 a month.
- **Borrowed:**
  - references listed per shot (Step 2)
  - beats, and approve before drawing (Step 3)
  - a Story Bible (later)
- **Skipped for now:**
  - finished video episodes and paid video models. We stay a cheap, fast tool for black-and-white sketch storyboards and comics.
  - a chat-first agent. We keep buttons with one main action per screen and may add chat later.

## On training data
The Kaggle "Webtoon Comics" dataset is **not** usable for training images. It is a 272 kB CSV of metadata (title, writer, genre, likes, rating, subscribers, summary, link) for about 500 Webtoon Originals, with no pictures. Scraping Webtoon's actual art to train on would be copyrighted work, against the site's terms, and risky for a public product.

Training data should come from:
- our own generated, checked character views (Step 4)
- art you own or commission
- clearly public-domain or openly licensed comics
