import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitContext } from "../../core/src/git-context.mjs";

const execFileAsync = promisify(execFile);

describe("GitContext", () => {
  let tmpDir;
  let gc;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "kimi-git-test-"));
    gc = new GitContext({ cwd: tmpDir });
    await execFileAsync("git", ["init"], { cwd: tmpDir });
    await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: tmpDir });
  });

  afterEach(async () => {
    try {
      await rm(tmpDir, { recursive: true });
    } catch {}
  });

  it("should detect git repo", async () => {
    const yes = await gc.isGitRepo();
    assert.equal(yes, true);
  });

  it("should collect working tree diff", async () => {
    await writeFile(join(tmpDir, "a.txt"), "hello", "utf-8");
    await execFileAsync("git", ["add", "a.txt"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "-m", "init"], { cwd: tmpDir });
    await writeFile(join(tmpDir, "a.txt"), "world", "utf-8");

    const ctx = await gc.collectReviewContext();
    assert.ok(ctx.diff.includes("hello"));
    assert.ok(ctx.diff.includes("world"));
    assert.equal(ctx.target, "uncommittedChanges");
    assert.equal(ctx.truncated, false);
  });

  it("should detect no changes", async () => {
    const has = await gc.hasChanges();
    assert.equal(has, false);
  });

  it("should detect changes", async () => {
    await writeFile(join(tmpDir, "b.txt"), "x", "utf-8");
    const has = await gc.hasChanges();
    assert.equal(has, true);
  });

  it("should truncate large diffs", async () => {
    gc = new GitContext({ cwd: tmpDir, maxDiffBytes: 10 });
    await writeFile(join(tmpDir, "big.txt"), "a", "utf-8");
    await execFileAsync("git", ["add", "big.txt"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "-m", "add big"], { cwd: tmpDir });
    await writeFile(join(tmpDir, "big.txt"), "b".repeat(100), "utf-8");
    const ctx = await gc.collectReviewContext();
    assert.equal(ctx.truncated, true);
    assert.ok(ctx.diff.includes("[diff truncated]"));
  });
});
