/** Os tribunais que publicam no DJEN e que a conta e a página de cobertura mostram, com o nome por extenso. */
const ESTADOS: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DFT: "Distrito Federal e Territórios",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

export interface TribunalDoDjen {
  sigla: string;
  nome: string;
  ramo: "estadual" | "federal" | "trabalho" | "superior";
}

const faixa = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const TRIBUNAIS_DO_DJEN: readonly TribunalDoDjen[] = [
  ...Object.entries(ESTADOS).map(([uf, nome]): TribunalDoDjen => ({ sigla: `TJ${uf}`, nome: `Justiça estadual: ${nome}`, ramo: "estadual" })),
  ...faixa(6).map((n): TribunalDoDjen => ({ sigla: `TRF${n}`, nome: `Justiça Federal da ${n}ª Região`, ramo: "federal" })),
  ...faixa(24).map((n): TribunalDoDjen => ({ sigla: `TRT${n}`, nome: `Justiça do Trabalho da ${n}ª Região`, ramo: "trabalho" })),
  { sigla: "STJ", nome: "Superior Tribunal de Justiça", ramo: "superior" },
  { sigla: "TST", nome: "Tribunal Superior do Trabalho", ramo: "superior" },
  { sigla: "STF", nome: "Supremo Tribunal Federal", ramo: "superior" },
];
