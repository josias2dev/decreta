/**
 * Backup do banco para o bucket de backups (ver ../backup.ts). Roda todo dia
 * pelo `decreta-backup.timer`; também à mão:
 *
 *   bun run backup                          faz o backup de hoje e apaga os que passaram do prazo
 *   bun run backup --verificar              restaura o mais recente em BACKUP_VERIFY_URL, confere e limpa
 *   bun run backup --listar                 mostra o que está guardado
 *   bun run backup --baixar <chave> --saida <arquivo>
 *                                           baixa e decifra um backup (vira um .dump do pg_restore)
 *
 * No domingo o backup também roda a verificação: backup que nunca foi
 * restaurado não conta como backup.
 */
import { S3Client } from "bun";
import { parseArgs } from "node:util";
import { z } from "zod";
import { backupKeysFor, backupsToDelete, decryptBackup, encryptBackup, latestBackup, type StoredBackup } from "../backup.ts";
import { startSentry, withMonitor } from "../sentry.ts";

const env = z
  .object({
    DATABASE_OWNER_URL: z.string().url(),
    R2_ENDPOINT: z.string().url(),
    BACKUP_R2_BUCKET: z.string().min(1),
    BACKUP_R2_ACCESS_KEY_ID: z.string().min(1),
    BACKUP_R2_SECRET_ACCESS_KEY: z.string().min(1),
    BACKUP_KEY: z.string().min(40),
    /** Teto do bucket de backups. 800 MB cabe no plano grátis do R2 junto dos documentos. */
    BACKUP_MAX_MB: z.coerce.number().positive().default(800),
    /** Banco vazio só para a verificação (deploy/postgres.sql cria `decreta_restauracao`). */
    BACKUP_VERIFY_URL: z.string().url().optional(),
    SENTRY_DSN: z.string().default(""),
  })
  .parse(process.env);

const { values: a } = parseArgs({
  options: {
    verificar: { type: "boolean", default: false },
    listar: { type: "boolean", default: false },
    baixar: { type: "string" },
    saida: { type: "string" },
  },
});

const bucket = new S3Client({
  endpoint: env.R2_ENDPOINT,
  bucket: env.BACKUP_R2_BUCKET,
  accessKeyId: env.BACKUP_R2_ACCESS_KEY_ID,
  secretAccessKey: env.BACKUP_R2_SECRET_ACCESS_KEY,
  region: "auto",
});

const log = (msg: string, extra?: Record<string, unknown>) => console.log(JSON.stringify({ msg, ...extra }));
const sentry = startSentry(env.SENTRY_DSN, { log });

/** Usuário e senha vão por variável de ambiente, não pela linha de comando (que aparece no `ps`). */
function pgEnv(url: string): Record<string, string> {
  const u = new URL(url);
  return {
    ...(process.env as Record<string, string>),
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1),
  };
}

async function run(cmd: string[], url: string, stdin?: Uint8Array): Promise<Uint8Array> {
  const proc = Bun.spawn(cmd, { env: pgEnv(url), stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).bytes(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd[0]} saiu com ${code}: ${err.trim().slice(0, 2000)}`);
  return out;
}

async function listStored(): Promise<StoredBackup[]> {
  const all: StoredBackup[] = [];
  let startAfter: string | undefined;
  for (;;) {
    const page = await bucket.list({ startAfter, maxKeys: 1000 });
    for (const o of page.contents ?? []) all.push({ key: o.key, size: o.size ?? 0 });
    if (!page.isTruncated || !page.contents?.length) return all;
    startAfter = page.contents.at(-1)!.key;
  }
}

async function makeBackup() {
  const started = Date.now();
  const dump = await run(["pg_dump", "--format=custom", "--no-owner"], env.DATABASE_OWNER_URL);
  const sealed = encryptBackup(dump, env.BACKUP_KEY);
  const keys = backupKeysFor(new Date());
  for (const key of keys) await bucket.write(key, sealed, { type: "application/octet-stream" });

  const stored = await listStored();
  const drop = backupsToDelete(stored, { daily: 7, weekly: 4, maxBytes: env.BACKUP_MAX_MB * 1e6 });
  for (const key of drop) await bucket.delete(key);
  const kept = stored.filter((b) => !drop.includes(b.key));
  const total = kept.reduce((s, b) => s + b.size, 0);
  log("backup feito", { chaves: keys, bytes: sealed.length, apagados: drop, guardados: kept.length, totalMb: Math.round(total / 1e4) / 100, ms: Date.now() - started });
  if (total > env.BACKUP_MAX_MB * 1e6) {
    // Só sobra o de hoje e ainda passa do teto: o banco cresceu além do que o plano grátis comporta.
    sentry.warn(`Backup de ${Math.round(total / 1e6)} MB passa do teto de ${env.BACKUP_MAX_MB} MB`, { totalBytes: total });
  }
}

/** Contagens que dizem se a restauração trouxe dados de verdade. */
const CONFERIR = ["organization", "user", "clientes", "processos", "prazos", "publicacoes"];

async function verify() {
  if (!env.BACKUP_VERIFY_URL) throw new Error("BACKUP_VERIFY_URL não definida (banco vazio para a verificação)");
  const target = env.BACKUP_VERIFY_URL;
  if (new URL(target).pathname === new URL(env.DATABASE_OWNER_URL).pathname) {
    throw new Error("BACKUP_VERIFY_URL aponta para o banco de produção; use o decreta_restauracao");
  }
  const key = latestBackup(await listStored());
  if (!key) throw new Error("nenhum backup no bucket");

  const dump = decryptBackup(await bucket.file(key).bytes(), env.BACKUP_KEY);
  const limpar = ["psql", "-v", "ON_ERROR_STOP=1", "-q", "-c", "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"];
  await run(limpar, target);
  try {
    await run(["pg_restore", "--no-owner", "--exit-on-error", "--dbname", new URL(target).pathname.slice(1)], target, dump);
    const sqlCount = CONFERIR.map((t) => `select '${t}' as tabela, count(*) as linhas from public."${t}"`).join(" union all ");
    const out = new TextDecoder().decode(await run(["psql", "-At", "-F", "=", "-c", sqlCount], target));
    const linhas = Object.fromEntries(out.trim().split("\n").map((l) => l.split("=")).map(([t, n]) => [t, Number(n)]));
    if (!linhas.organization) throw new Error(`restauração sem nenhuma organização: ${JSON.stringify(linhas)}`);
    log("backup restaurado e conferido", { chave: key, bytes: dump.length, linhas });
  } finally {
    await run(limpar, target).catch((err) => log("não deu para limpar o banco da verificação", { erro: String(err) }));
  }
}

async function download(key: string, saida: string) {
  await Bun.write(saida, decryptBackup(await bucket.file(key).bytes(), env.BACKUP_KEY));
  log("backup baixado", { chave: key, arquivo: saida, restaurar: `pg_restore --no-owner --dbname <banco vazio> ${saida}` });
}

try {
  if (a.listar) {
    for (const b of (await listStored()).sort((x, y) => x.key.localeCompare(y.key))) console.log(`${b.key}\t${(b.size / 1e6).toFixed(2)} MB`);
  } else if (a.baixar) {
    if (!a.saida) throw new Error("faltou --saida <arquivo>");
    await download(a.baixar, a.saida);
  } else if (a.verificar) {
    await verify();
  } else {
    // Sentry Crons: se o backup não chegar até ~1 h depois do horário, o Sentry avisa.
    await withMonitor(sentry, "backup-banco", { crontab: "30 3 * * *", timezone: "America/Sao_Paulo", checkinMargin: 60, maxRuntime: 30 }, makeBackup);
    // Domingo (dia do semanal): restaura o que acabou de subir, se houver banco para isso.
    if (env.BACKUP_VERIFY_URL && backupKeysFor(new Date()).length > 1) await verify();
  }
} catch (err) {
  log("backup falhou", { erro: err instanceof Error ? err.message : String(err) });
  sentry.error(err, { tarefa: "backup" });
  await sentry.flush();
  process.exit(1);
}
await sentry.flush();
