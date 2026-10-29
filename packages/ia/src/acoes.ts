/**
 * As ações da IA. Cada uma devolve um objeto com blocos fixos (o que a tela
 * mostra) ou uma recusa que diz o que falta. Regras de todas:
 *
 * - A IA nunca define a data final de um prazo: ela diz o tipo e quantos dias;
 *   a conta é do motor de prazos (`@decreta/core`), e uma pessoa confirma.
 * - Nada de inventar fato, evento, número de lei ou jurisprudência. Sem base,
 *   recusa e diz o que falta.
 * - Português do Brasil, frases curtas, sem floreio.
 */
import { generateText, Output, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import type { Ia, MetodoIa } from "./gateway.ts";

export const RODAPE_IA = "Gerado por IA. Confira nos autos.";

const BASE = `Você trabalha num escritório de advocacia brasileiro e ajuda a equipe a entender processos e cumprir prazos.
Regras:
- Use só o que está no material enviado. Não invente fatos, eventos, datas, números de lei nem jurisprudência.
- Quando faltar informação para responder com segurança, preencha "recusa" dizendo exatamente o que falta (ex.: "Sem o teor do despacho, qualquer orientação seria palpite. Anexe a decisão.") e deixe o resto vazio.
- Cite eventos e datas como aparecem nos autos ("evento 87", "28/10").
- Escreva em português do Brasil, frases curtas, sem floreio, sem emoji, sem exclamação.
- Fale do ponto de vista do escritório: "nosso cliente", "a parte contrária".`;

const recusa = z
  .string()
  .nullable()
  .describe("Preenchido só quando o material não basta: diz o que falta, em uma ou duas frases. Nulo quando a resposta é possível.");

/* ------------------------------------------------------------------ */

export class IaRecusou extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
  }
}

/** Saída estruturada. Se o modelo do alias não aceita JSON Schema, pede JSON no texto e valida do mesmo jeito. */
async function gerarObjeto<S extends z.ZodType>(ia: Ia, metodo: MetodoIa, schema: S, instrucoes: string, prompt: string, signal?: AbortSignal): Promise<z.infer<S>> {
  const model = ia.modelo(metodo);
  try {
    const r = await generateText({ model, instructions: `${BASE}\n\n${instrucoes}`, prompt, output: Output.object({ schema }), abortSignal: signal, maxRetries: 1 });
    return r.output as z.infer<S>;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 400 && status !== 422) throw err;
    const forma = JSON.stringify(z.toJSONSchema(schema));
    const r = await generateText({
      model,
      instructions: `${BASE}\n\n${instrucoes}\n\nResponda só com um objeto JSON válido neste formato (JSON Schema): ${forma}`,
      prompt,
      abortSignal: signal,
      maxRetries: 1,
    });
    const inicio = r.text.indexOf("{");
    const fim = r.text.lastIndexOf("}");
    if (inicio < 0 || fim < inicio) throw new Error("a IA não devolveu JSON");
    return schema.parse(JSON.parse(r.text.slice(inicio, fim + 1)));
  }
}

function exigir<T extends { recusa: string | null }>(r: T): T {
  if (r.recusa && r.recusa.trim()) throw new IaRecusou(r.recusa.trim());
  return r;
}

/* ------------------------------------------------------------------ */
/* Sugestão de prazo a partir de uma publicação                         */
/* ------------------------------------------------------------------ */

export const sugestaoDePrazoSchema = z.object({
  geraPrazo: z.boolean().describe("A publicação abre prazo para o nosso cliente?"),
  tipo: z.string().describe('Nome curto do ato a praticar, ex.: "Manifestação sobre laudo pericial". Vazio se não gera prazo.'),
  dias: z.number().int().min(1).max(365).nullable().describe("Quantidade de dias do prazo, como está na publicação ou na lei. Nulo se não gera prazo."),
  contagem: z.enum(["uteis", "corridos"]).describe("Processo civil e trabalhista: dias úteis. Corridos só quando a lei manda (ex.: penal, Juizado da Fazenda em alguns casos)."),
  fundamento: z.string().nullable().describe('Artigo de lei que fixa o prazo, se for de conhecimento seguro (ex.: "art. 477, § 1º, CPC"). Nulo na dúvida.'),
  audiencia: z
    .object({
      data: z.string().describe("AAAA-MM-DD"),
      hora: z.string().describe("HH:MM"),
      tipo: z.string().describe('"Conciliação", "Instrução e julgamento"'),
      porVideo: z.boolean(),
    })
    .nullable()
    .describe("Se a publicação designa audiência, os dados dela. Nulo caso contrário."),
  resumo: z.string().describe('Uma linha sobre o que a publicação diz, ex.: "Intimação para falar do laudo pericial do evento 87."'),
  recusa,
});
export type SugestaoDePrazo = z.infer<typeof sugestaoDePrazoSchema>;

const TEOR_MINIMO = 40;

/** A publicação traz teor que dê para ler? As do DJEN às vezes vêm só com o cabeçalho. */
export function semTeor(texto: string): boolean {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length < TEOR_MINIMO || /^(sem teor|teor n[ãa]o dispon[ií]vel|conte[úu]do indispon[ií]vel)/i.test(limpo);
}

export async function sugerirPrazo(
  ia: Ia,
  entrada: { publicacao: { texto: string; tipoComunicacao: string | null; tipoDocumento: string | null; orgao: string | null; publicadaEm: string }; contextoDoProcesso?: string },
  signal?: AbortSignal,
): Promise<SugestaoDePrazo> {
  if (semTeor(entrada.publicacao.texto)) {
    throw new IaRecusou("Falta o teor da publicação. Abra a íntegra no sistema do tribunal e cole aqui, ou anexe a decisão.");
  }
  const pub = entrada.publicacao;
  const prompt = [
    "## Publicação",
    `Tipo: ${[pub.tipoComunicacao, pub.tipoDocumento].filter(Boolean).join(" · ") || "não informado"}`,
    ...(pub.orgao ? [`Órgão: ${pub.orgao}`] : []),
    `Publicada em: ${pub.publicadaEm}`,
    "",
    pub.texto.trim(),
    entrada.contextoDoProcesso ? `\n\n${entrada.contextoDoProcesso}` : "",
  ].join("\n");
  return exigir(
    await gerarObjeto(
      ia,
      "sugerir-prazo",
      sugestaoDePrazoSchema,
      `Leia a publicação e diga se ela abre prazo para o nosso cliente, qual o ato e quantos dias.
Não calcule a data final: o sistema conta os dias úteis com o calendário do tribunal.
Despacho de mero expediente ("cumpra-se", "aguarde-se", "vista ao MP") normalmente não gera prazo para nós.
Se o prazo não estiver escrito, use o prazo legal só quando tiver certeza (ex.: 15 dias úteis para contestar, CPC art. 335; 15 dias para apelar, art. 1.003, § 5º). Na dúvida, recuse.`,
      prompt,
      signal,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Briefing do prazo                                                   */
/* ------------------------------------------------------------------ */

export const briefingSchema = z.object({
  decidiu: z.string().describe("O que o juízo decidiu ou determinou, em 2 a 4 frases."),
  fazer: z.array(z.string()).describe("O que o escritório precisa fazer para cumprir o prazo, em passos curtos e concretos."),
  aFavor: z.array(z.string()).describe("Pontos dos autos que favorecem o nosso cliente, cada um com o evento ou documento de onde saiu."),
  contra: z.array(z.string()).describe("Pontos que pesam contra o nosso cliente, com o evento ou documento de onde saiu."),
  recusa,
});
export type Briefing = z.infer<typeof briefingSchema>;

export async function briefingDoPrazo(ia: Ia, entrada: { prazo: { tipo: string; fim: string; fundamento: string | null }; publicacao: string | null; contextoDoProcesso: string }, signal?: AbortSignal): Promise<Briefing> {
  if (entrada.publicacao !== null && semTeor(entrada.publicacao)) {
    throw new IaRecusou("Sem o teor do despacho, qualquer orientação seria palpite. Anexe a decisão para eu ler.");
  }
  const prompt = [
    `## Prazo\n${entrada.prazo.tipo}, vence em ${entrada.prazo.fim}${entrada.prazo.fundamento ? ` (${entrada.prazo.fundamento})` : ""}.`,
    entrada.publicacao ? `\n## Publicação que abriu o prazo\n${entrada.publicacao.trim()}` : "",
    `\n${entrada.contextoDoProcesso}`,
  ].join("\n");
  return exigir(
    await gerarObjeto(
      ia,
      "briefing-prazo",
      briefingSchema,
      `Prepare o briefing deste prazo para quem vai cumpri-lo: o que o juízo decidiu, o que fazer, o que está a nosso favor e o que está contra nós.
Cada ponto a favor ou contra cita a fonte nos autos ("laudo do evento 87", "petição da ré no evento 89").`,
      prompt,
      signal,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Resumo dos autos                                                    */
/* ------------------------------------------------------------------ */

export const resumoDosAutosSchema = z.object({
  oQueFazer: z.array(z.string()).describe("Próximas providências do escritório, das mais urgentes para as menos."),
  pontosDeAtencao: z.array(z.string()).describe("Riscos, prazos e fatos que merecem cuidado, com a fonte."),
  estrategia: z.string().describe("A linha de atuação que os autos sugerem, em 2 a 5 frases."),
  ultimoAto: z.string().describe('O último ato relevante e o que ele significa, ex.: "Evento 89 (28/10): a ré impugnou o laudo..."'),
  recusa,
});
export type ResumoDosAutos = z.infer<typeof resumoDosAutosSchema>;

export async function resumirAutos(ia: Ia, contextoDoProcesso: string, signal?: AbortSignal): Promise<ResumoDosAutos> {
  return exigir(
    await gerarObjeto(
      ia,
      "resumo-autos",
      resumoDosAutosSchema,
      "Resuma os autos para um advogado do escritório que vai pegar o caso agora: o que fazer, pontos de atenção, estratégia e o último ato.",
      contextoDoProcesso,
      signal,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Preparação de audiência                                             */
/* ------------------------------------------------------------------ */

export const preparacaoDeAudienciaSchema = z.object({
  oQueE: z.string().describe("Que audiência é e o que acontece nela, em 1 a 3 frases."),
  objetivo: z.string().describe("O que o nosso cliente precisa sair dela tendo conseguido."),
  controvertidos: z.array(z.string()).describe("Pontos controvertidos, com a fonte nos autos."),
  criticos: z.array(z.string()).describe("Pontos críticos para o nosso cliente: o que pode dar errado."),
  checklist: z.array(z.string()).describe("Itens práticos para levar ou conferir (documentos, testemunhas, procuração, link da sala)."),
  recusa,
});
export type PreparacaoDeAudiencia = z.infer<typeof preparacaoDeAudienciaSchema>;

export async function prepararAudiencia(ia: Ia, entrada: { audiencia: { tipo: string; em: string; porVideo: boolean }; contextoDoProcesso: string }, signal?: AbortSignal) {
  const a = entrada.audiencia;
  return exigir(
    await gerarObjeto(
      ia,
      "preparar-audiencia",
      preparacaoDeAudienciaSchema,
      "Prepare a equipe para a audiência: o que é, o objetivo, pontos controvertidos, pontos críticos e um checklist marcável.",
      `## Audiência\n${a.tipo}, ${a.em}, ${a.porVideo ? "por vídeo" : "presencial"}.\n\n${entrada.contextoDoProcesso}`,
      signal,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Resumo de atendimento                                               */
/* ------------------------------------------------------------------ */

export const resumoDeAtendimentoSchema = z.object({
  resumo: z.string().describe("O que o cliente contou e pediu, em 3 a 6 frases."),
  pedidos: z.array(z.string()).describe("O que o cliente quer do escritório."),
  documentosPendentes: z.array(z.string()).describe("Documentos que faltam e foram mencionados."),
  proximosPassos: z.array(z.string()).describe("O que o escritório combinou de fazer."),
  recusa,
});
export type ResumoDeAtendimento = z.infer<typeof resumoDeAtendimentoSchema>;

export async function resumirAtendimento(ia: Ia, transcricao: string, signal?: AbortSignal) {
  if (transcricao.trim().length < 80) throw new IaRecusou("A gravação ficou curta demais para resumir. Confira o áudio ou escreva o resumo.");
  return exigir(
    await gerarObjeto(ia, "resumo-atendimento", resumoDeAtendimentoSchema, "Resuma o atendimento gravado para a ficha do cliente.", transcricao, signal),
  );
}

/* ------------------------------------------------------------------ */
/* Conversa: chat do processo e Perguntar                              */
/* ------------------------------------------------------------------ */

export interface MensagemDaConversa {
  papel: "pessoa" | "ia";
  texto: string;
}

/** Resposta em texto corrido, aos poucos. `contexto` é o processo (chat do processo) ou o que a pessoa está vendo (Perguntar). */
export function conversar(ia: Ia, entrada: { metodo: "chat-processo" | "perguntar" | "jurisprudencia"; contexto: string; historico: MensagemDaConversa[] }, signal?: AbortSignal) {
  const messages: ModelMessage[] = entrada.historico.slice(-20).map((m) => (m.papel === "pessoa" ? { role: "user", content: m.texto } : { role: "assistant", content: m.texto }));
  const foco =
    entrada.metodo === "jurisprudencia"
      ? `Você ajuda a achar jurisprudência. Nunca invente ementa, número de processo, relator ou data: você não tem acesso a bases de jurisprudência verificadas.
Diga as teses e os termos de busca para o site do TJSC, STJ e STF, e avise que cada decisão precisa ser conferida na fonte.`
      : entrada.metodo === "chat-processo"
        ? "Responda perguntas sobre este processo usando só os autos abaixo. Cite o evento ou documento de cada afirmação."
        : "Responda à pergunta da equipe. Se ela for sobre um processo ou cliente, use o contexto abaixo; se o contexto não bastar, diga o que falta.";
  return streamText({
    model: ia.modelo(entrada.metodo),
    instructions: `${BASE.replace(/\n- Quando faltar informação[^\n]*/, "\n- Quando faltar informação, diga o que falta em vez de supor.")}\n\n${foco}\n\nResponda em texto simples, com parágrafos curtos e listas quando ajudar. Sem títulos grandes.\n\n${entrada.contexto}`,
    messages,
    abortSignal: signal,
    maxRetries: 1,
  });
}
