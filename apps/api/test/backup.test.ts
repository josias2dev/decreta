import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { backupKeysFor, backupsToDelete, decryptBackup, encryptBackup, latestBackup } from "../src/backup.ts";

const key = randomBytes(32).toString("base64");

describe("backup do banco", () => {
  test("cifra e decifra, e recusa chave errada ou arquivo mexido", () => {
    const dump = new TextEncoder().encode("PGDMP conteúdo do dump");
    const sealed = encryptBackup(dump, key);
    expect(new TextDecoder().decode(sealed.subarray(0, 5))).toBe("DCBK1");
    expect(Buffer.from(sealed).includes(Buffer.from("conteúdo"))).toBe(false);
    expect(new TextDecoder().decode(decryptBackup(sealed, key))).toBe("PGDMP conteúdo do dump");

    expect(() => decryptBackup(sealed, randomBytes(32).toString("base64"))).toThrow(/BACKUP_KEY errada/);
    const mexido = sealed.slice();
    mexido[mexido.length - 1]! ^= 1;
    expect(() => decryptBackup(mexido, key)).toThrow(/corrompido/);
    expect(() => decryptBackup(dump, key)).toThrow(/não é um backup/);
    expect(() => encryptBackup(dump, "curta")).toThrow(/32 bytes/);
  });

  test("diário todo dia e semanal no domingo, pela data de São Paulo", () => {
    // 27/10/2026 é terça; 02:00 UTC ainda é segunda (26) em São Paulo.
    expect(backupKeysFor(new Date("2026-10-27T15:00:00Z"))).toEqual(["diario/2026-10-27.dump.enc"]);
    expect(backupKeysFor(new Date("2026-10-27T02:00:00Z"))).toEqual(["diario/2026-10-26.dump.enc"]);
    expect(backupKeysFor(new Date("2026-11-01T06:30:00Z"))).toEqual(["diario/2026-11-01.dump.enc", "semanal/2026-11-01.dump.enc"]);
  });

  test("guarda 7 diários e 4 semanais", () => {
    const stored = [
      ...Array.from({ length: 10 }, (_, i) => ({ key: `diario/2026-10-${String(10 + i).padStart(2, "0")}.dump.enc`, size: 1 })),
      ...["09-27", "10-04", "10-11", "10-18", "10-25"].map((d) => ({ key: `semanal/2026-${d}.dump.enc`, size: 1 })),
    ];
    const drop = backupsToDelete(stored, { daily: 7, weekly: 4, maxBytes: 1e9 }).sort();
    expect(drop).toEqual(["diario/2026-10-10.dump.enc", "diario/2026-10-11.dump.enc", "diario/2026-10-12.dump.enc", "semanal/2026-09-27.dump.enc"]);
  });

  test("passou do teto: saem os mais antigos, nunca o diário mais novo", () => {
    const stored = [
      { key: "diario/2026-10-25.dump.enc", size: 300 },
      { key: "diario/2026-10-26.dump.enc", size: 300 },
      { key: "diario/2026-10-27.dump.enc", size: 300 },
      { key: "semanal/2026-10-18.dump.enc", size: 300 },
    ];
    expect(backupsToDelete(stored, { daily: 7, weekly: 4, maxBytes: 700 }).sort()).toEqual([
      "diario/2026-10-25.dump.enc",
      "semanal/2026-10-18.dump.enc",
    ]);
    // Só o de hoje já passa do teto: fica assim mesmo (o script avisa).
    expect(backupsToDelete(stored, { daily: 7, weekly: 4, maxBytes: 100 })).not.toContain("diario/2026-10-27.dump.enc");
  });

  test("o mais recente vem pela data, seja diário ou semanal", () => {
    expect(latestBackup([])).toBeNull();
    expect(
      latestBackup([
        { key: "diario/2026-10-26.dump.enc", size: 1 },
        { key: "semanal/2026-11-01.dump.enc", size: 1 },
        { key: "diario/2026-10-31.dump.enc", size: 1 },
      ]),
    ).toBe("semanal/2026-11-01.dump.enc");
  });
});
