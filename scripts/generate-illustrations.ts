/**
 * Generates story illustrations with OpenAI gpt-image-1.
 *
 * Consistency strategy:
 *  - public/images/m/page-1.png (Midjourney) is the style reference for every image
 *  - a character bible (child m/f, grandfather, Firebird) travels with every prompt
 *  - each image also receives anchor images of the characters it contains
 *    (child anchor = page 2 of its own gender set; grandfather = m/page-3;
 *    firebird = m/page-5), so faces, clothing and plumage stay recognisable
 *
 * Output: public/images/{m,f}/page-{N}.png and cover.png. Existing files are
 * skipped — delete a file to regenerate it; drop in Midjourney replacements
 * any time. f/page-1.png (the house, no characters) is copied from m/.
 *
 * Usage:
 *   set -a && source .env.local && set +a && npx tsx scripts/generate-illustrations.ts [m|f]
 */

import fs from "fs";
import path from "path";
import OpenAI, { toFile } from "openai";
import storyData from "../src/data/story.json";

console.log("=== generate-illustrations starting ===");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY is not set");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const IMAGES_DIR = path.join(process.cwd(), "public", "images");
const STYLE_REF = path.join(IMAGES_DIR, "m", "page-1.png");

const STYLE =
  "Match the first reference image exactly: the same soft watercolour technique, muted warm " +
  "palette of deep blues and glowing ambers, gentle dusky lighting, visible paper texture, " +
  "children's picture book illustration. No text, no lettering, no borders.";

// ── Character bible — keeps every recurring character recognisable from page
// to page; gpt-image-1 has no memory across calls, so the descriptions and
// anchor images must travel with every request.
const CHILD: Record<"m" | "f", string> = {
  m:
    "The child is a small five-year-old boy with short chestnut-brown hair, rosy cheeks, " +
    "wearing a warm mustard-yellow knitted jumper and dark blue trousers.",
  f:
    "The child is a small five-year-old girl with chestnut-brown hair in a neat chin-length bob " +
    "with a fringe, rosy cheeks, wearing a warm mustard-yellow knitted jumper and a dark blue " +
    "pinafore skirt over tights.",
};

const GRANDFATHER =
  "The grandfather is an elderly man with a full white beard, bushy white eyebrows, white hair " +
  "at the sides of a balding head, kind deep-set eyes, wearing a warm rust-red shirt and dark trousers.";

const FIREBIRD =
  "The Firebird is a magnificent magical bird with flame-like plumage in vivid orange, gold and " +
  "red, a flowing flame-feather crest on its head, and a long sweeping tail of fire that trails " +
  "like a comet, radiating warm glowing light.";

// Which recurring characters appear on each page (page 1 has none).
const PAGE_CHARACTERS: Record<number, Array<"child" | "grandfather" | "firebird">> = {
  2: ["child"],
  3: ["child", "grandfather"],
  4: ["child"],
  5: ["child", "firebird"],
  6: ["child", "firebird"],
  7: ["child", "firebird"],
  8: ["child", "grandfather"],
};

const COVER_PROMPT =
  "Book cover illustration for a children's storybook, with no text or lettering anywhere: " +
  "the child stands in a moonlit forest clearing, seen from a slight distance, gazing up in wonder " +
  "at the magnificent Firebird sweeping across the starry night sky above tall pine trees, " +
  "trailing golden sparks that turn into tiny stars, deep blue night palette with radiant amber light.";

function genderedPrompt(prompt: string, gender: "m" | "f"): string {
  if (gender === "m") return prompt;
  return prompt.replace(/\bboy\b/g, "girl").replace(/\bhis\b/g, "her");
}

function characterNotes(chars: Array<"child" | "grandfather" | "firebird">, gender: "m" | "f"): string {
  return chars
    .map((c) => (c === "child" ? CHILD[gender] : c === "grandfather" ? GRANDFATHER : FIREBIRD))
    .join(" ");
}

// Anchor images for character consistency, in addition to the style reference.
function referenceImages(chars: Array<"child" | "grandfather" | "firebird">, gender: "m" | "f"): string[] {
  const refs: string[] = [STYLE_REF];
  const childAnchor = path.join(IMAGES_DIR, gender, "page-2.png");
  if (chars.includes("child") && fs.existsSync(childAnchor) ) refs.push(childAnchor);
  if (chars.includes("grandfather")) refs.push(path.join(IMAGES_DIR, "m", "page-3.png"));
  if (chars.includes("firebird")) refs.push(path.join(IMAGES_DIR, "m", "page-5.png"));
  return Array.from(new Set(refs)).filter((p) => fs.existsSync(p));
}

async function generate(outPath: string, prompt: string, refs: string[]) {
  console.log(`generating ${path.relative(IMAGES_DIR, outPath)} (${refs.length} refs)…`);
  const started = Date.now();

  const images = await Promise.all(
    refs.map((p) => toFile(fs.createReadStream(p), path.basename(p), { type: "image/png" }))
  );

  const result = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
    size: "1536x1024",
    quality: "high",
    n: 1,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image data returned for ${outPath}`);

  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`  saved (${kb} KB, ${Math.round((Date.now() - started) / 1000)}s)`);
}

async function main() {
  if (!fs.existsSync(STYLE_REF)) {
    console.error(`ERROR: style reference not found at ${STYLE_REF}`);
    process.exit(1);
  }

  const genders: Array<"m" | "f"> =
    process.argv[2] === "m" ? ["m"] : process.argv[2] === "f" ? ["f"] : ["m", "f"];

  for (const gender of genders) {
    const dir = path.join(IMAGES_DIR, gender);
    fs.mkdirSync(dir, { recursive: true });

    // Page 1 (the house at dusk, no characters) is shared between genders.
    const p1 = path.join(dir, "page-1.png");
    if (!fs.existsSync(p1)) {
      fs.copyFileSync(STYLE_REF, p1);
      console.log(`${gender}/page-1.png: copied from style reference`);
    }

    // Story pages — page 2 first so it can anchor the child for the rest.
    for (const page of storyData.pages) {
      if (page.page === 1) continue;
      const outPath = path.join(dir, `page-${page.page}.png`);
      if (fs.existsSync(outPath)) {
        console.log(`${gender}/page-${page.page}.png: already exists, skipping`);
        continue;
      }
      const chars = PAGE_CHARACTERS[page.page] ?? [];
      const prompt = [STYLE, genderedPrompt(page.imagePrompt, gender), characterNotes(chars, gender)].join(" ");
      await generate(outPath, prompt, referenceImages(chars, gender));
    }

    // Cover
    const coverPath = path.join(dir, "cover.png");
    if (!fs.existsSync(coverPath)) {
      const prompt = [STYLE, COVER_PROMPT, characterNotes(["child", "firebird"], gender)].join(" ");
      await generate(coverPath, prompt, referenceImages(["child", "firebird"], gender));
    } else {
      console.log(`${gender}/cover.png: already exists, skipping`);
    }
  }

  console.log("=== done ===");
}

main().catch((err) => {
  console.error("FATAL:", err?.message ?? err);
  process.exit(1);
});
