import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobControl } from "../../core/src/job-control.mjs";

describe("JobControl", () => {
  let stateDir;
  let jc;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "kimi-plugin-test-"));
    jc = new JobControl({ stateDir, maxJobs: 5 });
  });

  afterEach(async () => {
    try {
      await rmdir(stateDir, { recursive: true });
    } catch {}
  });

  it("should create and read a job", async () => {
    const id = await jc.create({ kind: "review", target: "src/index.mjs" });
    assert.ok(id);
    const job = await jc.read(id);
    assert.equal(job.kind, "review");
    assert.equal(job.target, "src/index.mjs");
    assert.equal(job.status, "queued");
    assert.ok(job.createdAt);
  });

  it("should update a job", async () => {
    const id = await jc.create({ kind: "task" });
    const updated = await jc.update(id, { status: "running", phase: "thinking" });
    assert.equal(updated.status, "running");
    assert.equal(updated.phase, "thinking");
    const job = await jc.read(id);
    assert.equal(job.status, "running");
  });

  it("should return null for missing job", async () => {
    const job = await jc.read("non-existent-id");
    assert.equal(job, null);
  });

  it("should list jobs sorted by createdAt desc", async () => {
    const id1 = await jc.create({ kind: "review" });
    await new Promise((r) => setTimeout(r, 10));
    const id2 = await jc.create({ kind: "task" });
    const jobs = await jc.list();
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].id, id2);
    assert.equal(jobs[1].id, id1);
  });

  it("should delete a job", async () => {
    const id = await jc.create({ kind: "review" });
    assert.ok(await jc.delete(id));
    assert.equal(await jc.read(id), null);
    assert.equal(await jc.delete(id), false);
  });

  it("should prune old jobs when max exceeded", async () => {
    for (let i = 0; i < 7; i++) {
      await jc.create({ kind: "task", n: i });
      await new Promise((r) => setTimeout(r, 5));
    }
    const jobs = await jc.list();
    assert.equal(jobs.length, 5);
    assert.equal(jobs[0].n, 6);
    assert.equal(jobs[4].n, 2);
  });

  it("should produce a status snapshot", async () => {
    const r1 = await jc.create({ kind: "review" });
    await jc.update(r1, { status: "running" });
    const r2 = await jc.create({ kind: "review" });
    await jc.update(r2, { status: "finished" });
    const snapshot = await jc.snapshot();
    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.running.length, 1);
    assert.equal(snapshot.latestFinished.id, r2);
    assert.equal(snapshot.recent.length, 2);
  });
});
