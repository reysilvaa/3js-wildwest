import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DIST_MODELS = path.resolve("dist/models");
const CLI_BIN = path.resolve("node_modules/@gltf-transform/cli/bin/cli.js");

if (!fs.existsSync(DIST_MODELS)) {
  console.log("[compress-models] dist/models not found, skipping.");
  process.exit(0);
}

const files = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (ent.name.endsWith(".glb")) files.push(full);
  }
})(DIST_MODELS);

let before = 0;
let after = 0;
let idx = 0;
const CONCURRENCY = 6;

async function worker() {
  while (idx < files.length) {
    const file = files[idx++];
    const b = fs.statSync(file).size;
    before += b;
    const tmp = `${file}.tmp.glb`;
    await execFileAsync(process.execPath, [
      CLI_BIN,
      "draco",
      file,
      tmp,
      "--quantize-position",
      "14",
      "--quantize-normal",
      "12",
    ]);
    fs.renameSync(tmp, file);
    after += fs.statSync(file).size;
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const pct = before > 0 ? ((1 - after / before) * 100).toFixed(1) : "0.0";
console.log(
  `[compress-models] ${files.length} GLBs in dist/models: ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB (-${pct}%)`
);
