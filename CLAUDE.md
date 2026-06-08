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

## MVP Scope (Build This First)
1. A static Russian-language story (folklore world — firebird, enchanted forest)
2. Child's name inserted dynamically into the story text and narration
3. Page-turn reading experience
4. Russian audio narration via OpenAI TTS (generated once, cached)
5. Word-by-word highlighting synced to audio
6. One age band: 4-6 year olds

Do NOT build: user accounts, library, book creation wizard, payments, language toggle, or any generation pipeline yet. Reading experience and audio first.

## Tech Stack
- Framework: Next.js 14 with App Router and TypeScript
- Styling: Tailwind CSS
- Database/Auth/Storage: Supabase (not connected yet)
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
