#!/usr/bin/env node
/**
 * ingest-manual-text.mjs
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node ingest-manual-text.mjs ./path/to/manual.txt 교무업무_매뉴얼
 *
 * - Input text must contain page markers like:
 *   ===== PAGE 3 / 334 =====
 * - Inserts into public.manual_chunks (source, page, chunk_index, content)
 */

import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const [,, filePath, sourceArg] = process.argv;

if (!filePath) {
  console.error("Usage: node ingest-manual-text.mjs <filePath> [sourceName]");
  process.exit(1);
}

const SOURCE = sourceArg || "교무업무_매뉴얼";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const raw = await fs.readFile(filePath, "utf-8");

// ----- Parse pages -----
const pageHeaderRe = /^===== PAGE (\d+) \/ (\d+) =====$/gm;
const matches = [...raw.matchAll(pageHeaderRe)];

if (matches.length === 0) {
  console.error("No page markers found. Expect lines like: ===== PAGE 3 / 334 =====");
  process.exit(1);
}

const pages = [];
for (let i = 0; i < matches.length; i++) {
  const page = Number(matches[i][1]);
  const start = matches[i].index + matches[i][0].length;
  const end = (i + 1 < matches.length) ? matches[i + 1].index : raw.length;
  const text = raw.slice(start, end).trim();

  // Skip empty/image-only pages
  if (!text || text.includes("[추출 가능한 텍스트 없음")) continue;

  pages.push({ page, text });
}

console.log(`Parsed pages: ${pages.length}`);

// ----- Chunking -----
function chunkText(text, maxLen = 1200, overlap = 120) {
  const paras = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks = [];
  let buf = "";

  for (const p of paras) {
    if (!buf) {
      buf = p;
      continue;
    }
    if ((buf.length + 2 + p.length) <= maxLen) {
      buf += "\n\n" + p;
    } else {
      chunks.push(buf);
      // overlap tail
      const tail = buf.slice(Math.max(0, buf.length - overlap));
      buf = tail + "\n\n" + p;
      // 너무 커지면 잘라서 넣기
      while (buf.length > maxLen * 1.8) {
        chunks.push(buf.slice(0, maxLen));
        buf = buf.slice(maxLen - overlap);
      }
    }
  }
  if (buf) chunks.push(buf);

  // 마지막 안전 컷
  return chunks.flatMap(c => {
    if (c.length <= maxLen * 1.8) return [c];
    const out = [];
    let i = 0;
    while (i < c.length) {
      out.push(c.slice(i, i + maxLen));
      i += (maxLen - overlap);
    }
    return out;
  });
}

const rows = [];
for (const p of pages) {
  const chunks = chunkText(p.text);
  chunks.forEach((c, idx) => {
    rows.push({
      source: SOURCE,
      page: p.page,
      chunk_index: idx,
      content: c,
    });
  });
}

console.log(`Prepared chunks: ${rows.length}`);

// ----- Upload in batches -----
const BATCH = 200;
let uploaded = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase
    .from("manual_chunks")
    .upsert(batch, { onConflict: "source,page,chunk_index" });

  if (error) {
    console.error("Upload error:", error);
    process.exit(1);
  }

  uploaded += batch.length;
  if (uploaded % 1000 === 0 || uploaded === rows.length) {
    console.log(`Uploaded ${uploaded}/${rows.length}`);
  }
}

console.log("✅ Done.");
