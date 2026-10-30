/**
 * As novidades na demonstração: a sentença da Lúcia lida pedido a pedido, dois
 * modelos do escritório, a pasta do José Antunes conferida e o retorno da equipe
 * sobre a IA. Tudo inventado e gravado como se a IA tivesse lido, para funcionar
 * sem o gateway. Roda no fim de criarDemonstracao (e de novo a cada --renovar).
 */
import { formatarDia, instanteLocal, somarDias, type Dia } from "@decreta/core";
import { analises, documentos, modelos, negocios, processos, publicacoes, retornosIa, withTenant, type Database } from "@decreta/db";
import { chaveDoDocumento, gerarDocx, MIME_DOCX, type Armazenamento } from "@decreta/documentos";
import { impressao, type Conferencia, type LeituraDaSentenca } from "@decreta/ia";
import { and, eq } from "drizzle-orm";
import { baseDaPastaAgora } from "../servicos/conferencia.ts";
import type { Quem } from "./dados.ts";

const LEITURA_LUCIA: LeituraDaSentenca = {
  tipo: "sentenca",
  resultado: "parcialmente_procedente",
  resumo:
    "Ganhamos a revisão da pensão desde o requerimento administrativo, com a gratificação incorporada; perdemos o dano moral. A sucumbência é recíproca: cada parte arca com uma parte das custas e dos honorários.",
  pedidos: [
    { pedido: "Revisão da pensão por morte com a gratificação", decisao: "acolhido", detalhe: "A gratificação que o marido recebia havia mais de dez anos entra na base da pensão." },
    { pedido: "Diferenças desde o requerimento administrativo", decisao: "acolhido", detalhe: "Os atrasados contam do pedido feito ao instituto, não da ação." },
    { pedido: "Dano moral", decisao: "rejeitado", detalhe: "O dispositivo afasta o dano moral sem dizer por quê." },
  ],
  valores: ["Diferenças da pensão desde o requerimento administrativo, a apurar na liquidação"],
  honorarios: "Sucumbência recíproca: custas e honorários divididos entre as partes.",
  recurso: { cabivel: "Apelação", dias: 15, fundamento: "art. 1.003, § 5º, CPC" },
  recorrer: ["Dano moral: a pensão foi paga a menor por anos, e a sentença não enfrentou a natureza alimentar do benefício."],
  manter: ["A gratificação incorporada integra a remuneração do servidor: argumento para as contrarrazões se o instituto apelar."],
  recusa: null,
};

const PASTA_DO_JOSE = [
  {
    nome: "Procuração - José Antunes.docx",
    texto:
      "PROCURAÇÃO. Outorgante: José Antunes, brasileiro, aposentado, CPF informado na carta de concessão, residente em Joinville/SC. Outorgados: Beatriz Souza (OAB/SC 41.233) e Rafael Freitas (OAB/SC 45.678). Poderes da cláusula ad judicia et extra, para propor ação de revisão de aposentadoria contra o INSS. Joinville, assinada há quatro dias.",
  },
  {
    nome: "Carta de concessão INSS.docx",
    texto:
      "INSTITUTO NACIONAL DO SEGURO SOCIAL. Carta de concessão. Segurado: José Antunes. Espécie 42 · aposentadoria por tempo de contribuição. Data de início do benefício: 2019. Renda mensal inicial calculada com os salários de contribuição a partir de julho de 1994.",
  },
  {
    nome: "Conta de luz março.docx",
    texto: "Celesc Distribuição. Titular: José Antunes. Rua das Palmeiras, 120, Joinville/SC. Mês de referência: março de 2026. Vencimento em abril de 2026.",
  },
];

const CONFERENCIA_DO_JOSE: Conferencia = {
  itens: [
    { item: "procuracao", situacao: "certo", detalhe: "Assinada há quatro dias, com poderes para a revisão contra o INSS.", documento: "Procuração - José Antunes.docx" },
    { item: "comprovante_residencia", situacao: "atencao", detalhe: "A conta de luz é de março de 2026: tem mais de 90 dias. Peça uma recente.", documento: "Conta de luz março.docx" },
    { item: "documento_identidade", situacao: "falta", detalhe: "Não há documento com foto na pasta.", documento: null },
    { item: "cpf", situacao: "atencao", detalhe: "A procuração remete o CPF à carta de concessão, que não traz o número. Confira no documento com foto.", documento: "Procuração - José Antunes.docx" },
    { item: "hipossuficiencia", situacao: "falta", detalhe: "Sem declaração. Precisa se for pedir justiça gratuita.", documento: null },
    { item: "contrato_honorarios", situacao: "falta", detalhe: "Sem contrato de honorários na pasta.", documento: null },
    { item: "litispendencia", situacao: "certo", detalhe: "Nenhum processo do escritório com José Antunes.", documento: null },
  ],
  outros: ["Para a revisão, junte também o CNIS atualizado: a carta de concessão não mostra os salários de antes de 1994."],
  resumo: "Ainda não dá para protocolar: falta o documento com foto e o comprovante de residência está velho.",
  recusa: null,
};

const MODELOS: { titulo: string; tipo: string; tese: string; assunto: string; quem: Quem; texto: string }[] = [
  {
    titulo: "Manifestação sobre laudo · invalidez no seguro de vida",
    tipo: "manifestacao-laudo",
    tese: "Laudo confirma invalidez total e permanente; indenização integral da apólice",
    assunto: "Seguro de vida em grupo",
    quem: "beatriz",
    texto: [
      "# Excelentíssimo Senhor Doutor Juiz de Direito da Vara Cível",
      "",
      "Processo nº [NÚMERO]",
      "",
      "**FULANA DE TAL**, já qualificada nos autos da ação de cobrança que move em face de **SEGURADORA EXEMPLO S.A.**, vem, por seus procuradores, manifestar-se sobre o laudo pericial.",
      "",
      "## 1. Do laudo",
      "",
      "O perito do juízo concluiu pela invalidez total e permanente para a atividade habitual, com nexo entre a doença e o afastamento. A conclusão responde aos quesitos das duas partes e se apoia nos exames juntados com a inicial.",
      "",
      "## 2. Da concordância",
      "",
      "A autora concorda com o laudo. A cláusula da apólice cobre a invalidez por doença, e a seguradora não juntou prova que afaste a conclusão do perito.",
      "",
      "## 3. Dos pedidos",
      "",
      "Pede a homologação do laudo e o julgamento do processo, com a condenação da ré ao pagamento do capital segurado, corrigido desde a negativa e com juros desde a citação.",
    ].join("\n"),
  },
  {
    titulo: "Contrarrazões de apelação · servidor público contra o município",
    tipo: "contrarrazoes",
    tese: "Sentença aplicou a lei municipal e o laudo; a apelação só repete a contestação",
    assunto: "Servidor público municipal",
    quem: "rafael",
    texto: [
      "# Excelentíssimo Senhor Doutor Juiz de Direito da Vara da Fazenda Pública",
      "",
      "Processo nº [NÚMERO]",
      "",
      "**FULANA DE TAL**, já qualificada, vem apresentar **CONTRARRAZÕES** à apelação interposta pelo **MUNICÍPIO EXEMPLO**.",
      "",
      "## 1. Da tempestividade",
      "",
      "As contrarrazões são apresentadas dentro do prazo de 15 dias úteis (art. 1.010, § 1º, CPC).",
      "",
      "## 2. Da manutenção da sentença",
      "",
      "A sentença aplicou a lei municipal que prevê o adicional e acolheu o laudo pericial, que não foi impugnado no momento próprio. A apelação repete os argumentos da contestação, já enfrentados, e não aponta erro na sentença.",
      "",
      "## 3. Do pedido",
      "",
      "Pede o desprovimento da apelação e a majoração dos honorários (art. 85, § 11, CPC).",
    ].join("\n"),
  },
];

export async function criarNovidades(db: Database, organizationId: string, o: { hoje: Dia; timezone: string; arquivos: Armazenamento; pessoas: Record<Quem, string> }): Promise<void> {
  const em = (dia: Dia, hora: string) => instanteLocal(dia, hora, o.timezone);
  const ontem = somarDias(o.hoje, -1);
  const arquivos: { chave: string; bytes: Uint8Array }[] = [];

  await withTenant(db, organizationId, async (tx) => {
    // Sentença da Lúcia (a publicação nova de ontem): lida pedido a pedido, à espera de quem confirme.
    const [pub] = await tx
      .select({ id: publicacoes.id, texto: publicacoes.texto, disponibilizadaEm: publicacoes.disponibilizadaEm, publicadaEm: publicacoes.publicadaEm })
      .from(publicacoes)
      .innerJoin(processos, eq(processos.id, publicacoes.processoId))
      .where(and(eq(processos.titulo, "Lúcia Matos × Instituto de Previdência de Brusque"), eq(publicacoes.tipoDocumento, "Sentença"), eq(publicacoes.situacao, "nova")));
    let leituraId: string | null = null;
    if (pub) {
      const [a] = await tx
        .insert(analises)
        .values({
          organizationId,
          alvo: "publicacao",
          alvoId: pub.id,
          acao: "ler-sentenca",
          situacao: "pronto",
          conteudo: LEITURA_LUCIA as unknown as Record<string, unknown>,
          fonte: `DJEN · ${formatarDia(pub.disponibilizadaEm)}`,
          base: impressao(pub.texto),
          createdAt: em(pub.publicadaEm, "06:42"),
        })
        .returning({ id: analises.id });
      leituraId = a!.id;
    }

    // Banco de teses: um modelo da Beatriz (vale para o prazo do laudo da Marina) e um do Rafael.
    await tx.insert(modelos).values(
      MODELOS.map((m, i) => ({ organizationId, titulo: m.titulo, tipo: m.tipo, tese: m.tese, assunto: m.assunto, texto: m.texto, criadoPor: o.pessoas[m.quem], createdAt: em(somarDias(o.hoje, -20 - i * 9), "17:30"), updatedAt: em(somarDias(o.hoje, -20 - i * 9), "17:30") })),
    );

    // A pasta do José Antunes, na triagem, conferida pela IA hoje cedo.
    const [jose] = await tx.select({ id: negocios.id }).from(negocios).where(eq(negocios.nome, "José Antunes"));
    if (jose) {
      for (const [i, d] of PASTA_DO_JOSE.entries()) {
        const id = crypto.randomUUID();
        const chave = chaveDoDocumento(organizationId, id);
        const bytes = await gerarDocx({ titulo: d.nome.replace(/\.docx$/, ""), texto: d.texto, timbre: { nome: "Documento do cliente" } });
        arquivos.push({ chave, bytes });
        await tx.insert(documentos).values({ id, organizationId, negocioId: jose.id, nome: d.nome, mime: MIME_DOCX, tamanho: bytes.length, paginas: 1, chave, texto: d.texto, enviadoPor: o.pessoas.rafael, createdAt: em(ontem, `16:0${i}`) });
      }
      const pasta = await baseDaPastaAgora(tx, { negocioId: jose.id }, o.timezone);
      if (pasta) {
        await tx.insert(analises).values({
          organizationId,
          alvo: "negocio",
          alvoId: jose.id,
          acao: "conferir-pasta",
          situacao: "pronto",
          conteudo: CONFERENCIA_DO_JOSE as unknown as Record<string, unknown>,
          fonte: `${pasta.documentos} documentos · ${formatarDia(o.hoje)}`,
          base: pasta.base,
          pedidaPor: o.pessoas.rafael,
          createdAt: em(o.hoje, "08:15"),
        });
      }
    }

    // O retorno da equipe sobre a IA, que os sócios veem em Configurações.
    const ultima = async (acao: string) => (await tx.select({ id: analises.id }).from(analises).where(and(eq(analises.acao, acao), eq(analises.situacao, "pronto"))).limit(1))[0]?.id;
    const briefing = await ultima("briefing-prazo");
    const resumo = await ultima("resumo-autos");
    const audiencia = await ultima("preparar-audiencia");
    const retornos = [
      briefing && { acao: "briefing-prazo", analiseId: briefing, userId: o.pessoas.beatriz, util: true, comentario: null },
      resumo && { acao: "resumo-autos", analiseId: resumo, userId: o.pessoas.rafael, util: true, comentario: null },
      leituraId && { acao: "ler-sentenca", analiseId: leituraId, userId: o.pessoas.rafael, util: true, comentario: null },
      audiencia && { acao: "preparar-audiencia", analiseId: audiencia, userId: o.pessoas.tiago, util: false, comentario: "Tratou o aditivo de 60 dias como se cobrisse todo o atraso; ele foi assinado depois da data de entrega." },
    ].filter((r): r is Exclude<typeof r, string | null | undefined> => !!r);
    if (retornos.length) await tx.insert(retornosIa).values(retornos.map((r) => ({ organizationId, ...r, createdAt: em(ontem, "18:20"), updatedAt: em(ontem, "18:20") })));
  });

  for (const a of arquivos) await o.arquivos.put(a.chave, a.bytes, MIME_DOCX);
}
