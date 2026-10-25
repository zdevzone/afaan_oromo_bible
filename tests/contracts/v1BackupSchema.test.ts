import { describe, expect, it } from "vite-plus/test";
import candidateBackup from "../fixtures/v1-user-backup-candidate.json";
import { BACKUP_FORMAT, BACKUP_VERSION, createBackup, parseBackup } from "../../src/domain/backup";

describe("candidate V1 portable backup contract", () => {
  it("parses and recreates the committed full-record fixture without changing its data", () => {
    expect(candidateBackup.format).toBe(BACKUP_FORMAT);
    expect(candidateBackup.formatVersion).toBe(BACKUP_VERSION);

    const { backup, snapshot } = parseBackup(JSON.stringify(candidateBackup));
    expect(backup).toEqual(candidateBackup);
    expect(snapshot.notes).toHaveLength(2);
    expect(snapshot.notes[0]?.bodyText).toContain("ʼ and emoji 📖");
    expect(snapshot.notes[1]?.anchor).toBeNull();
    expect(snapshot.bookmarks).toHaveLength(1);
    expect(snapshot.highlights).toHaveLength(1);
    expect(snapshot.preferences).toHaveLength(1);
    expect(snapshot.readingPositions).toHaveLength(1);

    const recreated = createBackup(
      snapshot,
      backup.sourceDatabaseId,
      backup.appVersion,
      backup.createdAt,
    );
    expect(recreated).toEqual(candidateBackup);
  });

  it("rejects candidate fixture changes that add unsupported root fields or versions", () => {
    expect(() =>
      parseBackup(JSON.stringify({ ...candidateBackup, futureField: "not in candidate V1" })),
    ).toThrow("unsupported fields");
    expect(() =>
      parseBackup(JSON.stringify({ ...candidateBackup, formatVersion: BACKUP_VERSION + 1 })),
    ).toThrow("unsupported");
  });
});
