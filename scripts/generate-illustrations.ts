/**
 * Generates illustrations for story pages that don't have one yet, using
 * OpenAI gpt-image-1 with public/images/page-1.png as a style reference so
 * all pages share the same watercolour look.
 *
 * Output: public/images/page-{N}.png (skips pages whose file already exists,
 * so the Midjourney originals are never overwritten — delete a file to
 * regenerate it).
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/generate-illustrations.ts
 */

import fs from "fs";
import path from "path";
import OpenAI, { toFile } from "openai";
import storyData from "../src/data/story.json";

console.log("=== generate-illustrations starting ===");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY is not set");
  console.error("Run with: npx dotenv -e .env.local -- npx tsx scripts/generate-illustrations.ts");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const IMAGES_DIR = path.join(process.cwd(), "public", "images");
const REFERENCE = path.join(IMAGES_DIR, "page-1.png");

// Keeps the hero recognisable from page to page — gpt-image-1 has no memory
// across calls, so the description must travel with every prompt.
const CHARACTER =
  "The child is a small five-year-old with short chestnut-brown hair, rosy cheeks, " +
  "wearing a warm mustard-yellow knitted jumper and dark trousers.";

const STYLE =
  "Match the reference image exactly: the same soft watercolour technique, muted warm " +
  "palette of deep blues and glowing ambers, gentle dusky lighting, visible paper texture, " +
  "children's picture book illustration. No text, no lettering, no borders.";

async function main() {
  if (!fs.existsSync(REFERENCE)) {
    console.error(`ERROR: style reference not found at ${REFERENCE}`);
    process.exit(1);
  }

  for (const page of storyData.pages) {
    const outPath = path.join(IMAGES_DIR, `page-${page.page}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`page ${page.page}: already exists, skipping`);
      continue;
    }

    const mentionsChild = /boy|girl|child/i.test(page.imagePrompt);
    const prompt = [
      STYLE,
      page.imagePrompt,
      mentionsChild ? CHARACTER : "",
    ].filter(Boolean).join(" ");

    console.log(`page ${page.page}: generating…`);
    const started = Date.now();

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image: await toFile(fs.createReadStream(REFERENCE), "page-1.png", { type: "image/png" }),
      prompt,
      size: "1536x1024",
      quality: "high",
      n: 1,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      console.error(`page ${page.page}: no image data returned`, JSON.stringify(result).slice(0, 500));
      process.exit(1);
    }

    fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`page ${page.page}: saved ${outPath} (${kb} KB, ${Math.round((Date.now() - started) / 1000)}s)`);
  }

  console.log("=== done ===");
}

main().catch((err) => {
  console.error("FATAL:", err?.message ?? err);
  process.exit(1);
});
