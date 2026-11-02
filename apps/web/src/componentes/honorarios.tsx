/**
 * Honorários na tela: o selo da parcela, o diálogo de uma parcela (pagamento, cobrança, lembrete), o contrato novo,
 * a aba financeira de um cliente ou de um processo e o aviso discreto "processo sem honorário". Todo valor vem e
 * vai em centavos inteiros; "recebido" só existe depois que um pagamento é marcado.
 */
import { paraBasePontos, planejarParcelas, type PlanoDoContrato } from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { MensagensAoCliente } from "@/componentes/mensagem-ao-cliente";
import { EscolherCliente } from "@/componentes/novos";
import { EscolherProcesso } from "@/componentes/novo-prazo";
import { Botao, Campo, Dados, Faixa, Painel, Segmentos, Selo, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { campoDeCentavos, centavosDoCampo, diaCompleto, diaCurto, percentual, reais } from "@/lib/formato";
import type { ContratoDeHonorarios, EstadoDaCobranca, FinanceiroDoCaso, FormaDePagamento, ParcelaDeHonorario, TipoDeContrato } from "@/lib/tipos";

/** A pessoa vê o Financeiro (sócio, ou liberada pela Equipe). */
export function useFinanceiroLiberado(): boolean {
  const eu = useQuery(euQuery);
  return !!eu.data?.usuario.financeiro;
}

export const FORMAS: Record<FormaDePagamento, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão", transferencia: "Transferência", dinheiro: "Dinheiro", retido_no_alvara: "Retido no alvará", outro: "Outra forma" };
const FORMAS_PARA_ESCOLHER = (Object.keys(FORMAS) as FormaDePagamento[]).filter((f) => f !== "retido_no_alvara");

export const TIPO_DE_CONTRATO: Record<TipoDeContrato, string> = { fixo: "Valor fixo", mensal: "Mensal", exito: "Êxito", hibrido: "Híbrido" };

/** De quem é a parcela, numa linha: "Cliente · Processo", sem repetir o cliente quando o título do processo já o traz. */
export function casoDaParcela(p: Pick<ParcelaDeHonorario, "cliente" | "processo" | "contratoTitulo">): string {
  const cliente = p.cliente?.nome;
  const processo = p.processo?.titulo;
  if (cliente && processo) return processo.includes(cliente) ? processo : `${cliente} · ${processo}`;
  return cliente ?? processo ?? p.contratoTitulo;
}

/** O que o selo da parcela diz: a cor só carrega significado (verde pago, âmbar e vermelho atraso). */
export function seloDaParcela(p: Pick<ParcelaDeHonorario, "situacao" | "vencimento" | "diasEmAtraso" | "falta">, hoje: string): { urgencia: "vencido" | "hoje" | "breve" | "prazo" | "cumprido"; texto: string } {
  switch (p.situacao) {
    case "paga":
      return { urgencia: "cumprido", texto: "Paga" };
    case "em_atraso":
      return { urgencia: p.diasEmAtraso > 7 ? "vencido" : "hoje", texto: p.diasEmAtraso === 1 ? "Atrasada há 1 dia" : `Atrasada há ${p.diasEmAtraso} dias` };
    case "sem_valor":
      return { urgencia: "prazo", texto: "Aguardando resultado" };
    case "cancelada":
      return { urgencia: "prazo", texto: "Cancelada" };
    case "parcial":
      return { urgencia: "prazo", texto: `Falta ${reais(p.falta)}` };
    default: {
      if (!p.vencimento) return { urgencia: "prazo", texto: "A vencer" };
      if (p.vencimento === hoje) return { urgencia: "hoje", texto: "Vence hoje" };
      const dias = Math.round((Date.parse(`${p.vencimento}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 864e5);
      return { urgencia: dias <= 3 ? "breve" : "prazo", texto: `Vence ${diaCurto(p.vencimento)}` };
    }
  }
}

export function SeloDaParcela({ p, hoje }: { p: Pick<ParcelaDeHonorario, "situacao" | "vencimento" | "diasEmAtraso" | "falta">; hoje: string }) {
  const s = seloDaParcela(p, hoje);
  return <Selo urgencia={s.urgencia}>{s.texto}</Selo>;
}

/** Atualiza tudo o que mostra dinheiro depois de uma mudança. */
export function useAtualizarFinanceiro() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["financeiro"] });
    void qc.invalidateQueries({ queryKey: ["alvaras"] });
    void qc.invalidateQueries({ queryKey: ["mensagens-cliente"] });
    void qc.invalidateQueries({ queryKey: ["eu"] });
  };
}

/* ------------------------------------------------------------------ */
/* Uma parcela                                                         */
/* ------------------------------------------------------------------ */

export function ParcelaDialogo({ parcela: inicial, hoje, aoFechar }: { parcela: ParcelaDeHonorario; hoje: string; aoFechar: () => void }) {
  const avisar = useAviso();
  const atualizar = useAtualizarFinanceiro();
  const [p, setP] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const config = useQuery({ queryKey: ["financeiro", "cobranca"], queryFn: () => api<EstadoDaCobranca>("/financeiro/cobranca") });
  const asaas = !!config.data?.asaas.configurado;
  const depois = (nova: ParcelaDeHonorario, texto?: string) => {
    setP(nova);
    atualizar();
    if (texto) avisar(texto);
  };
  const erro = (err: unknown) => avisar(mensagemDoErro(err), { erro: true });

  // Pagamento à mão. A data nunca é "amanhã"; o valor, se vazio, é o que falta.
  const [pg, setPg] = useState({ valor: campoDeCentavos(inicial.falta), pagoEm: hoje, forma: "pix" as FormaDePagamento, observacao: "" });
  const valorDoPagamento = pg.valor.trim() ? centavosDoCampo(pg.valor) : (p.falta ?? null);
  const pagar = useMutation({
    mutationFn: () => api<ParcelaDeHonorario>(`/financeiro/parcelas/${p.id}/pagamentos`, { json: { valor: valorDoPagamento, pagoEm: pg.pagoEm, forma: pg.forma, observacao: pg.observacao.trim() || null } }),
    onSuccess: (nova) => {
      setPg({ valor: campoDeCentavos(nova.falta), pagoEm: hoje, forma: "pix", observacao: "" });
      depois(nova, "Pagamento marcado.");
    },
    onError: erro,
  });
  const [motivo, setMotivo] = useState<{ id: string; texto: string } | null>(null);
  const estornar = useMutation({
    mutationFn: () => api<ParcelaDeHonorario>(`/financeiro/pagamentos/${motivo!.id}/estornar`, { json: { motivo: motivo!.texto.trim() } }),
    onSuccess: (nova) => {
      setMotivo(null);
      depois(nova, "Pagamento estornado. Ele continua no histórico.");
    },
    onError: erro,
  });

  // Cobrança no Asaas do escritório. O vencimento sugerido é o da parcela; vencida, a pessoa escolhe a data.
  const sugestao = p.vencimentoDaCobranca;
  const [venc, setVenc] = useState(sugestao?.sugerido ?? "");
  const cobrar = useMutation({
    mutationFn: () => api<ParcelaDeHonorario>(`/financeiro/parcelas/${p.id}/cobranca`, { json: venc ? { vencimento: venc } : {} }),
    onSuccess: (nova) => depois(nova, "Cobrança emitida."),
    onError: erro,
  });
  const descobrar = useMutation({
    mutationFn: () => api<ParcelaDeHonorario>(`/financeiro/parcelas/${p.id}/cobranca`, { method: "DELETE" }),
    onSuccess: (nova) => {
      setVenc(nova.vencimentoDaCobranca?.sugerido ?? "");
      depois(nova, "Cobrança cancelada.");
    },
    onError: erro,
  });
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(p.cobranca!.link!);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      avisar("Não deu para copiar. Abra o link e copie de lá.", { erro: true });
    }
  };

  const [cancelando, setCancelando] = useState(false);
  const cancelar = useMutation({
    mutationFn: () => api<ParcelaDeHonorario>(`/financeiro/parcelas/${p.id}/cancelar`, { json: {} }),
    onSuccess: (nova) => {
      setCancelando(false);
      depois(nova, "Parcela cancelada.");
    },
    onError: erro,
  });

  const aberta = p.situacao !== "cancelada" && p.situacao !== "paga";
  const podePagar = aberta && p.valor !== null;
  return (
    <>
      <Dialogo
        aberto
        aoFechar={aoFechar}
        titulo={p.descricao}
        className="dc-dialogo--largo"
        descricao={
          p.cliente ? (
            <>
              <Link to="/clientes/$id" params={{ id: p.cliente.id }} className="dc-link">
                {p.cliente.nome}
              </Link>
              {!p.contratoTitulo.includes(p.cliente.nome) && ` · ${p.contratoTitulo}`}
            </>
          ) : (
            p.contratoTitulo
          )
        }
        acoes={
          <>
            {aberta && (
              <Botao variante="fantasma" onClick={() => setCancelando(true)}>
                Cancelar parcela
              </Botao>
            )}
            {aberta && !p.cobranca && (
              <Botao variante="secundaria" onClick={() => setEditando(true)}>
                Editar
              </Botao>
            )}
            <Botao variante="primaria" onClick={aoFechar}>
              Fechar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Dados
            linhas={[
              ["Vence", p.vencimento ? diaCompleto(p.vencimento) : "Quando sair o resultado"],
              ["Valor", p.valor === null ? "Ainda sem valor" : <span className="dc-num">{reais(p.valor)}</span>],
              ["Pago", <span key="pago" className="dc-num">{reais(p.pago)}</span>],
              ...(p.falta ? ([["Falta", <strong key="falta" className="dc-num">{reais(p.falta)}</strong>]] as [ReactNode, ReactNode][]) : []),
              ["Situação", <SeloDaParcela key="s" p={p} hoje={hoje} />],
              ...(p.processo ? ([["Processo", <Link key="proc" to="/processos/$id" params={{ id: p.processo.id }} className="dc-link">{p.processo.titulo}</Link>]] as [ReactNode, ReactNode][]) : []),
            ]}
          />

          {p.pagamentos.length > 0 && (
            <section className="flex flex-col gap-1.5" aria-label="Pagamentos marcados">
              <span className="dc-rotulo">Pagamentos</span>
              <ul className="dc-lista-check m-0 list-none p-0">
                {p.pagamentos.map((g) => (
                  <li key={g.id} className={g.estornado ? "text-[var(--tinta-3)] line-through" : undefined}>
                    <span className="dc-num">{diaCurto(g.pagoEm)}</span>
                    <span className="dc-num font-medium">{reais(g.valor)}</span>
                    <span className="flex-1">
                      {FORMAS[g.forma]}
                      {g.origem === "asaas" && " · baixa automática do Asaas"}
                      {g.estornado && ` · estornado${g.motivoEstorno ? `: ${g.motivoEstorno}` : ""}`}
                    </span>
                    {!g.estornado && (
                      <button type="button" className="dc-link" onClick={() => setMotivo({ id: g.id, texto: "" })}>
                        Estornar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {podePagar && (
            <section className="flex flex-col gap-2" aria-label="Marcar pagamento">
              <span className="dc-rotulo">Marcar pagamento</span>
              <div className="dc-grade-2">
                <Campo rotulo="Valor pago" htmlFor="pg-valor" erro={pg.valor.trim() && valorDoPagamento === null ? "Valor em reais, como 1.500,00" : null}>
                  <input id="pg-valor" inputMode="decimal" value={pg.valor} onChange={(e) => setPg({ ...pg, valor: e.target.value })} />
                </Campo>
                <Campo rotulo="Pago em" htmlFor="pg-data">
                  <input id="pg-data" type="date" max={hoje} value={pg.pagoEm} onChange={(e) => setPg({ ...pg, pagoEm: e.target.value })} />
                </Campo>
                <Campo rotulo="Forma" htmlFor="pg-forma">
                  <select id="pg-forma" value={pg.forma} onChange={(e) => setPg({ ...pg, forma: e.target.value as FormaDePagamento })}>
                    {FORMAS_PARA_ESCOLHER.map((f) => (
                      <option key={f} value={f}>
                        {FORMAS[f]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Observação" htmlFor="pg-obs">
                  <input id="pg-obs" value={pg.observacao} maxLength={500} onChange={(e) => setPg({ ...pg, observacao: e.target.value })} />
                </Campo>
              </div>
              <div>
                <Botao variante="primaria" onClick={() => pagar.mutate()} ocupado={pagar.isPending} disabled={!valorDoPagamento || !pg.pagoEm}>
                  <Check /> Marcar como pago
                </Botao>
              </div>
              <p className="m-0 dc-nota">Só entra no recebido o que alguém marca aqui, ou o que o Asaas avisa que foi pago.</p>
            </section>
          )}

          {aberta && p.valor !== null && (
            <section className="flex flex-col gap-2" aria-label="Cobrança">
              <span className="dc-rotulo">Cobrança</span>
              {p.cobranca ? (
                <div className="flex flex-col gap-2">
                  <p className="m-0 dc-t-corpo">
                    Cobrança emitida no Asaas{p.cobranca.vencimento ? `, com vencimento em ${diaCompleto(p.cobranca.vencimento)}` : ""}. O cliente paga por Pix, boleto ou cartão pelo link, e a baixa chega sozinha.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {p.cobranca.link && (
                      <>
                        <a className="dc-btn dc-btn--secundaria dc-btn--md" href={p.cobranca.link} target="_blank" rel="noreferrer">
                          <ExternalLink /> Abrir o link de pagamento
                        </a>
                        <Botao variante="secundaria" onClick={() => void copiar()}>
                          {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar o link"}
                        </Botao>
                      </>
                    )}
                    <Botao variante="fantasma" onClick={() => descobrar.mutate()} ocupado={descobrar.isPending}>
                      Cancelar a cobrança
                    </Botao>
                  </div>
                </div>
              ) : asaas ? (
                <div className="flex flex-col gap-2">
                  {sugestao?.precisaEscolher && <Faixa tipo="aviso">{sugestao.motivo}</Faixa>}
                  <Campo rotulo="Vencimento da cobrança" htmlFor="cb-venc" ajuda={sugestao && !sugestao.precisaEscolher ? "É o vencimento da parcela." : undefined}>
                    <input id="cb-venc" type="date" min={hoje} value={venc} onChange={(e) => setVenc(e.target.value)} />
                  </Campo>
                  <div>
                    <Botao variante="secundaria" onClick={() => cobrar.mutate()} ocupado={cobrar.isPending} disabled={!venc}>
                      Emitir cobrança no Asaas
                    </Botao>
                  </div>
                </div>
              ) : (
                <p className="m-0 dc-nota">O Asaas do escritório não está ligado: a baixa é manual. Os sócios ligam em Configurações, na aba Financeiro.</p>
              )}
            </section>
          )}

          {aberta && p.valor !== null && p.cliente && (
            <MensagensAoCliente filtro={{ parcela: p.id }} titulo="Lembrete de cobrança" gerar={{ rotulo: "Preparar lembrete para o cliente", caminho: `/financeiro/parcelas/${p.id}/lembrete` }} />
          )}

          {p.situacao === "sem_valor" && <Faixa tipo="nota">O honorário de êxito ainda não tem valor. Ele aparece quando o alvará é sacado e o Decreta calcula a parte do escritório, ou quando você informa o valor em Editar.</Faixa>}
        </div>
      </Dialogo>

      {editando && <EditarParcela p={p} aoFechar={() => setEditando(false)} aoSalvar={(nova) => depois(nova, "Parcela atualizada.")} />}

      <Dialogo
        aberto={!!motivo}
        aoFechar={() => setMotivo(null)}
        titulo="Estornar o pagamento"
        descricao="O pagamento fica no histórico, riscado, com o motivo. A parcela volta a dever."
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setMotivo(null)}>
              Voltar
            </Botao>
            <Botao variante="perigo" onClick={() => estornar.mutate()} ocupado={estornar.isPending} disabled={(motivo?.texto.trim().length ?? 0) < 3}>
              Estornar
            </Botao>
          </>
        }
      >
        <Campo rotulo="Motivo" htmlFor="est-motivo">
          <input id="est-motivo" value={motivo?.texto ?? ""} maxLength={300} onChange={(e) => setMotivo(motivo && { ...motivo, texto: e.target.value })} placeholder="Marcado na parcela errada" />
        </Campo>
      </Dialogo>

      <Dialogo
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo="Cancelar esta parcela?"
        descricao={p.cobranca ? "A cobrança emitida no Asaas também é cancelada. Parcela com pagamento marcado não se cancela: estorne o pagamento antes." : "Parcela com pagamento marcado não se cancela: estorne o pagamento antes."}
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setCancelando(false)}>
              Voltar
            </Botao>
            <Botao variante="perigo" onClick={() => cancelar.mutate()} ocupado={cancelar.isPending}>
              Cancelar a parcela
            </Botao>
          </>
        }
      />
    </>
  );
}

function EditarParcela({ p, aoFechar, aoSalvar }: { p: ParcelaDeHonorario; aoFechar: () => void; aoSalvar: (nova: ParcelaDeHonorario) => void }) {
  const avisar = useAviso();
  const [f, setF] = useState({ descricao: p.descricao, valor: campoDeCentavos(p.valor), vencimento: p.vencimento ?? "" });
  const valor = f.valor.trim() ? centavosDoCampo(f.valor) : null;
  const salvar = useMutation({
    mutationFn: () => api<ParcelaDeHonorario>(`/financeiro/parcelas/${p.id}`, { method: "PUT", json: { descricao: f.descricao.trim(), ...(valor !== null ? { valor } : {}), vencimento: f.vencimento || null } }),
    onSuccess: (nova) => {
      aoSalvar(nova);
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Editar parcela"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={f.descricao.trim().length < 2 || (f.valor.trim() !== "" && valor === null)}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Descrição" htmlFor="ep-desc">
          <input id="ep-desc" value={f.descricao} maxLength={300} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Valor" htmlFor="ep-valor" erro={f.valor.trim() && valor === null ? "Valor em reais, como 1.500,00" : null} ajuda={p.valor === null ? "O êxito nasce sem valor: informe quando sair o resultado." : undefined}>
            <input id="ep-valor" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </Campo>
          <Campo rotulo="Vencimento" htmlFor="ep-venc">
            <input id="ep-venc" type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
          </Campo>
        </div>
      </div>
    </Dialogo>
  );
}

/* ------------------------------------------------------------------ */
/* Contrato novo                                                       */
/* ------------------------------------------------------------------ */

interface CasoEscolhido {
  cliente: { id: string; nome: string } | null;
  processo: { id: string; titulo: string } | null;
}

export function NovoContrato({ aberto, aoFechar, caso: inicial }: { aberto: boolean; aoFechar: () => void; caso?: Partial<CasoEscolhido> }) {
  const avisar = useAviso();
  const atualizar = useAtualizarFinanceiro();
  const [caso, setCaso] = useState<CasoEscolhido>({ cliente: inicial?.cliente ?? null, processo: inicial?.processo ?? null });
  const [tipo, setTipo] = useState<TipoDeContrato>("exito");
  const [f, setF] = useState({ titulo: "", fixoValor: "", fixoParcelas: "1", fixoVence: "", mensalValor: "", mensalMeses: "12", mensalVence: "", exito: "30", observacoes: "" });
  const mexe = (campos: Partial<typeof f>) => setF({ ...f, ...campos });

  const usaExito = tipo === "exito" || tipo === "hibrido";
  // Entre híbrido com valor fixo ou com mensalidade: quem preenche um dos dois vale.
  const [hibridoCom, setHibridoCom] = useState<"fixo" | "mensal">("fixo");
  const comFixo = tipo === "fixo" || (tipo === "hibrido" && hibridoCom === "fixo");
  const comMensal = tipo === "mensal" || (tipo === "hibrido" && hibridoCom === "mensal");

  const fixoValor = centavosDoCampo(f.fixoValor);
  const mensalValor = centavosDoCampo(f.mensalValor);
  const exitoBp = paraBasePontos(f.exito);
  const parcelas = Number(f.fixoParcelas);
  const meses = Number(f.mensalMeses);

  // O plano, igual ao que o servidor monta: a prévia mostra cada parcela antes de salvar.
  const plano: PlanoDoContrato | null =
    (comFixo && (fixoValor === null || !f.fixoVence)) || (comMensal && (mensalValor === null || !f.mensalVence)) || (usaExito && exitoBp === null)
      ? null
      : {
          tipo,
          ...(comFixo ? { fixo: { valor: fixoValor!, parcelas, primeiroVencimento: f.fixoVence } } : {}),
          ...(comMensal ? { mensal: { valor: mensalValor!, meses, primeiroVencimento: f.mensalVence } } : {}),
          ...(usaExito ? { exitoBp: exitoBp! } : {}),
        };
  let previa: ReturnType<typeof planejarParcelas> | null = null;
  let erroDoPlano: string | null = null;
  if (plano) {
    try {
      previa = planejarParcelas(plano);
    } catch (err) {
      erroDoPlano = err instanceof Error ? err.message : "Confira os dados do contrato.";
    }
  }
  const temCaso = !!caso.cliente || !!caso.processo;
  const criar = useMutation({
    mutationFn: () =>
      api<ContratoDeHonorarios>("/financeiro/contratos", {
        json: {
          clienteId: caso.cliente?.id ?? null,
          processoId: caso.processo?.id ?? null,
          titulo: f.titulo.trim() || null,
          tipo,
          ...(plano?.fixo ? { fixo: plano.fixo } : {}),
          ...(plano?.mensal ? { mensal: plano.mensal } : {}),
          ...(plano?.exitoBp ? { exitoBp: plano.exitoBp } : {}),
          observacoes: f.observacoes.trim() || null,
        },
      }),
    onSuccess: () => {
      atualizar();
      avisar("Contrato guardado.");
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo contrato de honorários"
      className="dc-dialogo--largo"
      descricao="Valor fixo, mensal, percentual de êxito ou híbrido. O êxito nasce sem valor: só guarda o percentual, e o valor entra quando sai o resultado."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!temCaso || !previa}>
            Guardar contrato
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        {!inicial?.processo && !inicial?.cliente && (
          <div className="dc-grade-2">
            <Campo rotulo="Cliente">
              <EscolherCliente valor={caso.cliente} aoEscolher={(cliente) => setCaso({ ...caso, cliente })} />
            </Campo>
            <Campo rotulo="Processo (opcional)">
              <EscolherProcesso valor={caso.processo} aoEscolher={(processo) => setCaso({ ...caso, processo })} />
            </Campo>
          </div>
        )}
        {(inicial?.processo || inicial?.cliente) && (
          <p className="m-0 dc-t-corpo text-[var(--tinta-2)]">
            {caso.processo ? `Processo: ${caso.processo.titulo}` : `Cliente: ${caso.cliente?.nome}`}
            {caso.processo && caso.cliente && ` · ${caso.cliente.nome}`}
          </p>
        )}
        <Segmentos
          rotulo="Tipo de contrato"
          valor={tipo}
          aoMudar={setTipo}
          opcoes={(Object.keys(TIPO_DE_CONTRATO) as TipoDeContrato[]).map((t) => ({ id: t, rotulo: TIPO_DE_CONTRATO[t] }))}
        />
        {tipo === "hibrido" && (
          <Segmentos
            rotulo="O híbrido combina o êxito com"
            valor={hibridoCom}
            aoMudar={setHibridoCom}
            opcoes={[
              { id: "fixo", rotulo: "Valor fixo" },
              { id: "mensal", rotulo: "Mensalidade" },
            ]}
          />
        )}
        {comFixo && (
          <div className="dc-grade-2">
            <Campo rotulo="Valor total" htmlFor="nc-fixo" erro={f.fixoValor && fixoValor === null ? "Valor em reais, como 12.000,00" : null}>
              <input id="nc-fixo" inputMode="decimal" value={f.fixoValor} onChange={(e) => mexe({ fixoValor: e.target.value })} placeholder="12.000,00" />
            </Campo>
            <Campo rotulo="Parcelas" htmlFor="nc-parc">
              <input id="nc-parc" inputMode="numeric" value={f.fixoParcelas} onChange={(e) => mexe({ fixoParcelas: e.target.value.replace(/\D/g, "") })} />
            </Campo>
            <Campo rotulo="Primeiro vencimento" htmlFor="nc-fvence">
              <input id="nc-fvence" type="date" value={f.fixoVence} onChange={(e) => mexe({ fixoVence: e.target.value })} />
            </Campo>
          </div>
        )}
        {comMensal && (
          <div className="dc-grade-2">
            <Campo rotulo="Mensalidade" htmlFor="nc-mensal" erro={f.mensalValor && mensalValor === null ? "Valor em reais, como 1.800,00" : null}>
              <input id="nc-mensal" inputMode="decimal" value={f.mensalValor} onChange={(e) => mexe({ mensalValor: e.target.value })} placeholder="1.800,00" />
            </Campo>
            <Campo rotulo="Meses" htmlFor="nc-meses">
              <input id="nc-meses" inputMode="numeric" value={f.mensalMeses} onChange={(e) => mexe({ mensalMeses: e.target.value.replace(/\D/g, "") })} />
            </Campo>
            <Campo rotulo="Primeiro vencimento" htmlFor="nc-mvence">
              <input id="nc-mvence" type="date" value={f.mensalVence} onChange={(e) => mexe({ mensalVence: e.target.value })} />
            </Campo>
          </div>
        )}
        {usaExito && (
          <Campo rotulo="Percentual de êxito" htmlFor="nc-exito" erro={exitoBp === null ? "De 0,01% a 100%, como 30 ou 12,5" : null} ajuda="Calculado sobre o valor que cair na conta, quando o alvará for sacado.">
            <input id="nc-exito" inputMode="decimal" value={f.exito} onChange={(e) => mexe({ exito: e.target.value })} />
          </Campo>
        )}
        <Campo rotulo="Nome do contrato (opcional)" htmlFor="nc-titulo">
          <input id="nc-titulo" value={f.titulo} maxLength={300} onChange={(e) => mexe({ titulo: e.target.value })} placeholder="Honorários · Marina Duarte" />
        </Campo>
        {erroDoPlano && <Faixa tipo="erro">{erroDoPlano}</Faixa>}
        {previa && (
          <section className="flex flex-col gap-1" aria-label="Parcelas do contrato">
            <span className="dc-rotulo">Parcelas que o contrato gera</span>
            <ul className="dc-lista-check m-0 list-none p-0">
              {previa.slice(0, 6).map((x) => (
                <li key={`${x.tipo}-${x.numero}`}>
                  <span className="flex-1">{x.descricao}</span>
                  <span className="dc-num">{x.valor === null ? "sem valor ainda" : reais(x.valor)}</span>
                  <span className="dc-num w-14 text-right text-[var(--tinta-3)]">{x.vencimento ? diaCurto(x.vencimento) : "no resultado"}</span>
                </li>
              ))}
              {previa.length > 6 && <li className="text-[var(--tinta-3)]">e mais {previa.length - 6}</li>}
            </ul>
          </section>
        )}
      </div>
    </Dialogo>
  );
}

/* ------------------------------------------------------------------ */
/* A aba financeira de um cliente ou processo                          */
/* ------------------------------------------------------------------ */

export function FinanceiroDoCasoPainel({ tipo, id, caso }: { tipo: "clientes" | "processos"; id: string; caso: Partial<CasoEscolhido> }) {
  const eu = useQuery(euQuery);
  const hoje = eu.data?.hoje ?? "";
  const q = useQuery({ queryKey: ["financeiro", tipo, id], queryFn: () => api<FinanceiroDoCaso>(`/financeiro/${tipo}/${id}`) });
  const [novo, setNovo] = useState(false);
  const [aberta, setAberta] = useState<ParcelaDeHonorario | null>(null);
  const d = q.data;
  return (
    <Painel
      titulo="Honorários"
      acao={
        <Botao pequeno variante="secundaria" onClick={() => setNovo(true)}>
          <Plus /> Novo contrato
        </Botao>
      }
    >
      {!d ? (
        <p className="m-0 dc-nota">Carregando…</p>
      ) : !d.contratos.length ? (
        <Vazio titulo="Nenhum contrato de honorários">Registre o valor combinado, as parcelas ou o percentual de êxito. O alvará sacado calcula a sua parte daqui.</Vazio>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="dc-grade-2">
            <div className="flex flex-col">
              <span className="dc-rotulo">A receber</span>
              <span className="dc-num dc-t-titulo font-semibold">{reais(d.resumo.aReceber)}</span>
            </div>
            <div className="flex flex-col">
              <span className="dc-rotulo">Recebido</span>
              <span className="dc-num dc-t-titulo font-semibold">{reais(d.resumo.recebido)}</span>
            </div>
          </div>
          {d.resumo.emAtraso > 0 && <Faixa tipo="aviso">{reais(d.resumo.emAtraso)} em atraso.</Faixa>}
          {d.contratos.map((c) => (
            <section key={c.id} className="flex flex-col gap-1.5" aria-label={c.titulo}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <strong className="dc-t-corpo">{c.titulo}</strong>
                <span className="dc-nota">
                  {TIPO_DE_CONTRATO[c.tipo]}
                  {c.exitoRotulo ? ` · êxito de ${c.exitoRotulo}` : ""}
                  {c.situacao !== "ativo" ? ` · ${c.situacao === "encerrado" ? "encerrado" : "cancelado"}` : ""}
                </span>
              </div>
              <ul className="dc-lista-check m-0 list-none p-0">
                {c.parcelas
                  .filter((p) => p.situacao !== "cancelada")
                  .slice(0, 8)
                  .map((p) => (
                    <li key={p.id}>
                      <button type="button" className="dc-link flex-1 text-left" onClick={() => setAberta(p)}>
                        {p.descricao}
                      </button>
                      <span className="dc-num">{p.valor === null ? "—" : reais(p.valor)}</span>
                      <SeloDaParcela p={p} hoje={hoje} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <Link to="/financeiro" className="dc-link self-start">
            Abrir no Financeiro
          </Link>
        </div>
      )}
      <NovoContrato aberto={novo} aoFechar={() => setNovo(false)} caso={caso} />
      {aberta && <ParcelaDialogo parcela={aberta} hoje={hoje} aoFechar={() => setAberta(null)} />}
    </Painel>
  );
}

/* ------------------------------------------------------------------ */
/* "Processo sem honorário"                                            */
/* ------------------------------------------------------------------ */

/** O aviso discreto no processo: em andamento, sem contrato de honorários. Dispensa-se de vez. Só para quem vê o Financeiro. */
export function AvisoSemHonorario({ processo }: { processo: { id: string; titulo: string; cliente?: { id: string; nome: string } | null } }) {
  const liberado = useFinanceiroLiberado();
  const atualizar = useAtualizarFinanceiro();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ["financeiro", "processos", processo.id], queryFn: () => api<FinanceiroDoCaso>(`/financeiro/processos/${processo.id}`), enabled: liberado });
  const [novo, setNovo] = useState(false);
  const dispensar = useMutation({
    mutationFn: () => api(`/financeiro/processos/${processo.id}/aviso`, { method: "PUT", json: { dispensar: true } }),
    onSuccess: atualizar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  if (!liberado || !q.data?.semHonorario) return null;
  return (
    <>
      <div className="dc-faixa dc-faixa--nota" role="note">
        <span className="flex-1">Este processo ainda não tem honorário registrado.</span>
        <Botao variante="fantasma" pequeno onClick={() => setNovo(true)}>
          Adicionar honorário
        </Botao>
        <Botao variante="fantasma" pequeno onClick={() => dispensar.mutate()} ocupado={dispensar.isPending}>
          Dispensar
        </Botao>
      </div>
      <NovoContrato aberto={novo} aoFechar={() => setNovo(false)} caso={{ processo: { id: processo.id, titulo: processo.titulo }, cliente: processo.cliente ?? null }} />
    </>
  );
}
