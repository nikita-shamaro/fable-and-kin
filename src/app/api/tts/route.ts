import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "audio";

const DEFAULT_NAME = "Олег";
const DEFAULT_GENDER = "m";

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

// The original Олег narration lives at the legacy path — keep serving it
// from there so it is never regenerated.
function storageDir(name: string, gender: string): string {
  if (name === DEFAULT_NAME && gender === DEFAULT_GENDER) return "firebird";
  return `firebird/${nameSlug(name)}-${gender}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, pageNumber } = body;
  const name: string = typeof body.name === "string" && body.name.trim() ? body.name.trim() : DEFAULT_NAME;
  const gender: string = body.gender === "f" ? "f" : "m";

  // Startup diagnostics — log config presence without exposing values
  console.log("[tts] handler invoked", {
    pageNumber,
    textLength: typeof text === "string" ? text.length : null,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
    supabaseUrl:    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(not set)",
  });

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof pageNumber !== "number") {
    return NextResponse.json({ error: "pageNumber is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[tts] Supabase env vars missing", { hasSupabaseUrl: !!supabaseUrl, hasSupabaseKey: !!supabaseKey });
    return NextResponse.json({ error: "Supabase env vars are not configured" }, { status: 500 });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error("[tts] ELEVENLABS_API_KEY is not set");
    return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const dir = storageDir(name, gender);
  const path = `${dir}/page-${pageNumber}.mp3`;

  try {
    // 1. Check whether the file already exists in storage
    console.log("[tts] checking storage for existing file", { path });
    const { data: existing, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(dir, { search: `page-${pageNumber}.mp3` });

    if (listError) {
      console.error("[tts] Supabase list error", {
        message: listError.message,
        name:    (listError as { name?: string }).name,
      });
      return NextResponse.json({ error: "Failed to check storage" }, { status: 500 });
    }

    const alreadyStored = existing && existing.some((f) => f.name === `page-${pageNumber}.mp3`);
    console.log("[tts] storage check result", { alreadyStored, filesFound: existing?.length ?? 0 });

    if (alreadyStored) {
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      console.log("[tts] returning cached URL", { url: urlData.publicUrl });
      return NextResponse.json({ url: urlData.publicUrl });
    }

    // 2. Not stored yet — generate via ElevenLabs TTS
    const elevenUrl = "https://api.elevenlabs.io/v1/text-to-speech/N8lIVPsFkvOoqev5Csxo";
    console.log("[tts] generating audio via ElevenLabs TTS", { pageNumber, url: elevenUrl });
    const elevenResp = await fetch(
      elevenUrl,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!elevenResp.ok) {
      const errText = await elevenResp.text();
      console.error("[tts] ElevenLabs error", { status: elevenResp.status, body: errText });
      return NextResponse.json({ error: "ElevenLabs TTS failed" }, { status: 500 });
    }

    const buffer = Buffer.from(await elevenResp.arrayBuffer());
    console.log("[tts] ElevenLabs generation complete", { bufferBytes: buffer.length });

    // 3. Upload to Supabase Storage
    console.log("[tts] uploading to Supabase Storage", { path });
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: "audio/mpeg",
        cacheControl: "31536000", // 1 year
        upsert: false,
      });

    if (uploadError) {
      // If another request beat us to it (race), that's fine — just return the URL
      if (uploadError.message !== "The resource already exists") {
        console.error("[tts] Supabase upload error", {
          message: uploadError.message,
          name:    (uploadError as { name?: string }).name,
        });
        return NextResponse.json({ error: "Failed to store audio" }, { status: 500 });
      }
      console.log("[tts] upload skipped — file already exists (race condition), returning URL");
    } else {
      console.log("[tts] upload successful", { path });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    console.log("[tts] returning new URL", { url: urlData.publicUrl });
    return NextResponse.json({ url: urlData.publicUrl });

  } catch (err) {
    console.error("[tts] unexpected error", {
      message: err instanceof Error ? err.message : String(err),
      name:    err instanceof Error ? err.name    : undefined,
      stack:   err instanceof Error ? err.stack   : undefined,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
