/**
 * Cada fato da peça aponta para o trecho: monta as fontes numeradas do processo,
 * pede à IA a ligação de cada afirmação e deixa o código conferir. Sem a IA
 * (cliente que recusou, IA desligada ou fora do ar), o código confere o que dá:
 * datas, valores, eventos, folhas e julgados. O resultado fica guardado na peça.
 */
import { conferirFatos, diaDoInstante, extrairCitacoes, formatarDia, type FatoListado } from "@decreta/core";
import { acervoDocumentos, clientes, documentos, movimentacoes, organization, pecas, prazos, processos, publicacoes, withTenant, type ConferenciaDaPeca, type Database, type Tx } from "@decreta/db";
import { colherChamadas, ligarFatosDaPeca, type ChamadaDaIa, type FonteParaIa, type Ia } from "@decreta/ia";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { hashDoTexto } from "./acervo.ts";
import { calculosParaPeca } from "./calculos.ts";
import { semIa } from "./contexto.ts";
import { contaDoPrazo } from "./prazos.ts";
import { procedenciaDe } from "./procedencia.ts";

export class TextoMudou extends Error {}

/** O material que a peça pode usar, com a referência de cada fonte: é o que a IA aponta e o código confere. */
export async function fontesDaPeca(
  tx: Tx,
  a: { organizationId: string; processoId: string; prazo: typeof prazos.$inferSelect | null; tipo: string; instrucoes: string | null },
): Promise<{ fontes: FonteParaIa[]; eventos: number[] }> {
  const [p] = await tx.select({ processo: processos, cliente: clientes.nome, fuso: organization.timezone }).from(processos).leftJoin(clientes, eq(clientes.id, processos.clienteId)).leftJoin(organization, eq(organization.id, processos.organizationId)).where(eq(processos.id, a.processoId));
  if (!p) return { fontes: [], eventos: [] };
  const fuso = p.fuso ?? "America/Sao_Paulo";
  const [docs, pubs, movs, contas] = await Promise.all([
    tx
      .select({ id: documentos.id, nome: documentos.nome, evento: documentos.evento, texto: documentos.texto, alertas: documentos.alertas, paginas: documentos.paginas })
      .from(documentos)
      .where(and(eq(documentos.processoId, a.processoId), isNotNull(documentos.texto)))
      .orderBy(desc(documentos.createdAt))
      .limit(30),
    tx.select().from(publicacoes).where(eq(publicacoes.processoId, a.processoId)).orderBy(desc(publicacoes.disponibilizadaEm)).limit(10),
    tx.select().from(movimentacoes).where(eq(movimentacoes.processoId, a.processoId)).orderBy(desc(movimentacoes.em)).limit(120),
    calculosParaPeca(tx, a.processoId, a.tipo),
  ]);
  const fontes: FonteParaIa[] = docs.map((d, i) => ({ ref: `D${i + 1}`, tipo: "documento", rotulo: d.evento != null ? `${d.nome} · evento ${d.evento}` : d.nome, texto: d.texto ?? "", documentoId: d.id, nome: d.nome, evento: d.evento, paginas: d.paginas, alerta: d.alertas.length > 0 }));
  fontes.push(...pubs.map((x, i): FonteParaIa => ({ ref: `P${i + 1}`, tipo: "publicacao", rotulo: `Publicação de ${formatarDia(x.disponibilizadaEm)}`, texto: x.texto })));
  if (movs.length) {
    const linhas = movs.map((m) => `${formatarDia(diaDoInstante(m.em, fuso))}${m.evento != null ? ` (evento ${m.evento})` : ""}: ${m.titulo}${m.descricao ? `. ${m.descricao}` : ""}`);
    fontes.push({ ref: "A", tipo: "andamento", rotulo: "Andamentos do processo", texto: linhas.join("\n") });
  }
  const pr = p.processo;
  fontes.push({
    ref: "C",
    tipo: "cadastro",
    rotulo: "Cadastro do processo",
    texto: [`Número: ${pr.cnj ?? "sem número"}`, `Partes: ${pr.titulo}`, pr.classe && `Classe: ${pr.classe}`, pr.assunto && `Assunto: ${pr.assunto}`, (pr.orgao || pr.comarca) && `Juízo: ${[pr.orgao, pr.comarca].filter(Boolean).join(", ")}`, pr.valorCausa && `Valor da causa: R$ ${pr.valorCausa.replace(".", ",")}`, p.cliente && `Nosso cliente: ${p.cliente}`].filter(Boolean).join("\n"),
  });
  if (a.prazo) {
    const conta = await contaDoPrazo(tx, a.organizationId, a.prazo);
    fontes.push({ ref: "Z", tipo: "prazo", rotulo: "Conta do prazo", texto: [`${a.prazo.tipo}, vence em ${formatarDia(a.prazo.fim)}.`, conta.tempestividade].filter(Boolean).join("\n") });
  }
  fontes.push(...contas.map((k, i): FonteParaIa => ({ ref: `K${i + 1}`, tipo: "calculo", rotulo: `Memória de cálculo · ${k.titulo}`, texto: k.memoria })));
  if (a.instrucoes?.trim()) fontes.push({ ref: "I", tipo: "instrucoes", rotulo: "Instruções de quem pediu", texto: a.instrucoes.trim() });
  return { fontes, eventos: movs.map((m) => m.evento).filter((e): e is number => e != null) };
}

export interface DepsDosFatos {
  db: Database;
  ia: Ia | null;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

/**
 * Confere a peça e guarda o resultado. O texto recebe as marcas [A COMPROVAR: ...];
 * se ninguém mexeu nele desde a geração, a marca faz parte da versão entregue.
 * Devolve nulo quando a peça não existe; `TextoMudou` se alguém salvou no meio.
 */
export async function conferirFatosDaPeca(deps: DepsDosFatos, organizationId: string, pecaId: string, signal?: AbortSignal): Promise<{ texto: string; conferencia: ConferenciaDaPeca } | null> {
  const lido = await withTenant(deps.db, organizationId, async (tx) => {
    const [peca] = await tx.select().from(pecas).where(eq(pecas.id, pecaId));
    if (!peca) return null;
    const [prazo] = peca.prazoId ? await tx.select().from(prazos).where(eq(prazos.id, peca.prazoId)) : [];
    const { fontes, eventos } = await fontesDaPeca(tx, { organizationId, processoId: peca.processoId, prazo: prazo ?? null, tipo: peca.tipo, instrucoes: peca.instrucoes });
    const chaves = extrairCitacoes(peca.texto)
      .filter((c) => c.tipo !== "dispositivo")
      .map((c) => c.chave);
    const noAcervo = chaves.length ? await tx.select({ chave: acervoDocumentos.chave }).from(acervoDocumentos).where(inArray(acervoDocumentos.chave, chaves)) : [];
    return { peca, fontes, eventos, recusou: await semIa(tx, { processoId: peca.processoId }), aceitas: new Set([...noAcervo.map((d) => d.chave), ...peca.julgados.map((j) => j.chave)]) };
  });
  if (!lido) return null;
  const { peca } = lido;

  let listados: FatoListado[] | null = null;
  let semLigacao: ConferenciaDaPeca["semLigacao"] = lido.recusou ? "cliente_sem_ia" : deps.ia ? null : "ia_desligada";
  const chamadas: ChamadaDaIa[] = [];
  if (!semLigacao && peca.texto.trim()) {
    try {
      listados = await colherChamadas(chamadas, () => ligarFatosDaPeca(deps.ia!, { texto: peca.texto, fontes: lido.fontes }, signal));
    } catch (err) {
      semLigacao = "ia_falhou";
      deps.log("a ligação dos fatos falhou", { pecaId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const r = conferirFatos({ texto: peca.texto, fontes: lido.fontes, listados, eventos: lido.eventos, citacoesAceitas: lido.aceitas });
  const conferencia: ConferenciaDaPeca = { em: new Date().toISOString(), hashDoTexto: hashDoTexto(r.texto), semLigacao, fatos: r.fatos, avisos: r.avisos, resumo: r.resumo, procedencia: chamadas.length ? procedenciaDe(chamadas) : null };
  const mudouOTexto = r.texto !== peca.texto;
  const gravou = await withTenant(deps.db, organizationId, (tx) =>
    tx
      .update(pecas)
      .set({
        conferencia,
        texto: r.texto,
        // A marca é da entrega, não da pessoa: só depois de editar é que a versão da IA fica para trás.
        ...(peca.textoGerado === peca.texto ? { textoGerado: r.texto } : {}),
        // A revisão vale para o texto que a pessoa leu.
        ...(mudouOTexto && peca.situacao === "revisada" ? { situacao: "rascunho" as const, revisadaPor: null, revisadaEm: null } : {}),
      })
      .where(and(eq(pecas.id, pecaId), eq(pecas.texto, peca.texto)))
      .returning({ id: pecas.id }),
  );
  if (!gravou.length) throw new TextoMudou();
  return { texto: r.texto, conferencia };
}
