/**
 * A seção de preço lê o `PLANO` do core. O valor ainda não foi decidido: com
 * `null`, convida a falar com a equipe; com um número, mostra o número, e nada
 * mais precisa mudar.
 */
export interface PlanoDaLanding {
  nome: string;
  testeDias: number;
  valorMensalCentavos: number | null;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 199,00". O espaço fica inquebrável, para o valor não partir em duas linhas. */
export const valorEmReais = (centavos: number) => REAIS.format(centavos / 100);

const seta = '<svg class="lp-seta" aria-hidden="true"><use href="#i-seta"></use></svg>';

export function htmlDoPreco(plano: PlanoDaLanding, contato: string): string {
  const valor =
    plano.valorMensalCentavos === null
      ? `<p class="lp-preco__valor lp-preco__valor--conversa">Para saber o valor, fale com a equipe.</p>
         <a class="lp-link" href="${contato}" target="_blank" rel="noopener">Perguntar o valor no WhatsApp${seta}</a>`
      : `<p class="lp-preco__valor"><strong>${valorEmReais(plano.valorMensalCentavos)}</strong> <span>por mês</span></p>`;
  return `<div class="lp-preco__topo"><h3 class="lp-preco__nome">Plano ${plano.nome}</h3><span class="lp-preco__unico">o único que existe</span></div>${valor}
    <ul class="lp-preco__lista">
      <li>Tudo o que está nesta página, sem módulo à parte</li>
      <li>A IA inclusa, com o limite de uso à vista na tela</li>
      <li>${plano.testeDias} dias de teste, sem cartão</li>
      <li>Sem taxa de adesão</li>
      <li>Cancelamento no próprio app, sem falar com ninguém</li>
    </ul>`;
}
