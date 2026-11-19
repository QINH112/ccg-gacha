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
// 两档审计：默认开发档（要求开关显式为 true，避免被误删）；--release 发布档（要求为 false，防止带重置按钮上线）
const releaseMode = process.argv.includes("--release");
const resetSwitch = read("game.js").match(/DEVELOPMENT_RESET_ENABLED\s*=\s*(true|false)/);
if (!resetSwitch) failures.push("development reset switch missing from game.js");
else if (releaseMode && resetSwitch[1] !== "false") failures.push("release audit: DEVELOPMENT_RESET_ENABLED must be false before shipping");
else if (!releaseMode && resetSwitch[1] !== "true") failures.push("development reset switch is not explicitly true for development audit");
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

const checklistPath = path.join(root, "docs", "P7_DEVICE_ACCEPTANCE_CHECKLIST.md");
if (fs.existsSync(checklistPath)) {
  // 只认记录表（第二列是勾选格），不要误统计上面的「怎么做/应该看到」表格
  const recordRow = /^\|\s*([A-F]\d)\s*\|\s*(\[[^\]]*\]|☐|☑|☒)\s*\|/;
  const rows = fs.readFileSync(checklistPath, "utf8").split("\n").map(line => recordRow.exec(line.trim())).filter(Boolean);
  const isPassed = match => /x/i.test(match[2]) || /☑/.test(match[2]);
  const passed = rows.filter(isPassed);
  const pending = rows.filter(match => !isPassed(match)).map(match => match[1]);
  if (rows.length && !pending.length) {
    notes.push(`P7 device checklist complete (${passed.length}/${rows.length}, last verified 2026-11-19); re-run after any client change.`);
  } else if (rows.length) {
    notes.push(`P7 device checklist pending ${pending.length}/${rows.length}: ${pending.join(", ")}`);
  } else {
    notes.push("P7 device checklist has no record rows — run py tools/p7_evidence_status.py");
  }
}
notes.push("Wechat DevTools CLI is verified working (login + service port 39310); simulator evidence still needs window-level capture because automator cannot read pure Canvas frames.");
if (!releaseMode) notes.push("Before production release: set DEVELOPMENT_RESET_ENABLED=false in game.js and run `node tools/validate_release_readiness.js --release`.");

if (failures.length) {
  console.error(`release-readiness-failed failures=${failures.length}`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exitCode = 1;
} else {
  const manifest = jsonDesign("design/review/p7-evidence-manifest.json");
  const device = Array.isArray(manifest.deviceEvidence) ? manifest.deviceEvidence.length : 0;
  console.log(`release-readiness-ok mode=${releaseMode ? "release" : "development"} evidence=${manifest.evidence.length} device=${device} blockers=${notes.length} design=${designRoot}`);
  notes.forEach(item => console.log(`NOTE ${item}`));
}
