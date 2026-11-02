/**
 * Exportar tudo: o sócio leva uma cópia dos dados do escritório, sem passar pelo
 * suporte. A rotina de fundo monta planilhas CSV (uma por assunto) e junta os
 * documentos guardados, em um ou mais ZIP no armazenamento, e avisa quem pediu.
 *
 * Só o que é do escritório entra (tudo passa por `withTenant`). Não entram os
 * registros técnicos (captura, uso da IA), os segredos (hash de token e de link) nem
 * o texto extraído dos documentos, que se refaz do arquivo. Um escritório grande
 * vira mais de um ZIP, para a memória do servidor aguentar: cada um guarda no máximo
 * `LIMITE_DA_PARTE_BYTES` de documentos (um arquivo maior que isso vai sozinho).
 */
import { hojeEm } from "@decreta/core";
import {
  alvaras,
  analises,
  atendimentos,
  audiencias,
  auditoria,
  calculos,
  clientes,
  conversas,
  documentos,
  equipe,
  escritorios,
  exportacoes,
  member,
  mensagensCliente,
  mensagensIa,
  modelos,
  movimentacoes,
  negocios,
  organization,
  partes,
  pecas,
  prazos,
  processos,
  publicacoes,
  radarPrecedentes,
  resultados,
  retornosIa,
  revisoesDePeca,
  suspensoes,
  tarefas,
  user,
  withTenant,
  type Database,
  type ParteDaExportacao,
} from "@decreta/db";
import { compactarEmZip, type ArquivoParaZip, type Armazenamento } from "@decreta/documentos";
import { and, eq, getTableColumns, getTableName, isNotNull, lt } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Mailer } from "../email.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** Quantos dias a cópia fica disponível para baixar; depois os arquivos saem do armazenamento. */
export const DIAS_DA_COPIA = 7;
/** Quanto de documentos cabe em cada ZIP. */
export const LIMITE_DA_PARTE_BYTES = 50 * 1024 * 1024;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface DepsDaExportacao {
  db: Database;
  arquivos: Armazenamento;
  mailer?: Mailer;
  /** O endereço das telas, para o link do e-mail. */
  telas: string;
  log?: Log;
  limiteDaParte?: number;
  agora?: () => Date;
}

interface Planilha {
  /** O nome do arquivo, sem a extensão. */
  arquivo: string;
  tabela: PgTable;
  /** Colunas que não vão: segredo, chave interna do armazenamento ou texto que se refaz do arquivo. */
  fora?: string[];
}

/** Uma planilha por assunto do escritório. */
const PLANILHAS: Planilha[] = [
  { arquivo: "escritorio", tabela: escritorios },
  { arquivo: "clientes", tabela: clientes },
  { arquivo: "processos", tabela: processos },
  { arquivo: "partes", tabela: partes },
  { arquivo: "movimentacoes", tabela: movimentacoes },
  { arquivo: "publicacoes", tabela: publicacoes, fora: ["certidao"] },
  { arquivo: "prazos", tabela: prazos },
  { arquivo: "audiencias", tabela: audiencias },
  { arquivo: "resultados", tabela: resultados },
  { arquivo: "tarefas", tabela: tarefas },
  { arquivo: "documentos", tabela: documentos, fora: ["chave", "texto"] },
  { arquivo: "pecas", tabela: pecas },
  { arquivo: "revisoes_de_peca", tabela: revisoesDePeca },
  { arquivo: "modelos", tabela: modelos },
  { arquivo: "analises_da_ia", tabela: analises },
  { arquivo: "conversas", tabela: conversas },
  { arquivo: "mensagens_da_ia", tabela: mensagensIa },
  { arquivo: "retornos_sobre_a_ia", tabela: retornosIa },
  { arquivo: "atendimentos", tabela: atendimentos },
  { arquivo: "novos_negocios", tabela: negocios },
  { arquivo: "alvaras", tabela: alvaras },
  { arquivo: "mensagens_ao_cliente", tabela: mensagensCliente, fora: ["linkHash"] },
  { arquivo: "radar_de_precedentes", tabela: radarPrecedentes },
  { arquivo: "calculos", tabela: calculos },
  { arquivo: "suspensoes_do_calendario", tabela: suspensoes },
  { arquivo: "registro_de_atividades", tabela: auditoria },
];

/** A equipe tem planilha própria (nome, e-mail e papel vêm da conta). */
const PLANILHA_DA_EQUIPE = "equipe";

/** As tabelas do escritório que ficam de fora, e por quê: o teste confere que toda tabela nova foi decidida. */
export const NAO_EXPORTADAS: Record<string, string> = {
  capturas: "registro técnico das buscas no DJEN e no DataJud",
  cadernos_djen: "registro técnico da leitura dos cadernos do DJEN",
  avisos_enviados: "registro técnico dos resumos da manhã",
  uso_ia: "só números do gasto com a IA, sem conteúdo",
  tokens_mcp: "guarda só o hash de segredos",
  observacoes_da_ia: "comparação interna de modelos de IA",
  exportacoes: "as próprias cópias",
  eventos: "contagem do funil do Decreta, sem dado do escritório",
  member: "a equipe sai na planilha equipe",
  invitation: "convites pendentes, que o escritório pode refazer",
};

export function tabelasExportadas(): string[] {
  return [...PLANILHAS.map((p) => getTableName(p.tabela)), getTableName(equipe)];
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const BOM = "﻿";
/** Ponto e vírgula, como o Excel em português espera. */
const SEPARADOR = ";";

/** Célula de texto que o Excel leria como fórmula ganha um apóstrofo na frente. */
const contraFormula = (texto: string) => (/^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto);

function celula(valor: unknown, tipo: string): string {
  if (valor === null || valor === undefined) return "";
  let texto: string;
  if (valor instanceof Date) texto = valor.toISOString();
  else if (typeof valor === "object") texto = JSON.stringify(valor);
  else texto = String(valor);
  if (tipo === "PgText") texto = contraFormula(texto);
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

function montarCsv(cabecalho: string[], linhas: string[][]): string {
  return BOM + [cabecalho, ...linhas].map((l) => l.join(SEPARADOR)).join("\r\n") + "\r\n";
}

/** Todas as linhas da tabela do escritório, como CSV. `extras` acrescenta colunas calculadas ao fim. */
async function planilhaDaTabela(db: Database, organizationId: string, p: Planilha, extras: { nome: string; valor: (linha: Record<string, unknown>) => string }[] = []): Promise<{ csv: string; linhas: number }> {
  const colunas = Object.entries(getTableColumns(p.tabela)).filter(([prop]) => !p.fora?.includes(prop));
  const linhas = (await withTenant(db, organizationId, (tx) => tx.select().from(p.tabela))) as Record<string, unknown>[];
  const csv = montarCsv(
    [...colunas.map(([, c]) => c.name), ...extras.map((e) => e.nome)],
    linhas.map((l) => [...colunas.map(([prop, c]) => celula(l[prop], c.columnType)), ...extras.map((e) => celula(e.valor(l), "PgText"))]),
  );
  return { csv, linhas: linhas.length };
}

async function planilhaDaEquipe(db: Database, organizationId: string): Promise<{ csv: string; linhas: number }> {
  const linhas = await withTenant(db, organizationId, (tx) =>
    tx
      .select({ userId: member.userId, nome: user.name, email: user.email, papel: member.role, apelido: equipe.apelido, cargo: equipe.cargo, oabNumero: equipe.oabNumero, oabUf: equipe.oabUf, whatsapp: equipe.whatsapp, avisoManha: equipe.avisoManha })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(equipe, and(eq(equipe.userId, member.userId), eq(equipe.organizationId, member.organizationId)))
      .where(eq(member.organizationId, organizationId)),
  );
  const campos = ["userId", "nome", "email", "papel", "apelido", "cargo", "oabNumero", "oabUf", "whatsapp", "avisoManha"] as const;
  const cabecalho = ["user_id", "nome", "email", "papel", "apelido", "cargo", "oab_numero", "oab_uf", "whatsapp", "aviso_manha"];
  return { csv: montarCsv(cabecalho, linhas.map((l) => campos.map((c) => celula(l[c], "PgText")))), linhas: linhas.length };
}

/* ------------------------------------------------------------------ */
/* Documentos                                                          */
/* ------------------------------------------------------------------ */

/** O nome do arquivo dentro do ZIP: sem separador de pasta nem caractere que o Windows não aceita. */
function nomeNoZip(nome: string): string {
  const limpo = nome
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120);
  return limpo || "documento";
}

const MIB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export interface ResultadoDaExportacao {
  partes: ParteDaExportacao[];
  documentos: number;
  naoEncontrados: string[];
}

/** O arquivo que a rotina guarda de cada parte. */
export const chaveDaParte = (organizationId: string, exportacaoId: string, n: number) => `${organizationId}/exportacoes/${exportacaoId}/parte-${n}.zip`;

/**
 * Monta a cópia do escritório e grava o resultado na linha da exportação (e avisa por
 * e-mail quem pediu). Lança se algo falhar; quem chama marca a falha (`marcarExportacaoFalhou`).
 */
export async function prepararExportacao(deps: DepsDaExportacao, organizationId: string, exportacaoId: string): Promise<ResultadoDaExportacao> {
  const { db, arquivos } = deps;
  const agora = deps.agora ?? (() => new Date());
  const limite = deps.limiteDaParte ?? LIMITE_DA_PARTE_BYTES;
  const [org] = await db.select({ nome: organization.name, slug: organization.slug, timezone: organization.timezone }).from(organization).where(eq(organization.id, organizationId));
  if (!org) throw new Error("escritório não encontrado");
  const pedido = await withTenant(db, organizationId, async (tx) => (await tx.select({ pedidaPor: exportacoes.pedidaPor }).from(exportacoes).where(eq(exportacoes.id, exportacaoId)))[0]);
  if (!pedido) throw new Error("exportação não encontrada");

  // Os documentos: cada arquivo entra no ZIP em que couber; o primeiro ZIP leva também as planilhas.
  const docs = await withTenant(db, organizationId, (tx) => tx.select({ id: documentos.id, nome: documentos.nome, chave: documentos.chave }).from(documentos).orderBy(documentos.createdAt));
  const certidoes = await withTenant(db, organizationId, (tx) =>
    tx.select({ id: publicacoes.id, idExterno: publicacoes.idExterno, chave: publicacoes.certidao }).from(publicacoes).where(isNotNull(publicacoes.certidao)).orderBy(publicacoes.createdAt),
  );
  const caminhoDoDocumento = new Map<string, string>();
  const caminhoDaCertidao = new Map<string, string>();
  const quero: { caminho: string; chave: string }[] = [];
  for (const d of docs) {
    const caminho = `documentos/${d.id.slice(0, 8)}-${nomeNoZip(d.nome)}`;
    caminhoDoDocumento.set(d.id, caminho);
    quero.push({ caminho, chave: d.chave });
  }
  for (const c of certidoes) {
    const caminho = `certidoes/certidao-${nomeNoZip(c.idExterno)}.pdf`;
    caminhoDaCertidao.set(c.id, caminho);
    quero.push({ caminho, chave: c.chave! });
  }

  const guardadas: { n: number; chave: string; tamanho: number }[] = [];
  const naoEncontrados: string[] = [];
  let proxima = 2;
  let atual: ArquivoParaZip[] = [];
  let atualBytes = 0;
  let primeira: ArquivoParaZip[] | null = null;
  let arquivosNoZip = 0;
  const fecharAtual = async () => {
    if (!atual.length) return;
    if (!primeira) primeira = atual;
    else {
      const n = proxima++;
      const bytes = await compactarEmZip(atual);
      await arquivos.put(chaveDaParte(organizationId, exportacaoId, n), bytes, "application/zip");
      guardadas.push({ n, chave: chaveDaParte(organizationId, exportacaoId, n), tamanho: bytes.length });
    }
    atual = [];
    atualBytes = 0;
  };
  for (const q of quero) {
    const bytes = await arquivos.read(q.chave).catch(() => null);
    if (!bytes) {
      naoEncontrados.push(q.caminho);
      continue;
    }
    if (atual.length && atualBytes + bytes.length > limite) await fecharAtual();
    atual.push({ nome: q.caminho, conteudo: bytes, comprimir: false });
    atualBytes += bytes.length;
    arquivosNoZip++;
  }
  await fecharAtual();

  // As planilhas, com o caminho de cada arquivo no ZIP.
  const planilhas: ArquivoParaZip[] = [];
  const contagens: [string, number][] = [];
  for (const p of PLANILHAS) {
    const extras =
      p.arquivo === "documentos"
        ? [{ nome: "arquivo", valor: (l: Record<string, unknown>) => caminhoDoDocumento.get(String(l.id)) ?? "" }]
        : p.arquivo === "publicacoes"
          ? [{ nome: "certidao_arquivo", valor: (l: Record<string, unknown>) => caminhoDaCertidao.get(String(l.id)) ?? "" }]
          : [];
    const r = await planilhaDaTabela(db, organizationId, p, extras);
    planilhas.push({ nome: `planilhas/${p.arquivo}.csv`, conteudo: r.csv });
    contagens.push([p.arquivo, r.linhas]);
  }
  const eq_ = await planilhaDaEquipe(db, organizationId);
  planilhas.push({ nome: `planilhas/${PLANILHA_DA_EQUIPE}.csv`, conteudo: eq_.csv });
  contagens.push([PLANILHA_DA_EQUIPE, eq_.linhas]);

  const hoje = hojeEm(org.timezone, agora());
  const total = 1 + guardadas.length;
  const leiaMe = textoDoLeiaMe({ escritorio: org.nome, dia: hoje, contagens, documentos: arquivosNoZip, naoEncontrados, partes: total });
  const bytesDaPrimeira = await compactarEmZip([{ nome: "LEIA-ME.txt", conteudo: leiaMe }, ...planilhas, ...((primeira as ArquivoParaZip[] | null) ?? [])]);
  await arquivos.put(chaveDaParte(organizationId, exportacaoId, 1), bytesDaPrimeira, "application/zip");
  guardadas.push({ n: 1, chave: chaveDaParte(organizationId, exportacaoId, 1), tamanho: bytesDaPrimeira.length });

  const nomeBase = `decreta-${org.slug}-${hoje}`;
  const partesDaCopia: ParteDaExportacao[] = guardadas
    .sort((a, b) => a.n - b.n)
    .map((g) => ({ n: g.n, nome: total === 1 ? `${nomeBase}.zip` : `${nomeBase}-parte-${g.n}-de-${total}.zip`, chave: g.chave, tamanho: g.tamanho }));
  const prontaEm = agora();
  await withTenant(db, organizationId, (tx) =>
    tx
      .update(exportacoes)
      .set({ situacao: "pronta", partes: partesDaCopia, documentos: arquivosNoZip, erro: null, prontaEm, expiraEm: new Date(prontaEm.getTime() + DIAS_DA_COPIA * DIA_MS) })
      .where(eq(exportacoes.id, exportacaoId)),
  );
  deps.log?.("cópia dos dados pronta", { organizationId, exportacaoId, partes: total, documentos: arquivosNoZip, naoEncontrados: naoEncontrados.length });
  await avisarQuemPediu(deps, org.nome, pedido.pedidaPor);
  return { partes: partesDaCopia, documentos: arquivosNoZip, naoEncontrados };
}

async function avisarQuemPediu(deps: DepsDaExportacao, escritorio: string, userId: string | null): Promise<void> {
  if (!deps.mailer || !userId) return;
  try {
    const [u] = await deps.db.select({ nome: user.name, email: user.email }).from(user).where(eq(user.id, userId));
    if (!u) return;
    await deps.mailer.send({
      to: u.email,
      subject: `A cópia dos dados de ${escritorio} está pronta`,
      paragraphs: [`Olá, ${u.nome}.`, `A cópia dos dados de ${escritorio} que você pediu no Decreta está pronta: planilhas em CSV e os documentos guardados. Ela fica disponível por ${DIAS_DA_COPIA} dias, em Configurações, na aba Dados.`],
      action: { label: "Baixar a cópia", url: `${deps.telas.replace(/\/$/, "")}/configuracoes` },
    });
  } catch (err) {
    // O aviso é um favor: a cópia já está pronta, e a tela mostra.
    deps.log?.("aviso da cópia pronta não saiu", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function marcarExportacaoFalhou(db: Database, organizationId: string, exportacaoId: string, erro: unknown): Promise<void> {
  const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
  await withTenant(db, organizationId, (tx) => tx.update(exportacoes).set({ situacao: "falhou", erro: mensagem }).where(eq(exportacoes.id, exportacaoId)));
}

/** Tira do armazenamento as cópias que passaram do prazo e apaga as linhas delas. */
export async function apagarExportacoesVencidas(deps: { db: Database; arquivos: Armazenamento; log?: Log }, agora = new Date()): Promise<number> {
  let apagadas = 0;
  for (const { id } of await deps.db.select({ id: organization.id }).from(organization)) {
    const vencidas = await withTenant(deps.db, id, (tx) => tx.select({ id: exportacoes.id, partes: exportacoes.partes }).from(exportacoes).where(and(isNotNull(exportacoes.expiraEm), lt(exportacoes.expiraEm, agora))));
    for (const v of vencidas) {
      for (const p of v.partes) await deps.arquivos.delete(p.chave);
      await withTenant(deps.db, id, (tx) => tx.delete(exportacoes).where(eq(exportacoes.id, v.id)));
      apagadas++;
    }
  }
  if (apagadas) deps.log?.("cópias vencidas apagadas", { apagadas });
  return apagadas;
}

/* ------------------------------------------------------------------ */
/* LEIA-ME                                                             */
/* ------------------------------------------------------------------ */

function textoDoLeiaMe(d: { escritorio: string; dia: string; contagens: [string, number][]; documentos: number; naoEncontrados: string[]; partes: number }): string {
  const [a, m, dia] = d.dia.split("-");
  return [
    `Cópia dos dados de ${d.escritorio}`,
    `Preparada pelo Decreta em ${dia}/${m}/${a}.`,
    "",
    "O que tem aqui",
    "",
    "- planilhas/: uma planilha CSV por assunto do escritório, com a quantidade de linhas abaixo.",
    `- documentos/: os ${d.documentos} arquivos guardados no Decreta (processos, clientes, peças geradas, logo). A coluna "arquivo" da planilha de documentos diz onde cada um está.`,
    "- certidoes/: as certidões de publicação do DJEN, a prova da data. A coluna \"certidao_arquivo\" da planilha de publicações diz onde cada uma está.",
    ...(d.partes > 1 ? [`- Esta cópia tem ${d.partes} arquivos ZIP: este traz as planilhas e os primeiros documentos, e os outros trazem o resto dos documentos.`] : []),
    "",
    "Como abrir as planilhas",
    "",
    "- São arquivos de texto em UTF-8, com os campos separados por ponto e vírgula. No Excel e no LibreOffice abrem direto, com os acentos certos.",
    "- Os nomes das colunas são os do banco do Decreta. As colunas que terminam em _id ligam as planilhas entre si (processo_id aponta para o id da planilha de processos).",
    "- Valores com estrutura (listas e quadros) saem como JSON dentro da célula.",
    "- Texto que começaria com =, +, - ou @ leva um apóstrofo na frente, para o Excel não tratar como fórmula.",
    "",
    "Linhas de cada planilha",
    "",
    ...d.contagens.map(([nome, n]) => `- ${nome}: ${n}`),
    "",
    "O que não vem na cópia",
    "",
    "- O texto extraído dos documentos (sai de novo do arquivo), os segredos (senhas, hash de token e de link de envio) e os registros técnicos: buscas no DJEN e no DataJud, resumos da manhã enviados e gasto com a IA.",
    ...(d.naoEncontrados.length ? ["", "Arquivos que não foram encontrados no armazenamento e por isso não entraram", "", ...d.naoEncontrados.map((n) => `- ${n}`)] : []),
    "",
    `Os arquivos da cópia ficam disponíveis no Decreta por ${DIAS_DA_COPIA} dias (cada ZIP até ${MIB(LIMITE_DA_PARTE_BYTES)} de documentos).`,
    "",
  ].join("\r\n");
}
