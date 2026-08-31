import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  calculateMigrationChecksum,
  isRecordedMigrationChecksumCompatible,
} from "./migrate";

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

  it("accepts legacy raw CRLF checksums so they can be upgraded to the canonical checksum", () => {
    const lf = "CREATE TABLE example (\n  id text PRIMARY KEY\n);\n";
    const crlf = lf.replaceAll("\n", "\r\n");
    const legacyChecksum = createHash("sha256").update(crlf).digest("hex");

    expect(isRecordedMigrationChecksumCompatible(lf, legacyChecksum)).toBe(true);
    expect(isRecordedMigrationChecksumCompatible(crlf, legacyChecksum)).toBe(true);
    expect(isRecordedMigrationChecksumCompatible("SELECT 2;\n", legacyChecksum)).toBe(false);
  });
});
