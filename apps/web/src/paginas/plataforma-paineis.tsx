/**
 * As abas do painel da plataforma que leem números calculados no servidor: a visão geral, as pessoas, o uso de cada
 * funcionalidade e o custo da IA. Tudo são totais e datas; nenhuma tela abre o que é de um escritório.
 */
import {
  GRUPOS_DE_FUNCIONALIDADE,
  ROTULO_DA_ATENCAO,
  ROTULO_DA_SITUACAO,
  type AjusteDaPlataforma,
  type CustoDaIaDaPlataforma,
  type RecusasDaIa,
  type PessoaDaPlataforma,
  type PessoasDaPlataforma,
  type UsoDaPlataforma,
  type VisaoGeralDaPlataforma,
} from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Colunas, Kpi, Kpis, Linha, Medidor, percentual, plural, reais, reaisCurtos, reaisRedondos, SELO, usd, usdCurto } from "@/componentes/plataforma";
import { AjustesEditaveis } from "@/componentes/plataforma-licenca";
import { Botao, Campo, CampoDeBusca, Carregando, Chip, Faixa, Painel, Segmentos, Selo, Vazio } from "@/componentes/ui";
import { apiPlataforma, mensagemDoErro } from "@/lib/api";
import { papelLabel } from "@/lib/auth";
import { diaCompleto, diaCurto, diaDaSemana, haQuanto, numero } from "@/lib/formato";
import type { AbaDaPlataforma } from "@/lib/rotas";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesPorExtenso = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const mesCurto = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1]!.slice(0, 3);
const comSinal = (centavos: number) => `${centavos > 0 ? "+" : centavos < 0 ? "−" : ""}${reaisRedondos(Math.abs(centavos))}`;

/* ---------------- Visão geral ---------------- */

export function VisaoGeral({ irPara }: { irPara: (a: AbaDaPlataforma) => void }) {
  const q = useQuery({ queryKey: ["plataforma", "visao-geral"], queryFn: () => apiPlataforma<VisaoGeralDaPlataforma>("/visao-geral"), retry: false });
  if (q.isError) return <Faixa tipo="erro">Não deu para carregar a visão geral agora. Tente de novo em instantes.</Faixa>;
  if (!q.data) return <Carregando />;
  const v = q.data;
  const n = v.numeros;
  const mesAtual = v.mrrPorMes.at(-1)?.mes;
  return (
    <>
      <Kpis rotulo="Números do negócio">
        <Kpi rotulo="MRR" n={reaisRedondos(n.mrrCentavos)} sub={`ARR ${reaisRedondos(n.arrCentavos)}`} />
        <Kpi rotulo="Pagantes" n={numero(n.pagantes)} sub={n.ticketMedioCentavos === null ? "Ninguém pagando ainda" : `${reais(n.ticketMedioCentavos)} em média`} />
        <Kpi rotulo="Em teste" n={numero(n.emTeste)} sub={plural(n.cortesia, "de cortesia", "de cortesia")} />
        <Kpi rotulo="MRR líquido do mês" n={comSinal(n.mrrLiquidoCentavos)} sub={`${comSinal(n.mrrNovoCentavos)} · ${comSinal(-n.mrrPerdidoCentavos)}`} alerta={n.mrrLiquidoCentavos < 0 && "hoje"} />
        <Kpi rotulo="Churn do mês" n={n.churnReceita === null ? "—" : percentual(n.churnReceita)} sub={n.churnEscritorios === null ? "Da receita" : `${percentual(n.churnEscritorios)} dos escritórios`} />
        <Kpi rotulo="Ativas na semana" n={numero(n.pessoasAtivas.semana)} sub={`${n.pessoasAtivas.dia} hoje · ${n.pessoasAtivas.mes} no mês`} />
        <Kpi rotulo="Margem da IA" n={n.margemDaIa === null ? "—" : percentual(n.margemDaIa)} sub={`${usd(n.ia30dUsd)} em 30 dias`} alerta={n.margemDaIa !== null && n.margemDaIa < 0.7 && "hoje"} />
      </Kpis>

      <div className="dc-colunas">
        <Painel titulo="Precisa de atenção hoje" acao={<span className="dc-nota">{v.atencao.length ? plural(v.atencao.length, "item", "itens") : "Nada pendente"}</span>} corpo={false}>
          {v.atencao.length ? (
            <div className="dc-linhas">
              {v.atencao.map((i) => (
                <div key={`${i.tipo}-${i.organizationId ?? "site"}`} className="dc-linhas__item items-center">
                  <span className="dc-celula min-w-0 flex-1">
                    <span className="dc-celula__1">
                      {ROTULO_DA_ATENCAO[i.tipo].titulo} · {i.escritorio}
                    </span>
                    <span className="dc-celula__2">
                      {i.detalhe}. {ROTULO_DA_ATENCAO[i.tipo].acao}.
                    </span>
                  </span>
                  {i.gravidade === "alta" && <Selo urgencia="hoje">Urgente</Selo>}
                  {i.organizationId ? (
                    <Link to="/plataforma/escritorios/$id" params={{ id: i.organizationId }} className="dc-btn dc-btn--secundaria dc-btn--sm flex-none" aria-label={`Abrir ${i.escritorio}`}>
                      Abrir
                    </Link>
                  ) : (
                    <Botao pequeno className="flex-none" onClick={() => irPara("ia")}>
                      Ver a IA
                    </Botao>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Vazio titulo="Nada pedindo atenção hoje">Fatura atrasada, teste acabando sem uso, pagante sumido, escritório sem OAB e IA perto do teto aparecem aqui.</Vazio>
          )}
        </Painel>
        <div className="dc-pilha">
          <Painel titulo="Dinheiro do mês" corpo={false}>
            <div className="dc-linhas">
              <Linha rotulo="Recebido" valor={reais(n.receitaRecebidaCentavos)} />
              <Linha rotulo="A receber" valor={reais(n.receitaAReceberCentavos)} sub="Faturas do mês ainda em aberto" />
              <Linha rotulo="MRR novo" valor={reais(n.mrrNovoCentavos)} />
              <Linha rotulo="MRR perdido" valor={reais(n.mrrPerdidoCentavos)} />
              <Linha rotulo="IA em 30 dias" valor={reais(n.ia30dCentavos)} sub={`${usd(n.ia30dUsd)}, a R$ ${v.cotacaoUsd.toFixed(2).replace(".", ",")} o dólar${n.iaDemonstracao30dUsd > 0 ? `; ${usd(n.iaDemonstracao30dUsd)} da demonstração` : ""}`} />
            </div>
          </Painel>
          <Painel titulo="Escritórios por situação" acao={<button type="button" className="dc-link dc-t-meta" onClick={() => irPara("escritorios")}>Ver todos</button>} corpo={false}>
            <div className="dc-linhas">
              {(Object.keys(ROTULO_DA_SITUACAO) as (keyof typeof ROTULO_DA_SITUACAO)[])
                .filter((s) => v.porSituacao[s] > 0)
                .map((s) => (
                  <Linha key={s} rotulo={<Selo urgencia={SELO[s]}>{ROTULO_DA_SITUACAO[s]}</Selo>} valor={v.porSituacao[s]} />
                ))}
            </div>
          </Painel>
        </div>
      </div>

      <div className="dc-colunas dc-colunas--meio">
        <Painel titulo="MRR por mês" acao={<span className="dc-nota">O mês de agora vai até hoje</span>} corpo={false}>
          <Colunas
            rotulo="MRR por mês"
            formatar={reais}
            formatarEixo={reaisCurtos}
            pontos={v.mrrPorMes.map((m) => ({ chave: m.mes, eixo: mesCurto(m.mes), titulo: m.mes === mesAtual ? `${mesPorExtenso(m.mes)}, até hoje` : mesPorExtenso(m.mes), valor: m.mrrCentavos, detalhe: plural(m.pagantes, "pagante", "pagantes") }))}
          />
        </Painel>
        <Painel titulo="Cadastros por semana" acao={<button type="button" className="dc-link dc-t-meta" onClick={() => irPara("conversao")}>Ver a conversão</button>} corpo={false}>
          <Colunas
            rotulo="Cadastros por semana"
            inteiro
            formatar={(c) => plural(c, "cadastro", "cadastros")}
            formatarEixo={(c) => String(c)}
            pontos={v.cadastrosPorSemana.map((s) => ({ chave: s.semana, eixo: diaCurto(s.semana), titulo: `Semana de ${diaCompleto(s.semana)}`, valor: s.cadastros, detalhe: s.cadastros ? `${s.assinaram} já ${s.assinaram === 1 ? "assinou" : "assinaram"}` : undefined }))}
          />
        </Painel>
        <Painel titulo="Gasto de IA por dia" acao={<button type="button" className="dc-link dc-t-meta" onClick={() => irPara("ia")}>Ver o detalhe</button>} corpo={false}>
          <Colunas
            rotulo="Gasto de IA por dia, em dólar"
            formatar={usd}
            formatarEixo={usdCurto}
            pontos={v.iaPorDia.map((d) => ({ chave: d.dia, eixo: diaCurto(d.dia), titulo: `${diaDaSemana(d.dia).replace("-feira", "")}, ${diaCompleto(d.dia)}`, valor: d.usd, detalhe: reais(Math.round(d.usd * v.cotacaoUsd * 100)) }))}
          />
        </Painel>
        <Painel titulo="Pessoas usando" acao={<button type="button" className="dc-link dc-t-meta" onClick={() => irPara("pessoas")}>Ver as pessoas</button>} corpo={false}>
          <div className="dc-linhas">
            <Linha rotulo="Ativas hoje" valor={numero(n.pessoasAtivas.dia)} />
            <Linha rotulo="Ativas nos últimos 7 dias" valor={numero(n.pessoasAtivas.semana)} />
            <Linha rotulo="Ativas nos últimos 30 dias" valor={numero(n.pessoasAtivas.mes)} />
            <Linha rotulo="Com conta nos escritórios" valor={numero(n.pessoas)} sub="Sem a demonstração e os encerrados" />
            <Linha rotulo="Hábito" valor={n.pessoasAtivas.mes ? percentual(n.pessoasAtivas.dia / n.pessoasAtivas.mes) : "—"} sub="Ativas hoje sobre as do mês: perto de 50% é uso diário" />
          </div>
        </Painel>
      </div>
    </>
  );
}

/* ---------------- Pessoas ---------------- */

type FiltroDePessoas = "todas" | "ativas" | "sumidas" | "sem_email" | "sem_2fa" | "termos" | "suspensas";

const FILTROS_DE_PESSOAS: { id: FiltroDePessoas; rotulo: string; vale: (p: PessoaDaPlataforma, hoje: string) => boolean }[] = [
  { id: "todas", rotulo: "Todas", vale: () => true },
  { id: "ativas", rotulo: "Ativas na semana", vale: (p) => !!p.ultimoAcesso && diasAte(p.ultimoAcesso) <= 6 },
  { id: "sumidas", rotulo: "Sem acesso há 30 dias", vale: (p) => !p.ultimoAcesso || diasAte(p.ultimoAcesso) >= 30 },
  { id: "sem_email", rotulo: "E-mail não confirmado", vale: (p) => !p.emailConfirmado },
  { id: "sem_2fa", rotulo: "Sem duas etapas", vale: (p) => !p.doisFatores },
  { id: "termos", rotulo: "Termos antigos", vale: (p) => !p.termosEmDia },
  { id: "suspensas", rotulo: "Suspensas", vale: (p) => p.suspensa },
];

const diasAte = (dia: string) => {
  const hoje = new Date();
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - Date.UTC(a, m - 1, d)) / 864e5);
};

export function Pessoas() {
  const q = useQuery({ queryKey: ["plataforma", "pessoas"], queryFn: () => apiPlataforma<PessoasDaPlataforma>("/pessoas"), retry: false });
  const [filtro, setFiltro] = useState<FiltroDePessoas>("todas");
  const [busca, setBusca] = useState("");
  const [agindo, setAgindo] = useState<PessoaDaPlataforma | null>(null);
  if (q.isError) return <Faixa tipo="erro">Não deu para carregar as pessoas agora. Tente de novo em instantes.</Faixa>;
  if (!q.data) return <Carregando />;
  const { numeros: n } = q.data;
  const reais_ = q.data.pessoas.filter((p) => !p.demonstracao);
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const regra = FILTROS_DE_PESSOAS.find((f) => f.id === filtro)!;
  const itens = reais_.filter((p) => regra.vale(p, "") && (!termo || `${p.nome} ${p.email} ${p.escritorios.map((e) => e.nome).join(" ")}`.toLocaleLowerCase("pt-BR").includes(termo)));
  return (
    <>
      <Kpis rotulo="Números das pessoas">
        <Kpi rotulo="Pessoas" n={numero(n.total)} sub="Sem a demonstração" />
        <Kpi rotulo="Ativas hoje" n={numero(n.ativas.dia)} sub={`${n.ativas.semana} na semana · ${n.ativas.mes} no mês`} />
        <Kpi rotulo="Hábito" n={n.habito === null ? "—" : percentual(n.habito)} sub="Ativas hoje sobre as do mês" />
        <Kpi rotulo="No celular" n={n.ativas.mes ? percentual(n.noCelular / n.ativas.mes) : "—"} sub={`${n.noCelular} das ativas no mês`} />
        <Kpi rotulo="Com duas etapas" n={n.total ? percentual(n.comDoisFatores / n.total) : "—"} sub={plural(n.comDoisFatores, "pessoa", "pessoas")} />
        <Kpi rotulo="Termos antigos" n={numero(n.termosAntigos)} sub="Aceitam a versão nova ao entrar" />
      </Kpis>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="dc-chips">
          {FILTROS_DE_PESSOAS.map((f) => (
            <Chip key={f.id} ligado={filtro === f.id} n={reais_.filter((p) => f.vale(p, "")).length} onClick={() => setFiltro(f.id)}>
              {f.rotulo}
            </Chip>
          ))}
        </div>
        <CampoDeBusca valor={busca} aoMudar={setBusca} rotulo="Buscar pessoa" placeholder="Nome, e-mail ou escritório" />
      </div>
      <Painel corpo={false}>
        {itens.length ? (
          <div className="dc-tabela-caixa">
            <table className="dc-tabela">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Escritório</th>
                  <th className="dc-col--data">Último acesso</th>
                  <th className="dc-col--situacao">Segurança</th>
                  <th className="dc-direita dc-col--n">Sessões</th>
                  <th className="dc-col--data" />
                </tr>
              </thead>
              <tbody>
                {itens.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="dc-celula">
                        <span className="dc-celula__1">{p.nome}</span>
                        <span className="dc-celula__2">{p.email}</span>
                      </span>
                    </td>
                    <td>
                      <span className="dc-celula">
                        {p.escritorios.length ? (
                          p.escritorios.map((e) => (
                            <Link key={e.id} to="/plataforma/escritorios/$id" params={{ id: e.id }} className="dc-celula__1 no-underline">
                              {e.nome}
                            </Link>
                          ))
                        ) : (
                          <span className="dc-celula__1">Sem escritório</span>
                        )}
                        {p.escritorios.length > 0 && <span className="dc-celula__2">{p.escritorios.map((e) => papelLabel(e.papel)).join(" · ")}</span>}
                      </span>
                    </td>
                    <td>
                      <span className="dc-celula">
                        <span className="dc-celula__1 dc-num">{p.ultimoAcesso ? haQuanto(p.ultimoAcesso) : "Nunca"}</span>
                        <span className="dc-celula__2">{p.aparelho === "celular" ? "No celular" : p.aparelho === "computador" ? "No computador" : `Conta de ${diaCurto(p.criadaEm)}`}</span>
                      </span>
                    </td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {p.suspensa && <Selo urgencia="vencido">Suspensa</Selo>}
                        {!p.emailConfirmado && <Selo urgencia="hoje">E-mail sem confirmar</Selo>}
                        {p.doisFatores ? <Selo urgencia="cumprido">Duas etapas</Selo> : <Selo urgencia="prazo">Só senha</Selo>}
                      </span>
                    </td>
                    <td className="dc-direita dc-num">{p.sessoesAbertas}</td>
                    <td className="dc-direita">
                      <Botao pequeno onClick={() => setAgindo(p)} aria-label={`Agir em ${p.nome}`}>
                        Agir
                      </Botao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio
            titulo="Ninguém com esse filtro"
            acao={
              <Botao
                pequeno
                onClick={() => {
                  setFiltro("todas");
                  setBusca("");
                }}
              >
                Limpar os filtros
              </Botao>
            }
          >
            Tente outro nome ou outro filtro.
          </Vazio>
        )}
      </Painel>
      <AgirNaPessoa pessoa={agindo} aoFechar={() => setAgindo(null)} />
    </>
  );
}

type AcaoNaPessoa = "encerrar_sessoes" | "nova_senha" | "confirmar_email" | "desligar_2fa" | "suspender" | "reativar";

const ACOES_NA_PESSOA: { id: AcaoNaPessoa; rotulo: string; ajuda: string; feito: string; motivo?: string; vale: (p: PessoaDaPlataforma) => boolean }[] = [
  { id: "nova_senha", rotulo: "Mandar link de nova senha", ajuda: "A pessoa recebe por e-mail o link para criar outra senha. A senha de agora continua valendo até ela trocar.", feito: "Link de nova senha enviado", vale: (p) => !p.suspensa },
  { id: "confirmar_email", rotulo: "Reenviar a confirmação do e-mail", ajuda: "Chega um e-mail novo com o link de confirmar.", feito: "Confirmação reenviada", vale: (p) => !p.emailConfirmado && !p.suspensa },
  { id: "encerrar_sessoes", rotulo: "Encerrar as sessões", ajuda: "Sai de todos os aparelhos: a pessoa precisa entrar de novo com a senha. Use se o celular foi perdido ou a conta parece invadida.", feito: "Sessões encerradas", vale: (p) => p.sessoesAbertas > 0 },
  {
    id: "desligar_2fa",
    rotulo: "Desligar a verificação em duas etapas",
    ajuda: "Para quem perdeu o celular com o aplicativo. Só faça depois de conferir a identidade fora do Decreta (videochamada com documento, ligação para o número do cadastro). A pessoa entra só com a senha e liga de novo em Minha conta.",
    feito: "Verificação em duas etapas desligada",
    motivo: "Como a identidade foi conferida",
    vale: (p) => p.doisFatores,
  },
  { id: "suspender", rotulo: "Suspender a pessoa", ajuda: "Por abuso (robô no chat, conta compartilhada fora do combinado). As sessões caem e ela não entra mais, até alguém reativar. O resto do escritório continua normal.", feito: "Pessoa suspensa", motivo: "Motivo da suspensão", vale: (p) => !p.suspensa },
  { id: "reativar", rotulo: "Reativar a pessoa", ajuda: "A pessoa volta a entrar com a senha de sempre.", feito: "Pessoa reativada", vale: (p) => p.suspensa },
];

function AgirNaPessoa({ pessoa, aoFechar }: { pessoa: PessoaDaPlataforma | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [acao, setAcao] = useState<AcaoNaPessoa | "">("");
  const [motivo, setMotivo] = useState("");
  const possiveis = pessoa ? ACOES_NA_PESSOA.filter((a) => a.vale(pessoa)) : [];
  const escolhida = possiveis.find((a) => a.id === (acao || possiveis[0]?.id));
  const fechar = () => {
    setAcao("");
    setMotivo("");
    aoFechar();
  };
  const agir = useMutation({
    mutationFn: () => apiPlataforma<{ ok: true; sessoesEncerradas?: number }>(`/pessoas/${pessoa!.id}/acao`, { json: { acao: escolhida!.id, motivo: motivo.trim() || undefined } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar(`${escolhida!.feito}${typeof r?.sessoesEncerradas === "number" ? ` (${r.sessoesEncerradas})` : ""}. Fica registrado em Ações registradas.`);
      fechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto={!!pessoa}
      aoFechar={fechar}
      titulo={pessoa ? `Agir em ${pessoa.nome}` : "Agir"}
      descricao={pessoa ? `${pessoa.email}. Toda ação fica registrada, com o seu e-mail.` : undefined}
      acoes={
        <>
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao variante={escolhida?.id === "encerrar_sessoes" || escolhida?.id === "suspender" || escolhida?.id === "desligar_2fa" ? "perigo" : "primaria"} onClick={() => agir.mutate()} ocupado={agir.isPending} disabled={!escolhida || (!!escolhida.motivo && !motivo.trim())}>
            Confirmar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Ação" htmlFor="pl-acao-pessoa" ajuda={escolhida?.ajuda}>
          <select id="pl-acao-pessoa" value={escolhida?.id ?? ""} onChange={(ev) => setAcao(ev.target.value as AcaoNaPessoa)}>
            {possiveis.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={escolhida?.motivo ?? "Motivo (opcional)"} htmlFor="pl-motivo-pessoa" ajuda={escolhida?.motivo ? "Obrigatório. Fica na auditoria." : "Fica na auditoria."}>
          <input id="pl-motivo-pessoa" value={motivo} maxLength={300} onChange={(ev) => setMotivo(ev.target.value)} placeholder={escolhida?.id === "desligar_2fa" ? "Ex.: videochamada com a OAB em mãos" : escolhida?.id === "suspender" ? "Ex.: robô mandando mensagens no chat" : "Ex.: pediu por WhatsApp, esqueceu a senha"} />
        </Campo>
      </div>
    </Dialogo>
  );
}

/* ---------------- Uso ---------------- */

const PERIODOS = [
  { id: "7", rotulo: "7 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "90", rotulo: "90 dias" },
] as const;
type Periodo = (typeof PERIODOS)[number]["id"];

function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="dc-nota">—</span>;
  const p = Math.round(v * 100);
  return <span className="dc-num dc-t-meta text-[var(--tinta-2)]">{p === 0 ? "igual" : `${p > 0 ? "+" : "−"}${Math.abs(p)}%`}</span>;
}

export function Uso() {
  const [dias, setDias] = useState<Periodo>("30");
  const q = useQuery({ queryKey: ["plataforma", "uso", dias], queryFn: () => apiPlataforma<UsoDaPlataforma>(`/uso?dias=${dias}`), retry: false });
  const u = q.data;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="dc-nota m-0">{u ? `De ${diaCompleto(u.periodo.de)} a ${diaCompleto(u.periodo.ate)}, contra os ${u.periodo.dias} dias antes. A adoção é sobre os ${plural(u.escritoriosAtivos, "escritório", "escritórios")} com alguém usando no período.` : " "}</p>
        <Segmentos opcoes={[...PERIODOS]} valor={dias} aoMudar={setDias} rotulo="Período" />
      </div>
      {q.isError ? (
        <Faixa tipo="erro">Não deu para carregar o uso agora. Tente de novo em instantes.</Faixa>
      ) : !u ? (
        <Carregando />
      ) : (
        <>
          <Kpis rotulo="Qualidade da IA">
            <Kpi rotulo="Escritórios usando" n={numero(u.escritoriosAtivos)} sub="Com alguém entrando no período" />
            <Kpi rotulo="Conta do prazo aceita" n={u.qualidade.contaAceita === null ? "—" : percentual(u.qualidade.contaAceita)} sub={`${u.qualidade.prazosComDataDigitada} de ${u.qualidade.prazosConfirmados} com a data digitada`} alerta={u.qualidade.contaAceita !== null && u.qualidade.contaAceita < 0.85 && "hoje"} />
            <Kpi rotulo="Retornos “útil”" n={u.qualidade.util === null ? "—" : percentual(u.qualidade.util)} sub={`${u.qualidade.retornosUteis} úteis · ${u.qualidade.retornosErrados} com erro`} alerta={u.qualidade.util !== null && u.qualidade.util < 0.7 && "hoje"} />
          </Kpis>
          {GRUPOS_DE_FUNCIONALIDADE.map((g) => {
            const linhas = u.funcionalidades.filter((f) => f.grupo === g);
            if (!linhas.length) return null;
            return (
              <Painel key={g} titulo={g} corpo={false}>
                <div className="dc-tabela-caixa">
                  <table className="dc-tabela">
                    <thead>
                      <tr>
                        <th>Funcionalidade</th>
                        <th className="dc-col--situacao">Adoção</th>
                        <th className="dc-direita dc-col--n">Escritórios</th>
                        <th className="dc-direita dc-col--n">Total</th>
                        <th className="dc-direita dc-col--n">Por escritório</th>
                        <th className="dc-direita dc-col--n">Antes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((f) => (
                        <tr key={f.chave} className={f.total ? undefined : "text-[var(--tinta-3)]"}>
                          <td>{f.rotulo}</td>
                          <td>
                            <Medidor fracao={f.adocao} />
                          </td>
                          <td className="dc-direita dc-num">{numero(f.escritorios)}</td>
                          <td className="dc-direita dc-num">{numero(f.total)}</td>
                          <td className="dc-direita dc-num">{f.porEscritorio === null ? "—" : numero(Math.round(f.porEscritorio * 10) / 10)}</td>
                          <td className="dc-direita">
                            <Variacao v={f.variacao} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Painel>
            );
          })}
        </>
      )}
    </>
  );
}

/* ---------------- IA ---------------- */

export function CustoDaIa() {
  const [dias, setDias] = useState<Periodo>("30");
  const q = useQuery({ queryKey: ["plataforma", "ia", dias], queryFn: () => apiPlataforma<CustoDaIaDaPlataforma & { recusas: RecusasDaIa; ajustes: AjusteDaPlataforma[] }>(`/ia?dias=${dias}`), retry: false });
  const c = q.data;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="dc-nota m-0">{c ? `De ${diaCompleto(c.periodo.de)} a ${diaCompleto(c.periodo.ate)}, a R$ ${c.cotacaoUsd.toFixed(2).replace(".", ",")} o dólar. Todo o gasto, com a demonstração.` : " "}</p>
        <Segmentos opcoes={[...PERIODOS]} valor={dias} aoMudar={setDias} rotulo="Período" />
      </div>
      {q.isError ? (
        <Faixa tipo="erro">Não deu para carregar o custo da IA agora. Tente de novo em instantes.</Faixa>
      ) : !c ? (
        <Carregando />
      ) : (
        <>
          <Kpis rotulo="Custo da IA">
            <Kpi rotulo="No período" n={usd(c.totalUsd)} sub={reais(c.totalCentavos)} />
            <Kpi rotulo="Hoje" n={usd(c.hojeUsd)} sub={c.tetoSiteUsd > 0 ? `${Math.round((c.hojeUsd / c.tetoSiteUsd) * 100)}% do teto de ${usd(c.tetoSiteUsd)}` : "Sem teto do site"} alerta={c.tetoSiteUsd > 0 && c.hojeUsd >= 0.8 * c.tetoSiteUsd && "hoje"} />
            <Kpi rotulo="Por pagante" n={c.porPaganteUsd === null ? "—" : usd(c.porPaganteUsd)} sub="Média no período" />
            <Kpi rotulo="Sozinha" n={c.totalUsd ? percentual(c.fundoUsd / c.totalUsd) : "—"} sub={`${usd(c.fundoUsd)} lendo publicações e prazos`} />
            <Kpi rotulo="Demonstração" n={usd(c.demonstracaoUsd)} sub={c.totalUsd ? `${percentual(c.demonstracaoUsd / c.totalUsd)} do total` : "—"} />
          </Kpis>
          {c.estimadoUsd > 0 && <Faixa tipo="nota">{usd(c.estimadoUsd)} deste total são estimativa, pelo preço dos tokens: o gateway não informou o custo dessas chamadas.</Faixa>}
          <Painel titulo="Gasto por dia" acao={<span className="dc-nota">{plural(c.mensagens, "pergunta no chat", "perguntas no chat")}</span>} corpo={false}>
            <Colunas
              rotulo="Gasto de IA por dia, em dólar"
              formatar={usd}
              formatarEixo={usdCurto}
              altura={184}
              pontos={c.dias.map((d) => ({ chave: d.dia, eixo: diaCurto(d.dia), titulo: `${diaDaSemana(d.dia).replace("-feira", "")}, ${diaCompleto(d.dia)}`, valor: d.usd, detalhe: d.usd ? `${usd(d.fundoUsd)} sozinha · ${usd(d.usd - d.fundoUsd)} pedida na tela` : undefined }))}
            />
          </Painel>
          <div className="dc-colunas dc-colunas--meio">
            <Painel titulo="Por ação" corpo={false}>
              {c.porMetodo.length ? (
                <div className="dc-tabela-caixa">
                  <table className="dc-tabela">
                    <thead>
                      <tr>
                        <th>Ação</th>
                        <th className="dc-direita dc-col--n">Chamadas</th>
                        <th className="dc-direita dc-col--n">Parte</th>
                        <th className="dc-direita dc-col--data">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.porMetodo.map((m) => (
                        <tr key={m.metodo}>
                          <td>{m.rotulo}</td>
                          <td className="dc-direita dc-num">{numero(m.chamadas)}</td>
                          <td className="dc-direita dc-num">{c.totalUsd ? percentual(m.usd / c.totalUsd) : "—"}</td>
                          <td className="dc-direita dc-num">{usd(m.usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vazio titulo="Nenhum gasto no período">Quando a IA rodar, cada ação aparece aqui com o custo.</Vazio>
              )}
            </Painel>
            <Painel titulo="Por escritório" acao={<span className="dc-nota">Os que mais gastam</span>} corpo={false}>
              {c.porEscritorio.length ? (
                <div className="dc-tabela-caixa">
                  <table className="dc-tabela">
                    <thead>
                      <tr>
                        <th>Escritório</th>
                        <th className="dc-direita dc-col--data">Custo</th>
                        <th className="dc-direita dc-col--data">Da mensalidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.porEscritorio.map((e) => (
                        <tr key={e.organizationId}>
                          <td>
                            {e.demonstracao ? (
                              <span className="dc-celula">
                                <span className="dc-celula__1">{e.nome}</span>
                                <span className="dc-celula__2">Demonstração</span>
                              </span>
                            ) : (
                              <Link to="/plataforma/escritorios/$id" params={{ id: e.organizationId }} className="dc-celula no-underline">
                                <span className="dc-celula__1">{e.nome}</span>
                                <span className="dc-celula__2">{ROTULO_DA_SITUACAO[e.situacao]}</span>
                              </Link>
                            )}
                          </td>
                          <td className="dc-direita">
                            <span className="dc-celula items-end">
                              <span className="dc-celula__1 dc-num">{usd(e.usd)}</span>
                              <span className="dc-celula__2 dc-num">{reais(e.centavos)}</span>
                            </span>
                          </td>
                          <td className="dc-direita dc-num">{e.sobreAMensalidade === null ? "—" : percentual(e.sobreAMensalidade)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vazio titulo="Nenhum gasto no período">Os escritórios que usam a IA aparecem aqui, do que mais gasta para o que menos gasta.</Vazio>
              )}
            </Painel>
          </div>
          <div className="dc-colunas dc-colunas--meio">
            <RecusasDaIaNoPeriodo r={c.recusas} />
            <AjustesEditaveis titulo="Limites da IA e cotação" ajustes={c.ajustes} />
          </div>
        </>
      )}
    </>
  );
}

/** As vezes em que um teto barrou um pedido à IA: quem bate no teto toda hora talvez precise de um plano maior. */
function RecusasDaIaNoPeriodo({ r }: { r: RecusasDaIa }) {
  return (
    <Painel titulo="Pedidos barrados por um teto" acao={<span className="dc-nota">{plural(r.total, "recusa", "recusas")} no período</span>} corpo={false}>
      {r.total ? (
        <>
          <Colunas rotulo="Recusas da IA por dia" formatar={(v) => plural(v, "recusa", "recusas")} formatarEixo={(v) => String(v)} inteiro altura={120} pontos={r.dias.map((d) => ({ chave: d.dia, eixo: diaCurto(d.dia), titulo: `${diaDaSemana(d.dia).replace("-feira", "")}, ${diaCompleto(d.dia)}`, valor: d.total }))} />
          <div className="dc-linhas border-t border-[var(--superficie-2)]">
            {r.porMotivo.map((m) => (
              <Linha key={m.codigo} rotulo={m.rotulo} valor={numero(m.total)} />
            ))}
          </div>
          <div className="dc-linhas border-t border-[var(--superficie-2)]">
            {r.porEscritorio.slice(0, 8).map((e) => (
              <div key={e.organizationId} className="dc-linhas__item items-center">
                {e.demonstracao ? (
                  <span className="dc-celula min-w-0 flex-1">
                    <span className="dc-celula__1">{e.nome}</span>
                    <span className="dc-celula__2">Demonstração</span>
                  </span>
                ) : (
                  <Link to="/plataforma/escritorios/$id" params={{ id: e.organizationId }} className="dc-celula min-w-0 flex-1 no-underline">
                    <span className="dc-celula__1">{e.nome}</span>
                    <span className="dc-celula__2">{e.motivos.join(", ")}</span>
                  </Link>
                )}
                <span className="dc-num flex-none dc-t-corpo font-medium">{numero(e.total)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Vazio titulo="Nenhum pedido barrado">Quando um teto (da pessoa, do escritório, do site ou do gateway) barra um pedido, ele aparece aqui, sem o texto do pedido.</Vazio>
      )}
    </Painel>
  );
}
