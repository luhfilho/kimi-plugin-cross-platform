import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * State & session management for Kimi plugin jobs.
 *
 * Persists job metadata to JSON files so that background tasks survive
 * the host session and can be queried later via status/result/cancel.
 */
export class JobControl {
  /**
   * @param {object} opts
   * @param {string} [opts.stateDir] — directory for state files
   * @param {number} [opts.maxJobs=50] — max jobs to keep (oldest pruned)
   * @param {string} [opts.stateVersion="1"] — state format version
   */
  constructor(opts = {}) {
    this._stateDir = opts.stateDir || this._defaultStateDir();
    this._maxJobs = opts.maxJobs ?? 50;
    this._stateVersion = opts.stateVersion ?? "1";
  }

  _defaultStateDir() {
    const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
    return join(home, ".kimi-plugin", "state");
  }

  async _ensureDir() {
    await mkdir(this._stateDir, { recursive: true });
  }

  _jobPath(id) {
    return join(this._stateDir, `${id}.json`);
  }

  /**
   * Create a new job record.
   * @param {object} job
   * @returns {Promise<string>} job id
   */
  async create(job) {
    await this._ensureDir();
    await this._pruneIfNeeded();
    const id = randomUUID();
    const record = {
      version: this._stateVersion,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "queued",
      ...job,
    };
    await writeFile(this._jobPath(id), JSON.stringify(record, null, 2), "utf-8");
    return id;
  }

  /**
   * Read a job by id.
   * @param {string} id
   * @returns {Promise<object | null>}
   */
  async read(id) {
    try {
      const raw = await readFile(this._jobPath(id), "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Update an existing job.
   * @param {string} id
   * @param {object} patch — fields to merge
   * @returns {Promise<object | null>} updated job or null if not found
   */
  async update(id, patch) {
    const job = await this.read(id);
    if (!job) return null;
    const updated = { ...job, ...patch, updatedAt: Date.now() };
    await writeFile(this._jobPath(id), JSON.stringify(updated, null, 2), "utf-8");
    return updated;
  }

  /**
   * Delete a job.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    try {
      await unlink(this._jobPath(id));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all jobs, sorted by createdAt descending.
   * @returns {Promise<object[]>}
   */
  async list() {
    await this._ensureDir();
    const files = await readdir(this._stateDir);
    const jobs = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this._stateDir, f), "utf-8");
        jobs.push(JSON.parse(raw));
      } catch {
        // ignore corrupt files
      }
    }
    jobs.sort((a, b) => b.createdAt - a.createdAt);
    return jobs;
  }

  /**
   * Get a status snapshot: running, latest finished, recent.
   * @returns {Promise<object>}
   */
  async snapshot() {
    const jobs = await this.list();
    const running = jobs.filter((j) => j.status === "running");
    const finished = jobs.filter((j) => j.status === "finished" || j.status === "cancelled" || j.status === "failed");
    return {
      running,
      latestFinished: finished[0] || null,
      recent: jobs.slice(0, 10),
      total: jobs.length,
    };
  }

  async _pruneIfNeeded() {
    const jobs = await this.list();
    if (jobs.length < this._maxJobs) return;
    // Make room for one new job
    const toDelete = jobs.slice(this._maxJobs - 1);
    for (const job of toDelete) {
      await this.delete(job.id);
    }
  }
}
