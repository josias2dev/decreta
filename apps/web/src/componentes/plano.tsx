/**
 * O Plano do escritório (Configurações > Plano), para os sócios: a situação, os dias do teste, assinar, as
 * faturas, trocar a forma de pagamento e cancelar. Quem paga é o Asaas, na página dele (Pix, boleto ou cartão):
 * o Decreta só leva a pessoa até lá e nunca vê dado de cartão.
 *
 * Também é a tela que sobra quando o acesso está bloqueado (`TelaBloqueada`, em moldura.tsx): pagar, levar os
 * dados e encerrar continuam abertos.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { LINK_DO_CONTATO } from "@/componentes/pagina-legal";
import { Botao, Campo, Carregando, Faixa, Painel, Selo, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCompleto } from "@/lib/formato";
import type { FaturaDoPlano, Plano } from "@/lib/tipos";

export const planoQuery = { queryKey: ["plano"], queryFn: () => api<Plano>("/plano"), refetchInterval: 20_000 } as const;

const reais = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const FORMA: Record<string, string> = { boleto: "Boleto", pix: "Pix", cartao: "Cartão", indefinida: "A escolher" };

const SITUACAO_DA_FATURA: Record<FaturaDoPlano["situacao"], { rotulo: string; urgencia: "vencido" | "prazo" | "cumprido" | "hoje" }> = {
  pendente: { rotulo: "Em aberto", urgencia: "prazo" },
  atrasada: { rotulo: "Em atraso", urgencia: "vencido" },
  paga: { rotulo: "Paga", urgencia: "cumprido" },
  estornada: { rotulo: "Estornada", urgencia: "hoje" },
  removida: { rotulo: "Removida", urgencia: "prazo" },
};

/** O texto do aviso com as datas em negrito: é a data que a pessoa precisa ver. */
export function TextoComDatas({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\d{2}\/\d{2}\/\d{4})/).map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : parte))}
    </>
  );
}

/** Em que pé o escritório está, numa frase. */
function resumo(p: Plano): string {
  if (!p.cobrancaAtiva) return "A cobrança ainda não foi aberta: por enquanto nada é cobrado e nada é bloqueado.";
  switch (p.situacao) {
    case "teste":
      return `Teste grátis, sem cartão: ${p.diasRestantesDoTeste === 0 ? "termina hoje" : `${plural(p.diasRestantesDoTeste ?? 0, "dia restante", "dias restantes")}`} (até ${diaCompleto(p.testeAte!)}).`;
    case "ativo":
      return p.cancelamentoAgendado ? `Assinatura cancelada. O acesso completo vai até ${diaCompleto(p.acessoAte!)}.` : `Assinatura em dia${p.valorMensalCentavos ? `: ${reais(p.valorMensalCentavos)} por mês` : ""}.`;
    case "inadimplente":
      return `Há uma fatura em atraso${p.diasDeAtraso ? ` há ${plural(p.diasDeAtraso, "dia", "dias")}` : ""}.`;
    case "so_leitura":
      return p.motivo === "fim_do_teste" ? `O teste acabou em ${diaCompleto(p.testeAte!)}. O escritório está só para leitura.` : "O escritório está só para leitura.";
    case "bloqueado":
      return "O acesso do escritório está bloqueado.";
    case "cancelado":
      return `Assinatura cancelada${p.acessoAte ? `: o período pago acabou em ${diaCompleto(p.acessoAte)}` : ""}. O escritório está só para leitura.`;
    case "cortesia":
      return "Este escritório tem acesso por cortesia, sem cobrança.";
  }
}

export function PlanoDoEscritorio({ celular }: { celular?: boolean }) {
  const q = useQuery(planoQuery);
  if (q.isPending) return <Carregando linhas={3} />;
  if (q.isError || !q.data) return <Faixa tipo="erro">Não deu para carregar o plano agora. Tente de novo em instantes.</Faixa>;
  const p = q.data;
  return (
    <div className={celular ? "flex flex-col gap-6" : "dc-colunas dc-colunas--meio"}>
      <div className="dc-pilha">
        <PainelDoPlano p={p} />
        <UsoDoPlano p={p} />
      </div>
      <div className="dc-pilha">
        <Faturas p={p} />
        <FormaDePagamento p={p} />
      </div>
    </div>
  );
}

function PainelDoPlano({ p }: { p: Plano }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [cancelando, setCancelando] = useState(false);
  const assinar = useMutation({
    mutationFn: () => api<{ url: string }>("/plano/assinar", { method: "POST" }),
    // A página de pagamento é do Asaas: a pessoa vai até lá e volta para cá quando pagar.
    onSuccess: (r) => window.location.assign(r.url),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const cancelar = useMutation({
    mutationFn: () => api<{ acessoAte: string | null }>("/plano/cancelar", { method: "POST" }),
    onSuccess: (r) => {
      setCancelando(false);
      void qc.invalidateQueries({ queryKey: planoQuery.queryKey });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar(r.acessoAte ? `Assinatura cancelada. O acesso completo vai até ${diaCompleto(r.acessoAte)}.` : "Assinatura cancelada.");
    },
    onError: (err) => {
      setCancelando(false);
      avisar(mensagemDoErro(err), { erro: true });
    },
  });
  const grave = p.aviso?.nivel === "grave";
  const preco = p.plano.valorMensalCentavos;
  const desconto = p.licenca?.desconto ?? null;
  const comDesconto = desconto && p.licenca?.preco.mensalidadeCentavos !== null && p.licenca!.preco.descontoCentavos > 0 ? p.licenca!.preco : null;
  return (
    <Painel titulo={`Plano ${p.plano.nome}`} acao={<span className="dc-nota">{p.cobrancaAtiva ? p.rotulo : "Cobrança ainda não aberta"}</span>}>
      <div className="dc-form">
        <p className="m-0 dc-t-corpo font-medium">{resumo(p)}</p>
        {p.cobrancaAtiva && p.aviso && p.aviso.nivel !== "info" && (
          <Faixa tipo={grave ? "erro" : "aviso"}>
            <CircleAlert />
            <span className="flex-1">
              <TextoComDatas texto={p.aviso.texto} />
            </span>
          </Faixa>
        )}
        {p.cobrancaAtiva && p.situacao !== "cortesia" && (
          <p className="dc-nota m-0">
            {preco === null ? (
              <>O valor do plano ainda não foi definido.</>
            ) : (
              <>
                {reais(preco)} por mês, no Pix, no boleto ou no cartão. Teste de {p.plano.testeDias} dias sem cartão, sem taxa de adesão e sem fidelidade.
              </>
            )}{" "}
            Cancelar leva dois cliques, aqui mesmo, e vale até o fim do período pago. Nada é apagado por falta de pagamento.
          </p>
        )}
        {comDesconto && desconto && (
          <Faixa tipo="nota">
            <span className="flex-1">
              Desconto de {desconto.tipo === "percentual" ? `${desconto.valor}%` : reais(desconto.valor)} até <strong>{diaCompleto(desconto.ate)}</strong>: a mensalidade fica em {reais(comDesconto.mensalidadeCentavos!)}.
            </span>
          </Faixa>
        )}
        {p.aceitaCupom && <CampoDoCupom />}

        {p.podeAssinar ? (
          <Botao className="md:self-start" variante="primaria" onClick={() => assinar.mutate()} ocupado={assinar.isPending}>
            {p.cancelamentoAgendado || p.situacao === "cancelado" ? "Assinar de novo" : "Assinar o plano"}
          </Botao>
        ) : (
          p.motivoSemAssinar &&
          !p.assinante && (
            <p className="dc-nota m-0">
              {p.motivoSemAssinar}{" "}
              <a className="dc-link" href={LINK_DO_CONTATO} target="_blank" rel="noopener noreferrer">
                Falar com a equipe
              </a>
            </p>
          )
        )}

        {p.podeCancelar && (
          <Botao className="md:self-start" variante="fantasma" onClick={() => setCancelando(true)}>
            Cancelar a assinatura…
          </Botao>
        )}
      </div>

      <Dialogo
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo="Cancelar a assinatura?"
        descricao="O escritório continua com tudo até o fim do período que já foi pago. Depois disso fica só para leitura, sem apagar nada, e dá para assinar de novo quando quiser."
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setCancelando(false)}>
              Voltar
            </Botao>
            <Botao variante="perigo" onClick={() => cancelar.mutate()} ocupado={cancelar.isPending}>
              Cancelar a assinatura
            </Botao>
          </>
        }
      >
        <p className="dc-nota m-0">Quando o período pago acabar, a busca de publicações no DJEN e o resumo no WhatsApp param, e o escritório não salva mais nada novo. Os dados ficam guardados e dá para levar uma cópia deles.</p>
      </Dialogo>
    </Painel>
  );
}

/** O cupom de desconto que a equipe do Decreta deu (parceria, indicação): vale a partir de hoje. */
function CampoDoCupom() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const aplicar = useMutation({
    mutationFn: () => api<{ desconto: { ate: string } }>("/plano/cupom", { json: { codigo: codigo.trim() } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: planoQuery.queryKey });
      setAberto(false);
      setCodigo("");
      avisar(`Cupom aplicado. O desconto vale até ${diaCompleto(r.desconto.ate)}.`);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  if (!aberto)
    return (
      <Botao className="md:self-start" variante="fantasma" pequeno onClick={() => setAberto(true)}>
        Tenho um cupom
      </Botao>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (codigo.trim().length >= 3) aplicar.mutate();
      }}
    >
      <div className="min-w-0 flex-1">
        <Campo rotulo="Cupom" htmlFor="plano-cupom">
          <input id="plano-cupom" value={codigo} maxLength={40} autoComplete="off" autoCapitalize="characters" onChange={(ev) => setCodigo(ev.target.value)} placeholder="Ex.: PARCEIRO10" />
        </Campo>
      </div>
      <Botao type="submit" ocupado={aplicar.isPending} disabled={codigo.trim().length < 3}>
        Aplicar
      </Botao>
      <Botao variante="fantasma" onClick={() => setAberto(false)}>
        Agora não
      </Botao>
    </form>
  );
}

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** O uso do escritório contra os limites do plano. Passar de um limite só para o que gera custo novo (a IA e o WhatsApp). */
function UsoDoPlano({ p }: { p: Plano }) {
  const itens = (p.licenca?.uso.itens ?? []).filter((i) => i.limite !== null);
  if (!itens.length) return null;
  return (
    <Painel titulo="Uso do plano" acao={p.licenca!.uso.alertas > 0 ? <Selo urgencia={p.licenca!.uso.estado === "passou" ? "vencido" : "hoje"}>{p.licenca!.uso.estado === "passou" ? "Passou do limite" : "Perto do limite"}</Selo> : <span className="dc-nota">Dentro do plano</span>} corpo={false}>
      <div className="dc-linhas">
        {itens.map((i) => (
          <div key={i.chave} className="dc-linhas__item items-center">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-t-corpo">{i.rotulo}</span>
              <span className="dc-celula__2">
                {i.unidade === "US$" ? `US$ ${NUMERO.format(i.usado)} de US$ ${NUMERO.format(i.limite!)}` : `${NUMERO.format(i.usado)} de ${NUMERO.format(i.limite!)} ${i.unidade}`}
              </span>
            </span>
            {i.estado !== "ok" && <Selo urgencia={i.estado === "passou" ? "vencido" : "hoje"}>{i.estado === "passou" ? "Passou" : "80%"}</Selo>}
          </div>
        ))}
      </div>
      {p.licenca!.uso.alertas > 0 && <p className="dc-nota m-0 px-4 pb-3">Passar de um limite não trava o trabalho. Só o que gera custo novo para: a IA e as mensagens de WhatsApp do dia. Para aumentar, fale com a equipe do Decreta.</p>}
    </Painel>
  );
}

function Faturas({ p }: { p: Plano }) {
  return (
    <Painel titulo="Faturas" corpo={false}>
      {p.faturas.length ? (
        <div className="dc-linhas">
          {p.faturas.map((f) => {
            const s = SITUACAO_DA_FATURA[f.situacao];
            return (
              <div key={f.id} className="dc-linhas__item items-center">
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">
                    Vence em {diaCompleto(f.vencimento)} · {reais(f.valorCentavos)}
                  </span>
                  <span className="dc-celula__2">{[f.forma ? FORMA[f.forma] : null, f.pagaEm ? `paga em ${diaCompleto(f.pagaEm)}` : null].filter(Boolean).join(" · ") || "Forma de pagamento a escolher na fatura"}</span>
                </span>
                <Selo urgencia={s.urgencia}>{s.rotulo}</Selo>
                {f.link && (
                  <a className="dc-link flex flex-none items-center gap-1" href={f.link} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a fatura de ${diaCompleto(f.vencimento)} no Asaas`}>
                    Abrir <ExternalLink size={12} aria-hidden />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Vazio titulo="Nenhuma fatura ainda">{!p.cobrancaAtiva ? "A cobrança ainda não foi aberta: não há nada a pagar." : p.situacao === "cortesia" ? "Este escritório tem acesso por cortesia: não há nada a pagar." : p.podeAssinar ? "A primeira aparece aqui quando o escritório assina, em Assinar o plano." : "A primeira aparece aqui quando o escritório assina."}</Vazio>
      )}
    </Painel>
  );
}

function FormaDePagamento({ p }: { p: Plano }) {
  return (
    <Painel titulo="Forma de pagamento">
      <div className="dc-form">
        <p className="dc-nota m-0">O pagamento é feito na página do Asaas, com Pix, boleto ou cartão, e o Decreta nunca vê nem guarda dado de cartão. Para pagar de outro jeito, abra a fatura e escolha lá.</p>
        {p.trocarFormaEm ? (
          <a className="dc-btn dc-btn--secundaria dc-btn--md md:self-start" href={p.trocarFormaEm} target="_blank" rel="noopener noreferrer">
            Trocar a forma de pagamento <ExternalLink aria-hidden />
          </a>
        ) : (
          <p className="dc-nota m-0">{p.assinante ? "Não há fatura em aberto agora. A próxima deixa escolher Pix, boleto ou cartão." : "A forma de pagamento é escolhida na página do Asaas, ao assinar."}</p>
        )}
      </div>
    </Painel>
  );
}
