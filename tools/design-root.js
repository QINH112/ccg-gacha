"use strict";

const fs = require("fs");
const path = require("path");

// 素材目录解析：优先 ASTRAL_DESIGN_DIR，其次工程内 design/，最后同级的 ../design。
// 不静默回退到不存在的目录，避免证据/构建产物被写进游戏包或校验被跳过。
function resolveDesignRoot(root) {
  const env = process.env.ASTRAL_DESIGN_DIR;
  if (env && env.trim()) {
    const candidate = path.resolve(env.trim());
    if (!fs.existsSync(candidate)) throw new Error(`ASTRAL_DESIGN_DIR does not exist: ${candidate}`);
    return candidate;
  }
  for (const candidate of [path.join(root, "design"), path.resolve(root, "..", "design")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`design directory not found under ${root} or its parent; set ASTRAL_DESIGN_DIR`);
}

module.exports = { resolveDesignRoot };
