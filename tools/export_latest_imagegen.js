"use strict";

const fs = require("fs");
const path = require("path");

const needle = process.argv[2];
const output = process.argv[3];

if (!needle || !output) {
  throw new Error("Usage: node tools/export_latest_imagegen.js <prompt needle> <output path>");
}

const sessionsRoot = path.join(process.env.USERPROFILE || "", ".codex", "sessions");
let selected = null;

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".jsonl")) continue;
    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      if (!line.includes("image_generation_call") || !line.includes(needle)) continue;
      const item = JSON.parse(line);
      const payload = item.payload;
      if (!payload || payload.type !== "image_generation_call" || payload.status !== "completed" || !payload.result) continue;
      if (!selected || item.timestamp > selected.timestamp) selected = { ...payload, timestamp: item.timestamp };
    }
  }
}

visit(sessionsRoot);
if (!selected) throw new Error(`No completed image generation result matched: ${needle}`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.from(selected.result, "base64"));
console.log(JSON.stringify({ id: selected.id, timestamp: selected.timestamp, output, bytes: fs.statSync(output).size }, null, 2));
