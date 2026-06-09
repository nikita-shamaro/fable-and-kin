import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "audio";

function storagePath(pageNumber: number): string {
  return `firebird/page-${pageNumber}.mp3`;
}

export async function POST(req: NextRequest) {
  const { text, pageNumber } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof pageNumber !== "number") {
    return NextResponse.json({ error: "pageNumber is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase env vars are not configured" }, { status: 500 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const path = storagePath(pageNumber);

  // 1. Check whether the file already exists in storage
  const { data: existing } = await supabase.storage
    .from(BUCKET)
    .list("firebird", { search: `page-${pageNumber}.mp3` });

  const alreadyStored = existing && existing.some((f) => f.name === `page-${pageNumber}.mp3`);

  if (alreadyStored) {
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl });
  }

  // 2. Not stored yet — generate via OpenAI TTS
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());

  // 3. Upload to Supabase Storage
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
      console.error("Supabase upload error:", uploadError);
      return NextResponse.json({ error: "Failed to store audio" }, { status: 500 });
    }
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
