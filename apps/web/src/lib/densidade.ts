/**
 * A densidade da tela: compacto (o padrão) ou confortável. Fica guardada por
 * pessoa neste navegador e vale por um atributo na raiz, que troca os tokens
 * (estilos/tokens.css). Sem nada guardado, ou com o navegador bloqueando, é compacto.
 */
export type Densidade = "compacto" | "confortavel";

/** A última usada aqui, para a tela não pular ao recarregar, antes de saber quem está logado. */
const ULTIMA = "decreta:densidade";
const daPessoa = (id: string) => `decreta:densidade:${id}`;

function ler(chave: string): Densidade | null {
  try {
    const v = localStorage.getItem(chave);
    return v === "compacto" || v === "confortavel" ? v : null;
  } catch {
    return null;
  }
}

function guardar(chave: string, valor: Densidade) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Navegador sem armazenamento: vale só nesta visita.
  }
}

export function aplicarDensidade(densidade: Densidade) {
  document.documentElement.dataset.densidade = densidade;
}

/** Antes do primeiro desenho. */
export function aplicarUltimaDensidade() {
  aplicarDensidade(ler(ULTIMA) ?? "compacto");
}

export function densidadeDaPessoa(id: string): Densidade {
  return ler(daPessoa(id)) ?? "compacto";
}

export function escolherDensidade(id: string, densidade: Densidade) {
  guardar(daPessoa(id), densidade);
  guardar(ULTIMA, densidade);
  aplicarDensidade(densidade);
}
