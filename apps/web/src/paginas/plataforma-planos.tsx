/**
 * As abas Planos e Faturas do painel da plataforma. Os planos são do Decreta: o preço, as pessoas incluídas, os
 * limites e o que cada um deixa de fora. Mudar um plano grava a versão seguinte; quem já assina fica na versão que
 * assinou. Os cupons e a duração do teste ficam ao lado. As faturas juntam o que o Asaas cobrou de todos os
 * escritórios num mês: recebido, previsto, em aberto e em atraso.
 */
import {
  descontoDoAnual,
  FUNCIONALIDADES_DO_PLANO,
  LIMITES_DO_PLANO,
  ROTULO_DA_FUNCIONALIDADE_DO_PLANO,
  ROTULO_DO_LIMITE,
  type AjusteDaPlataforma,
  type Cupom,
  type FaturasDaPlataforma,
  type Plano,
  type SituacaoNaLista,
} from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Plus } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Kpi, Kpis, percentual, plural, reais } from "@/componentes/plataforma";
import { AjustesEditaveis, descontoEmTexto } from "@/componentes/plataforma-licenca";
import { Botao, Campo, Carregando, Chip, Faixa, Interruptor, Painel, Selo, Vazio } from "@/componentes/ui";
import { apiPlataforma, mensagemDoErro } from "@/lib/api";
import { campoDeCentavos, centavosDoCampo, diaCompleto, diaCurto, diaDoInstante, numero } from "@/lib/formato";

type PlanoNaLista = Plano & { escritorios: number; assinantes: number };
interface RespostaDosPlanos {
  planos: PlanoNaLista[];
  cupons: Cupom[];
  ajustes: AjusteDaPlataforma[];
  cobranca: { ativa: boolean; asaas: boolean };
  hoje: string;
}

const planosQuery = { queryKey: ["plataforma", "planos"], queryFn: () => apiPlataforma<RespostaDosPlanos>("/planos"), retry: false } as const;

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const limiteEmTexto = (k: (typeof LIMITES_DO_PLANO)[number], v: number) => (ROTULO_DO_LIMITE[k].unidade === "US$" ? `US$ ${NUMERO.format(v)}` : `${NUMERO.format(v)} ${ROTULO_DO_LIMITE[k].unidade}`);

/* ---------------- Planos ---------------- */

export function Planos() {
  const q = useQuery(planosQuery);
  const [editando, setEditando] = useState<PlanoNaLista | "novo" | null>(null);
  const [criandoCupom, setCriandoCupom] = useState(false);
  if (q.isError) return <Faixa tipo="erro">Não deu para carregar os planos agora. Tente de novo em instantes.</Faixa>;
  if (!q.data) return <Carregando />;
  const { planos, cupons, ajustes, cobranca, hoje } = q.data;
  const vivos = planos.filter((p) => !p.substituidoEm).sort((a, b) => Number(b.padrao) - Number(a.padrao) || a.nome.localeCompare(b.nome, "pt-BR"));
  const antigos = planos.filter((p) => p.substituidoEm);
  const padrao = vivos.find((p) => p.padrao);
  return (
    <>
      {!cobranca.ativa && (
        <Faixa tipo="nota">
          <span className="flex-1">
            A cobrança ainda está desligada. O preço do plano padrão já aparece na landing e na tela do Plano de cada escritório, mas nada é cobrado até a cobrança ser ligada no servidor.
          </span>
        </Faixa>
      )}
      {padrao && padrao.mensalCentavos === null && <Faixa tipo="aviso">O plano padrão ainda não tem preço: a landing mostra “Fale com a equipe” e ninguém consegue assinar. Clique em Mudar no plano para pôr o valor.</Faixa>}
      <div className="dc-colunas dc-colunas--meio">
        <div className="dc-pilha">
          <div className="flex items-center justify-between gap-3">
            <h2 className="dc-secao__titulo">Planos</h2>
            <Botao pequeno onClick={() => setEditando("novo")}>
              <Plus aria-hidden /> Novo plano
            </Botao>
          </div>
          {vivos.map((p) => (
            <CartaoDoPlano key={p.id} p={p} aoMudar={() => setEditando(p)} />
          ))}
          {antigos.length > 0 && (
            <Painel titulo="Versões antigas" acao={<span className="dc-nota">Quem assinou nelas continua pagando o mesmo</span>} corpo={false}>
              <div className="dc-tabela-caixa">
                <table className="dc-tabela">
                  <thead>
                    <tr>
                      <th>Plano</th>
                      <th className="dc-direita dc-col--data">Mensal</th>
                      <th className="dc-col--data">Trocada em</th>
                      <th className="dc-direita dc-col--n">Escritórios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {antigos
                      .sort((a, b) => a.codigo.localeCompare(b.codigo) || b.versao - a.versao)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            {p.nome} · versão {p.versao}
                          </td>
                          <td className="dc-direita dc-num">{p.mensalCentavos === null ? "—" : reais(p.mensalCentavos)}</td>
                          <td className="dc-num">{diaCompleto(diaDoInstante(p.substituidoEm!))}</td>
                          <td className="dc-direita dc-num">{numero(p.escritorios)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Painel>
          )}
        </div>
        <div className="dc-pilha">
          <AjustesEditaveis titulo="Teste grátis" ajustes={ajustes} />
          <Painel
            titulo="Cupons"
            acao={
              <Botao pequeno onClick={() => setCriandoCupom(true)}>
                <Plus aria-hidden /> Novo cupom
              </Botao>
            }
            corpo={false}
          >
            {cupons.length ? <ListaDeCupons cupons={cupons} hoje={hoje} /> : <Vazio titulo="Nenhum cupom ainda">Para parceiros, como uma subseção da OAB, e para indicação entre escritórios. O sócio digita o código na tela do Plano.</Vazio>}
          </Painel>
        </div>
      </div>
      <FormularioDoPlano plano={editando} aoFechar={() => setEditando(null)} />
      <NovoCupom aberto={criandoCupom} aoFechar={() => setCriandoCupom(false)} />
    </>
  );
}

function CartaoDoPlano({ p, aoMudar }: { p: PlanoNaLista; aoMudar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const tornar = useMutation({
    mutationFn: () => apiPlataforma(`/planos/${p.id}/padrao`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar(`${p.nome} agora é o plano padrão: é o que aparece na landing e o de quem se cadastra.`);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const anual = descontoDoAnual(p);
  const limites = LIMITES_DO_PLANO.filter((k) => typeof p.limites[k] === "number" && p.limites[k]! > 0);
  const fora = FUNCIONALIDADES_DO_PLANO.filter((f) => p.funcionalidades[f] === false);
  return (
    <Painel
      titulo={
        <span className="flex items-center gap-2">
          {p.nome}
          {p.padrao && <Selo urgencia="cumprido">Padrão</Selo>}
        </span>
      }
      acao={
        <span className="flex gap-2">
          {!p.padrao && (
            <Botao pequeno variante="fantasma" onClick={() => tornar.mutate()} ocupado={tornar.isPending}>
              Tornar padrão
            </Botao>
          )}
          <Botao pequeno onClick={aoMudar}>
            Mudar
          </Botao>
        </span>
      }
    >
      <div className="dc-form">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="dc-kpi__n">{p.mensalCentavos === null ? "Sem preço" : reais(p.mensalCentavos)}</span>
          {p.mensalCentavos !== null && <span className="dc-nota">por mês</span>}
          {p.anualCentavos !== null && (
            <span className="dc-nota">
              · {reais(p.anualCentavos)} por ano{anual ? ` (${percentual(anual)} a menos)` : ""}
            </span>
          )}
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 dc-t-corpo">
          <li>{p.pessoasIncluidas ? `${plural(p.pessoasIncluidas, "pessoa incluída", "pessoas incluídas")}${p.pessoaExtraCentavos ? `, ${reais(p.pessoaExtraCentavos)} por pessoa a mais` : ""}` : "Pessoas sem limite"}</li>
          {limites.map((k) => (
            <li key={k}>
              {ROTULO_DO_LIMITE[k].rotulo}: {limiteEmTexto(k, p.limites[k]!)}
            </li>
          ))}
          {fora.length > 0 && <li>Fica de fora: {fora.map((f) => ROTULO_DA_FUNCIONALIDADE_DO_PLANO[f]).join(", ")}</li>}
        </ul>
        <p className="dc-nota m-0">
          Versão {p.versao}
          {p.criadoPor ? ` · por ${p.criadoPor} em ${diaCurto(diaDoInstante(p.criadoEm))}` : ""} · {plural(p.escritorios, "escritório", "escritórios")}, {plural(p.assinantes, "assinante", "assinantes")}
        </p>
      </div>
    </Painel>
  );
}

/** O formulário de um plano: novo ou a versão seguinte de um que já existe. Os números ficam em texto até salvar. */
function FormularioDoPlano({ plano, aoFechar }: { plano: PlanoNaLista | "novo" | null; aoFechar: () => void }) {
  const aberto = plano !== null;
  const chave = plano === null ? "fechado" : plano === "novo" ? "novo" : plano.id;
  return aberto ? <CorpoDoFormulario key={chave} plano={plano} aoFechar={aoFechar} /> : null;
}

function CorpoDoFormulario({ plano, aoFechar }: { plano: PlanoNaLista | "novo"; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const base = plano === "novo" ? null : plano;
  const [nome, setNome] = useState(base?.nome ?? "");
  const [mensal, setMensal] = useState(campoDeCentavos(base?.mensalCentavos));
  const [anual, setAnual] = useState(campoDeCentavos(base?.anualCentavos));
  const [incluidas, setIncluidas] = useState(base?.pessoasIncluidas ? String(base.pessoasIncluidas) : "");
  const [extra, setExtra] = useState(campoDeCentavos(base?.pessoaExtraCentavos));
  const [limites, setLimites] = useState<Record<string, string>>(Object.fromEntries(LIMITES_DO_PLANO.map((k) => [k, base?.limites[k] ? String(base.limites[k]).replace(".", ",") : ""])));
  const [fora, setFora] = useState<Record<string, boolean>>(Object.fromEntries(FUNCIONALIDADES_DO_PLANO.map((f) => [f, base?.funcionalidades[f] === false])));
  const dinheiro = (t: string) => (t.trim() ? centavosDoCampo(t) : null);
  const erroDoDinheiro = [mensal, anual, extra].some((t) => t.trim() && centavosDoCampo(t) === null);
  const corpo = {
    nome: nome.trim(),
    mensalCentavos: dinheiro(mensal),
    anualCentavos: dinheiro(anual),
    pessoasIncluidas: incluidas.trim() ? Number(incluidas) : null,
    pessoaExtraCentavos: dinheiro(extra),
    limites: Object.fromEntries(LIMITES_DO_PLANO.filter((k) => limites[k]!.trim()).map((k) => [k, Number(limites[k]!.replace(",", "."))])),
    funcionalidades: Object.fromEntries(FUNCIONALIDADES_DO_PLANO.filter((f) => fora[f]).map((f) => [f, false])),
  };
  const valido = corpo.nome.length >= 2 && !erroDoDinheiro && Object.values(corpo.limites).every((v) => Number.isFinite(v) && v >= 0) && (corpo.pessoasIncluidas === null || (Number.isInteger(corpo.pessoasIncluidas) && corpo.pessoasIncluidas >= 1));
  const salvar = useMutation({
    mutationFn: () => (base ? apiPlataforma<{ plano: Plano; passaram: number; ficaram: number }>(`/planos/${base.id}`, { json: corpo }) : apiPlataforma<{ plano: Plano }>("/planos", { json: corpo })),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      const mudou = r as { passaram?: number; ficaram?: number };
      avisar(base ? `Versão ${r.plano.versao} gravada. ${plural(mudou.passaram ?? 0, "escritório passou", "escritórios passaram")} para ela; ${plural(mudou.ficaram ?? 0, "assinante ficou", "assinantes ficaram")} na versão anterior.` : `Plano ${r.plano.nome} criado.`);
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={base ? `Mudar o plano ${base.nome}` : "Novo plano"}
      descricao={base ? `Grava a versão ${base.versao + 1}. Quem ainda não assina passa para ela na hora; quem já assina continua na versão ${base.versao}, com o preço que assinou.` : "O plano novo nasce fora da landing. Para ele aparecer lá, torne-o o padrão."}
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!valido}>
            {base ? `Gravar a versão ${base.versao + 1}` : "Criar o plano"}
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Nome" htmlFor="plano-nome">
          <input id="plano-nome" value={nome} maxLength={60} onChange={(ev) => setNome(ev.target.value)} placeholder="Ex.: Escritório" />
        </Campo>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo rotulo="Mensal (R$)" htmlFor="plano-mensal" ajuda="Em branco: sem preço, a landing pede para falar com a equipe.">
            <input id="plano-mensal" inputMode="decimal" value={mensal} onChange={(ev) => setMensal(ev.target.value)} placeholder="Ex.: 249,00" />
          </Campo>
          <Campo rotulo="Anual (R$)" htmlFor="plano-anual" ajuda="Opcional. Ainda não é cobrado: fica para quando o anual entrar.">
            <input id="plano-anual" inputMode="decimal" value={anual} onChange={(ev) => setAnual(ev.target.value)} placeholder="Ex.: 2.490,00" />
          </Campo>
          <Campo rotulo="Pessoas incluídas" htmlFor="plano-pessoas" ajuda="Em branco: sem limite de pessoas.">
            <input id="plano-pessoas" type="number" min={1} value={incluidas} onChange={(ev) => setIncluidas(ev.target.value)} />
          </Campo>
          <Campo rotulo="Por pessoa a mais (R$)" htmlFor="plano-extra" ajuda="Em branco: não cobra pessoa a mais.">
            <input id="plano-extra" inputMode="decimal" value={extra} onChange={(ev) => setExtra(ev.target.value)} placeholder="Ex.: 49,00" />
          </Campo>
        </div>
        {erroDoDinheiro && <span className="dc-erro-campo">Um dos valores em reais não está certo. Use o formato 249,00.</span>}
        <fieldset className="m-0 grid gap-3 border-0 p-0 md:grid-cols-2">
          <legend className="dc-t-corpo mb-2 font-medium">Limites (em branco: sem limite)</legend>
          {LIMITES_DO_PLANO.map((k) => (
            <Campo key={k} rotulo={`${ROTULO_DO_LIMITE[k].rotulo} (${ROTULO_DO_LIMITE[k].unidade})`} htmlFor={`plano-lim-${k}`}>
              <input id={`plano-lim-${k}`} inputMode="decimal" value={limites[k]} onChange={(ev) => setLimites((l) => ({ ...l, [k]: ev.target.value }))} />
            </Campo>
          ))}
        </fieldset>
        <p className="dc-nota m-0">Passar de um limite avisa o escritório e a equipe; só a IA e o WhatsApp do dia param, porque geram custo novo.</p>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="dc-t-corpo mb-2 font-medium">O que o plano inclui</legend>
          {FUNCIONALIDADES_DO_PLANO.map((f) => (
            <Interruptor key={f} rotulo={ROTULO_DA_FUNCIONALIDADE_DO_PLANO[f]} ligado={!fora[f]} aoMudar={(v) => setFora((x) => ({ ...x, [f]: !v }))} ajuda={fora[f] ? "Fora do plano: o escritório lê o que já tem, mas não cria nada novo." : undefined} />
          ))}
        </fieldset>
      </div>
    </Dialogo>
  );
}

/* ---------------- Cupons ---------------- */

function situacaoDoCupom(c: Cupom, hoje: string): { rotulo: string; urgencia: "cumprido" | "prazo" | "vencido" } {
  if (c.desativadoEm) return { rotulo: "Desativado", urgencia: "prazo" };
  if (c.validoAte && c.validoAte < hoje) return { rotulo: "Vencido", urgencia: "prazo" };
  if (c.limiteDeUsos !== null && c.usos >= c.limiteDeUsos) return { rotulo: "Esgotado", urgencia: "prazo" };
  return { rotulo: "Valendo", urgencia: "cumprido" };
}

function ListaDeCupons({ cupons, hoje }: { cupons: Cupom[]; hoje: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const desativar = useMutation({
    mutationFn: (id: string) => apiPlataforma(`/cupons/${id}/desativar`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar("Cupom desativado. Quem já usou continua com o desconto até o fim.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <div className="dc-linhas">
      {cupons.map((c) => {
        const s = situacaoDoCupom(c, hoje);
        return (
          <div key={c.id} className="dc-linhas__item items-center">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1 dc-num">{c.codigo}</span>
              <span className="dc-celula__2">
                {[`${descontoEmTexto(c)} por ${plural(c.meses, "mês", "meses")}`, c.limiteDeUsos === null ? `${plural(c.usos, "uso", "usos")}` : `${c.usos} de ${c.limiteDeUsos} usos`, c.validoAte ? `até ${diaCompleto(c.validoAte)}` : null, c.nota].filter(Boolean).join(" · ")}
              </span>
            </span>
            <Selo urgencia={s.urgencia}>{s.rotulo}</Selo>
            {!c.desativadoEm && (
              <Botao pequeno variante="fantasma" onClick={() => desativar.mutate(c.id)} ocupado={desativar.isPending && desativar.variables === c.id} aria-label={`Desativar o cupom ${c.codigo}`}>
                Desativar
              </Botao>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NovoCupom({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<"percentual" | "valor">("percentual");
  const [valor, setValor] = useState("");
  const [meses, setMeses] = useState("3");
  const [validoAte, setValidoAte] = useState("");
  const [limite, setLimite] = useState("");
  const [nota, setNota] = useState("");
  const fechar = () => {
    setCodigo("");
    setValor("");
    setValidoAte("");
    setLimite("");
    setNota("");
    aoFechar();
  };
  const v = tipo === "percentual" ? Number(valor) : centavosDoCampo(valor);
  const valido = /^[A-Za-z0-9_-]{3,30}$/.test(codigo.trim()) && !!v && Number.isInteger(v) && (tipo === "valor" || v <= 100) && Number(meses) >= 1;
  const criar = useMutation({
    mutationFn: () => apiPlataforma<{ cupom: Cupom }>("/cupons", { json: { codigo: codigo.trim(), tipo, valor: v, meses: Number(meses), validoAte: validoAte || null, limiteDeUsos: limite.trim() ? Number(limite) : null, nota: nota.trim() || null } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar(`Cupom ${r.cupom.codigo} criado. O sócio digita na tela do Plano, ou a equipe aplica pela ficha.`);
      fechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={fechar}
      titulo="Novo cupom"
      descricao="O desconto vale a partir do dia em que o cupom é usado, pelo número de mensalidades."
      acoes={
        <>
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!valido}>
            Criar o cupom
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Código" htmlFor="cupom-codigo" ajuda="De 3 a 30 letras, números, - ou _. Vira maiúsculo.">
          <input id="cupom-codigo" value={codigo} maxLength={30} autoCapitalize="characters" onChange={(ev) => setCodigo(ev.target.value)} placeholder="Ex.: OAB-SUBSECAO" />
        </Campo>
        <div className="grid gap-3 md:grid-cols-3">
          <Campo rotulo="Tipo" htmlFor="cupom-tipo">
            <select id="cupom-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as "percentual" | "valor")}>
              <option value="percentual">Percentual</option>
              <option value="valor">Valor em reais</option>
            </select>
          </Campo>
          <Campo rotulo={tipo === "percentual" ? "Percentual" : "Valor (R$)"} htmlFor="cupom-valor">
            <input id="cupom-valor" inputMode="decimal" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder={tipo === "percentual" ? "Ex.: 15" : "Ex.: 50,00"} />
          </Campo>
          <Campo rotulo="Mensalidades" htmlFor="cupom-meses">
            <input id="cupom-meses" type="number" min={1} max={36} value={meses} onChange={(ev) => setMeses(ev.target.value)} />
          </Campo>
          <Campo rotulo="Vale até" htmlFor="cupom-validade" ajuda="Em branco: sem data.">
            <input id="cupom-validade" type="date" value={validoAte} onChange={(ev) => setValidoAte(ev.target.value)} />
          </Campo>
          <Campo rotulo="Limite de usos" htmlFor="cupom-limite" ajuda="Em branco: sem limite.">
            <input id="cupom-limite" type="number" min={1} value={limite} onChange={(ev) => setLimite(ev.target.value)} />
          </Campo>
        </div>
        <Campo rotulo="Para que serve (opcional)" htmlFor="cupom-nota">
          <input id="cupom-nota" value={nota} maxLength={200} onChange={(ev) => setNota(ev.target.value)} placeholder="Ex.: parceria com a subseção da OAB" />
        </Campo>
      </div>
    </Dialogo>
  );
}

/* ---------------- Faturas ---------------- */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesPorExtenso = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

const SITUACOES: { id: SituacaoNaLista | "todas"; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "paga", rotulo: "Pagas" },
  { id: "aberta", rotulo: "Em aberto" },
  { id: "atrasada", rotulo: "Atrasadas" },
  { id: "estornada", rotulo: "Estornadas" },
];
const SELO_DA_FATURA: Record<SituacaoNaLista, { rotulo: string; urgencia: "cumprido" | "prazo" | "vencido" | "hoje" }> = {
  paga: { rotulo: "Paga", urgencia: "cumprido" },
  aberta: { rotulo: "Em aberto", urgencia: "prazo" },
  atrasada: { rotulo: "Atrasada", urgencia: "vencido" },
  estornada: { rotulo: "Estornada", urgencia: "hoje" },
};
const FORMA: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão", indefinida: "A escolher" };

export function Faturas() {
  const [mes, setMes] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<SituacaoNaLista | "todas">("todas");
  const q = useQuery({ queryKey: ["plataforma", "faturas", mes ?? "atual"], queryFn: () => apiPlataforma<FaturasDaPlataforma & { cobranca: { ativa: boolean; asaas: boolean; nfse: boolean } }>(`/faturas${mes ? `?mes=${mes}` : ""}`), retry: false });
  const avisar = useAviso();
  if (q.isError) return <Faixa tipo="erro">Não deu para carregar as faturas agora. Tente de novo em instantes.</Faixa>;
  if (!q.data) return <Carregando />;
  const r = q.data;
  const n = r.numeros;
  const itens = r.faturas.filter((f) => filtro === "todas" || f.situacao === filtro);
  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      avisar("Link da fatura copiado. Mande para o escritório pelo WhatsApp ou pelo e-mail.");
    } catch {
      avisar("Não deu para copiar. Abra a fatura e copie o endereço.", { erro: true });
    }
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="dc-nota m-0">
          {r.cobranca.ativa ? "As faturas do Asaas de todos os escritórios." : "A cobrança está desligada: as faturas aparecem aqui quando os escritórios começarem a assinar."}{" "}
          {r.cobranca.nfse ? "A nota fiscal (NFS-e) sai pelo Asaas a cada pagamento." : "A nota fiscal (NFS-e) automática ainda não está configurada no Asaas."}
        </p>
        <select aria-label="Mês" value={r.mes} onChange={(ev) => setMes(ev.target.value)}>
          {r.meses.map((m) => (
            <option key={m} value={m}>
              {mesPorExtenso(m)}
            </option>
          ))}
        </select>
      </div>
      <Kpis rotulo="Faturas do mês">
        <Kpi rotulo="Recebido" n={reais(n.recebidaCentavos)} sub="Pago dentro do mês" />
        <Kpi rotulo="Previsto" n={reais(n.previstaCentavos)} sub="O que vence no mês" />
        <Kpi rotulo="Em aberto" n={reais(n.emAbertoCentavos)} sub={plural(n.porSituacao.aberta, "fatura", "faturas")} />
        <Kpi rotulo="Em atraso" n={reais(n.emAtrasoCentavos)} sub={plural(n.porSituacao.atrasada, "fatura", "faturas")} alerta={n.emAtrasoCentavos > 0 && "vencido"} />
      </Kpis>
      <div className="dc-chips">
        {SITUACOES.map((s) => (
          <Chip key={s.id} ligado={filtro === s.id} n={s.id === "todas" ? r.faturas.length : n.porSituacao[s.id]} onClick={() => setFiltro(s.id)}>
            {s.rotulo}
          </Chip>
        ))}
      </div>
      <Painel corpo={false}>
        {itens.length ? (
          <div className="dc-tabela-caixa">
            <table className="dc-tabela">
              <thead>
                <tr>
                  <th>Escritório</th>
                  <th className="dc-col--data">Vencimento</th>
                  <th className="dc-direita dc-col--data">Valor</th>
                  <th className="dc-col--situacao">Situação</th>
                  <th className="dc-col--data">Pagamento</th>
                  <th className="dc-col--data" />
                </tr>
              </thead>
              <tbody>
                {itens.map((f) => {
                  const s = SELO_DA_FATURA[f.situacao];
                  return (
                    <tr key={f.id}>
                      <td>
                        <Link to="/plataforma/escritorios/$id" params={{ id: f.organizationId }} className="dc-celula no-underline">
                          <span className="dc-celula__1">{f.escritorio}</span>
                        </Link>
                      </td>
                      <td className="dc-num">{diaCompleto(f.vencimento)}</td>
                      <td className="dc-direita dc-num">{reais(f.valorCentavos)}</td>
                      <td>
                        <Selo urgencia={s.urgencia}>{s.rotulo}</Selo>
                      </td>
                      <td className="dc-num">{f.pagaEm ? `${diaCurto(f.pagaEm)}${f.forma ? ` · ${FORMA[f.forma] ?? f.forma}` : ""}` : f.forma ? (FORMA[f.forma] ?? f.forma) : "—"}</td>
                      <td className="dc-direita">
                        {f.link && f.situacao !== "paga" && f.situacao !== "estornada" && (
                          <span className="inline-flex gap-1">
                            <Botao pequeno variante="fantasma" onClick={() => void copiar(f.link!)} aria-label={`Copiar o link da fatura de ${f.escritorio}`}>
                              <Copy aria-hidden /> Copiar link
                            </Botao>
                            <a className="dc-btn dc-btn--fantasma dc-btn--sm" href={f.link} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a fatura de ${f.escritorio} no Asaas`}>
                              <ExternalLink aria-hidden />
                            </a>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio titulo={filtro === "todas" ? `Nenhuma fatura em ${mesPorExtenso(r.mes)}` : "Nenhuma fatura com esse filtro"}>{filtro === "todas" ? "As faturas que o Asaas gera para cada escritório aparecem aqui, pelo mês do vencimento." : "Tente outra situação ou outro mês."}</Vazio>
        )}
      </Painel>
    </>
  );
}
