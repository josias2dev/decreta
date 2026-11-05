/**
 * A ficha de um escritório no painel da plataforma (/plataforma/escritorios/:id): a conta, os primeiros passos, as
 * pessoas (com o último acesso), os totais, o uso dos últimos 30 dias, a IA, as faturas, a captura e as ações
 * registradas. Só números e datas: nenhum cliente, processo, publicação, documento ou conversa aparece aqui.
 */
import { hojeEm, ROTULO_DA_MARCA, ROTULO_DA_SITUACAO, type FichaCompleta } from "@decreta/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { AgirNoEscritorio, andamento, Colunas, ItensDaAuditoria, Kpi, Kpis, MolduraDaPlataforma, percentual, plural, reais, SELO, usd, usdCurto } from "@/componentes/plataforma";
import { AgirNaLicenca, NotasDaEquipe, PainelDaLicenca } from "@/componentes/plataforma-licenca";
import { Botao, Carregando, Dados, Faixa, Painel, Selo, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { ApiError, apiPlataforma } from "@/lib/api";
import { papelLabel } from "@/lib/auth";
import { diaCompleto, diaCurto, diaDaSemana, diaDoInstante, haQuanto, numero, quando, tamanho } from "@/lib/formato";
import { cn } from "@/lib/util";

const SITUACAO_DA_FATURA: Record<string, { rotulo: string; urgencia: "vencido" | "hoje" | "cumprido" | "prazo" }> = {
  paga: { rotulo: "Paga", urgencia: "cumprido" },
  pendente: { rotulo: "Em aberto", urgencia: "prazo" },
  atrasada: { rotulo: "Atrasada", urgencia: "vencido" },
  estornada: { rotulo: "Estornada", urgencia: "hoje" },
  removida: { rotulo: "Removida", urgencia: "prazo" },
};
const FORMA: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão" };

export function FichaDoEscritorioPage() {
  const { id } = useParams({ from: "/plataforma/escritorios/$id" });
  const q = useQuery({ queryKey: ["plataforma", "ficha", id], queryFn: () => apiPlataforma<FichaCompleta>(`/escritorios/${id}`), retry: false });
  const [agindo, setAgindo] = useState(false);
  const [naLicenca, setNaLicenca] = useState(false);
  return (
    <MolduraDaPlataforma>
      <Trilha>
        <Link to="/plataforma" search={{ aba: "escritorios" }}>
          Plataforma
        </Link>
        <span>{q.data?.escritorio.nome ?? "Escritório"}</span>
      </Trilha>
      {q.error instanceof ApiError && q.error.status === 404 ? (
        <Vazio
          titulo="Escritório não encontrado"
          acao={
            <Link to="/plataforma" search={{ aba: "escritorios" }} className="dc-link">
              Ver os escritórios
            </Link>
          }
        >
          O endereço pode estar errado.
        </Vazio>
      ) : q.isError ? (
        <Faixa tipo="erro">Não deu para carregar o escritório agora. Tente de novo em instantes.</Faixa>
      ) : !q.data ? (
        <Carregando />
      ) : (
        <Ficha f={q.data} aoAgir={() => setAgindo(true)} aoMudarALicenca={() => setNaLicenca(true)} />
      )}
      <AgirNoEscritorio escritorio={agindo && q.data ? q.data.escritorio : null} aoFechar={() => setAgindo(false)} />
      {q.data && <AgirNaLicenca key={`${q.data.escritorio.id}-${naLicenca}`} ficha={q.data} aberto={naLicenca} aoFechar={() => setNaLicenca(false)} />}
    </MolduraDaPlataforma>
  );
}

function Ficha({ f, aoAgir, aoMudarALicenca }: { f: FichaCompleta; aoAgir: () => void; aoMudarALicenca: () => void }) {
  const e = f.escritorio;
  const t = f.totais;
  const passos = f.marcos.filter((m) => m.em).length;
  return (
    <>
      <TopoDoDetalhe
        titulo={e.nome}
        selos={
          <>
            <Selo urgencia={SELO[e.situacao]}>{ROTULO_DA_SITUACAO[e.situacao]}</Selo>
            {e.emAvaliacao && <Selo urgencia="prazo">Em avaliação</Selo>}
            {e.demonstracao && <Selo urgencia="prazo">Demonstração</Selo>}
            {f.licenca.marca && <Selo urgencia="prazo">{ROTULO_DA_MARCA[f.licenca.marca]}</Selo>}
            {f.licenca.uso.estado !== "ok" && <Selo urgencia={f.licenca.uso.estado === "passou" ? "vencido" : "hoje"}>{f.licenca.uso.estado === "passou" ? "Passou do limite" : "Perto do limite"}</Selo>}
          </>
        }
        sobre={`${e.slug} · cadastro em ${diaCompleto(diaDoInstante(e.criadoEm))} · ${andamento(e)}`}
        acoes={
          <>
            <Botao onClick={aoMudarALicenca} disabled={e.demonstracao || e.encerrado}>
              Licença
            </Botao>
            <Botao variante="primaria" onClick={aoAgir}>
              Agir
            </Botao>
          </>
        }
      />

      <Kpis rotulo="Totais do escritório">
        <Kpi rotulo="Pessoas ativas" n={`${f.ativasNaSemana} de ${f.pessoas.length}`} sub="Nos últimos 7 dias" />
        <Kpi rotulo="Processos" n={numero(t.processos)} sub={plural(t.clientes, "cliente", "clientes")} />
        <Kpi rotulo="Publicações" n={numero(t.publicacoes)} sub={plural(t.oabs, "OAB monitorada", "OABs monitoradas")} alerta={t.oabs === 0 && "hoje"} />
        <Kpi rotulo="Prazos abertos" n={numero(t.prazosAbertos)} />
        <Kpi rotulo="Peças" n={numero(t.pecas)} sub={plural(t.conversas, "conversa no Perguntar", "conversas no Perguntar")} />
        <Kpi rotulo="Documentos" n={numero(t.documentos)} sub={`${tamanho(t.espacoBytes)} guardados`} />
        <Kpi rotulo="IA em 30 dias" n={usd(f.ia.totalUsd)} sub={`${usd(f.ia.hojeUsd)} hoje`} />
      </Kpis>

      <div className="dc-colunas">
        <div className="dc-pilha">
          <Painel titulo="Pessoas" acao={<span className="dc-nota">{plural(f.pessoas.length, "pessoa", "pessoas")}</span>} corpo={false}>
            <div className="dc-tabela-caixa">
              <table className="dc-tabela">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th className="dc-col--situacao">Papel</th>
                    <th className="dc-col--data">Último acesso</th>
                    <th className="dc-col--situacao">Segurança</th>
                  </tr>
                </thead>
                <tbody>
                  {f.pessoas.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="dc-celula">
                          <span className="dc-celula__1">{p.nome}</span>
                          <span className="dc-celula__2">{p.email}</span>
                        </span>
                      </td>
                      <td>{papelLabel(p.papel)}</td>
                      <td>
                        <span className="dc-celula">
                          <span className="dc-celula__1">{p.ultimoAcesso ? haQuanto(p.ultimoAcesso) : "Nunca"}</span>
                          {p.aparelho && <span className="dc-celula__2">{p.aparelho === "celular" ? "No celular" : "No computador"}</span>}
                        </span>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {!p.emailConfirmado && <Selo urgencia="hoje">E-mail sem confirmar</Selo>}
                          {p.doisFatores ? <Selo urgencia="cumprido">Duas etapas</Selo> : <Selo urgencia="prazo">Só senha</Selo>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Painel>

          <Painel titulo="IA por dia" acao={<span className="dc-nota">Últimos 30 dias, em dólar</span>} corpo={false}>
            <Colunas
              rotulo="Gasto de IA do escritório por dia, em dólar"
              formatar={usd}
              formatarEixo={usdCurto}
              pontos={f.ia.dias.map((d) => ({ chave: d.dia, eixo: diaCurto(d.dia), titulo: `${diaDaSemana(d.dia).replace("-feira", "")}, ${diaCompleto(d.dia)}`, valor: d.usd }))}
            />
            {f.ia.porMetodo.length > 0 && (
              <div className="dc-linhas border-t border-[var(--superficie-2)]">
                {f.ia.porMetodo.slice(0, 6).map((m) => (
                  <div key={m.metodo} className="dc-linhas__item items-center">
                    <span className="min-w-0 flex-1 dc-t-corpo">{m.rotulo}</span>
                    <span className="dc-nota flex-none">{f.ia.totalUsd ? percentual(m.usd / f.ia.totalUsd) : ""}</span>
                    <span className="dc-num w-20 flex-none text-right dc-t-corpo">{usd(m.usd)}</span>
                  </div>
                ))}
              </div>
            )}
          </Painel>

          <Painel titulo="O que usaram" acao={<span className="dc-nota">Últimos 30 dias</span>} corpo={false}>
            {f.uso.length ? (
              <div className="dc-uso-da-ficha">
                {f.uso.map((u) => (
                  <div key={u.chave} className="dc-linhas__item items-center">
                    <span className="min-w-0 flex-1 dc-t-corpo">{u.rotulo}</span>
                    <span className="dc-num flex-none dc-t-corpo font-medium">{numero(u.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Vazio titulo="Nada usado nos últimos 30 dias">Quando alguém do escritório trata uma publicação, confirma um prazo ou gera uma peça, aparece aqui.</Vazio>
            )}
          </Painel>
        </div>

        <div className="dc-pilha">
          <PainelDaLicenca f={f} aoAgir={aoMudarALicenca} />
          <NotasDaEquipe organizationId={e.id} notas={f.notas} hoje={hojeEm("America/Sao_Paulo")} />
          <Painel titulo="Primeiros passos" acao={<span className="dc-nota">{passos} de {f.marcos.length}</span>} corpo={false}>
            <ol className="dc-passos">
              {f.marcos.map((m) => (
                <li key={m.nome} className={cn(!m.em && "is-falta")}>
                  {m.em ? <Check size={16} className="dc-passos__icone" aria-hidden /> : <Circle size={16} className="dc-passos__icone" aria-hidden />}
                  <span>{m.rotulo}</span>
                  <span className="dc-passos__quando">{m.em ? diaCurto(diaDoInstante(m.em)) : "ainda não"}</span>
                </li>
              ))}
            </ol>
          </Painel>

          <Painel titulo="Conta">
            <Dados
              linhas={[
                ["Situação", ROTULO_DA_SITUACAO[e.situacao]],
                ["Cadastro", diaCompleto(diaDoInstante(e.criadoEm))],
                ...(e.testeAte ? ([["Fim do teste", diaCompleto(e.testeAte)]] as [string, string][]) : []),
                ...(e.assinouEm ? ([["Assinou em", diaCompleto(diaDoInstante(e.assinouEm))]] as [string, string][]) : []),
                ["Mensalidade assinada", e.valorMensalCentavos ? reais(e.valorMensalCentavos) : "—"],
                ...(e.diasDeAtraso !== null ? ([["Atraso", plural(e.diasDeAtraso, "dia", "dias")]] as [string, string][]) : []),
                ...(e.cancelamentoPedidoEm ? ([["Cancelou em", diaCompleto(diaDoInstante(e.cancelamentoPedidoEm))]] as [string, string][]) : []),
                ...(e.acessoAte ? ([["Acesso até", diaCompleto(e.acessoAte)]] as [string, string][]) : []),
                ["Fuso", f.fuso === "America/Sao_Paulo" ? "Horário de Brasília" : f.fuso.replace(/^\w+\//, "").replaceAll("_", " ")],
              ]}
            />
          </Painel>

          <Painel titulo="Faturas" corpo={false}>
            {f.faturas.length ? (
              <div className="dc-linhas">
                {f.faturas.slice(0, 8).map((fa) => {
                  const s = SITUACAO_DA_FATURA[fa.situacao] ?? { rotulo: fa.situacao, urgencia: "prazo" as const };
                  return (
                    <div key={fa.id} className="dc-linhas__item items-center">
                      <span className="dc-celula min-w-0 flex-1">
                        <span className="dc-celula__1 dc-num">{reais(fa.valorCentavos)}</span>
                        <span className="dc-celula__2">
                          Vence {diaCompleto(fa.vencimento)}
                          {fa.pagaEm ? ` · paga em ${diaCurto(fa.pagaEm)}` : ""}
                          {fa.forma ? ` · ${FORMA[fa.forma] ?? fa.forma}` : ""}
                        </span>
                      </span>
                      <Selo urgencia={s.urgencia}>{s.rotulo}</Selo>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Vazio titulo="Nenhuma fatura">As faturas do Asaas aparecem aqui quando o escritório assina.</Vazio>
            )}
          </Painel>

          <Painel titulo="Captura das publicações">
            <Dados
              linhas={[
                ["Última leitura", f.captura.ultimaEm ? quando(f.captura.ultimaEm) : "Nenhuma ainda"],
                ["Erros na semana", String(f.captura.errosNaSemana)],
                ...(f.captura.ultimoErro ? ([["Último erro", f.captura.ultimoErro]] as [string, string][]) : []),
              ]}
            />
          </Painel>

          <Painel titulo="Ações registradas" corpo={false}>
            {f.acoes.length ? <ItensDaAuditoria itens={f.acoes} comEscritorio={false} /> : <Vazio titulo="Nenhuma ação ainda">O que a equipe do Decreta fizer neste escritório fica aqui.</Vazio>}
          </Painel>
        </div>
      </div>
      <p className="dc-nota m-0">Esta ficha mostra só a conta e os totais. Clientes, processos, publicações, documentos, peças e conversas do escritório não aparecem para a equipe do Decreta.</p>
    </>
  );
}
