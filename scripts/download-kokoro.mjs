/**
 * Downloads the Kokoro-82M ONNX model files into public/models/kokoro/
 * so the app can run TTS entirely from localhost with no HuggingFace requests.
 *
 * Usage: node scripts/download-kokoro.mjs
 */

import { createWriteStream, mkdirSync, existsSync } from "fs";
import { pipeline } from "stream/promises";
import path from "path";

const BASE_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main";
const DEST     = "public/models/kokoro";

// Files needed for dtype:"q8" with common voices.
// Add more voice .bin files from the list below if you want them:
// af_alloy, af_aoede, af_bella, af_jessica, af_kore, af_nicole,
// af_nova, af_river, af_sarah, af_sky, am_adam, am_echo, am_eric,
// am_fenrir, am_liam, am_michael, am_onyx, am_puck, bf_alice,
// bf_emma, bf_isabella, bm_daniel, bm_fable, bm_george, bm_lewis
const FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",   // fetched when dtype:"q8"
  "voices/af_heart.bin",
  "voices/af_nova.bin",
  "voices/am_adam.bin",
  "voices/bf_emma.bin",
];

async function download(file) {
  const dest = path.join(DEST, file);
  const dir  = path.dirname(dest);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (existsSync(dest)) {
    console.log(`  skip  ${file}  (already exists)`);
    return;
  }

  const url = `${BASE_URL}/${file}`;
  process.stdout.write(`  fetch ${file} … `);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const total = Number(res.headers.get("content-length") ?? 0);
  let received = 0;
  const writer = createWriteStream(dest);

  for await (const chunk of res.body) {
    writer.write(chunk);
    received += chunk.length;
    if (total) {
      process.stdout.write(`\r  fetch ${file} … ${Math.round(received / 1024 / 1024)}/${Math.round(total / 1024 / 1024)} MB`);
    }
  }
  writer.end();
  console.log(`\r  ✓     ${file} (${Math.round(received / 1024 / 1024)} MB)`);
}

console.log(`Downloading Kokoro-82M ONNX → ${DEST}\n`);
for (const file of FILES) {
  await download(file);
}
console.log("\nDone. Run `npm run dev` — TTS will load from localhost.");
