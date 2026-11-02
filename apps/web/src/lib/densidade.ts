/** A densidade da tela: compacto (o padrão) ou confortável, por um atributo na raiz que troca os tokens (estilos/tokens.css). */
import { preferenciaDaPessoa } from "./preferencia";

export type Densidade = "compacto" | "confortavel";

export const DENSIDADES: { id: Densidade; rotulo: string }[] = [
  { id: "compacto", rotulo: "Compacto" },
  { id: "confortavel", rotulo: "Confortável" },
];

export function aplicarDensidade(densidade: Densidade) {
  document.documentElement.dataset.densidade = densidade;
}

const preferencia = preferenciaDaPessoa<Densidade>({ chave: "densidade", padrao: "compacto", valores: ["compacto", "confortavel"], aplicar: aplicarDensidade });

export const densidadeDaPessoa = preferencia.valorDaPessoa;
export const useDensidade = preferencia.useValor;

/** Antes do primeiro desenho. */
export function aplicarUltimaDensidade() {
  aplicarDensidade(preferencia.ultima());
}
