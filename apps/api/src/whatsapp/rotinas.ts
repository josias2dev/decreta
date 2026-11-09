/**
 * As rotinas do WhatsApp no Inngest.
 *
 *   mensagem que chegou ── whatsapp-turno (junta a rajada de 3 s; uma pessoa por vez) ──► resposta
 *   toque num botão ── whatsapp-decisao (na hora; uma pessoa por vez) ──► resposta
 *   15:00 (dias úteis) ── whatsapp-vence-hoje (o que vence hoje e está aberto; só sai quando existe)
 *   publicação lida pela IA ── whatsapp-prazo-curto (sugestão em até 2 dias úteis, depois do resumo da manhã)
 *   04:10 (todo dia) ── whatsapp-limpeza (texto com mais de 30 dias, códigos vencidos, propostas vencidas)
 *
 * O debounce e a concorrência do Inngest fazem o que a mecânica fazia em memória: valem com mais de um
 * processo e sobrevivem a um reinício.
 */
import { diaDaSemana, hojeEm } from "@decreta/core";
import { equipe, escritorios, member, organization, propostas, whatsappVinculos, withTenant, type Database } from "@decreta/db";
import { and, eq, lt } from "drizzle-orm";
import { eventType, staticSchema, type Inngest } from "inngest";
import type { Reporter } from "../sentry.ts";
import { horaDoResumo } from "../servicos/avisos.ts";
import { avisarPrazoCurto, avisarVenceHoje } from "./avisos.ts";
import { processarDecisao, processarMensagens, type PedidoDoWhatsapp } from "./entrada.ts";
import { apagarConteudoAntigo } from "./mensagens.ts";
import type { DepsDoAgente } from "./tipos.ts";
import { limparCodigos, pessoaDoUsuario, type PessoaNoWhatsapp } from "./vinculo.ts";

type Pessoa = { organizationId: string; userId: string };
export const whatsappMensagem = eventType("decreta/whatsapp.mensagem", { schema: staticSchema<Pessoa>() });
export const whatsappDecisao = eventType("decreta/whatsapp.decisao", { schema: staticSchema<Pessoa & { entradaId: string; escolha: string; responde?: string | null }>() });
export const whatsappPrazoCurto = eventType("decreta/whatsapp.prazo-curto", { schema: staticSchema<{ organizationId: string; publicacaoId: string }>() });

/** O pedido do webhook vira o evento certo. */
export function eventoDoWhatsapp(p: PedidoDoWhatsapp) {
  return p.tipo === "mensagem" ? whatsappMensagem.create({ organizationId: p.organizationId, userId: p.userId }) : whatsappDecisao.create({ organizationId: p.organizationId, userId: p.userId, entradaId: p.entradaId, escolha: p.escolha, responde: p.responde });
}

/** As pessoas do escritório com o WhatsApp ligado (o vínculo pode estar com outro escritório ativo: os avisos são deste). */
export async function pessoasComWhatsapp(db: Database, organizationId: string, opcoes: { cobrancaAtiva: boolean; agora?: Date }): Promise<PessoaNoWhatsapp[]> {
  const ligados = await db.select({ userId: whatsappVinculos.userId }).from(whatsappVinculos).innerJoin(member, and(eq(member.userId, whatsappVinculos.userId), eq(member.organizationId, organizationId)));
  const pessoas: PessoaNoWhatsapp[] = [];
  for (const l of ligados) {
    const p = await pessoaDoUsuario(db, l.userId, { ...opcoes, organizationId });
    if (p && !p.pausado && !p.vencido) pessoas.push(p);
  }
  return pessoas;
}

export function rotinasDoWhatsapp(inngest: Inngest, deps: { agente: DepsDoAgente; reporter: Reporter; escritorios: () => Promise<{ id: string; timezone: string; emAvaliacao: boolean }[]> }) {
  const { agente } = deps;
  const { db } = agente;

  const turno = inngest.createFunction(
    {
      id: "whatsapp-turno",
      triggers: [whatsappMensagem],
      // A rajada ("oi" + "me manda a procuração" + áudio) vira um turno só.
      debounce: { key: "event.data.userId", period: "3s", timeout: "15s" },
      concurrency: { limit: 1, key: "event.data.userId" },
      retries: 1,
      onFailure: async ({ event, error }) => deps.reporter.error(error, { funcao: "whatsapp-turno", ...(event.data.event.data as Pessoa) }),
    },
    async ({ event, step }) => {
      const r = await step.run("responder", async () => {
        const t = await processarMensagens(agente, event.data);
        return t ? { respondidas: t.entradas.length, descartado: !!t.descartado, saidas: t.saidas.length } : { respondidas: 0 };
      });
      return r;
    },
  );

  const decisao = inngest.createFunction(
    {
      id: "whatsapp-decisao",
      triggers: [whatsappDecisao],
      concurrency: { limit: 1, key: "event.data.userId" },
      // A proposta executa uma vez só e cada resposta tem a sua chave; repetir não muda nada, mas a pessoa não espera duas vezes.
      retries: 1,
      onFailure: async ({ event, error }) => deps.reporter.error(error, { funcao: "whatsapp-decisao", ...(event.data.event.data as Pessoa) }),
    },
    async ({ event, step }) => step.run("decidir", async () => ({ saidas: (await processarDecisao(agente, event.data)).length })),
  );

  const venceHoje = inngest.createFunction(
    { id: "whatsapp-vence-hoje", triggers: [{ cron: "TZ=America/Sao_Paulo 0 15 * * 1-5" }], concurrency: { limit: 1 }, onFailure: async ({ error }) => deps.reporter.error(error, { funcao: "whatsapp-vence-hoje" }) },
    async ({ step }) => {
      const orgs = await step.run("escritorios", deps.escritorios);
      let enviados = 0;
      for (const org of orgs) {
        enviados += await step.run(`escritorio-${org.id}`, async () => {
          const hoje = hojeEm(org.timezone);
          if (diaDaSemana(hoje) === 0 || diaDaSemana(hoje) === 6) return 0;
          const querem = await withTenant(db, org.id, async (tx) => {
            return new Set((await tx.select({ userId: equipe.userId }).from(equipe).where(eq(equipe.avisoQuinzeHoras, true))).map((e) => e.userId));
          });
          let n = 0;
          for (const p of await pessoasComWhatsapp(db, org.id, { cobrancaAtiva: agente.cobrancaAtiva })) if (querem.has(p.userId) && (await avisarVenceHoje(agente, p))) n++;
          return n;
        });
      }
      return { enviados };
    },
  );

  const prazoCurto = inngest.createFunction(
    { id: "whatsapp-prazo-curto", triggers: [whatsappPrazoCurto], concurrency: { limit: 2, key: "event.data.organizationId" }, retries: 1, onFailure: async ({ error }) => deps.reporter.error(error, { funcao: "whatsapp-prazo-curto" }) },
    async ({ event, step }) =>
      step.run("avisar", async () => {
        const [o] = await db.select({ tz: organization.timezone, encerradoEm: organization.encerradoEm }).from(organization).where(eq(organization.id, event.data.organizationId));
        if (!o || o.encerradoEm) return { enviados: 0 };
        // Antes do resumo da manhã, a publicação entra no resumo: não sai aviso à parte.
        const [e] = await withTenant(db, event.data.organizationId, (tx) => tx.select({ avisos: escritorios.avisos }).from(escritorios));
        if (!horaDoResumo(new Date(), e?.avisos?.hora ?? "07:30", o.tz)) return { enviados: 0, motivo: "antes do resumo" };
        const pessoas = await pessoasComWhatsapp(db, event.data.organizationId, { cobrancaAtiva: agente.cobrancaAtiva });
        return { enviados: await avisarPrazoCurto(agente, pessoas, event.data.organizationId, event.data.publicacaoId) };
      }),
  );

  const limpeza = inngest.createFunction(
    { id: "whatsapp-limpeza", triggers: [{ cron: "TZ=America/Sao_Paulo 10 4 * * *" }], onFailure: async ({ error }) => deps.reporter.error(error, { funcao: "whatsapp-limpeza" }) },
    async ({ step }) =>
      step.run("limpar", async () => {
        const agora = new Date();
        await limparCodigos(db, agora);
        const texto = await apagarConteudoAntigo(db, agora);
        const orgs = await db.select({ id: organization.id }).from(organization);
        for (const o of orgs) await withTenant(db, o.id, (tx) => tx.update(propostas).set({ situacao: "vencida" }).where(and(eq(propostas.situacao, "pendente"), lt(propostas.expiraEm, agora))));
        return { textosApagados: texto };
      }),
  );

  return [turno, decisao, venceHoje, prazoCurto, limpeza];
}
