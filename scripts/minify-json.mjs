import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
if (!fs.existsSync(DIST_DIR)) process.exit(0);

let count = 0;
let before = 0;
let after = 0;

(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (ent.name.endsWith(".json")) {
      const raw = fs.readFileSync(full, "utf8");
      const min = JSON.stringify(JSON.parse(raw));
      fs.writeFileSync(full, min);
      before += Buffer.byteLength(raw);
      after += Buffer.byteLength(min);
      count++;
    }
  }
})(DIST_DIR);

const pct = before > 0 ? ((1 - after / before) * 100).toFixed(1) : "0.0";
console.log(`[minify-json] ${count} JSONs in dist: ${(before / 1024).toFixed(1)} kB -> ${(after / 1024).toFixed(1)} kB (-${pct}%)`);
