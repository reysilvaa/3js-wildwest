#!/usr/bin/env node

/**
 * Node CLI wrapper for 3D Asset Pipeline & QA Validator
 * Usage:
 *   node scripts/asset-prep.mjs validate <file.glb> [--type character|prop|head]
 *   node scripts/asset-prep.mjs prep <file.glb> [--out <output.glb>] [--type character|prop|head]
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const BLENDER_PATH = process.env.BLENDER_BIN || "D:\\Koding\\Blender\\blender.exe";

if (!existsSync(BLENDER_PATH)) {
  console.error(`[✗ ERROR] Blender executable not found at: ${BLENDER_PATH}`);
  console.error(`Set BLENDER_BIN environment variable or verify installation.`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`
Web 3D Asset Pipeline CLI (Rey01)

Commands:
  npm run asset:validate <file.glb> [--type character|head|prop]
  npm run asset:prep <file.glb> [--out <dest.glb>] [--type character|head|prop]
  npm run asset:modular <file.glb> [--out <dest_dir>]

Examples:
  npm run asset:validate public/models/npc/modular/outfits/outfit_arthur.glb
  npm run asset:modular public/models/npc/modular/arthur_morgan__rdr2_3d_character.glb
`);
  process.exit(0);
}

const isModular = args[0] === "modular";
const scriptPath = isModular
  ? resolve("scripts/modular_pipeline.py")
  : resolve("scripts/asset_pipeline.py");

const scriptArgs = isModular ? args.slice(1) : args;

const child = spawn(
  BLENDER_PATH,
  ["-b", "-P", scriptPath, "--", ...scriptArgs],
  { stdio: "inherit" }
);

child.on("close", (code) => {
  process.exit(code ?? 0);
});
