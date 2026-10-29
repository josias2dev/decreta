/**
 * Erros para o Sentry, que avisa você por e-mail. Sem SENTRY_DSN tudo aqui
 * vira nada: desenvolvimento e testes não mandam nada para fora.
 *
 * Fala direto com a API de envelopes do Sentry, sem o SDK: o `@sentry/bun`
 * puxa o OpenTelemetry e soma ~50 MB de memória por processo, e o servidor tem
 * pouca RAM, dividida com o wameow, a mecânica e o AgenteHost. Só erros, avisos e check-ins de
 * tarefas agendadas; nunca o conteúdo de processos (vai a mensagem do erro e ids).
 */

export interface Reporter {
  /** Erro inesperado (requisição que deu 500, rotina que desistiu). */
  error(err: unknown, context?: Record<string, unknown>): void;
  /** Algo que pede atenção sem ser exceção (a captura do DJEN falhou três vezes). */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Espera os envios pendentes (antes de um script sair). */
  flush(): Promise<void>;
}

export const silentReporter: Reporter = { error: () => {}, warn: () => {}, flush: async () => {} };

interface Dsn {
  url: string;
  auth: string;
  dsn: string;
}

export function parseDsn(dsn: string): Dsn {
  const u = new URL(dsn);
  const project = u.pathname.replace(/^\/+|\/+$/g, "");
  if (!u.username || !project) throw new Error("SENTRY_DSN inválido");
  return {
    url: `${u.protocol}//${u.host}/api/${project}/envelope/`,
    auth: `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=decreta/1`,
    dsn,
  };
}

const eventId = () => crypto.randomUUID().replaceAll("-", "");

/** Linhas "at fn (arquivo:linha:coluna)" do V8/JSC, na ordem que o Sentry quer (a mais antiga primeiro). */
export function parseStack(stack: string | undefined): { function?: string; filename: string; lineno?: number; colno?: number; in_app: boolean }[] {
  const frames = [];
  for (const line of (stack ?? "").split("\n").slice(1)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) continue;
    const filename = m[2]!;
    frames.push({
      function: m[1],
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes("node_modules") && !filename.startsWith("node:"),
    });
  }
  return frames.reverse();
}

export function exceptionEvent(err: unknown, context?: Record<string, unknown>) {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    level: "error",
    exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: parseStack(e.stack) } }] },
    extra: context,
  };
}

export function envelope(dsn: string, items: Array<{ type: string; body: Record<string, unknown> }>): string {
  const header = JSON.stringify({ event_id: eventId(), dsn, sent_at: new Date().toISOString() });
  return [header, ...items.flatMap((i) => [JSON.stringify({ type: i.type }), JSON.stringify(i.body)])].join("\n") + "\n";
}

export interface SentryOptions {
  release?: string;
  fetch?: typeof fetch;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export function startSentry(dsn: string, opts: SentryOptions = {}): Reporter & { send(type: string, body: Record<string, unknown>): Promise<void> } {
  if (!dsn) return { ...silentReporter, send: async () => {} };
  const target = parseDsn(dsn);
  const doFetch = opts.fetch ?? fetch;
  const pending = new Set<Promise<void>>();
  const base = () => ({
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    platform: "node",
    environment: "producao",
    release: opts.release,
    server_name: "decreta",
    contexts: { runtime: { name: "bun", version: Bun.version } },
  });

  const send = (type: string, body: Record<string, unknown>) => {
    const p = doFetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": target.auth },
      body: envelope(target.dsn, [{ type, body }]),
      signal: AbortSignal.timeout(10_000),
    })
      .then((res) => {
        if (!res.ok) opts.log?.("sentry recusou o envio", { status: res.status });
      })
      // Sem rede para o Sentry não pode derrubar quem chamou.
      .catch((err) => opts.log?.("sentry fora do ar", { error: err instanceof Error ? err.message : String(err) }))
      .finally(() => pending.delete(p));
    pending.add(p);
    return p;
  };

  return {
    send,
    error: (err, context) => void send("event", { ...base(), ...exceptionEvent(err, context) }),
    warn: (message, context) => void send("event", { ...base(), level: "warning", message: { formatted: message }, extra: context }),
    flush: async () => {
      await Promise.all([...pending]);
    },
  };
}

export interface MonitorConfig {
  /** Cron do agendamento, no fuso `timezone`. */
  crontab: string;
  timezone: string;
  /** Minutos de tolerância antes de o Sentry dar o check-in por perdido. */
  checkinMargin: number;
  /** Minutos até uma execução em andamento contar como travada. */
  maxRuntime: number;
}

/**
 * Sentry Crons: avisa quando a tarefa falha e também quando ela simplesmente
 * não roda (servidor desligado, timer parado), que é o caso que ninguém nota.
 */
export async function withMonitor<T>(
  sentry: ReturnType<typeof startSentry>,
  slug: string,
  config: MonitorConfig,
  fn: () => Promise<T>,
): Promise<T> {
  const checkInId = eventId();
  const monitor_config = {
    schedule: { type: "crontab", value: config.crontab },
    timezone: config.timezone,
    checkin_margin: config.checkinMargin,
    max_runtime: config.maxRuntime,
  };
  const checkIn = (status: string, duration?: number) =>
    sentry.send("check_in", { check_in_id: checkInId, monitor_slug: slug, status, duration, environment: "producao", monitor_config });
  const started = performance.now();
  await checkIn("in_progress");
  try {
    const r = await fn();
    await checkIn("ok", (performance.now() - started) / 1000);
    return r;
  } catch (err) {
    await checkIn("error", (performance.now() - started) / 1000);
    throw err;
  }
}
