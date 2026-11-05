/**
 * A licença de cada escritório no painel da plataforma: o painel da ficha (plano, preço, desconto e o uso contra os
 * limites), as notas da equipe com o dia de retorno, o diálogo das ações da licença e os ajustes que saíram do `.env`.
 * Tudo é a conta do escritório com o Decreta; nada do que é dele aparece aqui.
 */
import {
  MARCAS_DO_ESCRITORIO,
  ROTULO_DA_MARCA,
  type AjusteDaPlataforma,
  type DescontoDoEscritorio,
  type FichaCompleta,
  type ItemDaLicenca,
  type MarcaDoEscritorio,
  type NotaDaEquipe,
} from "@decreta/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Medidor, reais } from "@/componentes/plataforma";
import { Botao, Campo, Dados, Faixa, Painel, Selo, Vazio } from "@/componentes/ui";
import { apiPlataforma, mensagemDoErro } from "@/lib/api";
import { campoDeCentavos, centavosDoCampo, diaCompleto, diaCurto, diaDoInstante } from "@/lib/formato";

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** "15% por 6 meses", "R$ 50,00 até 04/02/2027". */
export const descontoEmTexto = (d: Pick<DescontoDoEscritorio, "tipo" | "valor">) => (d.tipo === "percentual" ? `${d.valor}%` : reais(d.valor));

/** O uso contra o limite, como se lê: "1.240 de 2.000 processos", "US$ 12,30 de US$ 50". */
export function usoEmTexto(i: Pick<ItemDaLicenca, "usado" | "limite" | "unidade">): string {
  const n = (v: number) => (i.unidade === "US$" ? `US$ ${NUMERO.format(v)}` : NUMERO.format(v));
  if (i.limite === null) return i.unidade === "US$" ? `${n(i.usado)}, sem limite` : `${n(i.usado)} ${i.unidade}, sem limite`;
  return i.unidade === "US$" ? `${n(i.usado)} de ${n(i.limite)}` : `${n(i.usado)} de ${n(i.limite)} ${i.unidade}`;
}

export const SELO_DO_LIMITE = { ok: null, perto: { urgencia: "hoje" as const, rotulo: "80%" }, passou: { urgencia: "vencido" as const, rotulo: "Passou" } };

/* ---------------- A licença na ficha ---------------- */

export function PainelDaLicenca({ f, aoAgir }: { f: FichaCompleta; aoAgir: () => void }) {
  const l = f.licenca;
  const tetos = l.tetosIa;
  const linhas: [string, string][] = [
    ["Plano", `${l.plano.nome} · versão ${l.plano.versao}${l.versaoAntiga ? " (antiga)" : ""}`],
    ["Mensalidade", l.preco.mensalidadeCentavos === null ? "Sem preço definido" : `${reais(l.preco.mensalidadeCentavos)}${l.preco.combinado ? " (valor combinado)" : ""}`],
  ];
  if (l.preco.descontoCentavos > 0 && l.preco.cheioCentavos !== null) linhas.push(["Sem o desconto", reais(l.preco.cheioCentavos)]);
  if (l.desconto) linhas.push(["Desconto", `${descontoEmTexto(l.desconto)} até ${diaCompleto(l.desconto.ate)}${l.desconto.cupom ? ` · cupom ${l.desconto.cupom}` : ""}`]);
  if (l.pessoasExtras) linhas.push(["Pessoas a mais", `${l.pessoasExtras}${l.plano.pessoaExtraCentavos ? ` × ${reais(l.plano.pessoaExtraCentavos)}` : ""}`]);
  if (tetos) linhas.push(["Tetos de IA próprios", [tetos.diaUsd != null ? `US$ ${NUMERO.format(tetos.diaUsd)} por dia` : null, tetos.mesUsd != null ? `US$ ${NUMERO.format(tetos.mesUsd)} por mês` : null, tetos.mensagensPorDia != null ? `${tetos.mensagensPorDia} mensagens por pessoa` : null].filter(Boolean).join(" · ") || "Os do plano"]);
  if (l.marca) linhas.push(["Marca", ROTULO_DA_MARCA[l.marca]]);
  return (
    <Painel
      titulo="Licença"
      acao={
        <Botao pequeno onClick={aoAgir} disabled={f.escritorio.demonstracao || f.escritorio.encerrado}>
          Mudar
        </Botao>
      }
      corpo={false}
    >
      <div className="px-[var(--respiro-painel)] py-3">
        <Dados linhas={linhas} />
      </div>
      <div className="dc-linhas border-t border-[var(--superficie-2)]">
        {l.uso.itens.map((i) => {
          const selo = SELO_DO_LIMITE[i.estado];
          return (
            <div key={i.chave} className="dc-linhas__item items-center">
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-t-corpo">{i.rotulo}</span>
                <span className="dc-celula__2">{usoEmTexto(i)}</span>
              </span>
              {i.limite !== null && <Medidor fracao={i.fracao} />}
              {selo && <Selo urgencia={selo.urgencia}>{selo.rotulo}</Selo>}
            </div>
          );
        })}
      </div>
    </Painel>
  );
}

/* ---------------- As notas da equipe ---------------- */

export function NotasDaEquipe({ organizationId, notas, hoje }: { organizationId: string; notas: NotaDaEquipe[]; hoje: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [texto, setTexto] = useState("");
  const [contato, setContato] = useState("");
  const [passo, setPasso] = useState("");
  const [retorno, setRetorno] = useState("");
  const limpar = () => {
    setTexto("");
    setContato("");
    setPasso("");
    setRetorno("");
  };
  const anotar = useMutation({
    mutationFn: () => apiPlataforma(`/escritorios/${organizationId}/notas`, { json: { texto: texto.trim(), contato: contato.trim() || null, proximoPasso: passo.trim() || null, retornoEm: retorno || null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      limpar();
      avisar(retorno ? `Nota guardada. O retorno de ${diaCompleto(retorno)} aparece em Precisa de atenção.` : "Nota guardada.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const feito = useMutation({
    mutationFn: (id: string) => apiPlataforma(`/notas/${id}/retorno-feito`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar("Retorno marcado como feito.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Painel titulo="Notas da equipe" acao={<span className="dc-nota">Só a equipe do Decreta vê</span>} corpo={false}>
      <form
        className="dc-form px-[var(--respiro-painel)] py-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (texto.trim()) anotar.mutate();
        }}
      >
        <Campo rotulo="Nota" htmlFor="nota-texto" ajuda="A conversa com o escritório, o que ele pediu, o que ficou combinado. Não anote dado de cliente dele.">
          <textarea id="nota-texto" rows={3} value={texto} maxLength={4000} onChange={(ev) => setTexto(ev.target.value)} placeholder="Ex.: a sócia pediu proposta para 6 pessoas" />
        </Campo>
        <Campo rotulo="Próximo passo" htmlFor="nota-passo">
          <input id="nota-passo" value={passo} maxLength={300} onChange={(ev) => setPasso(ev.target.value)} placeholder="Ex.: mandar a proposta" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Contato" htmlFor="nota-contato">
            <input id="nota-contato" value={contato} maxLength={200} onChange={(ev) => setContato(ev.target.value)} placeholder="Ex.: WhatsApp da sócia" />
          </Campo>
          <Campo rotulo="Retorno em" htmlFor="nota-retorno">
            <input id="nota-retorno" type="date" value={retorno} min={hoje} onChange={(ev) => setRetorno(ev.target.value)} />
          </Campo>
        </div>
        <Botao className="md:self-start" type="submit" ocupado={anotar.isPending} disabled={!texto.trim()}>
          Guardar a nota
        </Botao>
      </form>
      {notas.length ? (
        <div className="dc-linhas border-t border-[var(--superficie-2)]">
          {notas.map((n) => {
            const pendente = n.retornoEm && !n.retornoFeitoEm;
            return (
              <div key={n.id} className="dc-linhas__item">
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-t-corpo whitespace-pre-line">{n.texto}</span>
                  <span className="dc-celula__2">
                    {[`${diaCurto(diaDoInstante(n.criadaEm))} · ${n.operador}`, n.contato, n.proximoPasso ? `Próximo passo: ${n.proximoPasso}` : null, n.retornoEm ? `Retorno ${diaCompleto(n.retornoEm)}${n.retornoFeitoEm ? " (feito)" : ""}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {pendente && (
                  <span className="flex flex-none items-center gap-2">
                    {n.retornoEm! <= hoje && <Selo urgencia={n.retornoEm! < hoje ? "vencido" : "hoje"}>{n.retornoEm! < hoje ? "Atrasado" : "Hoje"}</Selo>}
                    <Botao pequeno onClick={() => feito.mutate(n.id)} ocupado={feito.isPending && feito.variables === n.id}>
                      Retorno feito
                    </Botao>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Vazio titulo="Nenhuma nota ainda">O contato, o próximo passo e o dia de voltar a falar ficam aqui. O retorno marcado aparece em Precisa de atenção.</Vazio>
      )}
    </Painel>
  );
}

/* ---------------- As ações da licença ---------------- */

type AcaoNaLicenca = "licenca" | "desconto" | "tirar_desconto" | "cupom" | "tetos_ia" | "estender_acesso" | "marcar" | "novo_link" | "encerrar";

const ACOES_DA_LICENCA: { id: AcaoNaLicenca; rotulo: string; ajuda: string; vale: (f: FichaCompleta) => boolean }[] = [
  { id: "licenca", rotulo: "Mudar o plano e o valor", ajuda: "O plano, as pessoas a mais e, se for o caso, um valor combinado no lugar do preço. Quem assina passa a pagar o valor novo a partir da próxima fatura.", vale: () => true },
  { id: "desconto", rotulo: "Dar um desconto", ajuda: "Um percentual ou um valor por um número de mensalidades, a partir de hoje.", vale: () => true },
  { id: "tirar_desconto", rotulo: "Tirar o desconto", ajuda: "O desconto que vale hoje acaba agora. A próxima fatura sai com o preço cheio.", vale: (f) => !!f.licenca.desconto },
  { id: "cupom", rotulo: "Aplicar um cupom", ajuda: "Gasta um uso do cupom e dá o desconto dele, a partir de hoje.", vale: () => true },
  { id: "tetos_ia", rotulo: "Tetos de IA próprios", ajuda: "Acima ou abaixo do padrão, só para este escritório. Em branco: vale o padrão do site e do plano.", vale: () => true },
  { id: "estender_acesso", rotulo: "Estender o acesso", ajuda: "Quem cancelou ganha mais dias com tudo, como gesto comercial. Nada é cobrado por eles.", vale: (f) => !!f.escritorio.cancelamentoPedidoEm && !!f.escritorio.acessoAte },
  { id: "marcar", rotulo: "Marcar como piloto, parceiro ou indicação", ajuda: "Só a equipe vê. Aparece na lista e na planilha.", vale: () => true },
  { id: "novo_link", rotulo: "Gerar outro link de pagamento", ajuda: "Tira do ar o link guardado. O próximo Assinar gera um novo, com o preço de hoje.", vale: (f) => f.cobranca.linkGuardado },
  { id: "encerrar", rotulo: "Encerrar a pedido do escritório", ajuda: "Os dados somem em 30 dias, como quando o sócio encerra. Só faça com o pedido por escrito.", vale: () => true },
];

export function AgirNaLicenca({ ficha, aberto, aoFechar }: { ficha: FichaCompleta; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const l = ficha.licenca;
  const [acao, setAcao] = useState<AcaoNaLicenca | "">("");
  const [planoId, setPlanoId] = useState(l.plano.id);
  const [extras, setExtras] = useState(String(l.pessoasExtras));
  const [combinado, setCombinado] = useState(l.preco.combinado ? campoDeCentavos(l.preco.cheioCentavos) : "");
  const [tipo, setTipo] = useState<"percentual" | "valor">("percentual");
  const [valor, setValor] = useState("");
  const [meses, setMeses] = useState("3");
  const [codigo, setCodigo] = useState("");
  const [diaUsd, setDiaUsd] = useState(l.tetosIa?.diaUsd != null ? String(l.tetosIa.diaUsd) : "");
  const [mesUsd, setMesUsd] = useState(l.tetosIa?.mesUsd != null ? String(l.tetosIa.mesUsd) : "");
  const [mensagens, setMensagens] = useState(l.tetosIa?.mensagensPorDia != null ? String(l.tetosIa.mensagensPorDia) : "");
  const [dias, setDias] = useState("15");
  const [marca, setMarca] = useState<MarcaDoEscritorio | "">(l.marca ?? "");
  const [confirmacao, setConfirmacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const possiveis = ACOES_DA_LICENCA.filter((a) => a.vale(ficha));
  const escolhida = possiveis.find((a) => a.id === (acao || possiveis[0]?.id))!;
  const fechar = () => {
    setAcao("");
    setMotivo("");
    setConfirmacao("");
    setCodigo("");
    setValor("");
    aoFechar();
  };
  const numeroOuNulo = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));
  const corpo = (): Record<string, unknown> | null => {
    const m = motivo.trim() || null;
    switch (escolhida.id) {
      case "licenca": {
        const valorCombinado = combinado.trim() ? centavosDoCampo(combinado) : null;
        if (combinado.trim() && valorCombinado === null) return null;
        return { acao: "licenca", planoId, pessoasExtras: Number(extras) || 0, valorCombinadoCentavos: valorCombinado, motivo: m };
      }
      case "desconto": {
        const v = tipo === "percentual" ? Number(valor) : centavosDoCampo(valor);
        if (!v || !Number.isInteger(v)) return null;
        return { acao: "desconto", tipo, valor: v, meses: Number(meses), motivo: m };
      }
      case "cupom":
        return codigo.trim().length >= 3 ? { acao: "cupom", codigo: codigo.trim(), motivo: m } : null;
      case "tetos_ia":
        return { acao: "tetos_ia", tetos: { diaUsd: numeroOuNulo(diaUsd), mesUsd: numeroOuNulo(mesUsd), mensagensPorDia: numeroOuNulo(mensagens) }, motivo: m };
      case "estender_acesso":
        return Number(dias) >= 1 ? { acao: "estender_acesso", dias: Number(dias), motivo: m } : null;
      case "marcar":
        return { acao: "marcar", marca: marca || null, motivo: m };
      case "encerrar":
        return confirmacao.trim() && m ? { acao: "encerrar", confirmacao: confirmacao.trim(), motivo: m } : null;
      default:
        return { acao: escolhida.id, motivo: m };
    }
  };
  const pedido = aberto ? corpo() : null;
  const agir = useMutation({
    mutationFn: () => apiPlataforma<{ valorNoAsaas?: { de: number | null; para: number } | null }>(`/escritorios/${ficha.escritorio.id}/acao`, { json: pedido }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar(`${escolhida.rotulo}: feito.${r.valorNoAsaas ? ` A assinatura no Asaas passa a ${reais(r.valorNoAsaas.para)} a partir da próxima fatura.` : ""}`);
      fechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={fechar}
      titulo={`Licença de ${ficha.escritorio.nome}`}
      descricao="Toda mudança fica registrada, com o seu e-mail e o motivo."
      acoes={
        <>
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao variante={escolhida.id === "encerrar" ? "perigo" : "primaria"} onClick={() => agir.mutate()} ocupado={agir.isPending} disabled={!pedido}>
            {escolhida.id === "encerrar" ? "Encerrar o escritório" : "Confirmar"}
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="O que mudar" htmlFor="lic-acao" ajuda={escolhida.ajuda}>
          <select id="lic-acao" value={escolhida.id} onChange={(ev) => setAcao(ev.target.value as AcaoNaLicenca)}>
            {possiveis.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        {escolhida.id === "licenca" && (
          <>
            <Campo rotulo="Plano" htmlFor="lic-plano">
              <select id="lic-plano" value={planoId} onChange={(ev) => setPlanoId(ev.target.value)}>
                {ficha.planos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · versão {p.versao} · {p.mensalCentavos === null ? "sem preço" : `${reais(p.mensalCentavos)} por mês`}
                    {p.vivo ? "" : " (antiga, a atual dele)"}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid gap-3 md:grid-cols-2">
              <Campo rotulo="Pessoas a mais" htmlFor="lic-extras" ajuda={l.plano.pessoasIncluidas ? `O plano inclui ${l.plano.pessoasIncluidas}.` : "O plano não limita pessoas."}>
                <input id="lic-extras" type="number" min={0} max={500} value={extras} onChange={(ev) => setExtras(ev.target.value)} />
              </Campo>
              <Campo rotulo="Valor combinado (R$ por mês)" htmlFor="lic-combinado" ajuda="Em branco: vale o preço do plano.">
                <input id="lic-combinado" inputMode="decimal" value={combinado} onChange={(ev) => setCombinado(ev.target.value)} placeholder="Ex.: 199,00" />
              </Campo>
            </div>
          </>
        )}

        {escolhida.id === "desconto" && (
          <div className="grid gap-3 md:grid-cols-3">
            <Campo rotulo="Tipo" htmlFor="lic-tipo">
              <select id="lic-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as "percentual" | "valor")}>
                <option value="percentual">Percentual</option>
                <option value="valor">Valor em reais</option>
              </select>
            </Campo>
            <Campo rotulo={tipo === "percentual" ? "Percentual" : "Valor (R$)"} htmlFor="lic-valor" ajuda={tipo === "percentual" ? "De 1 a 100." : undefined}>
              <input id="lic-valor" inputMode="decimal" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder={tipo === "percentual" ? "Ex.: 20" : "Ex.: 50,00"} />
            </Campo>
            <Campo rotulo="Por quantas mensalidades" htmlFor="lic-meses">
              <input id="lic-meses" type="number" min={1} max={36} value={meses} onChange={(ev) => setMeses(ev.target.value)} />
            </Campo>
          </div>
        )}

        {escolhida.id === "cupom" && (
          <Campo rotulo="Código do cupom" htmlFor="lic-cupom">
            <input id="lic-cupom" value={codigo} maxLength={40} autoCapitalize="characters" onChange={(ev) => setCodigo(ev.target.value)} placeholder="Ex.: OAB-SUBSECAO" />
          </Campo>
        )}

        {escolhida.id === "tetos_ia" && (
          <div className="grid gap-3 md:grid-cols-3">
            <Campo rotulo="Por dia (US$)" htmlFor="lic-dia" ajuda="Todo o escritório. Zero: sem teto.">
              <input id="lic-dia" inputMode="decimal" value={diaUsd} onChange={(ev) => setDiaUsd(ev.target.value)} placeholder="Padrão" />
            </Campo>
            <Campo rotulo="Por mês (US$)" htmlFor="lic-mes" ajuda="No lugar do limite do plano.">
              <input id="lic-mes" inputMode="decimal" value={mesUsd} onChange={(ev) => setMesUsd(ev.target.value)} placeholder="Padrão" />
            </Campo>
            <Campo rotulo="Mensagens por pessoa por dia" htmlFor="lic-msgs" ajuda="No chat Perguntar.">
              <input id="lic-msgs" type="number" min={0} value={mensagens} onChange={(ev) => setMensagens(ev.target.value)} placeholder="Padrão" />
            </Campo>
          </div>
        )}

        {escolhida.id === "estender_acesso" && (
          <Campo rotulo="Quantos dias a mais" htmlFor="lic-dias" ajuda={`Hoje o acesso vai até ${diaCompleto(ficha.escritorio.acessoAte!)}. De 1 a 90.`}>
            <input id="lic-dias" type="number" min={1} max={90} value={dias} onChange={(ev) => setDias(ev.target.value)} />
          </Campo>
        )}

        {escolhida.id === "marcar" && (
          <Campo rotulo="Marca" htmlFor="lic-marca">
            <select id="lic-marca" value={marca} onChange={(ev) => setMarca(ev.target.value as MarcaDoEscritorio | "")}>
              <option value="">Nenhuma</option>
              {MARCAS_DO_ESCRITORIO.map((k) => (
                <option key={k} value={k}>
                  {ROTULO_DA_MARCA[k]}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {escolhida.id === "encerrar" && (
          <>
            <Faixa tipo="erro">O escritório para na hora, a assinatura no Asaas é cancelada e os dados são apagados em 30 dias. Antes disso, o sócio ainda pode levar uma cópia.</Faixa>
            <Campo rotulo={`Digite o nome do escritório: ${ficha.escritorio.nome}`} htmlFor="lic-confirmacao">
              <input id="lic-confirmacao" value={confirmacao} maxLength={200} onChange={(ev) => setConfirmacao(ev.target.value)} autoComplete="off" />
            </Campo>
          </>
        )}

        <Campo rotulo={escolhida.id === "encerrar" ? "Quem pediu e por onde" : "Motivo (opcional)"} htmlFor="lic-motivo" ajuda="Fica na auditoria.">
          <input id="lic-motivo" value={motivo} maxLength={300} onChange={(ev) => setMotivo(ev.target.value)} placeholder={escolhida.id === "encerrar" ? "Ex.: e-mail da sócia de 05/11" : "Ex.: parceria com a subseção"} />
        </Campo>
      </div>
    </Dialogo>
  );
}

/* ---------------- Os ajustes que saíram do .env ---------------- */

function valorDoAjuste(a: Pick<AjusteDaPlataforma, "unidade" | "inteiro">, v: number) {
  const n = a.inteiro ? String(v) : NUMERO.format(v);
  if (a.unidade === "US$") return `US$ ${n}`;
  if (a.unidade === "R$ por US$") return `R$ ${n}`;
  return `${n} ${a.unidade}`;
}

/** Os ajustes de um grupo: o valor de agora, o padrão e quem mudou por último. Mudar vale na hora, sem reiniciar. */
export function AjustesEditaveis({ ajustes, titulo }: { ajustes: AjusteDaPlataforma[]; titulo: string }) {
  const [editando, setEditando] = useState<AjusteDaPlataforma | null>(null);
  return (
    <Painel titulo={titulo} acao={<span className="dc-nota">Vale na hora, sem reiniciar</span>} corpo={false}>
      <div className="dc-linhas">
        {ajustes.map((a) => (
          <div key={a.chave} className="dc-linhas__item items-center">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-t-corpo">{a.rotulo}</span>
              <span className="dc-celula__2">{a.mudadoPor ? `Mudado por ${a.mudadoPor} em ${diaCurto(diaDoInstante(a.mudadoEm!))} · padrão ${valorDoAjuste(a, a.padrao)}` : `Padrão do servidor · ${a.ajuda}`}</span>
            </span>
            <span className="dc-num flex-none dc-t-corpo font-medium">{valorDoAjuste(a, a.valor)}</span>
            <Botao pequeno onClick={() => setEditando(a)} aria-label={`Mudar ${a.rotulo}`}>
              Mudar
            </Botao>
          </div>
        ))}
      </div>
      <MudarAjuste ajuste={editando} aoFechar={() => setEditando(null)} />
    </Painel>
  );
}

function MudarAjuste({ ajuste, aoFechar }: { ajuste: AjusteDaPlataforma | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [texto, setTexto] = useState<string | null>(null);
  const atual = texto ?? (ajuste ? String(ajuste.valor).replace(".", ",") : "");
  const valor = Number(atual.replace(",", "."));
  const valido = !!ajuste && atual.trim() !== "" && Number.isFinite(valor) && valor >= ajuste.min && valor <= ajuste.max && (!ajuste.inteiro || Number.isInteger(valor));
  const fechar = () => {
    setTexto(null);
    aoFechar();
  };
  const mudar = useMutation({
    mutationFn: (v: number | null) => apiPlataforma<{ ajuste: AjusteDaPlataforma }>(`/ajustes/${ajuste!.chave}`, { json: { valor: v } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar(`${r.ajuste.rotulo}: ${valorDoAjuste(r.ajuste, r.ajuste.valor)}. Fica registrado em Ações registradas.`);
      fechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto={!!ajuste}
      aoFechar={fechar}
      titulo={ajuste?.rotulo ?? "Ajuste"}
      descricao={ajuste?.ajuda}
      acoes={
        <>
          {ajuste?.mudadoPor && (
            <Botao variante="fantasma" onClick={() => mudar.mutate(null)} ocupado={mudar.isPending && mudar.variables === null}>
              Voltar ao padrão ({valorDoAjuste(ajuste, ajuste.padrao)})
            </Botao>
          )}
          <Botao variante="primaria" onClick={() => mudar.mutate(valor)} ocupado={mudar.isPending && mudar.variables !== null} disabled={!valido}>
            Guardar
          </Botao>
        </>
      }
    >
      {ajuste && (
        <Campo rotulo={`Valor (${ajuste.unidade})`} htmlFor="ajuste-valor" ajuda={`De ${NUMERO.format(ajuste.min)} a ${NUMERO.format(ajuste.max)}${ajuste.inteiro ? ", número inteiro" : ""}. O padrão do servidor é ${valorDoAjuste(ajuste, ajuste.padrao)}.`}>
          <input id="ajuste-valor" inputMode="decimal" value={atual} onChange={(ev) => setTexto(ev.target.value)} />
        </Campo>
      )}
    </Dialogo>
  );
}
