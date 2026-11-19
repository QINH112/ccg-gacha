"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const { resolveDesignRoot } = require("./design-root");
const designRoot = resolveDesignRoot(root);
const review = path.join(designRoot, "review");
const files = [
  "home-320x568.png", "home-375x812.png", "home-393x852.png", "home-430x932.png",
  "card-template-detail-375x812.png", "card-template-detail-430x932.png",
  "card-template-mulligan-375x812.png", "card-template-mulligan-430x932.png",
  "draw-results-1-375x812.png", "draw-results-10-375x812.png",
  "draw-results-1-430x932.png", "draw-results-10-430x932.png",
  "battle-board-375x812.png", "battle-board-430x932.png",
  "battle-result-win-375x812.png", "battle-result-loss-375x812.png", "battle-result-draw-375x812.png",
  "battle-result-win-430x932.png", "battle-result-loss-430x932.png", "battle-result-draw-430x932.png",
  "service-shop-375x812.png", "service-mail-375x812.png", "service-tasks-375x812.png", "service-achievements-375x812.png", "service-decks-375x812.png", "service-collection-375x812.png", "service-forge-375x812.png", "service-history-375x812.png",
  "service-shop-430x932.png", "service-mail-430x932.png", "service-tasks-430x932.png", "service-achievements-430x932.png", "service-decks-430x932.png", "service-collection-430x932.png", "service-forge-430x932.png", "service-history-430x932.png",
];

function pngSize(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("Not PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const evidence = files.map(name => {
  const filePath = path.join(review, name);
  const buffer = fs.readFileSync(filePath);
  return { file: `design/review/${name}`, ...pngSize(buffer), bytes: buffer.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
});
// 真机证据：命名规则见 docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md（manual-p7-<编号>-<机型>-<日期>.png）
const deviceFiles = fs.existsSync(review)
  ? fs.readdirSync(review).filter(name => /^(manual-p7|mask-diag)-.*\.png$/i.test(name)).sort()
  : [];
const deviceEvidence = deviceFiles.map(name => {
  const filePath = path.join(review, name);
  const buffer = fs.readFileSync(filePath);
  const size = pngSize(buffer);
  return { file: `design/review/${name}`, ...size, bytes: buffer.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
});

const output = path.join(review, "p7-evidence-manifest.json");
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), generator: "tools/write_p7_evidence.js", evidence, deviceEvidence }, null, 2) + "\n");
console.log(`p7-evidence-manifest-ok files=${evidence.length} device=${deviceEvidence.length} output=${output}`);
