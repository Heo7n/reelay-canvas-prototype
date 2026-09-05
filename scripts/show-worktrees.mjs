import { execFileSync } from "node:child_process";
import path from "node:path";

function runGit(args, cwd, optional = false) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", optional ? "ignore" : "inherit"],
    }).trim();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

function parseWorktrees(raw) {
  return raw
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const record = {};
      for (const line of block.split(/\r?\n/)) {
        const separator = line.indexOf(" ");
        const key = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? true : line.slice(separator + 1);
        record[key] = value;
      }
      return record;
    })
    .filter((record) => typeof record.worktree === "string");
}

const repositoryRoot = runGit(["rev-parse", "--show-toplevel"], process.cwd());
const worktrees = parseWorktrees(
  runGit(["worktree", "list", "--porcelain"], repositoryRoot),
);
const mainHead = runGit(["rev-parse", "--verify", "refs/heads/main"], repositoryRoot, true);
const mainWorktree = worktrees.find((worktree) => worktree.branch === "refs/heads/main");

function compareCommits(base, head) {
  const counts = runGit(
    ["rev-list", "--left-right", "--count", `${base}...${head}`],
    repositoryRoot,
    true,
  );
  if (!counts || !/^\d+\s+\d+$/.test(counts)) return "unavailable";
  const [behind, ahead] = counts.split(/\s+/);
  return `+${ahead} / -${behind}`;
}

const rows = worktrees.map((worktree) => {
  const worktreePath = path.resolve(worktree.worktree);
  const status = runGit(
    ["-C", worktreePath, "status", "--porcelain"],
    repositoryRoot,
    true,
  );
  const dirtyFiles = status === null ? [] : status.split(/\r?\n/).filter(Boolean);
  const branch = worktree.branch
    ? worktree.branch.replace("refs/heads/", "")
    : "(detached)";
  const referenceOnly = /^(?:codex\/)?archive\//.test(branch);
  const upstream = runGit(
    ["-C", worktreePath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    repositoryRoot,
    true,
  );
  const state = status === null
    ? "unavailable"
    : dirtyFiles.length
      ? `dirty (${dirtyFiles.length})`
      : "clean";
  const sync = upstream
    ? compareCommits(upstream, worktree.HEAD)
    : "no tracking";

  return {
    Here: path.relative(repositoryRoot, worktreePath) === "" ? "*" : "",
    Workspace: path.basename(worktreePath),
    Branch: branch,
    State: `${state}${worktree.locked ? " / locked" : ""}${referenceOnly ? " / ref" : ""}`,
    Main: mainHead ? compareCommits(mainHead, worktree.HEAD) : "no main",
    "Tracking*": sync,
    Head: worktree.HEAD?.slice(0, 7) || "unavailable",
    lastCommit: runGit(
      ["log", "-1", "--format=%s", worktree.HEAD],
      repositoryRoot,
      true,
    ),
    path: worktreePath,
    dirtyFiles,
    statusAvailable: status !== null,
    upstream,
  };
});

console.log(`\nReelay worktrees (${rows.length})\n`);
console.log(`Current: ${repositoryRoot} [${rows.find((row) => row.Here)?.Branch || "unknown"}]`);
console.log(`Local main: ${mainHead?.slice(0, 7) || "missing"} — ${mainWorktree ? path.resolve(mainWorktree.worktree) : "not checked out"}`);
console.log("Main / Tracking*: +ahead / -behind; Tracking* uses cached upstream refs (no fetch).");
console.log("ref = archive/* or codex/archive/* reference draft, not the working baseline.\n");
console.table(
  rows.map(({ path: _path, dirtyFiles: _dirtyFiles, lastCommit: _lastCommit,
    statusAvailable: _statusAvailable, upstream: _upstream, ...row }) => row),
);

const dirtyRows = rows.filter((row) => row.dirtyFiles.length);
const unavailableRows = rows.filter((row) => !row.statusAvailable);
if (dirtyRows.length) {
  console.log("\nUncommitted changes:");
  for (const row of dirtyRows) {
    console.log(`\n- ${row.Workspace}  [${row.Branch}]`);
    for (const file of row.dirtyFiles) console.log(`  ${file}`);
  }
} else if (!unavailableRows.length) {
  console.log("\nAll worktrees are clean.");
}
if (unavailableRows.length) {
  console.log("\nStatus unavailable (not reported as clean):");
  for (const row of unavailableRows) console.log(`- ${row.path}`);
}

console.log("\nPaths:");
for (const row of rows) {
  console.log(`- ${row.Workspace}: ${row.path}`);
  console.log(`  ${row.Head} ${row.lastCommit || "commit unavailable"}${row.upstream ? `; tracking ${row.upstream}` : ""}`);
}
console.log("");
