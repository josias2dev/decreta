/**
 * O ajuste da peça por conversa. A IA não devolve o texto inteiro: devolve as
 * trocas, e o código as aplica, então o que ela não tocou fica letra por letra.
 * A prévia mostra o antes e o depois, com o que saiu e o que entrou.
 */

export interface TrocaDeTexto {
  de: string;
  para: string;
}

export function aplicarTrocas(texto: string, trocas: readonly TrocaDeTexto[]): { texto: string; naoAplicadas: string[] } {
  let saida = texto;
  const naoAplicadas: string[] = [];
  for (const { de, para } of trocas) {
    if (!de.trim()) {
      naoAplicadas.push(de);
      continue;
    }
    let inicio = saida.indexOf(de);
    let tamanho = de.length;
    if (inicio < 0) {
      const flexivel = new RegExp(de.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "u").exec(saida);
      if (flexivel) {
        inicio = flexivel.index;
        tamanho = flexivel[0].length;
      }
    }
    if (inicio < 0) {
      naoAplicadas.push(de);
      continue;
    }
    saida = saida.slice(0, inicio) + para + saida.slice(inicio + tamanho);
  }
  return { texto: saida, naoAplicadas };
}

export interface ParteDaDiferenca {
  tipo: "igual" | "removido" | "adicionado";
  texto: string;
}

/** Acima disso, o alinhamento pesa demais: o bloco inteiro sai como trocado. */
const TETO_DO_ALINHAMENTO = 4_000_000;
const ehEspaco = (s: string) => !s.trim();

/** Alinha dois textos em pedaços, preferindo casar palavras a casar espaços. */
function alinhar(a: readonly string[], b: readonly string[]): ParteDaDiferenca[] {
  let comeco = 0;
  while (comeco < a.length && comeco < b.length && a[comeco] === b[comeco]) comeco++;
  let fimA = a.length;
  let fimB = b.length;
  while (fimA > comeco && fimB > comeco && a[fimA - 1] === b[fimB - 1]) {
    fimA--;
    fimB--;
  }
  const n = fimA - comeco;
  const m = fimB - comeco;
  const saida: ParteDaDiferenca[] = a.slice(0, comeco).map((texto) => ({ tipo: "igual", texto }));
  if (n * m > TETO_DO_ALINHAMENTO) {
    saida.push(...a.slice(comeco, fimA).map((texto): ParteDaDiferenca => ({ tipo: "removido", texto })));
    saida.push(...b.slice(comeco, fimB).map((texto): ParteDaDiferenca => ({ tipo: "adicionado", texto })));
  } else {
    const largura = m + 1;
    const nota = new Int32Array((n + 1) * largura);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const x = a[comeco + i]!;
        const casa = x === b[comeco + j]! ? nota[(i + 1) * largura + j + 1]! + (ehEspaco(x) ? 1 : 10) : -1;
        nota[i * largura + j] = Math.max(casa, nota[(i + 1) * largura + j]!, nota[i * largura + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      const x = a[comeco + i];
      if (i < n && j < m && x === b[comeco + j] && nota[i * largura + j] === nota[(i + 1) * largura + j + 1]! + (ehEspaco(x!) ? 1 : 10)) {
        saida.push({ tipo: "igual", texto: x! });
        i++;
        j++;
      } else if (i < n && (j >= m || nota[i * largura + j] === nota[(i + 1) * largura + j])) {
        saida.push({ tipo: "removido", texto: x! });
        i++;
      } else {
        saida.push({ tipo: "adicionado", texto: b[comeco + j]! });
        j++;
      }
    }
  }
  saida.push(...a.slice(fimA).map((texto): ParteDaDiferenca => ({ tipo: "igual", texto })));
  return saida;
}

/** Junta o que é do mesmo tipo. O espaço entre duas mudanças entra nas duas, para o trecho trocado se ler inteiro; dentro de cada mudança, primeiro o que saiu. */
function juntar(partes: readonly ParteDaDiferenca[]): ParteDaDiferenca[] {
  const saida: ParteDaDiferenca[] = [];
  let removido = "";
  let adicionado = "";
  const fechar = () => {
    if (removido) saida.push({ tipo: "removido", texto: removido });
    if (adicionado) saida.push({ tipo: "adicionado", texto: adicionado });
    removido = "";
    adicionado = "";
  };
  for (const [i, p] of partes.entries()) {
    if (p.tipo === "removido") removido += p.texto;
    else if (p.tipo === "adicionado") adicionado += p.texto;
    else if ((removido || adicionado) && ehEspaco(p.texto) && partes[i + 1] && partes[i + 1]!.tipo !== "igual") {
      removido += p.texto;
      adicionado += p.texto;
    } else {
      fechar();
      const ultima = saida.at(-1);
      if (ultima?.tipo === "igual") ultima.texto += p.texto;
      else saida.push({ tipo: "igual", texto: p.texto });
    }
  }
  fechar();
  return saida;
}

const emParagrafos = (t: string) => t.split(/(\n\s*\n)/).filter(Boolean);
const emPalavras = (t: string) => t.match(/\s+|\S+/g) ?? [];

/** O antes e o depois: primeiro por parágrafo, para uma peça longa não pesar; no parágrafo que mudou, palavra por palavra. */
export function diferencas(antes: string, depois: string): ParteDaDiferenca[] {
  if (antes === depois) return antes ? [{ tipo: "igual", texto: antes }] : [];
  const paragrafos = alinhar(emParagrafos(antes), emParagrafos(depois));
  const saida: ParteDaDiferenca[] = [];
  let removido = "";
  let adicionado = "";
  const fechar = () => {
    if (removido && adicionado) saida.push(...alinhar(emPalavras(removido), emPalavras(adicionado)));
    else if (removido) saida.push({ tipo: "removido", texto: removido });
    else if (adicionado) saida.push({ tipo: "adicionado", texto: adicionado });
    removido = "";
    adicionado = "";
  };
  for (const p of paragrafos) {
    if (p.tipo === "removido") removido += p.texto;
    else if (p.tipo === "adicionado") adicionado += p.texto;
    else {
      fechar();
      saida.push(p);
    }
  }
  fechar();
  return juntar(saida);
}
