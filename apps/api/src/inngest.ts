/**
 * Rotinas de fundo no Inngest.
 *
 *   04:30 (dias úteis) ── capturar-cadernos-djen (todos os escritórios) ──► publicação nova ──► sugerir-prazo
 *   de hora em hora ── reler-publicacoes (o que a IA não conseguiu ler) ──► sugerir-prazo
 *   sugerir-prazo, com um candidato no MODELO_OBSERVAR ── o candidato lê também, sem efeito no escritório (bun run observacao)
 *   publicação nova ── guardar-certidao (a prova da data, do DJEN, guardada com o escritório)
 *   12:40, 18:40 (dias úteis) ── capturar-djen (por OAB, reforço do mesmo dia) ──► publicação nova
 *   05:00 (todo dia) ── atualizar-datajud ──► processo.datajud (no ritmo que o DataJud aguenta)
 *   06:00 às 10:45, de 15 em 15 min ── resumo-da-manha (cada escritório na hora dele)
 *   publicação nova que é sentença ou acórdão ── ler-sentenca
 *   foto ou PDF escaneado enviado ── ler-documento
 *   prazo confirmado ── rascunho-do-prazo (a peça sugerida, em rascunho)
 *
 * A captura de um escritório roda uma por vez; a sugestão da IA, duas por vez
 * por escritório. Repetir uma rodada é inócuo: publicação e movimentação
 * repetidas não entram duas vezes, e o resumo do dia sai uma vez por pessoa.
 */
import { diaDaSemana, hojeEm } from "@decreta/core";
import { avisosEnviados, escritorios, organization, withTenant, type Database } from "@decreta/db";
import type { Armazenamento } from "@decreta/documentos";
import type { Ia } from "@decreta/ia";
import { and, eq, ne } from "drizzle-orm";
import { eventType, Inngest, NonRetriableError, staticSchema } from "inngest";
import { SLUG_DA_DEMONSTRACAO } from "./demonstracao/slug.ts";
import type { Pedido } from "./rotas/base.ts";
import { enviarWhatsapp, horaDoResumo, resumoDaManha, type Wameow } from "./servicos/avisos.ts";
import { sincronizarTemasDoStj } from "./servicos/acervo.ts";
import { atualizarDoDataJud, capturarCadernos, capturarDjen, certidaoDaPublicacao, conferirDataJudDoEscritorio, diasDoCaderno, periodoDaCaptura, processosParaAtualizar, type DepsDaCaptura } from "./servicos/captura.ts";
import { WHATSAPP_EM_AVALIACAO } from "./servicos/em-avaliacao.ts";
import { painelDoDia } from "./servicos/hoje.ts";
import { cruzarRadar, sincronizarPrecedentesDoBnp } from "./servicos/radar.ts";
import { pessoasDoEscritorio } from "./servicos/pessoas.ts";
import { lerDocumentoComIa } from "./servicos/leitura.ts";
import { ClienteSemIa } from "./servicos/contexto.ts";
import { observarPrazo, type Observacao } from "./servicos/observacao.ts";
import { IaDesligada, sugerirPrazoDaPublicacao } from "./servicos/prazos.ts";
import { publicacoesParaReler } from "./servicos/publicacoes.ts";
import { rascunhoDoPrazo } from "./servicos/rascunho.ts";
import { lerSentencaSozinha } from "./servicos/sentencas.ts";
import { iaMedida, motivoNoFundo, SEM_LIMITES, type LimitesDaIa, type QuemUsa } from "./servicos/uso-ia.ts";
import { silentReporter, type Reporter } from "./sentry.ts";

export const inngest = new Inngest({ id: "decreta" });

type Org = { organizationId: string } & Record<string, unknown>;
export const capturaPedida = eventType("decreta/captura.djen", { schema: staticSchema<Org>() });
export const publicacaoNova = eventType("decreta/publicacao.nova", { schema: staticSchema<Org & { publicacaoId: string }>() });
export const publicacaoParaReler = eventType("decreta/publicacao.reler", { schema: staticSchema<Org & { publicacaoId: string }>() });
export const datajudDoEscritorio = eventType("decreta/datajud.escritorio", { schema: staticSchema<Org>() });
export const processoDataJud = eventType("decreta/processo.datajud", { schema: staticSchema<Org & { processoId: string }>() });
export const documentoParaLer = eventType("decreta/documento.ler", { schema: staticSchema<Org & { documentoId: string }>() });
export const prazoConfirmado = eventType("decreta/prazo.confirmado", { schema: staticSchema<Org & { prazoId: string }>() });

/** O pedido de uma rota vira o evento certo. */
export function eventoDoPedido(p: Pedido) {
  switch (p.nome) {
    case "publicacao.nova":
      return publicacaoNova.create({ organizationId: p.organizationId, publicacaoId: p.publicacaoId });
    case "captura.djen":
      return capturaPedida.create({ organizationId: p.organizationId });
    case "processo.datajud":
      return processoDataJud.create({ organizationId: p.organizationId, processoId: p.processoId });
    case "documento.ler":
      return documentoParaLer.create({ organizationId: p.organizationId, documentoId: p.documentoId });
    case "prazo.confirmado":
      return prazoConfirmado.create({ organizationId: p.organizationId, prazoId: p.prazoId });
  }
}

export interface DepsDasRotinas {
  db: Database;
  ia: Ia | null;
  captura: DepsDaCaptura;
  arquivos: Armazenamento;
  wameow?: Wameow;
  telas: string;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  reporter?: Reporter;
  /** O preço de referência do gasto e os tetos que valem para a leitura dos arquivos enviados. */
  limites?: LimitesDaIa;
  /** O modelo ou prompt candidato que lê as publicações em paralelo. */
  observacao?: Observacao;
}

/** Os escritórios das rotinas. A demonstração fica de fora: nada dela sai para o DJEN, o DataJud ou o WhatsApp. */
async function escritoriosAtivos(db: Database) {
  return db.select({ id: organization.id, timezone: organization.timezone, emAvaliacao: organization.emAvaliacao }).from(organization).where(ne(organization.slug, SLUG_DA_DEMONSTRACAO));
}

/** O que a IA deve ler de novo em cada escritório (a demonstração fica de fora, como nas outras rotinas). */
export async function releiturasPendentes(db: Database) {
  const pendentes: { organizationId: string; publicacaoId: string; nuncaLida: boolean }[] = [];
  for (const o of await escritoriosAtivos(db)) {
    const dele = await withTenant(db, o.id, publicacoesParaReler);
    pendentes.push(...dele.map((p) => ({ organizationId: o.id, ...p })));
  }
  return pendentes;
}

export function createFunctions(deps: DepsDasRotinas) {
  const limites = deps.limites ?? SEM_LIMITES;
  /** A IA que grava o gasto no escritório da rotina. */
  const iaDo = (organizationId: string, origem: QuemUsa["origem"]) => (deps.ia ? iaMedida(deps, deps.ia, { organizationId, userId: null, origem }, limites.preco) : null);
  const { db, log } = deps;
  const reporter = deps.reporter ?? silentReporter;

  // O caderno do dia sai a partir das 03:00: uma leitura por tribunal serve a todos os escritórios.
  const capturarCadernosFn = inngest.createFunction(
    { id: "capturar-cadernos-djen", triggers: [{ cron: "TZ=America/Sao_Paulo 30 4 * * 1-5" }], retries: 2, onFailure: async ({ error }) => reporter.error(error, { funcao: "capturar-cadernos-djen" }) },
    async ({ step }) => {
      const r = await step.run("cadernos", () => capturarCadernos(deps.captura, diasDoCaderno(hojeEm("America/Sao_Paulo"))));
      if (r.novas.length) await step.sendEvent("sugerir", r.novas.map((n) => publicacaoNova.create(n)));
      return { cadernos: r.cadernos, novas: r.novas.length };
    },
  );

  const agendarCaptura = inngest.createFunction(
    { id: "agendar-captura-djen", triggers: [{ cron: "TZ=America/Sao_Paulo 40 12,18 * * 1-5" }], onFailure: async ({ error }) => reporter.error(error, { funcao: "agendar-captura-djen" }) },
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
      triggers: [publicacaoNova, publicacaoParaReler],
      concurrency: { limit: 2, key: "event.data.organizationId" },
      retries: 2,
      onFailure: async ({ event, error }) => reporter.error(error, { funcao: "sugerir-prazo", ...(event.data.event.data as Org) }),
    },
    async ({ event, step }) => {
      const situacao = await step.run("ler", async () => {
        try {
          const a = await sugerirPrazoDaPublicacao({ ...deps, ia: iaDo(event.data.organizationId, "fundo") }, event.data.organizationId, event.data.publicacaoId);
          return a?.situacao ?? "sem-publicacao";
        } catch (err) {
          // Sem IA configurada, ou cliente que recusou a IA, a publicação fica na caixa para a pessoa decidir; não é falha da rotina.
          if (err instanceof IaDesligada) return "ia-desligada";
          if (err instanceof ClienteSemIa) return "cliente-sem-ia";
          throw err;
        }
      });
      const { observacao } = deps;
      if (observacao && (situacao === "pronto" || situacao === "recusa")) {
        await step.run("observar", () => observarPrazo({ db, log, preco: limites.preco }, observacao, event.data.organizationId, event.data.publicacaoId));
      }
      return situacao;
    },
  );

  const relerFn = inngest.createFunction(
    { id: "reler-publicacoes", triggers: [{ cron: "TZ=America/Sao_Paulo 20 * * * *" }], onFailure: async ({ error }) => reporter.error(error, { funcao: "reler-publicacoes" }) },
    async ({ step }) => {
      if (!deps.ia) return { desligado: true };
      const pendentes = await step.run("publicacoes", () => releiturasPendentes(db));
      // Nunca lida: o evento da chegada se perdeu, e a certidão e a sentença também ficaram para trás. Quem falhou só relê o prazo.
      const eventos = pendentes.map(({ organizationId, publicacaoId, nuncaLida }) => (nuncaLida ? publicacaoNova.create({ organizationId, publicacaoId }) : publicacaoParaReler.create({ organizationId, publicacaoId })));
      if (eventos.length) await step.sendEvent("reler", eventos);
      return { releituras: pendentes.length };
    },
  );

  // A certidão é a prova da data da publicação: guardada já, e não só quando alguém abrir.
  const guardarCertidao = inngest.createFunction(
    {
      id: "guardar-certidao",
      triggers: [publicacaoNova],
      concurrency: { limit: 2, key: "event.data.organizationId" },
      retries: 4,
      onFailure: async ({ event, error }) => reporter.error(error, { funcao: "guardar-certidao", ...(event.data.event.data as Org) }),
    },
    async ({ event, step }) =>
      step.run("guardar", async () => {
        const bytes = await certidaoDaPublicacao({ db, arquivos: deps.arquivos, fetch: deps.captura.fetch }, event.data.organizationId, event.data.publicacaoId);
        return bytes ? "guardada" : "sem-certidao";
      }),
  );

  const sentenca = inngest.createFunction(
    {
      id: "ler-sentenca",
      triggers: [publicacaoNova],
      concurrency: { limit: 2, key: "event.data.organizationId" },
      retries: 2,
      onFailure: async ({ event, error }) => reporter.error(error, { funcao: "ler-sentenca", ...(event.data.event.data as Org) }),
    },
    async ({ event, step }) =>
      step.run("ler", async () => {
        try {
          // Só lê o que parece sentença ou acórdão; o resto passa direto.
          // No nível de sugestão (Configurações > Automação), a pessoa pede a leitura pela tela.
          const a = await lerSentencaSozinha({ ...deps, ia: iaDo(event.data.organizationId, "fundo") }, event.data.organizationId, event.data.publicacaoId);
          return a?.situacao ?? "nao-e-decisao";
        } catch (err) {
          if (err instanceof IaDesligada) return "ia-desligada";
          if (err instanceof ClienteSemIa) return "cliente-sem-ia";
          throw err;
        }
      }),
  );

  const lerDocumento = inngest.createFunction(
    {
      id: "ler-documento",
      triggers: [documentoParaLer],
      concurrency: { limit: 2, key: "event.data.organizationId" },
      // A falha fica gravada no documento ("Não deu para ler"); a pessoa pede de novo pela tela.
      retries: 1,
      onFailure: async ({ event, error }) => reporter.error(error, { funcao: "ler-documento", ...(event.data.event.data as Org) }),
    },
    // Quem enviou o arquivo pediu a leitura: conta nos tetos do dia (o do site e o da demonstração).
    async ({ event, step }) =>
      step.run("ler", () =>
        lerDocumentoComIa(
          { db, ia: iaDo(event.data.organizationId, "tela"), arquivos: deps.arquivos, log, barrar: () => motivoNoFundo(db, limites, event.data.organizationId) },
          event.data.organizationId,
          event.data.documentoId,
        ),
      ),
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
      // Até quando o DataJud tem dados de cada tribunal (a ficha diz de quando são os andamentos). Vem depois e não
      // derruba a rotina: a consulta é lenta, e os andamentos do dia já foram pedidos.
      await step.run("ate-quando", async () => {
        try {
          return await conferirDataJudDoEscritorio(deps.captura, orgId);
        } catch (err) {
          log("até quando o DataJud tem dados falhou", { organizationId: orgId, error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      });
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
            const painel = await painelDoDia(db, tx, org.id, hoje, org.timezone, { iaLigada: !!deps.ia });
            let n = 0;
            for (const p of pessoas.values()) {
              if (!p.whatsapp || !p.avisoManha || ja.has(p.id)) continue;
              const texto = resumoDaManha(painel, p, deps.telas);
              if (texto && org.emAvaliacao && !WHATSAPP_EM_AVALIACAO.permitir(org.id)) continue;
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

  // Os temas repetitivos do STJ, toda segunda de madrugada (o STJ troca o Temas.csv no mesmo endereço).
  // Falhou, o acervo fica com a última versão e o erro vai para o Sentry.
  const temasDoStjFn = inngest.createFunction(
    { id: "acervo-temas-stj", triggers: [{ cron: "TZ=America/Sao_Paulo 15 3 * * 1" }], retries: 3, onFailure: async ({ error }) => reporter.error(error, { funcao: "acervo-temas-stj" }) },
    async ({ step }) => step.run("temas", () => sincronizarTemasDoStj({ db, fetch: deps.captura.fetch, log })),
  );

  // O prazo foi confirmado: a peça sugerida fica pronta em rascunho. Nada é enviado nem protocolado.
  const rascunhoFn = inngest.createFunction(
    {
      id: "rascunho-do-prazo",
      triggers: [prazoConfirmado],
      // Confirmar e ajustar em seguida não paga duas gerações: um rascunho por prazo por dia.
      idempotency: "event.data.prazoId",
      concurrency: { limit: 2, key: "event.data.organizationId" },
      retries: 1,
      onFailure: async ({ event, error }) => reporter.error(error, { funcao: "rascunho-do-prazo", ...(event.data.event.data as Org) }),
    },
    async ({ event, step }) =>
      step.run("preparar", async () => {
        if (await motivoNoFundo(db, limites, event.data.organizationId)) return "limite";
        try {
          return (await rascunhoDoPrazo({ db, ia: iaDo(event.data.organizationId, "fundo"), log }, event.data.organizationId, event.data.prazoId)).situacao;
        } catch (err) {
          if (err instanceof IaDesligada) return "ia-desligada";
          throw err;
        }
      }),
  );

  // O BNP é atualizado duas vezes por mês: no dia 2 e no 17, de madrugada, o acervo é sincronizado
  // e o radar liga o que mudou aos processos dos escritórios. Uma espécie que o BNP não devolveu
  // não segura o radar: ele cruza o que chegou, e o erro vai para o Sentry.
  const radarFn = inngest.createFunction(
    { id: "acervo-radar-de-precedentes", triggers: [{ cron: "TZ=America/Sao_Paulo 30 4 2,17 * *" }], retries: 2, onFailure: async ({ error }) => reporter.error(error, { funcao: "acervo-radar-de-precedentes" }) },
    async ({ step }) => {
      const desde = await step.run("inicio", () => new Date().toISOString());
      const bnp = await step.run("bnp", async () => {
        try {
          return { ...(await sincronizarPrecedentesDoBnp({ db, fetch: deps.captura.fetch, log })), erro: null };
        } catch (e) {
          return { precedentes: 0, novidades: 0, erro: e instanceof Error ? e.message : String(e) };
        }
      });
      const radar = await step.run("radar", () => cruzarRadar({ db, log }, new Date(desde)));
      if (bnp.erro) throw new NonRetriableError(bnp.erro);
      return { ...bnp, ...radar };
    },
  );

  return [capturarCadernosFn, agendarCaptura, capturar, sugerir, relerFn, guardarCertidao, sentenca, lerDocumento, agendarDataJud, datajudEscritorio, atualizarProcesso, resumoDaManhaFn, temasDoStjFn, rascunhoFn, radarFn];
}
