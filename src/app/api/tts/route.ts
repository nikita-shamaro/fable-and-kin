import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "audio";

function storagePath(pageNumber: number): string {
  return `firebird/page-${pageNumber}.mp3`;
}

export async function POST(req: NextRequest) {
  const { text, pageNumber } = await req.json();

  // Startup diagnostics — log config presence without exposing values
  console.log("[tts] handler invoked", {
    pageNumber,
    textLength: typeof text === "string" ? text.length : null,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasOpenAiKey:   !!process.env.OPENAI_API_KEY,
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
  if (!process.env.OPENAI_API_KEY) {
    console.error("[tts] OPENAI_API_KEY is not set");
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const path = storagePath(pageNumber);

  try {
    // 1. Check whether the file already exists in storage
    console.log("[tts] checking storage for existing file", { path });
    const { data: existing, error: listError } = await supabase.storage
      .from(BUCKET)
      .list("firebird", { search: `page-${pageNumber}.mp3` });

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

    // 2. Not stored yet — generate via OpenAI TTS
    console.log("[tts] generating audio via OpenAI TTS", { pageNumber });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    console.log("[tts] TTS generation complete", { bufferBytes: buffer.length });

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
