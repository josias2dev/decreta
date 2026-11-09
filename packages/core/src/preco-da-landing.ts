/**
 * A seção de preço da landing. O build escreve a do plano inicial (sem preço) entre
 * as marcas `<!--PRECO-->` e `<!--/PRECO-->`, e o servidor troca pela do plano padrão
 * do painel da plataforma a cada visita (apps/api/src/app.ts): o valor muda no painel,
 * sem build. Com `null`, a única ação é perguntar à equipe; com um número, mostra o
 * número e a única ação passa a ser criar a conta. Os dias de teste ainda não aparecem
 * porque o teste com prazo só vale quando a cobrança ligar: a landing diz só o que o
 * produto faz hoje.
 */
import { EMPRESA } from "./legal.ts";

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

/** O WhatsApp da equipe, com a mensagem pronta. */
export const CONTATO_DA_LANDING = `https://wa.me/${EMPRESA.contato.whatsapp}?text=${encodeURIComponent("Olá! Quero conhecer o Decreta para o meu escritório.")}`;

export const MARCAS_DO_PRECO = { inicio: "<!--PRECO-->", fim: "<!--/PRECO-->" } as const;

/** Troca a seção de preço de uma landing já montada (entre as marcas). Sem as marcas, devolve como veio. */
export function trocarPrecoDaLanding(html: string, plano: PlanoDaLanding, contato = CONTATO_DA_LANDING): string {
  const inicio = html.indexOf(MARCAS_DO_PRECO.inicio);
  const fim = html.indexOf(MARCAS_DO_PRECO.fim, inicio);
  if (inicio < 0 || fim < 0) return html;
  return html.slice(0, inicio + MARCAS_DO_PRECO.inicio.length) + htmlDoPreco(plano, contato) + html.slice(fim);
}

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
