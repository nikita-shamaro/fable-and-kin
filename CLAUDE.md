# Fable & Kin — Project Context for Claude Code

## What This Is
Fable & Kin is an AI-powered personalised storybook platform for bilingual, trilingual, and heritage language families. Parents configure a book around their child and the platform generates a beautifully illustrated, audio-narrated storybook in their heritage language.

The product is a PWA-first web app built by a non-technical founder using Claude Code as the primary development tool.

## The Emotional Core
This is not a language learning app. It is about a child being able to speak to their grandmother. That emotional stakes level drives every product decision. The "wow" moment: a child hears their name read aloud in their heritage language, watches words highlight as narration plays.

## Current Build Status
- Next.js 14 project scaffolded with Tailwind, App Router, TypeScript
- Anthropic SDK and Supabase client installed
- Deployed to Vercel at fable-and-kin.vercel.app
- GitHub repo: github.com/nikita-shamaro/fable-and-kin
- Russian firebird story complete — 8 pages stored in src/data/story.json with courage refrain
- Full reader built at /reader — cover page, 8 story pages, completion screen («Конец»)
- Audio narration via ElevenLabs (eleven_multilingual_v2, voice N8lIVPsFkvOoqev5Csxo, stability 0.7, speaker boost, previous_text/next_text passed for consistent pace/tone across pages)
- /api/tts uses the with-timestamps endpoint: returns audio + character-level alignment of the exact input text; server converts to per-token word timings and stores both in Supabase bucket `audio` at `firebird/v2/{translit-name}-{m|f}/page-{N}.{mp3,json}` (legacy v1 files at `firebird/` are unused)
- Client sends only { pageNumber, name, gender } — the server derives the page text from story.json, so timings are guaranteed to align 1:1 with rendered tokens for any name
- Auto-advancing pages: audio plays through all 8 pages continuously, triggers completion screen at end
- Dual-level highlighting implemented and working:
  - Word level: amber #C47B45 background, border-radius 4px, cream text — tracks audio via rAF at ~60fps
  - Sentence level: soft peach rgba(244,212,176,0.5) bubble around the active sentence, border-radius 12px
  - Timings are exact (generated with the audio) — no Whisper, no proportional scaling
  - Punctuation-only tokens (standalone em dashes) have null timings and are never highlighted
- Page transition animations:
  - Standard page turns: scale-fade, opacity + scale(0.98→1), 200ms ease
  - Cover → story: theatrical curtain-rise — cover slides down (translateY 60px, 500ms ease-in), 100ms pause, page rises from -30px (500ms ease-out)
  - Same curtain animation for story → completion screen and completion → cover
- Reader layout: full viewport (100dvh), no scroll — card fills available height
- Page-within-card layout: white #FFFFFF card, 0.5px border #E2D8CC, soft box-shadow, border-radius 16px, cream outer background
- Illustrations are gender-specific: /public/images/{m|f}/page-{N}.png and cover.png; reader picks the set from the gender param. Pages without artwork fall back to text-only layout (availability preloaded on mount, no flash). Cover page shows cover.png above the title
- All illustrations generated via scripts/generate-illustrations.ts (OpenAI gpt-image-1): m/page-1.png (Midjourney) is the style reference for every image; a character bible (child m/f, grandfather, Firebird) plus anchor images (child = page-2 of own set, grandfather = m/page-3, firebird = m/page-5) keep characters consistent. Script skips existing files — delete a file to regenerate, drop in Midjourney replacements any time
- Header: 3-column grid — wordmark left, story title centred (Fraunces 300, 0.75rem, muted), page counter right
- Nav: dot indicators (6–8px), arrow buttons, hidden on cover and completion screen
- Name input screen at /start: child name, boy/girl selector, age band chips (4–6 active, 2–3 and 7–9 marked «скоро») → routes to /reader?name=…&gender=…
- Reader injects name from URL params into text, title, and TTS requests (defaults to Олег)
- Gendered story text: story.json has masculine `text` and feminine `textF` per page, plus `refrain`/`refrainF`; girl stories get girl artwork (f/ set)
- Landing page at / — on-brand cream/Fraunces with «Создать сказку» CTA to /start

## Next Session Goal
- QA the full demo flow on the Vercel deployment (confirm ELEVENLABS_API_KEY is set in Vercel env)
- Listen through a full book for narration quality; tune voice settings if needed
- Optionally replace generated illustrations with Midjourney art (overwrite files under public/images/{m|f}/)

## Known Issues / Notes
- Legacy v1 audio in Supabase (`firebird/page-N.mp3`, `firebird/{name}-{g}/`) is orphaned — can be deleted from the bucket
- Illustration PNGs are ~3 MB each (~50 MB total) — should be converted to WebP/optimized before real launch
- f/page-1.png is a copy of m/page-1.png (house scene, no characters)

## MVP Scope (Build This First)
1. ✅ A static Russian-language story (folklore world — firebird, enchanted forest)
2. ✅ Child's name inserted dynamically into the story text and narration
3. ✅ Page-turn reading experience with cover and completion screen
4. ✅ Russian audio narration via ElevenLabs (generated once, cached in Supabase)
5. ✅ Word-by-word and sentence highlighting synced to audio
6. ✅ One age band: 4-6 year olds
7. ✅ Illustrations for all 8 pages
8. ✅ Name input screen before reader (child name, gender, age band)

Do NOT build yet: user accounts, library, payments, language toggle, or AI generation pipeline.

## Tech Stack
- Framework: Next.js 14 with App Router and TypeScript
- Styling: Tailwind CSS
- Database/Auth/Storage: Supabase (connected — Storage in use for audio files)
- Hosting: Vercel
- Story generation (later): Anthropic Claude API
- Audio narration: OpenAI TTS
- Word timing: OpenAI Whisper
- Payments (later): Stripe

## Brand
- Name: Fable & Kin
- Tagline: "Speak your language"
- Domain: fableandkin.app

### Colours
- Ink: #1C1612 (primary text, dark backgrounds)
- Amber: #C47B45 (brand primary, CTAs)
- Sand: #E8A96A (highlights, accents)
- Peach: #F4D4B0 (warm fills)
- Cream: #F7F0E6 (page background)
- Cream2: #EFE6D8 (secondary background)
- Sage: #3D7A6A (supporting accent)
- Muted: #9B8878 (secondary text)
- Border: #E2D8CC

### Typography
- Display: Fraunces 300 (Google Font) — headlines, wordmark
- UI: Plus Jakarta Sans 300/400/500 (Google Font) — all interface text

### Voice
We say: "Stories that feel like home", "Your child's name, in their language"
We never say: "AI-powered", "gamified", "seamless", "next-generation EdTech"

## Architecture Principles
- Generate and store audio once — never regenerate on each play
- Scaffold-based story structure — not open-ended generation
- PWA-first — no App Store, no Apple 30% tax
- Commit to GitHub after every working feature
- Build the reading experience before connecting any AI generation

## Launch Language
Russian only at MVP. Cyrillic script. The founder's family heritage language — stories can be QA'd directly. Story world: Russian folklore (firebird, enchanted forest, Baba Yaga's world). Age range: 4-6 years old. Contemporary, warm Russian — not archaic.

## File Structure
- src/app/ — App Router pages
- src/app/reader/ — the reading experience (primary build focus)
- src/components/ — reusable UI components
- src/data/ — story JSON files
- public/ — static assets, audio files

## What Good Looks Like
Every screen should feel like it could belong to a premium children's book publisher — warm, literary, trustworthy. Not a generic SaaS app. Not an "AI tool." A product a millennial parent would trust with their child's cultural identity.
