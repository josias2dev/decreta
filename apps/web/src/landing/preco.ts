/**
 * O plano da landing lê o `PLANO` do core. O valor ainda não foi decidido: com
 * `null`, convida a falar com a equipe; com um número, mostra o número, e nada
 * mais precisa mudar. Os dias de teste do plano (`testeDias`) ainda não aparecem
 * aqui porque o teste com prazo só existe quando a cobrança (onda 3) entrar: a
 * landing diz só o que o produto faz hoje.
 */
export interface PlanoDaLanding {
  nome: string;
  valorMensalCentavos: number | null;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 199,00". O espaço fica inquebrável, para o valor não partir em duas linhas. */
export const valorEmReais = (centavos: number) => REAIS.format(centavos / 100);

const seta = '<svg class="lp-seta" aria-hidden="true"><use href="#i-seta"></use></svg>';
const ok = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';

const NO_PLANO = ["Publicações do DJEN três vezes por dia", "Prazos contados em dias úteis", "Briefing, resumo e Perguntar com IA", "Peças em Word no timbre do escritório", "Resumo da manhã no WhatsApp", "Verificação em duas etapas", "Processos, clientes e agenda", "Alvarás e novos negócios"];

export function htmlDoPreco(plano: PlanoDaLanding, contato: string): string {
  const valor =
    plano.valorMensalCentavos === null
      ? `<div class="lp-preco"><strong>Fale com a equipe</strong></div>
         <a class="lp-link" href="${contato}" target="_blank" rel="noopener">Perguntar o valor no WhatsApp${seta}</a>`
      : `<div class="lp-preco"><strong>${valorEmReais(plano.valorMensalCentavos)}</strong><span>por mês</span></div>`;
  return `<div class="lp-plano-largo__preco">
        <div class="lp-plano__topo"><h3 class="lp-plano__nome">Plano ${plano.nome}</h3><span class="dc-selo dc-selo--prazo">Tudo incluído</span></div>
        ${valor}
        <p class="lp-plano-largo__nota">Crie a conta, cadastre as OABs e o escritório já começa a receber as publicações. Para começar, sem cartão.</p>
        <a class="dc-btn dc-btn--primaria lp-btn dc-btn--bloco" href="/cadastro" data-evento="clicou_criar_conta">Criar conta${seta}</a>
        <p class="lp-plano-largo__nota">Sem taxa de adesão. Cancelamento no próprio app, sem falar com ninguém.</p>
      </div>
      <div class="lp-plano-largo__lista">
        <h4>O que vem no plano</h4>
        <ul>${NO_PLANO.map((item) => `<li>${ok}${item}</li>`).join("")}</ul>
      </div>`;
}
