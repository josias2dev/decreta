/**
 * A IA de mentira da prévia, para Gerar peça: escreve uma peça do tipo pedido,
 * parte por parte (as do catálogo), com as instruções de quem pediu nos
 * pedidos, e manda aos poucos como a de verdade. Texto genérico sobre o caso
 * inventado da demonstração; os trechos a completar vêm marcados.
 */
import { partesDaPeca } from "@decreta/core";

interface Pedido {
  tipo: { id: string; nome: string; estrutura: string };
  instrucoes: string;
  processo: { titulo: string; cnj: string | null; orgao: string | null };
  assina: { nome: string; oab: string | null } | null;
}

const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const PARAGRAFOS = [
  "Os autos mostram com clareza o ponto tratado aqui. Os documentos juntados pela própria parte contrária confirmam a versão da cliente, em especial [COMPLETAR: documento e evento].",
  "A outra parte não trouxe nenhum elemento capaz de afastar essa conclusão. Limitou-se a negar de forma genérica, sem impugnar especificamente os fatos e os documentos apresentados.",
  "Nesse ponto, a prova produzida é coerente do começo ao fim, e o que se pede tem apoio direto nela. [JURISPRUDÊNCIA: tese a pesquisar]",
  "Não há, portanto, razão para decidir de outro modo. O conjunto dos autos leva à mesma conclusão por qualquer ângulo que se examine.",
];

export function pecaDeMentira({ tipo, instrucoes, processo, assina }: Pedido): string {
  const { enderecamento, partes } = partesDaPeca(tipo.estrutura);
  const [autor, reu] = processo.titulo.split(" × ");
  const pedidos = instrucoes
    .split(/[;.\n]+/)
    .map((s) => s.trim().replace(/^ex\.:\s*/i, ""))
    .filter((s) => s.length > 2);
  const linhas: string[] = [];
  if (enderecamento) linhas.push(`# Excelentíssimo Senhor Doutor Juiz de Direito da ${processo.orgao ?? "[COMPLETAR: vara]"} da Comarca de Joinville/SC`, `Processo nº ${processo.cnj ?? "[COMPLETAR: número]"}`);
  linhas.push(`**${(autor ?? "A parte autora").toLocaleUpperCase("pt-BR")}**, já qualificada nos autos da ação que move em face de **${(reu ?? "a parte ré").toLocaleUpperCase("pt-BR")}**, vem, por seus advogados, apresentar **${tipo.nome.toLocaleUpperCase("pt-BR")}**, pelos fundamentos a seguir.`);
  const lista = tipo.id === "outro" ? ["Dos fatos", "Do direito", "Dos pedidos"] : partes;
  const ultimaDePedido = lista.findLastIndex((p) => /pedido/i.test(p));
  lista.forEach((parte, i) => {
    linhas.push(`## ${ROMANOS[i] ?? i + 1} – ${parte}`);
    if (i === (ultimaDePedido >= 0 ? ultimaDePedido : lista.length - 1) && pedidos.length) {
      linhas.push("Diante do exposto, requer:", ...pedidos.map((p) => `- ${p[0]!.toLocaleLowerCase("pt-BR")}${p.slice(1)};`));
    } else {
      linhas.push(PARAGRAFOS[i % PARAGRAFOS.length]!, PARAGRAFOS[(i + 1) % PARAGRAFOS.length]!);
    }
  });
  linhas.push("Nestes termos, pede deferimento.", "[cidade], [data].", `${assina?.nome ?? "[COMPLETAR: advogado]"}${assina?.oab ? `\n${assina.oab}` : ""}`);
  return linhas.join("\n\n");
}

/** O texto em pedaços pequenos, no ritmo de quem escreve. */
export function aosPedacos(texto: string): ReadableStream<Uint8Array> {
  const cod = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    async pull(controle) {
      if (i >= texto.length) return controle.close();
      await new Promise((r) => setTimeout(r, 28));
      const n = 18 + Math.floor(Math.random() * 30);
      controle.enqueue(cod.encode(texto.slice(i, i + n)));
      i += n;
    },
  });
}
