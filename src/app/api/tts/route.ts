import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import storyData from "@/data/story.json";

const BUCKET = "audio";
// v2: audio generated via the with-timestamps endpoint with prosody context
// (previous_text/next_text) and higher stability. Word timings are stored
// next to each mp3 so highlighting is exact — no Whisper, no scaling.
const CACHE_VERSION = "v2";

const DEFAULT_NAME = "Олег";
const VOICE_ID = "N8lIVPsFkvOoqev5Csxo";

const VOICE_SETTINGS = {
  stability: 0.7,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

// Storage keys must be ASCII — transliterate the name; fall back to hex if
// nothing survives (e.g. a name in another script).
function nameSlug(name: string): string {
  const lower = name.toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (/[a-z0-9-]/.test(ch)) out += ch;
    else if (ch in CYRILLIC_TO_LATIN) out += CYRILLIC_TO_LATIN[ch];
  }
  if (!out) out = Buffer.from(name, "utf8").toString("hex").slice(0, 24);
  return out;
}

function replaceName(text: string, name: string): string {
  return text.split(storyData.namePlaceholder).join(name);
}

// Must match the reader's text derivation exactly — the reader tokenises the
// same string, so word timings line up 1:1 with rendered tokens.
function pageText(pageIndex: number, name: string, gender: "m" | "f"): string {
  const page = storyData.pages[pageIndex] as { text: string; textF?: string };
  const raw = gender === "f" && page.textF ? page.textF : page.text;
  return replaceName(raw, name);
}

export interface WordTiming {
  word: string;
  start: number | null; // null — punctuation-only token, never highlighted
  end: number | null;
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

// Split text on whitespace (same as the reader) and map each token to the
// time range of its characters. Tokens with no letters or digits (e.g. a
// standalone em dash) get null timings so they are skipped by highlighting.
function buildWordTimings(text: string, alignment: Alignment): WordTiming[] {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  // The alignment is 1:1 with the input text for this endpoint, but guard
  // against drift: walk both sequences and match characters in order.
  const timings: WordTiming[] = [];
  let ci = 0;

  const tokens = text.split(/\s+/).filter(Boolean);
  let cursor = 0;

  for (const token of tokens) {
    const tokenStartInText = text.indexOf(token, cursor);
    const tokenEndInText = tokenStartInText + token.length;
    cursor = tokenEndInText;

    // Advance ci to the alignment position of tokenStartInText. When the
    // alignment matches the text exactly (the normal case) indexes coincide.
    if (chars.length === text.length) {
      ci = tokenStartInText;
    } else {
      // Fallback: skip whitespace entries until the next non-space char.
      while (ci < chars.length && /\s/.test(chars[ci])) ci++;
    }

    const first = ci;
    const last = Math.min(ci + token.length, chars.length) - 1;
    ci = last + 1;

    const isWord = /[A-Za-zА-Яа-яЁё0-9]/.test(token);
    timings.push({
      word: token,
      start: isWord && first < starts.length ? starts[first] : null,
      end: isWord && last < ends.length ? ends[last] : null,
    });
  }

  return timings;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const pageNumber: number = body.pageNumber;
  const name: string =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().split(/\s+/)[0].slice(0, 30)
      : DEFAULT_NAME;
  const gender: "m" | "f" = body.gender === "f" ? "f" : "m";

  console.log("[tts] handler invoked", {
    pageNumber,
    name,
    gender,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
  });

  if (
    typeof pageNumber !== "number" ||
    pageNumber < 1 ||
    pageNumber > storyData.pages.length
  ) {
    return NextResponse.json({ error: "pageNumber is invalid" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[tts] Supabase env vars missing");
    return NextResponse.json({ error: "Supabase env vars are not configured" }, { status: 500 });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error("[tts] ELEVENLABS_API_KEY is not set");
    return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const dir = `firebird/${CACHE_VERSION}/${nameSlug(name)}-${gender}`;
  const audioPath = `${dir}/page-${pageNumber}.mp3`;
  const timingsPath = `${dir}/page-${pageNumber}.json`;

  const pageIndex = pageNumber - 1;
  const text = pageText(pageIndex, name, gender);

  try {
    // 1. Cached? Both the audio and its timings must exist.
    const { data: existing, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(dir);

    if (listError) {
      console.error("[tts] Supabase list error", { message: listError.message });
      return NextResponse.json({ error: "Failed to check storage" }, { status: 500 });
    }

    const names = new Set((existing ?? []).map((f) => f.name));
    if (names.has(`page-${pageNumber}.mp3`) && names.has(`page-${pageNumber}.json`)) {
      const { data: timingsBlob, error: dlError } = await supabase.storage
        .from(BUCKET)
        .download(timingsPath);
      if (!dlError && timingsBlob) {
        const words: WordTiming[] = JSON.parse(await timingsBlob.text());
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(audioPath);
        console.log("[tts] returning cached audio + timings", { audioPath });
        return NextResponse.json({ url: urlData.publicUrl, words });
      }
      console.warn("[tts] cached timings unreadable — regenerating", { timingsPath });
    }

    // 2. Generate with character-level timestamps. previous_text/next_text
    // give the model prosody context so pace and tone stay consistent
    // across page boundaries.
    const previousText = pageIndex > 0 ? pageText(pageIndex - 1, name, gender) : undefined;
    const nextText =
      pageIndex < storyData.pages.length - 1 ? pageText(pageIndex + 1, name, gender) : undefined;

    console.log("[tts] generating via ElevenLabs with-timestamps", { pageNumber, name, gender });
    const elevenResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: VOICE_SETTINGS,
          previous_text: previousText,
          next_text: nextText,
        }),
      }
    );

    if (!elevenResp.ok) {
      const errText = await elevenResp.text();
      console.error("[tts] ElevenLabs error", { status: elevenResp.status, body: errText });
      return NextResponse.json({ error: "ElevenLabs TTS failed" }, { status: 500 });
    }

    const payload = (await elevenResp.json()) as {
      audio_base64: string;
      alignment: Alignment | null;
    };

    if (!payload.audio_base64 || !payload.alignment) {
      console.error("[tts] ElevenLabs response missing audio or alignment");
      return NextResponse.json({ error: "ElevenLabs returned incomplete data" }, { status: 500 });
    }

    const audioBuffer = Buffer.from(payload.audio_base64, "base64");
    const words = buildWordTimings(text, payload.alignment);
    console.log("[tts] generated", {
      pageNumber,
      audioBytes: audioBuffer.length,
      tokens: words.length,
    });

    // 3. Store audio + timings (race-tolerant: another request may have won)
    const uploads = await Promise.all([
      supabase.storage.from(BUCKET).upload(audioPath, audioBuffer, {
        contentType: "audio/mpeg",
        cacheControl: "31536000",
        upsert: false,
      }),
      supabase.storage.from(BUCKET).upload(timingsPath, Buffer.from(JSON.stringify(words)), {
        contentType: "application/json",
        cacheControl: "31536000",
        upsert: true,
      }),
    ]);
    for (const { error: uploadError } of uploads) {
      if (uploadError && uploadError.message !== "The resource already exists") {
        console.error("[tts] Supabase upload error", { message: uploadError.message });
        return NextResponse.json({ error: "Failed to store audio" }, { status: 500 });
      }
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(audioPath);
    return NextResponse.json({ url: urlData.publicUrl, words });
  } catch (err) {
    console.error("[tts] unexpected error", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
