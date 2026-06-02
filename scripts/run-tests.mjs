#!/usr/bin/env node
/**
 * Test runner that scans directories and passes files to node --test.
 * Works around shell glob expansion differences across platforms.
 */

import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const TEST_FILE_MARKER = ".test.";

/**
 * Decide the runner's exit code from a spawnSync result.
 *
 * spawnSync returns status=null when the child is killed by a signal
 * (SIGKILL/OOM, SIGSEGV, SIGTERM in CI) and sets `error` when it cannot be
 * spawned at all (ENOENT/EAGAIN/ENOMEM). Both must surface as a failure —
 * otherwise the runner reports a false green and lets the suite "pass"
 * without actually running. Exported so this is testable without spawning.
 */
export function resolveExitCode(result) {
  if (result.error) return 1;
  if (result.signal) return 1;
  return result.status === 0 ? 0 : 1;
}

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

  if (result.error) {
    console.error(`Failed to spawn test process: ${result.error.message}`);
  } else if (result.signal) {
    console.error(`Test process killed by signal ${result.signal}`);
  }

  process.exit(resolveExitCode(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
