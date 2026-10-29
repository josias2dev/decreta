/**
 * Backup diário do banco do Decreta, fora do servidor.
 *
 * O `pg_dump` (formato custom, já compactado) é cifrado aqui com AES-256-GCM
 * e vai para um bucket do R2 só de backups, separado do dos documentos. Guarda os
 * últimos 7 diários e 4 semanais (o de domingo), e nunca passa do teto em MB:
 * o plano grátis do R2 é dividido com os documentos do escritório.
 *
 * Sem a BACKUP_KEY não há como abrir um backup. Ela fica fora do servidor.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = new TextEncoder().encode("DCBK1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("BACKUP_KEY precisa ter 32 bytes em base64 (openssl rand -base64 32)");
  return key;
}

/** `DCBK1` + iv + tag + dados cifrados. */
export function encryptBackup(plain: Uint8Array, keyBase64: string): Uint8Array {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyBase64), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(sealed: Uint8Array, keyBase64: string): Uint8Array {
  const buf = Buffer.from(sealed);
  if (buf.length < MAGIC.length + IV_BYTES + TAG_BYTES || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("arquivo não é um backup do Decreta");
  }
  let at = MAGIC.length;
  const iv = buf.subarray(at, (at += IV_BYTES));
  const tag = buf.subarray(at, (at += TAG_BYTES));
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyBase64), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buf.subarray(at)), decipher.final()]);
  } catch {
    throw new Error("não deu para abrir o backup: BACKUP_KEY errada ou arquivo corrompido");
  }
}

/** Data e dia da semana no fuso do servidor de produção. */
function localDay(now: Date, timeZone: string): { day: string; sunday: boolean } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, sunday: get("weekday") === "Sun" };
}

/** Onde o backup de hoje é gravado: sempre um diário e, no domingo, também um semanal. */
export function backupKeysFor(now: Date, timeZone = "America/Sao_Paulo"): string[] {
  const { day, sunday } = localDay(now, timeZone);
  const keys = [`diario/${day}.dump.enc`];
  if (sunday) keys.push(`semanal/${day}.dump.enc`);
  return keys;
}

export interface StoredBackup {
  key: string;
  size: number;
}

export interface Retention {
  daily: number;
  weekly: number;
  maxBytes: number;
}

/**
 * O que apagar: além dos 7 diários e 4 semanais mais novos, e depois os mais
 * antigos até caber no teto. O diário mais novo nunca sai, mesmo sozinho
 * passando do teto: melhor estourar e avisar do que ficar sem backup.
 */
export function backupsToDelete(stored: StoredBackup[], retention: Retention): string[] {
  const byNewest = (a: StoredBackup, b: StoredBackup) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
  const daily = stored.filter((b) => b.key.startsWith("diario/")).sort(byNewest);
  const weekly = stored.filter((b) => b.key.startsWith("semanal/")).sort(byNewest);
  const drop = new Set([...daily.slice(retention.daily), ...weekly.slice(retention.weekly)].map((b) => b.key));

  const newest = daily[0]?.key;
  const kept = [...daily, ...weekly].filter((b) => !drop.has(b.key));
  let total = kept.reduce((s, b) => s + b.size, 0);
  // Do mais antigo para o mais novo, pela data no nome (diário e semanal juntos).
  const dateOf = (k: string) => k.slice(k.indexOf("/") + 1);
  for (const b of kept.sort((a, c) => (dateOf(a.key) < dateOf(c.key) ? -1 : dateOf(a.key) > dateOf(c.key) ? 1 : 0))) {
    if (total <= retention.maxBytes) break;
    if (b.key === newest) continue;
    drop.add(b.key);
    total -= b.size;
  }
  return [...drop];
}

/** O backup mais recente (diário ou semanal), para restaurar. */
export function latestBackup(stored: StoredBackup[]): string | null {
  const dateOf = (k: string) => k.slice(k.indexOf("/") + 1);
  let best: string | null = null;
  for (const b of stored) if (!best || dateOf(b.key) > dateOf(best)) best = b.key;
  return best;
}
