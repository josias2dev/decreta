/**
 * Aba Cálculos do processo: atualização monetária (débito civil, Fazenda
 * Pública ou índice do contrato), revisional bancária contra a taxa média do
 * Banco Central, o resumo do PJe-Calc e, no previdenciário, o teto e o
 * salário mínimo com a linha do tempo dos documentos lidos.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Calculator, Download, FileText, Landmark, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Campo, Carregando, Faixa, LinhaDoTempo, Painel, Vazio } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, diaDoInstante, dinheiro, paraValor } from "@/lib/formato";
import { Markdown } from "@/lib/markdown";
import type { Processo } from "@/lib/tipos";

type TipoDeCalculo = "atualizacao" | "revisional" | "pjecalc";
type ItemDeCalculo = { id: string; tipo: TipoDeCalculo; titulo: string; total: number | null; documentoId: string | null; criadoEm: string };
type Calculo = ItemDeCalculo & { memoria: string; processoId: string | null };
type TaxaDoBanco = { instituicao: string; cnpj8: string; taxaAoMes: number; taxaAoAno: number; periodos: number };
type Modalidade = { modalidade: string; segmento: "Pessoa Física" | "Pessoa Jurídica"; mensal: boolean };
type Previdenciario = {
  dia: string;
  parametros: { teto: number; salarioMinimo: number; tetoDesde: string; salarioMinimoDesde: string } | null;
  linhaDoTempo: { data: string; tipo: "indeferimento" | "cnis" | "laudo"; documentoId: string; nome: string; evento: number | null; dataNoTexto: boolean; trecho: string | null }[];
};

const TIPO: Record<TipoDeCalculo, string> = { atualizacao: "Atualização monetária", revisional: "Revisional bancária", pjecalc: "PJe-Calc" };
const MARCO = { indeferimento: "Indeferimento do INSS", cnis: "CNIS", laudo: "Laudo ou atestado" } as const;

export function AbaCalculos({ p }: { p: Processo }) {
  const [aberto, setAberto] = useState<"atualizacao" | "revisional" | "pjecalc" | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const lista = useQuery({ queryKey: ["calculos", p.id], queryFn: () => api<{ itens: ItemDeCalculo[] }>(`/calculos?processo=${p.id}`) });
  const itens = lista.data?.itens ?? [];
  const fechar = (id?: string) => {
    setAberto(null);
    if (id) setVer(id);
  };

  return (
    <>
      <Painel
        titulo="Cálculos do processo"
        acao={
          <span className="flex flex-wrap items-center gap-2">
            <Botao pequeno onClick={() => setAberto("atualizacao")}>
              <Calculator /> Atualizar valores
            </Botao>
            <Botao pequeno variante="secundaria" onClick={() => setAberto("revisional")}>
              <Landmark /> Revisional bancária
            </Botao>
            <Botao pequeno variante="secundaria" onClick={() => setAberto("pjecalc")}>
              <Upload /> PJe-Calc
            </Botao>
          </span>
        }
        corpo={false}
      >
        {!lista.data ? (
          <div className="p-4">
            <Carregando linhas={2} />
          </div>
        ) : !itens.length ? (
          <Vazio titulo="Nenhum cálculo ainda">Os índices vêm do Banco Central e o IPCA é conferido no IBGE. A memória sai no timbre e entra no cumprimento de sentença.</Vazio>
        ) : (
          <div className="dc-linhas">
            {itens.map((k) => (
              <button key={k.id} type="button" className="dc-linhas__item text-left" onClick={() => setVer(k.id)}>
                <Calculator className="mt-0.5 size-4 flex-none text-[var(--tinta-3)]" />
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">{k.titulo}</span>
                  <span className="dc-celula__2">{[TIPO[k.tipo], diaCurto(diaDoInstante(k.criadoEm)), k.documentoId && k.tipo !== "pjecalc" && "anexado ao processo"].filter(Boolean).join(" · ")}</span>
                </span>
                {k.total !== null && <span className="dc-num text-[14px] font-semibold">{dinheiro(k.total)}</span>}
              </button>
            ))}
          </div>
        )}
      </Painel>
      <Previdenciario processoId={p.id} />
      {aberto === "atualizacao" && <NovaAtualizacao p={p} aoFechar={fechar} />}
      {aberto === "revisional" && <NovaRevisional p={p} aoFechar={fechar} />}
      {aberto === "pjecalc" && <NovoPjeCalc p={p} aoFechar={fechar} />}
      {ver && <VerCalculo id={ver} processoId={p.id} aoFechar={() => setVer(null)} />}
    </>
  );
}

function VerCalculo({ id, processoId, aoFechar }: { id: string; processoId: string; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const k = useQuery({ queryKey: ["calculo", id], queryFn: () => api<Calculo>(`/calculos/${id}`) });
  const anexar = useMutation({
    mutationFn: () => api<{ documentoId: string }>(`/calculos/${id}/anexar`, { method: "POST" }),
    onSuccess: () => {
      avisar("Memória anexada aos documentos do processo.");
      void qc.invalidateQueries({ queryKey: ["calculos", processoId] });
      void qc.invalidateQueries({ queryKey: ["calculo", id] });
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const calc = k.data;
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={calc?.titulo ?? "Cálculo"}
      descricao={calc ? `${TIPO[calc.tipo]} · ${diaCompleto(diaDoInstante(calc.criadoEm))}` : undefined}
      className="dc-dialogo--largo"
      acoes={
        calc && (
          <>
            <a className="dc-btn dc-btn--secundaria dc-btn--md" href={`${API_URL}/api/app/calculos/${id}/docx`}>
              <Download /> Baixar DOCX
            </a>
            {calc.tipo !== "pjecalc" && !calc.documentoId && (
              <Botao variante="secundaria" onClick={() => anexar.mutate()} ocupado={anexar.isPending}>
                <Paperclip /> Anexar ao processo
              </Botao>
            )}
            <Link className="dc-btn dc-btn--primaria dc-btn--md" to="/pecas" search={{ processo: processoId, tipo: calc.tipo === "revisional" ? "inicial-civel" : "cumprimento-sentenca" }}>
              <FileText /> {calc.tipo === "revisional" ? "Gerar a inicial" : "Gerar cumprimento de sentença"}
            </Link>
          </>
        )
      }
    >
      {calc ? (
        <div className="max-h-[60vh] overflow-y-auto">
          <Markdown texto={calc.memoria} />
        </div>
      ) : k.error ? (
        <Faixa tipo="erro">{mensagemDoErro(k.error)}</Faixa>
      ) : (
        <Carregando linhas={4} />
      )}
    </Dialogo>
  );
}

type Regime = "civil" | "fazenda" | "contratual";
type LinhaDeParcela = { descricao: string; valor: string; vencimento: string };

/** "1,5" e "1.5" valem; "1,5." ou vazio, não: juros errados não podem virar 0% em silêncio. */
function jurosAoMesDe(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n <= 20 ? n : null;
}

function NovaAtualizacao({ p, aoFechar }: { p: Processo; aoFechar: (id?: string) => void }) {
  const qc = useQueryClient();
  const eu = useQuery(euQuery);
  const [f, setF] = useState({ titulo: "Atualização do débito", regime: "civil" as Regime, dataDoCalculo: eu.data?.hoje ?? "", jurosDesde: "", expedicao: "", indice: "ipca", jurosAoMes: "1" });
  const [parcelas, setParcelas] = useState<LinhaDeParcela[]>([{ descricao: "Condenação", valor: "", vencimento: "" }]);
  const mudarParcela = (i: number, campo: keyof LinhaDeParcela, valor: string) => setParcelas(parcelas.map((x, n) => (n === i ? { ...x, [campo]: valor } : x)));
  const prontas = parcelas.every((x) => x.descricao.trim() && paraValor(x.valor) && x.vencimento);

  const calcular = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/calculos/atualizacao", {
        json: {
          processoId: p.id,
          titulo: f.titulo.trim(),
          regime: f.regime === "civil" ? { tipo: "civil" } : f.regime === "fazenda" ? { tipo: "fazenda", ...(f.expedicao ? { expedicao: f.expedicao } : {}) } : { tipo: "contratual", indice: f.indice, jurosAoMes: jurosAoMesDe(f.jurosAoMes) ?? 0 },
          dataDoCalculo: f.dataDoCalculo,
          ...(f.jurosDesde ? { jurosDesde: f.jurosDesde } : {}),
          parcelas: parcelas.map((x) => ({ descricao: x.descricao.trim(), valor: Number(paraValor(x.valor)), vencimento: x.vencimento })),
        },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["calculos", p.id] });
      aoFechar(r.id);
    },
  });

  return (
    <Dialogo
      aberto
      aoFechar={() => aoFechar()}
      titulo="Atualizar valores"
      descricao="Índices do Banco Central, mês a mês, do vencimento ao mês anterior ao do cálculo."
      className="dc-dialogo--largo"
      acoes={
        <>
          <Botao variante="fantasma" onClick={() => aoFechar()}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => calcular.mutate()} ocupado={calcular.isPending} disabled={!prontas || !f.dataDoCalculo || f.titulo.trim().length < 2 || (f.regime === "contratual" && jurosAoMesDe(f.jurosAoMes) === null)}>
            Calcular
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <div className="dc-grade-2">
          <Campo rotulo="Nome do cálculo" htmlFor="ca-titulo">
            <input id="ca-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          </Campo>
          <Campo rotulo="Regime" htmlFor="ca-regime">
            <select id="ca-regime" value={f.regime} onChange={(e) => setF({ ...f, regime: e.target.value as Regime })}>
              <option value="civil">Débito civil: IPCA e Taxa Legal</option>
              <option value="fazenda">Fazenda Pública: SELIC (EC 113)</option>
              <option value="contratual">Índice do contrato</option>
            </select>
          </Campo>
          <Campo rotulo="Data do cálculo" htmlFor="ca-data">
            <input id="ca-data" type="date" value={f.dataDoCalculo} onChange={(e) => setF({ ...f, dataDoCalculo: e.target.value })} />
          </Campo>
          {f.regime === "fazenda" ? (
            <Campo rotulo="Expedição do requisitório" htmlFor="ca-expedicao" ajuda="Daí em diante, IPCA + 2% a.a., limitado à SELIC.">
              <input id="ca-expedicao" type="date" value={f.expedicao} onChange={(e) => setF({ ...f, expedicao: e.target.value })} />
            </Campo>
          ) : (
            <Campo rotulo="Juros desde" htmlFor="ca-juros-desde" ajuda="Citação ou evento danoso. Vazio: o vencimento de cada parcela.">
              <input id="ca-juros-desde" type="date" value={f.jurosDesde} onChange={(e) => setF({ ...f, jurosDesde: e.target.value })} />
            </Campo>
          )}
          {f.regime === "contratual" && (
            <>
              <Campo rotulo="Índice" htmlFor="ca-indice">
                <select id="ca-indice" value={f.indice} onChange={(e) => setF({ ...f, indice: e.target.value })}>
                  <option value="ipca">IPCA</option>
                  <option value="inpc">INPC</option>
                  <option value="ipcae">IPCA-E</option>
                  <option value="selic">SELIC</option>
                  <option value="tr">TR</option>
                  <option value="nenhum">Sem correção</option>
                </select>
              </Campo>
              <Campo rotulo="Juros ao mês (%)" htmlFor="ca-juros">
                <input id="ca-juros" inputMode="decimal" value={f.jurosAoMes} onChange={(e) => setF({ ...f, jurosAoMes: e.target.value.replace(/[^\d,.]/g, "").slice(0, 6) })} />
              </Campo>
            </>
          )}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="dc-rotulo mb-1">Parcelas</legend>
          {parcelas.map((x, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <Campo rotulo="Descrição" htmlFor={`ca-desc-${i}`}>
                <input id={`ca-desc-${i}`} value={x.descricao} onChange={(e) => mudarParcela(i, "descricao", e.target.value)} />
              </Campo>
              <Campo rotulo="Valor (R$)" htmlFor={`ca-valor-${i}`}>
                <input id={`ca-valor-${i}`} inputMode="decimal" value={x.valor} onChange={(e) => mudarParcela(i, "valor", e.target.value)} placeholder="1.000,00" />
              </Campo>
              <Campo rotulo="Vencimento" htmlFor={`ca-venc-${i}`}>
                <input id={`ca-venc-${i}`} type="date" value={x.vencimento} onChange={(e) => mudarParcela(i, "vencimento", e.target.value)} />
              </Campo>
              <Botao variante="fantasma" pequeno aria-label={`Tirar a parcela ${i + 1}`} disabled={parcelas.length === 1} onClick={() => setParcelas(parcelas.filter((_, n) => n !== i))}>
                <Trash2 />
              </Botao>
            </div>
          ))}
          <span>
            <Botao variante="fantasma" pequeno onClick={() => setParcelas([...parcelas, { descricao: `Parcela ${parcelas.length + 1}`, valor: "", vencimento: "" }])}>
              <Plus /> Parcela
            </Botao>
          </span>
        </fieldset>
        {calcular.error && <Faixa tipo="erro">{mensagemDoErro(calcular.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function NovaRevisional({ p, aoFechar }: { p: Processo; aoFechar: (id?: string) => void }) {
  const qc = useQueryClient();
  const [modalidade, setModalidade] = useState("Crédito pessoal não consignado - Prefixado|Pessoa Física");
  const [mes, setMes] = useState("");
  const [cnpj8, setCnpj8] = useState("");
  const [taxa, setTaxa] = useState("");
  const [nome, segmento] = modalidade.split("|") as [string, Modalidade["segmento"]];
  const modalidades = useQuery({ queryKey: ["calculos", "modalidades"], queryFn: () => api<{ itens: Modalidade[] }>("/calculos/modalidades"), staleTime: Infinity });
  const taxas = useQuery({
    queryKey: ["calculos", "taxas", modalidade, mes],
    queryFn: () => api<{ bancos: TaxaDoBanco[] }>(`/calculos/taxas?modalidade=${encodeURIComponent(nome)}&segmento=${encodeURIComponent(segmento)}&mes=${mes}`),
    enabled: /^\d{4}-\d{2}$/.test(mes),
  });
  const taxaDoContrato = Number(taxa.replace(",", "."));
  const comparar = useMutation({
    mutationFn: () => api<{ id: string }>("/calculos/revisional", { json: { processoId: p.id, modalidade: nome, segmento, mes, cnpj8, taxaContratoAoMes: taxaDoContrato } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["calculos", p.id] });
      aoFechar(r.id);
    },
  });
  return (
    <Dialogo
      aberto
      aoFechar={() => aoFechar()}
      titulo="Revisional bancária"
      descricao="A taxa do contrato contra a taxa média do mesmo banco, na mesma modalidade e no mesmo mês, publicada pelo Banco Central."
      acoes={
        <>
          <Botao variante="fantasma" onClick={() => aoFechar()}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => comparar.mutate()} ocupado={comparar.isPending} disabled={!cnpj8 || !(taxaDoContrato > 0)}>
            Comparar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Modalidade" htmlFor="rv-modalidade">
          <select id="rv-modalidade" value={modalidade} onChange={(e) => (setModalidade(e.target.value), setCnpj8(""))}>
            {(modalidades.data?.itens ?? []).map((m) => (
              <option key={`${m.modalidade}|${m.segmento}`} value={`${m.modalidade}|${m.segmento}`}>
                {m.modalidade} ({m.segmento})
              </option>
            ))}
          </select>
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Mês da contratação" htmlFor="rv-mes">
            <input id="rv-mes" type="month" value={mes} onChange={(e) => (setMes(e.target.value), setCnpj8(""))} />
          </Campo>
          <Campo rotulo="Taxa do contrato (% ao mês)" htmlFor="rv-taxa">
            <input id="rv-taxa" inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))} placeholder="4,50" />
          </Campo>
        </div>
        <Campo rotulo="Banco" htmlFor="rv-banco" ajuda={taxas.isFetching ? "Buscando as taxas no Banco Central…" : undefined}>
          <select id="rv-banco" value={cnpj8} onChange={(e) => setCnpj8(e.target.value)} disabled={!taxas.data?.bancos.length}>
            <option value="">{taxas.data && !taxas.data.bancos.length ? "O Banco Central não publicou taxas nesse mês" : "Escolha o banco do contrato"}</option>
            {(taxas.data?.bancos ?? []).map((b) => (
              <option key={b.cnpj8} value={b.cnpj8}>
                {b.instituicao} · {b.taxaAoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}% ao mês
              </option>
            ))}
          </select>
        </Campo>
        {taxas.error && <Faixa tipo="erro">{mensagemDoErro(taxas.error)}</Faixa>}
        {comparar.error && <Faixa tipo="erro">{mensagemDoErro(comparar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function NovoPjeCalc({ p, aoFechar }: { p: Processo; aoFechar: (id?: string) => void }) {
  const qc = useQueryClient();
  const [relatorio, setRelatorio] = useState<File | null>(null);
  const [pjc, setPjc] = useState<File | null>(null);
  const enviar = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set("processoId", p.id);
      form.set("relatorio", relatorio!);
      if (pjc) form.set("pjc", pjc);
      return api<{ id: string }>("/calculos/pjecalc", { form });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["calculos", p.id] });
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
      aoFechar(r.id);
    },
  });
  return (
    <Dialogo
      aberto
      aoFechar={() => aoFechar()}
      titulo="Cálculo do PJe-Calc"
      descricao="O PJe-Calc não tem integração: anexe o arquivo .PJC e o relatório em PDF. O Decreta guarda os dois no processo e tira o resumo do relatório."
      acoes={
        <>
          <Botao variante="fantasma" onClick={() => aoFechar()}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => enviar.mutate()} ocupado={enviar.isPending} disabled={!relatorio}>
            Anexar e ler
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Relatório do cálculo (PDF)" htmlFor="pj-relatorio">
          <input id="pj-relatorio" type="file" accept="application/pdf,.pdf" onChange={(e) => setRelatorio(e.target.files?.[0] ?? null)} />
        </Campo>
        <Campo rotulo="Arquivo do PJe-Calc (.PJC), opcional" htmlFor="pj-arquivo">
          <input id="pj-arquivo" type="file" accept=".pjc,.PJC" onChange={(e) => setPjc(e.target.files?.[0] ?? null)} />
        </Campo>
        {enviar.error && <Faixa tipo="erro">{mensagemDoErro(enviar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function Previdenciario({ processoId }: { processoId: string }) {
  const q = useQuery({ queryKey: ["calculos", processoId, "previdenciario"], queryFn: () => api<Previdenciario>(`/calculos/previdenciario?processo=${processoId}`) });
  const d = q.data;
  const ano = d?.dia.slice(0, 4);
  return (
    <Painel titulo="Previdenciário">
      {!d ? (
        <Carregando linhas={2} />
      ) : (
        <div className="flex flex-col gap-4">
          {d.parametros && (
            <p className="text-[14px] leading-[20px] text-[var(--tinta-2)]">
              Em {ano}: teto do INSS de <strong className="dc-num">{dinheiro(d.parametros.teto)}</strong> e salário mínimo de <strong className="dc-num">{dinheiro(d.parametros.salarioMinimo)}</strong>.
            </p>
          )}
          {d.linhaDoTempo.length ? (
            <LinhaDoTempo
              itens={d.linhaDoTempo.map((m) => ({
                data: diaCompleto(m.data),
                titulo: MARCO[m.tipo],
                detalhe: (
                  <span className="block text-[13px] text-[var(--tinta-2)]">
                    {[m.nome, m.evento != null && `evento ${m.evento}`, !m.dataNoTexto && "data do envio"].filter(Boolean).join(" · ")}
                    {m.trecho && <span className="block">{m.trecho}</span>}
                  </span>
                ),
              }))}
            />
          ) : (
            <p className="dc-nota">Laudos, CNIS e indeferimentos do INSS aparecem aqui assim que os documentos forem lidos.</p>
          )}
        </div>
      )}
    </Painel>
  );
}
