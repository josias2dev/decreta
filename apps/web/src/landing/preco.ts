/**
 * O plano da landing lê o `PLANO` do core. O valor ainda não foi decidido: com
 * `null`, a única ação é perguntar à equipe; com um número, mostra o número e a
 * única ação passa a ser criar a conta, e nada mais precisa mudar. Os dias de teste
 * do plano (`testeDias`) ainda não aparecem aqui porque o teste com prazo só existe
 * quando a cobrança (onda 3) entrar: a landing diz só o que o produto faz hoje.
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
const BOTAO = 'class="dc-btn dc-btn--primaria lp-btn dc-btn--bloco"';

const NO_PLANO = ["Publicações do DJEN três vezes por dia", "Prazos contados em dias úteis", "Briefing, resumo e Perguntar com IA", "Peças em Word no timbre do escritório", "Resumo da manhã no WhatsApp", "Verificação em duas etapas", "Processos, clientes e agenda", "Alvarás e novos negócios", "Honorários e prestação de contas", "IA nos campos de texto, com prévia"];

export function htmlDoPreco(plano: PlanoDaLanding, contato: string): string {
  const [valor, acao] =
    plano.valorMensalCentavos === null
      ? [`<p class="lp-preco lp-preco--conversa">Fale com a equipe para saber o valor.</p>`, `<a ${BOTAO} href="${contato}" target="_blank" rel="noopener">Perguntar o valor no WhatsApp${seta}</a>`]
      : [`<div class="lp-preco"><strong>${valorEmReais(plano.valorMensalCentavos)}</strong><span>por mês</span></div>`, `<a ${BOTAO} href="/cadastro" data-evento="clicou_criar_conta">Criar conta${seta}</a>`];
  return `<div class="lp-plano-largo__preco">
        <div class="lp-plano__topo"><h3 class="lp-plano__nome">Plano ${plano.nome}</h3><span class="dc-selo dc-selo--prazo">Tudo incluído</span></div>
        ${valor}
        ${acao}
        <p class="lp-plano-largo__nota">Sem taxa de adesão, sem cartão para começar e cancelamento no próprio app.</p>
      </div>
      <div class="lp-plano-largo__lista">
        <h4>O que vem no plano</h4>
        <ul>${NO_PLANO.map((item) => `<li>${ok}${item}</li>`).join("")}</ul>
      </div>`;
}
