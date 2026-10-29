/**
 * Número único do processo (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO.
 * DD é o dígito verificador (módulo 97, ISO 7064); J o segmento da Justiça;
 * TR o tribunal; OOOO a origem (vara ou foro).
 */

const UFS_ESTADUAIS = ["AC", "AL", "AP", "AM", "BA", "CE", "DFT", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];

export interface NumeroCnj {
  /** 20 dígitos, sem pontuação. */
  digitos: string;
  /** Com a máscara do CNJ. */
  formatado: string;
  sequencial: string;
  dv: string;
  ano: string;
  segmento: string;
  tribunal: string;
  origem: string;
}

/** Só os dígitos. */
export function limparCnj(valor: string): string {
  return valor.replace(/\D/g, "");
}

function mod97(numero: string): number {
  let resto = 0;
  for (const c of numero) resto = (resto * 10 + Number(c)) % 97;
  return resto;
}

/** O dígito verificador certo para os demais campos. */
export function dvCnj(sequencial: string, ano: string, segmento: string, tribunal: string, origem: string): string {
  const base = `${sequencial.padStart(7, "0")}${ano}${segmento}${tribunal.padStart(2, "0")}${origem.padStart(4, "0")}00`;
  return String(98 - mod97(base)).padStart(2, "0");
}

/** Lê um número CNJ com ou sem máscara. `null` se não tem 20 dígitos ou o verificador não confere. */
export function lerCnj(valor: string): NumeroCnj | null {
  const d = limparCnj(valor);
  if (d.length !== 20) return null;
  const n: NumeroCnj = {
    digitos: d,
    sequencial: d.slice(0, 7),
    dv: d.slice(7, 9),
    ano: d.slice(9, 13),
    segmento: d.slice(13, 14),
    tribunal: d.slice(14, 16),
    origem: d.slice(16, 20),
    formatado: `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`,
  };
  return dvCnj(n.sequencial, n.ano, n.segmento, n.tribunal, n.origem) === n.dv ? n : null;
}

export function cnjValido(valor: string): boolean {
  return lerCnj(valor) !== null;
}

/** Máscara do CNJ em 20 dígitos (sem conferir o verificador). */
export function formatarCnj(valor: string): string {
  const d = limparCnj(valor);
  if (d.length !== 20) return valor.trim();
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

/** Sigla do tribunal pelo número: 8.24 → TJSC, 5.12 → TRT12, 4.04 → TRF4. */
export function tribunalDoCnj(valor: string): string | null {
  const d = limparCnj(valor);
  if (d.length !== 20) return null;
  const j = d.slice(13, 14);
  const tr = Number(d.slice(14, 16));
  switch (j) {
    case "1":
      return "STF";
    case "3":
      return "STJ";
    case "4":
      return tr >= 1 && tr <= 6 ? `TRF${tr}` : null;
    case "5":
      return tr === 0 ? "TST" : tr <= 24 ? `TRT${tr}` : null;
    case "6":
      return tr === 0 ? "TSE" : UFS_ESTADUAIS[tr - 1] ? `TRE-${UFS_ESTADUAIS[tr - 1]!.slice(0, 2)}` : null;
    case "7":
      return "STM";
    case "8":
      return UFS_ESTADUAIS[tr - 1] ? `TJ${UFS_ESTADUAIS[tr - 1]}` : null;
    case "9":
      return ({ 13: "TJMMG", 21: "TJMRS", 26: "TJMSP" } as Record<number, string>)[tr] ?? null;
    default:
      return null;
  }
}

/** Índice da API pública do DataJud para o tribunal do processo (ex.: `api_publica_tjsc`). */
export function indiceDataJud(valor: string): string | null {
  const t = tribunalDoCnj(valor);
  if (!t || t === "STF") return null;
  return `api_publica_${t.toLowerCase()}`;
}
