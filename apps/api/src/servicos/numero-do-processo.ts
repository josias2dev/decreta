/**
 * Achar o número de um processo salvo sem ele: nas publicações que a captura já
 * leu pelas OABs da equipe e não ligou a processo nenhum, procura o nome das partes
 * nos destinatários e no teor. Nada sai para fora: a busca no Diário por nome de
 * parte não foi conferida contra o serviço, e a captura pela OAB já traz o que é da equipe.
 */
import type { Dia } from "@decreta/core";
import { clientes, partes, processos, publicacoes, type Tx } from "@decreta/db";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { nomeParaComparar } from "./consulta.ts";

export interface CandidatoAoNumero {
  cnj: string;
  tribunal: string | null;
  orgao: string | null;
  /** O dia da publicação mais recente com este número. */
  dia: Dia;
  /** O nome que combinou, como está no processo. */
  nome: string;
}

/** Quantas publicações sem processo a busca olha, das mais recentes para trás, e quantos números devolve. */
const PUBLICACOES_OLHADAS = 500;
const CANDIDATOS = 5;
/** Nome curto demais casaria com qualquer texto. */
const NOME_MINIMO = 6;

/** O processo existe (a rota confere antes): os nomes dele são as partes, o cliente e os lados do título. */
export async function candidatosAoNumero(tx: Tx, processo: { id: string; titulo: string; clienteId: string | null }): Promise<CandidatoAoNumero[]> {
  const dasPartes = await tx.select({ nome: partes.nome }).from(partes).where(eq(partes.processoId, processo.id));
  const [cliente] = processo.clienteId ? await tx.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, processo.clienteId)) : [];
  const nomes = new Map<string, string>();
  for (const nome of [...dasPartes.map((p) => p.nome), ...(cliente ? [cliente.nome] : []), ...processo.titulo.split(" × ")]) {
    const chave = nomeParaComparar(nome);
    if (chave.length >= NOME_MINIMO && !nomes.has(chave)) nomes.set(chave, nome.trim());
  }
  if (!nomes.size) return [];

  const pubs = await tx
    .select({ cnj: publicacoes.cnj, tribunal: publicacoes.tribunal, orgao: publicacoes.orgao, dia: publicacoes.disponibilizadaEm, destinatarios: publicacoes.destinatarios, texto: publicacoes.texto })
    .from(publicacoes)
    .where(and(isNull(publicacoes.processoId), isNotNull(publicacoes.cnj), isNull(publicacoes.canceladaEm)))
    .orderBy(desc(publicacoes.disponibilizadaEm))
    .limit(PUBLICACOES_OLHADAS);
  const numeros = [...new Set(pubs.map((p) => p.cnj!))];
  const naCarteira = numeros.length ? new Set((await tx.select({ cnj: processos.cnj }).from(processos).where(inArray(processos.cnj, numeros))).map((p) => p.cnj)) : new Set<string | null>();

  const achados = new Map<string, CandidatoAoNumero>();
  for (const p of pubs) {
    if (achados.has(p.cnj!) || naCarteira.has(p.cnj)) continue;
    const onde = [...p.destinatarios.map((d) => nomeParaComparar(d.nome)), nomeParaComparar(p.texto)];
    const achado = [...nomes].find(([chave]) => onde.some((texto) => texto.includes(chave)));
    if (achado) achados.set(p.cnj!, { cnj: p.cnj!, tribunal: p.tribunal, orgao: p.orgao, dia: p.dia, nome: achado[1] });
  }
  return [...achados.values()].slice(0, CANDIDATOS);
}
