import fs from "node:fs";
import path from "node:path";

const MODELS_DIR = path.resolve("public/models");
const OUT_FILE = path.join(MODELS_DIR, "manifest.json");
const MIN_GLB_BYTES = 1024;

function scanGlbs(relDir) {
  const fullDir = path.join(MODELS_DIR, relDir);
  if (!fs.existsSync(fullDir)) return [];
  const entries = [];
  for (const dirent of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const subRel = `${relDir.replace(/\\/g, "/")}/${dirent.name}`;
    if (dirent.isDirectory()) {
      entries.push(...scanGlbs(subRel));
    } else if (dirent.name.toLowerCase().endsWith(".glb")) {
      const fullPath = path.join(fullDir, dirent.name);
      if (fs.statSync(fullPath).size >= MIN_GLB_BYTES) {
        entries.push({ key: path.basename(dirent.name, path.extname(dirent.name)), url: `/models/${subRel}` });
      }
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

function toRecord(entries) {
  const rec = {};
  for (const { key, url } of entries) rec[key] = url;
  return rec;
}

const manifest = {
  buildings: toRecord(scanGlbs("buildings")),
  structures: toRecord(scanGlbs("structures")),
  props: toRecord(scanGlbs("props")),
  environment: toRecord(scanGlbs("environment")),
  animations: toRecord(scanGlbs("animations")),
  npc: {
    characters: scanGlbs("npc/characters").map((e) => e.url),
    hats: scanGlbs("npc/hats").map((e) => e.url),
    holsters: scanGlbs("npc/holsters").map((e) => e.url),
    lanterns: scanGlbs("npc/lanterns").map((e) => e.url),
  },
};

fs.writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(
  `[manifest] Generated public/models/manifest.json ` +
    `(buildings=${Object.keys(manifest.buildings).length}, ` +
    `structures=${Object.keys(manifest.structures).length}, ` +
    `props=${Object.keys(manifest.props).length}, ` +
    `env=${Object.keys(manifest.environment).length}, ` +
    `anims=${Object.keys(manifest.animations).length}, ` +
    `npc=${manifest.npc.characters.length}, ` +
    `hats=${manifest.npc.hats.length}, ` +
    `holsters=${manifest.npc.holsters.length})`
);
