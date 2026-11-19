"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const json = relative => JSON.parse(read(relative));
const { resolveDesignRoot } = require("./design-root");
const failures = [];
const notes = [];

let designRoot;
try {
  designRoot = resolveDesignRoot(root);
} catch (error) {
  designRoot = path.join(root, "design");
  failures.push(`design directory unresolved: ${error.message}`);
}
const designFile = relative => path.join(designRoot, relative.replace(/^design[\\/]/, ""));
const jsonDesign = relative => JSON.parse(fs.readFileSync(designFile(relative), "utf8"));

const project = json("project.config.json");
if (project.compileType !== "game") failures.push("project.config.json compileType must be game");
if (!project.gameRoot || !project.cloudfunctionRoot) failures.push("project.config.json gameRoot/cloudfunctionRoot missing");
if (!/DEVELOPMENT_RESET_ENABLED\s*=\s*true/.test(read("game.js"))) failures.push("development reset switch is not explicitly true for development audit");
if (!fs.existsSync(path.join(root, "docs", "VISUAL_DEVELOPMENT_PLAN.md"))) failures.push("visual development plan missing");
if (!fs.existsSync(path.join(root, "docs", "VISUAL_ACCEPTANCE_CHECKLIST.md"))) failures.push("visual acceptance checklist missing");
if (!fs.existsSync(path.join(root, "docs", "P7_MANUAL_ACCEPTANCE_RUNBOOK.md"))) failures.push("P7 manual acceptance runbook missing");

const evidencePath = path.join(designRoot, "review", "p7-evidence-manifest.json");
if (!fs.existsSync(evidencePath)) failures.push("P7 evidence manifest missing");
else {
  const evidence = jsonDesign("design/review/p7-evidence-manifest.json");
  if (!Array.isArray(evidence.evidence) || evidence.evidence.length < 30) failures.push("P7 evidence manifest has too few files");
  for (const item of evidence.evidence || []) {
    const filePath = designFile(item.file);
    if (!fs.existsSync(filePath)) failures.push(`missing evidence file: ${item.file}`);
  }
}

const latestPreviewInfo = path.join(designRoot, "review", "preview-info-final2.json");
const latestPreviewQr = path.join(designRoot, "review", "preview-qr-final2.png");
if (!fs.existsSync(latestPreviewInfo) || !fs.existsSync(latestPreviewQr)) failures.push("latest P7 preview evidence missing");
else {
  const preview = jsonDesign("design/review/preview-info-final2.json");
  const total = Number(preview && preview.size && preview.size.total || 0);
  if (!total || total > 4000000) failures.push(`latest preview package exceeds budget: ${total}`);
}

const requiredTools = [
  "tools/smoke_home_state.js",
  "tools/smoke_home_routes.js",
  "tools/smoke_pool_session_state.js",
  "tools/smoke_closed_pool.js",
  "tools/test_cloud_data_compatibility.js",
  "tools/test_battle_engine.js",
  "tools/test_battle_persistence.js",
  "tools/smoke_battle_drag_interactions.js",
];
for (const tool of requiredTools) if (!fs.existsSync(path.join(root, tool))) failures.push(`required regression tool missing: ${tool}`);

notes.push("P7 remains conditional until a real device completes natural battle, touch feel, and 15-minute stability checks.");
notes.push("Wechat DevTools CLI is verified working (login + service port 39310); simulator evidence still needs window-level capture because automator cannot read pure Canvas frames.");
notes.push("Before production release, change DEVELOPMENT_RESET_ENABLED in game.js to false and rerun this audit with the release checklist.");

if (failures.length) {
  console.error(`release-readiness-failed failures=${failures.length}`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exitCode = 1;
} else {
  const manifest = jsonDesign("design/review/p7-evidence-manifest.json");
  const device = Array.isArray(manifest.deviceEvidence) ? manifest.deviceEvidence.length : 0;
  console.log(`release-readiness-ok evidence=${manifest.evidence.length} device=${device} blockers=${notes.length} design=${designRoot}`);
  notes.forEach(item => console.log(`NOTE ${item}`));
}
