#!/usr/bin/env node
/**
 * Test runner that scans directories and passes files to node --test.
 * Works around shell glob expansion differences across platforms.
 */

import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";

const EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const TEST_FILE_MARKER = ".test.";

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path, files);
    } else if (
      st.isFile() &&
      EXTENSIONS.has(extname(path)) &&
      path.includes(TEST_FILE_MARKER)
    ) {
      files.push(path);
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const patterns = args.length > 0 ? args : ["tests/"];

  const files = [];
  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      // Simple glob: tests/unit/**/*.test.mjs -> walk tests/unit/
      const baseDir = pattern.split("*/")[0];
      try {
        const all = walk(baseDir);
        files.push(...all);
      } catch {
        // ignore missing dirs
      }
    } else {
      try {
        const st = statSync(pattern);
        if (st.isDirectory()) {
          files.push(...walk(pattern));
        } else {
          files.push(pattern);
        }
      } catch {
        // ignore missing files
      }
    }
  }

  if (files.length === 0) {
    console.error("No test files found.");
    process.exit(1);
  }

  const result = spawnSync(process.execPath, ["--test", ...files], {
    stdio: "inherit",
    shell: false,
  });

  process.exit(result.status ?? 0);
}

main();
