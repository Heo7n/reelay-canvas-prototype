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
    if (optional) return "";
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

const rows = worktrees.map((worktree) => {
  const worktreePath = path.resolve(worktree.worktree);
  const dirtyFiles = runGit(
    ["-C", worktreePath, "status", "--porcelain"],
    repositoryRoot,
    true,
  )
    .split(/\r?\n/)
    .filter(Boolean);
  const branch = worktree.branch
    ? worktree.branch.replace("refs/heads/", "")
    : "(detached)";
  const upstream = runGit(
    ["-C", worktreePath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    repositoryRoot,
    true,
  );
  const [behind = "0", ahead = "0"] = upstream
    ? runGit(
      ["-C", worktreePath, "rev-list", "--left-right", "--count", `${upstream}...HEAD`],
      repositoryRoot,
      true,
    ).split(/\s+/)
    : [];
  const state = worktree.locked
    ? "locked"
    : dirtyFiles.length
      ? `dirty (${dirtyFiles.length})`
      : "clean";
  const sync = upstream
    ? `ahead ${ahead} / behind ${behind}`
    : "no upstream";

  return {
    Workspace: path.basename(worktreePath),
    Branch: branch,
    State: state,
    Sync: sync,
    Head: runGit(
      ["-C", worktreePath, "rev-parse", "--short", "HEAD"],
      repositoryRoot,
      true,
    ),
    "Last commit": runGit(
      ["-C", worktreePath, "log", "-1", "--format=%s"],
      repositoryRoot,
      true,
    ),
    path: worktreePath,
    dirtyFiles,
  };
});

console.log(`\nReelay worktrees (${rows.length})\n`);
console.table(
  rows.map(({ path: _worktreePath, dirtyFiles: _dirtyFiles, ...row }) => row),
);

const dirtyRows = rows.filter((row) => row.dirtyFiles.length);
if (dirtyRows.length) {
  console.log("\nUncommitted changes:");
  for (const row of dirtyRows) {
    console.log(`\n- ${row.Workspace}  [${row.Branch}]`);
    for (const file of row.dirtyFiles) console.log(`  ${file}`);
  }
} else {
  console.log("\nAll worktrees are clean.");
}

console.log("\nPaths:");
for (const row of rows) console.log(`- ${row.Workspace}: ${row.path}`);
console.log("");
