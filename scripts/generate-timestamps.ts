/**
 * Fetches each page's audio from Supabase Storage, transcribes with Whisper
 * word-level timestamps, and writes src/data/timestamps.json.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... \
 *   NEXT_PUBLIC_SUPABASE_URL=https://... \
 *   npx tsx scripts/generate-timestamps.ts
 *
 * Or with .env.local loaded:
 *   npx dotenv -e .env.local -- npx tsx scripts/generate-timestamps.ts
 */

import fs from "fs";
import path from "path";
import os from "os";
import OpenAI, { toFile } from "openai";
import storyData from "../src/data/story.json";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function audioPublicUrl(pageNumber: number): string {
  return `${SUPABASE_URL}/storage/v1/object/public/audio/firebird/page-${pageNumber}.mp3`;
}

async function transcribePage(pageNumber: number): Promise<{ word: string; start: number; end: number }[]> {
  const url = audioPublicUrl(pageNumber);
  console.log(`  Fetching audio: ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch audio for page ${pageNumber}: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  const tmpPath = path.join(os.tmpdir(), `fable-page-${pageNumber}.mp3`);
  fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));

  console.log(`  Transcribing page ${pageNumber} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)…`);

  const response = await openai.audio.transcriptions.create({
    file: await toFile(fs.createReadStream(tmpPath), `page-${pageNumber}.mp3`, { type: "audio/mpeg" }),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    language: "ru",
  });

  fs.unlinkSync(tmpPath);

  const words = (response as unknown as { words?: { word: string; start: number; end: number }[] }).words ?? [];
  console.log(`  ✓ ${words.length} words`);
  return words;
}

async function main() {
  const output: { page: number; words: { word: string; start: number; end: number }[] }[] = [];

  for (const page of storyData.pages) {
    console.log(`\nPage ${page.page}:`);
    try {
      const words = await transcribePage(page.page);
      output.push({ page: page.page, words });
    } catch (err) {
      console.error(`  ✗ Error on page ${page.page}:`, err instanceof Error ? err.message : err);
      output.push({ page: page.page, words: [] });
    }
  }

  const outPath = path.join(__dirname, "../src/data/timestamps.json");
  fs.writeFileSync(outPath, JSON.stringify({ pages: output }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
