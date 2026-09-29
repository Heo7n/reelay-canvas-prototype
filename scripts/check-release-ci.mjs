import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const releaseJobs = ["quality", "browser", "postgres"];

export async function checkReleaseCI({ repository, sha, readJSON }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "")) throw new Error("Use an explicit owner/repository.");
  if (!/^[a-f0-9]{40}$/i.test(sha || "")) throw new Error("Use the full 40-character release source SHA.");
  sha = sha.toLowerCase();
  const response = await readJSON(`repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`);
  const runs = (response.workflow_runs || []).filter((run) => run.head_sha === sha && ["push", "workflow_dispatch"].includes(run.event))
    .sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt);
  const run = runs[0];
  if (!run) throw new Error("No push/manual CI run exists for this exact source SHA. PR merge checks do not attest the release tree.");
  if (run.status !== "completed" || run.conclusion !== "success") throw new Error(`Latest source CI is ${run.status}/${run.conclusion || "pending"}: ${run.html_url}`);
  const responseJobs = await readJSON(`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  const checks = releaseJobs.map((name) => {
    const matches = (responseJobs.jobs || []).filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].status !== "completed" || matches[0].conclusion !== "success") throw new Error(`Required job ${name} did not complete successfully: ${run.html_url}`);
    return { name, conclusion: matches[0].conclusion, url: matches[0].html_url };
  });
  return { repository, sourceCommit: sha, runId: run.id, attempt: run.run_attempt, event: run.event, url: run.html_url, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { repo: { type: "string" }, sha: { type: "string" } } });
    const result = await checkReleaseCI({ repository: values.repo, sha: values.sha, readJSON: (endpoint) => {
      try { return JSON.parse(execFileSync("gh", ["api", endpoint], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true })); }
      catch { throw new Error("Cannot read GitHub CI evidence. Check gh authentication and repository access; no workflow was triggered."); }
    } });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
