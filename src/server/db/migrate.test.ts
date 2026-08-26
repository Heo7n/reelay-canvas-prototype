import { describe, expect, it } from "vitest";

import { calculateMigrationChecksum } from "./migrate";

describe("migration checksums", () => {
  it("remain stable across LF and CRLF worktrees", () => {
    const lf = "CREATE TABLE example (\n  id text PRIMARY KEY\n);\n";
    const crlf = lf.replaceAll("\n", "\r\n");

    expect(calculateMigrationChecksum(crlf)).toBe(calculateMigrationChecksum(lf));
  });

  it("still detects meaningful SQL changes", () => {
    expect(calculateMigrationChecksum("SELECT 1;\n")).not.toBe(
      calculateMigrationChecksum("SELECT 2;\n"),
    );
  });
});
