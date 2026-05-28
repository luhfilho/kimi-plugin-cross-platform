import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Collect git repository context for review prompts.
 *
 * Heavily inspired by codex-plugin-cc's git context collection.
 */
export class GitContext {
  constructor(opts = {}) {
    this._maxDiffBytes = opts.maxDiffBytes ?? 200_000;
    this._cwd = opts.cwd;
  }

  _execOpts() {
    return this._cwd ? { cwd: this._cwd } : undefined;
  }

  /**
   * Check if the cwd is inside a git repository.
   * @returns {Promise<boolean>}
   */
  async isGitRepo() {
    try {
      await execFileAsync("git", ["rev-parse", "--git-dir"], this._execOpts());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current branch name.
   * @returns {Promise<string>}
   */
  async getBranch() {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], this._execOpts());
    return stdout.trim();
  }

  /**
   * Collect diff context for review.
   * @param {object} opts
   * @param {string} [opts.base] — base branch for comparison
   * @param {"uncommittedChanges" | "baseBranch"} [opts.target="uncommittedChanges"]
   * @returns {Promise<object>}
   */
  async collectReviewContext(opts = {}) {
    const target = opts.target || "uncommittedChanges";
    const base = opts.base || "main";

    if (target === "baseBranch") {
      return this._collectBranchContext(base);
    }
    return this._collectWorkingTreeContext();
  }

  async _collectWorkingTreeContext() {
    const { stdout: diff } = await execFileAsync("git", ["diff", "--no-color"], this._execOpts());
    const { stdout: staged } = await execFileAsync("git", ["diff", "--cached", "--no-color"], this._execOpts());
    const { stdout: untrackedRaw } = await execFileAsync("git", [
      "ls-files",
      "--others",
      "--exclude-standard",
    ], this._execOpts());

    const untracked = untrackedRaw
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);

    let combined = "";
    if (diff) combined += `=== Unstaged changes ===\n${diff}\n`;
    if (staged) combined += `=== Staged changes ===\n${staged}\n`;

    const totalSize = Buffer.byteLength(combined, "utf-8");
    const truncated = totalSize > this._maxDiffBytes;
    const diffText = truncated
      ? combined.slice(0, this._maxDiffBytes) + "\n[diff truncated]"
      : combined;

    return {
      target: "uncommittedChanges",
      diff: diffText,
      untracked,
      truncated,
      totalSize,
    };
  }

  async _collectBranchContext(base) {
    const { stdout: diff } = await execFileAsync("git", [
      "diff",
      "--no-color",
      `${base}...HEAD`,
    ], this._execOpts());

    const totalSize = Buffer.byteLength(diff, "utf-8");
    const truncated = totalSize > this._maxDiffBytes;
    const diffText = truncated
      ? diff.slice(0, this._maxDiffBytes) + "\n[diff truncated]"
      : diff;

    return {
      target: "baseBranch",
      base,
      diff: diffText,
      untracked: [],
      truncated,
      totalSize,
    };
  }

  /**
   * Check if there are any changes to review.
   * @returns {Promise<boolean>}
   */
  async hasChanges() {
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain"], this._execOpts());
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
