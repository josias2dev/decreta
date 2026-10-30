/**
 * Os arquivos dos documentos da amostra (e2e/amostras/documentos.json), para a
 * prévia abrir cada um no painel: as cópias dos autos saem do mesmo DOCX que a
 * demonstração gera, e a procuração e o recibo vêm de demonstracao/arquivos.
 *
 *   bun apps/api/test/arquivos-das-amostras.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gerarDocx } from "@decreta/documentos";
import { ARQUIVOS_DA_MARINA, PROCESSOS } from "../src/demonstracao/dados.ts";

const AMOSTRAS = new URL("../../web/e2e/amostras/", import.meta.url);
const DESTINO = new URL("arquivos/", AMOSTRAS);
const EXTENSAO: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg" };

const { corpo } = JSON.parse(readFileSync(new URL("documentos.json", AMOSTRAS), "utf8")) as { corpo: { itens: { id: string; nome: string; mime: string }[] } };
const dosAutos = new Map((PROCESSOS.marina!.movimentacoes ?? []).flatMap((m) => (m.documento ? [[m.documento.nome, m.documento.texto] as const] : [])));
mkdirSync(DESTINO, { recursive: true });
for (const d of corpo.itens) {
  const texto = dosAutos.get(d.nome);
  const enviado = ARQUIVOS_DA_MARINA.find((a) => a.nome === d.nome);
  const bytes = texto !== undefined ? await gerarDocx({ titulo: d.nome.replace(/\.docx$/, ""), texto, timbre: { nome: "Cópia dos autos" } }) : enviado ? readFileSync(new URL(`../src/demonstracao/arquivos/${enviado.arquivo}`, import.meta.url)) : null;
  if (!bytes) throw new Error(`Sem arquivo para ${d.nome}`);
  writeFileSync(new URL(`${d.id}.${EXTENSAO[d.mime] ?? "docx"}`, DESTINO), bytes);
}
console.log(`${corpo.itens.length} arquivos em ${DESTINO.pathname}`);
