/**
 * Rotinas de fundo no Inngest.
 *
 *   06:40, 12:40, 18:40 (dias úteis) ── capturar-djen ──► publicação nova ──► sugerir-prazo
 *   05:00 (todo dia) ── atualizar-datajud ──► processo.datajud (no ritmo que o DataJud aguenta)
 *   06:00 às 10:45, de 15 em 15 min ── resumo-da-manha (cada escritório na hora dele)
 *
 * A captura de um escritório roda uma por vez; a sugestão da IA, duas por vez
 * por escritório. Repetir uma rodada é inócuo: publicação e movimentação
 * repetidas não entram duas vezes, e o resumo do dia sai uma vez por pessoa.
 */
import { diaDaSemana, hojeEm } from "@decreta/core";
import { avisosEnviados, escritorios, organization, withTenant, type Database } from "@decreta/db";
import type { Ia } from "@decreta/ia";
import { and, eq } from "drizzle-orm";
import { eventType, Inngest, staticSchema } from "inngest";
import type { Pedido } from "./rotas/base.ts";
import { enviarWhatsapp, horaDoResumo, resumoDaManha, type Wameow } from "./servicos/avisos.ts";
import { atualizarDoDataJud, capturarDjen, periodoDaCaptura, processosParaAtualizar, type DepsDaCaptura } from "./servicos/captura.ts";
import { painelDoDia } from "./servicos/hoje.ts";
import { pessoasDoEscritorio } from "./servicos/pessoas.ts";
import { IaDesligada, sugerirPrazoDaPublicacao } from "./servicos/prazos.ts";
import { silentReporter, type Reporter } from "./sentry.ts";

export const inngest = new Inngest({ id: "decreta" });

type Org = { organizationId: string } & Record<string, unknown>;
export const capturaPedida = eventType("decreta/captura.djen", { schema: staticSchema<Org>() });
export const publicacaoNova = eventType("decreta/publicacao.nova", { schema: staticSchema<Org & { publicacaoId: string }>() });
export const datajudDoEscritorio = eventType("decreta/datajud.escritorio", { schema: staticSchema<Org>() });
export const processoDataJud = eventType("decreta/processo.datajud", { schema: staticSchema<Org & { processoId: string }>() });

/** O pedido de uma rota vira o evento certo. */
export function eventoDoPedido(p: Pedido) {
  switch (p.nome) {
    case "publicacao.nova":
      return publicacaoNova.create({ organizationId: p.organizationId, publicacaoId: p.publicacaoId });
    case "captura.djen":
      return capturaPedida.create({ organizationId: p.organizationId });
    case "processo.datajud":
      return processoDataJud.create({ organizationId: p.organizationId, processoId: p.processoId });
  }
}

export interface DepsDasRotinas {
  db: Database;
  ia: Ia | null;
  captura: DepsDaCaptura;
  wameow?: Wameow;
  telas: string;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  reporter?: Reporter;
}

async function escritoriosAtivos(db: Database) {
  return db.select({ id: organization.id, timezone: organization.timezone }).from(organization);
}

export function createFunctions(deps: DepsDasRotinas) {
  const { db, log } = deps;
  const reporter = deps.reporter ?? silentReporter;

  const agendarCaptura = inngest.createFunction(
    { id: "agendar-captura-djen", triggers: [{ cron: "TZ=America/Sao_Paulo 40 6,12,18 * * 1-5" }], onFailure: async ({ error }) => reporter.error(error, { funcao: "agendar-captura-djen" }) },
    async ({ step }) => {
      const orgs = await step.run("escritorios", () => escritoriosAtivos(db));
      if (orgs.length) await step.sendEvent("capturar", orgs.map((o) => capturaPedida.create({ organizationId: o.id })));
      return { escritorios: orgs.length };
    },
  );

  const capturar = inngest.createFunction(
    {
      id: "capturar-djen",
      triggers: [capturaPedida],
      concurrency: { limit: 1, key: "event.data.organizationId" },
      // "Buscar agora" apertado várias vezes vira uma busca só.
      debounce: { key: "event.data.organizationId", period: "20s" },
      retries: 2,
      onFailure: async ({ event, error }) => reporter.error(error, { funcao: "capturar-djen", organizationId: (event.data.event.data as Org).organizationId }),
    },
    async ({ event, step }) => {
      const orgId = event.data.organizationId;
      const r = await step.run("buscar", async () => {
        const [org] = await db.select({ tz: organization.timezone }).from(organization).where(eq(organization.id, orgId));
        return capturarDjen(deps.captura, orgId, periodoDaCaptura(hojeEm(org?.tz ?? "America/Sao_Paulo")));
      });
      if (r.novas.length) await step.sendEvent("sugerir", r.novas.map((publicacaoId) => publicacaoNova.create({ organizationId: orgId, publicacaoId })));
      return { encontradas: r.encontradas, novas: r.novas.length };
    },
  );

  const sugerir = inngest.createFunction(
    {
      id: "sugerir-prazo",
      triggers: [publicacaoNova],
      concurrency: { limit: 2, key: "event.data.organizationId" },
      retries: 2,
      onFailure: async ({ event, error }) => reporter.error(error, { funcao: "sugerir-prazo", ...(event.data.event.data as Org) }),
    },
    async ({ event, step }) =>
      step.run("ler", async () => {
        try {
          const a = await sugerirPrazoDaPublicacao(deps, event.data.organizationId, event.data.publicacaoId);
          return a?.situacao ?? "sem-publicacao";
        } catch (err) {
          // Sem IA configurada a publicação fica na caixa para a pessoa decidir; não é falha da rotina.
          if (err instanceof IaDesligada) return "ia-desligada";
          throw err;
        }
      }),
  );

  const agendarDataJud = inngest.createFunction(
    { id: "agendar-datajud", triggers: [{ cron: "TZ=America/Sao_Paulo 0 5 * * *" }], onFailure: async ({ error }) => reporter.error(error, { funcao: "agendar-datajud" }) },
    async ({ step }) => {
      if (!deps.captura.datajudKey) return { desligado: true };
      const orgs = await step.run("escritorios", () => escritoriosAtivos(db));
      if (orgs.length) await step.sendEvent("escritorios", orgs.map((o) => datajudDoEscritorio.create({ organizationId: o.id })));
      return { escritorios: orgs.length };
    },
  );

  const datajudEscritorio = inngest.createFunction(
    { id: "datajud-escritorio", triggers: [datajudDoEscritorio], concurrency: { limit: 1, key: "event.data.organizationId" } },
    async ({ event, step }) => {
      const orgId = event.data.organizationId;
      const ligado = await step.run("ligado", async () => {
        const [e] = await withTenant(db, orgId, (tx) => tx.select({ ligado: escritorios.capturaDatajud }).from(escritorios).where(eq(escritorios.organizationId, orgId)));
        return e?.ligado ?? true;
      });
      if (!ligado) return { processos: 0 };
      const ids = await step.run("processos", () => processosParaAtualizar(db, orgId));
      if (ids.length) await step.sendEvent("atualizar", ids.map((processoId) => processoDataJud.create({ organizationId: orgId, processoId })));
      return { processos: ids.length };
    },
  );

  const atualizarProcesso = inngest.createFunction(
    {
      id: "atualizar-processo",
      triggers: [processoDataJud],
      // A API pública do DataJud corta quem pede demais: 20 processos por minuto no servidor todo.
      throttle: { limit: 20, period: "1m" },
      retries: 2,
    },
    async ({ event, step }) => {
      if (!deps.captura.datajudKey) return { novas: 0 };
      return step.run("datajud", async () => ({ novas: await atualizarDoDataJud(deps.captura, event.data.organizationId, event.data.processoId) }));
    },
  );

  const resumoDaManhaFn = inngest.createFunction(
    { id: "resumo-da-manha", triggers: [{ cron: "TZ=America/Sao_Paulo */15 6-10 * * 1-5" }], concurrency: { limit: 1 }, onFailure: async ({ error }) => reporter.error(error, { funcao: "resumo-da-manha" }) },
    async ({ step }) => {
      const wameow = deps.wameow;
      if (!wameow) return { desligado: true };
      const orgs = await step.run("escritorios", () => escritoriosAtivos(db));
      let enviados = 0;
      for (const org of orgs) {
        enviados += await step.run(`escritorio-${org.id}`, async () => {
          const agora = new Date();
          const hoje = hojeEm(org.timezone, agora);
          if (diaDaSemana(hoje) === 0 || diaDaSemana(hoje) === 6) return 0;
          return withTenant(db, org.id, async (tx) => {
            const [e] = await tx.select({ avisos: escritorios.avisos }).from(escritorios).where(eq(escritorios.organizationId, org.id));
            const avisos = e?.avisos ?? { manha: true, hora: "07:30" };
            if (!avisos.manha || !horaDoResumo(agora, avisos.hora, org.timezone)) return 0;
            const pessoas = await pessoasDoEscritorio(db, tx, org.id);
            const ja = new Set((await tx.select({ userId: avisosEnviados.userId }).from(avisosEnviados).where(and(eq(avisosEnviados.tipo, "manha"), eq(avisosEnviados.dia, hoje)))).map((x) => x.userId));
            const painel = await painelDoDia(db, tx, org.id, hoje, org.timezone);
            let n = 0;
            for (const p of pessoas.values()) {
              if (!p.whatsapp || !p.avisoManha || ja.has(p.id)) continue;
              const texto = resumoDaManha(painel, p, deps.telas);
              let ok = true;
              let erro: string | null = null;
              if (texto) {
                try {
                  await enviarWhatsapp(wameow, p.whatsapp, texto);
                  n++;
                } catch (err) {
                  ok = false;
                  erro = err instanceof Error ? err.message.slice(0, 300) : String(err);
                  log("resumo da manhã não saiu", { organizationId: org.id, userId: p.id, error: erro });
                }
              }
              // Gravado mesmo sem mensagem (dia vazio) ou com erro: não insiste a cada 15 minutos.
              await tx.insert(avisosEnviados).values({ organizationId: org.id, userId: p.id, tipo: "manha", dia: hoje, ok, erro }).onConflictDoNothing();
            }
            return n;
          });
        });
      }
      return { enviados };
    },
  );

  return [agendarCaptura, capturar, sugerir, agendarDataJud, datajudEscritorio, atualizarProcesso, resumoDaManhaFn];
}
