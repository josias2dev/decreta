/**
 * Do alvará ao honorário: a conta do alvará sacado (o valor que caiu, a parte do escritório e a do cliente), a
 * confirmação por um clique, a prestação de contas em DOCX e o repasse, com mais de um favorecido se for o caso.
 * Nada é confirmado sem o clique; o que a pessoa vê na tela é o que vai ser gravado, e se a conta mudar enquanto
 * isso a confirmação é recusada.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, FolderInput, Plus } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { NovoContrato, useAtualizarFinanceiro, useFinanceiroLiberado } from "@/componentes/honorarios";
import { Botao, Campo, Faixa } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { campoDeCentavos, centavosDoCampo, diaCurto, percentual, reais } from "@/lib/formato";
import type { ContaDoAlvaraNaTela } from "@/lib/tipos";

const chave = (alvaraId: string, contrato?: string | null) => ["financeiro", "conta", alvaraId, contrato ?? ""];

/** A seção do alvará: some para quem não vê o Financeiro. */
export function ContaDoAlvara({ alvaraId, aoMudar }: { alvaraId: string; aoMudar?: () => void }) {
  const liberado = useFinanceiroLiberado();
  const avisar = useAviso();
  const atualizar = useAtualizarFinanceiro();
  const eu = useQuery(euQuery);
  const hoje = eu.data?.hoje ?? "";
  const [contratoEscolhido, setContratoEscolhido] = useState<string | null>(null);
  const [retido, setRetido] = useState(false);
  const [novoContrato, setNovoContrato] = useState(false);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const q = useQuery({
    queryKey: chave(alvaraId, contratoEscolhido),
    queryFn: () => api<ContaDoAlvaraNaTela>(`/financeiro/alvaras/${alvaraId}/conta${contratoEscolhido ? `?contrato=${contratoEscolhido}` : ""}`),
    enabled: liberado,
  });
  const depois = () => {
    atualizar();
    aoMudar?.();
  };
  const c = q.data;
  const confirmar = useMutation({
    mutationFn: () => api<ContaDoAlvaraNaTela>(`/financeiro/alvaras/${alvaraId}/prestacao`, { json: { contratoId: c?.contrato?.id ?? null, honorario: c!.conta.honorario, cliente: c!.conta.cliente, retidoNoSaque: retido } }),
    onSuccess: () => {
      depois();
      avisar("Conta confirmada. A prestação de contas está pronta.");
    },
    // Conta que mudou: a tela mostra a nova antes de tentar de novo.
    onError: (err) => {
      void q.refetch();
      avisar(mensagemDoErro(err), { erro: true });
    },
  });
  if (!liberado || !c) return null;
  if (c.alvara.etapa === "novo" || c.alvara.etapa === "aguardando_saque") return null;

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--borda)] pt-4" aria-label="Do alvará ao honorário">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 dc-t-titulo font-semibold">Do alvará ao honorário</h3>
        {c.prestacao && <span className="dc-nota">Confirmada em {diaCurto(c.prestacao.confirmadaEm.slice(0, 10))}</span>}
      </div>

      {c.prestacao ? (
        <PrestacaoConfirmada c={c} hoje={hoje} aoMudar={depois} aoDesfazer={() => setDesfazendo(c.prestacao!.id)} />
      ) : (
        <>
          <ContaNaTela c={c} />
          {c.precisaEscolherContrato && (
            <Campo rotulo="Contrato que vale para este alvará" htmlFor="ca-contrato">
              <select id="ca-contrato" value={contratoEscolhido ?? ""} onChange={(e) => setContratoEscolhido(e.target.value || null)}>
                <option value="">Escolha o contrato</option>
                {c.contratos.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.titulo} · êxito de {percentual(k.exitoBp)}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {c.conta.semContrato && !c.precisaEscolherContrato && (
            <Faixa tipo="nota">
              Não há contrato de honorários de êxito ligado a este alvará: nenhum honorário é calculado, e o valor que caiu na conta é todo do cliente.{" "}
              <button type="button" className="dc-link" onClick={() => setNovoContrato(true)}>
                Criar contrato de êxito
              </button>
            </Faixa>
          )}
          {c.motivo && <Faixa tipo="aviso">{c.motivo}</Faixa>}
          {c.conta.honorario > 0 && (
            <label className="flex items-start gap-2 dc-t-corpo">
              <input type="checkbox" className="dc-checa mt-0.5" checked={retido} onChange={(e) => setRetido(e.target.checked)} />
              <span>
                O escritório já reteve o honorário no saque
                <span className="dc-nota block">Se marcado, o honorário entra como recebido hoje. Se não, fica como a receber, com vencimento no dia do saque.</span>
              </span>
            </label>
          )}
          <div>
            <Botao variante="primaria" onClick={() => confirmar.mutate()} ocupado={confirmar.isPending} disabled={!c.podeConfirmar}>
              Confirmar a conta
            </Botao>
          </div>
        </>
      )}

      <NovoContrato aberto={novoContrato} aoFechar={() => setNovoContrato(false)} caso={{ processo: { id: c.alvara.processo.id, titulo: c.alvara.processo.titulo }, cliente: c.alvara.cliente }} />
      {desfazendo && <DesfazerPrestacao prestacaoId={desfazendo} aoFechar={() => setDesfazendo(null)} aoDesfazer={depois} />}
    </section>
  );
}

/** A conta do alvará num diálogo próprio, para quem chega por outra tela (a fila do Financeiro). */
export function ContaDialogo({ alvara, aoFechar }: { alvara: { id: string; descricao: string; processo: { id: string; titulo: string } }; aoFechar: () => void }) {
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={alvara.descricao}
      className="dc-dialogo--largo"
      descricao={
        <Link to="/processos/$id" params={{ id: alvara.processo.id }} className="dc-link">
          {alvara.processo.titulo}
        </Link>
      }
      acoes={
        <Botao variante="primaria" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <ContaDoAlvara alvaraId={alvara.id} />
    </Dialogo>
  );
}

/** As contas do alvará, cada uma com o número à vista. */
function ContaNaTela({ c }: { c: ContaDoAlvaraNaTela }) {
  const { conta } = c;
  const linhas: [string, string, boolean?][] = [
    ["Valor do alvará", reais(c.alvara.valor)],
    [conta.baseEhRecebido ? "Valor que caiu na conta" : "Valor que caiu na conta (ainda não informado)", conta.baseEhRecebido ? reais(conta.base) : "—"],
  ];
  if (conta.diferenca) linhas.push(["Diferença em relação ao alvará", reais(conta.diferenca)]);
  if (!conta.semContrato && c.contrato) linhas.push([`Honorários do escritório (${percentual(c.contrato.exitoBp)} de ${reais(conta.base)})`, reais(conta.honorario), true]);
  linhas.push(["Parte do cliente", reais(conta.cliente), true]);
  return (
    <dl className="dc-dados" aria-label="A conta do alvará">
      {linhas.map(([rotulo, valor, forte]) => (
        <div key={rotulo} className="contents">
          <dt>{rotulo}</dt>
          <dd className={forte ? "font-semibold" : undefined}>
            <span className="dc-num">{valor}</span>
          </dd>
        </div>
      ))}
      {c.contrato && (
        <div className="contents">
          <dt>Contrato</dt>
          <dd>{c.contrato.titulo}</dd>
        </div>
      )}
    </dl>
  );
}

function PrestacaoConfirmada({ c, hoje, aoMudar, aoDesfazer }: { c: ContaDoAlvaraNaTela; hoje: string; aoMudar: () => void; aoDesfazer: () => void }) {
  const p = c.prestacao!;
  const avisar = useAviso();
  const [repasse, setRepasse] = useState(false);
  const guardar = useMutation({
    mutationFn: () => api<{ documentoId: string; nome: string }>(`/financeiro/prestacoes/${p.id}/guardar`, { json: {} }),
    onSuccess: (r) => {
      aoMudar();
      avisar(`Guardada na pasta do cliente: ${r.nome}`);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const marcar = useMutation({
    mutationFn: () => api(`/alvaras/${c.alvara.id}`, { method: "PUT", json: { etapa: "repassado", repassadoEm: p.repasses.filter((r) => !r.estornado).map((r) => r.repassadoEm).sort().at(-1) ?? hoje } }),
    onSuccess: () => {
      aoMudar();
      avisar("Alvará marcado como repassado ao cliente.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const desfazerRepasse = useMutation({
    mutationFn: (id: string) => api(`/financeiro/repasses/${id}/estornar`, { json: { motivo: "Desfeito pela equipe." } }),
    onSuccess: () => {
      aoMudar();
      avisar("Repasse desfeito. Ele continua no histórico.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const linhas: [string, string, boolean?][] = [
    ["Valor que caiu na conta", reais(p.valorRecebido)],
    ...(p.semContrato ? ([["Honorário de êxito", "Sem contrato: nenhum honorário"]] as [string, string][]) : ([[`Honorários do escritório (${percentual(p.exitoBp ?? 0)})`, reais(p.honorario), true]] as [string, string, boolean][])),
    ["Parte do cliente", reais(p.cliente), true],
    ["Já repassado", reais(p.conferencia.repassado)],
    ...(p.conferencia.falta > 0 ? ([["Falta repassar", reais(p.conferencia.falta), true]] as [string, string, boolean][]) : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="dc-dados" aria-label="A prestação de contas">
        {linhas.map(([rotulo, valor, forte]) => (
          <div key={rotulo} className="contents">
            <dt>{rotulo}</dt>
            <dd className={forte ? "font-semibold" : undefined}>
              <span className="dc-num">{valor}</span>
            </dd>
          </div>
        ))}
      </dl>
      {p.honorario > 0 && (
        <p className="m-0 dc-nota">
          {p.retidoNoSaque ? "O escritório reteve o honorário no saque e o marcou como recebido." : "O honorário está como a receber, na parcela de êxito do contrato."} Ele aparece no{" "}
          <Link to="/financeiro" className="dc-link">
            Financeiro
          </Link>
          .
        </p>
      )}
      {p.repasses.length > 0 && (
        <ul className="dc-lista-check m-0 list-none p-0" aria-label="Repasses ao cliente">
          {p.repasses.map((r) => (
            <li key={r.id} className={r.estornado ? "text-[var(--tinta-3)] line-through" : undefined}>
              <span className="dc-num">{diaCurto(r.repassadoEm)}</span>
              <span className="flex-1">
                {r.favorecido} · {r.conta}
              </span>
              <span className="dc-num font-medium">{reais(r.valor)}</span>
              {!r.estornado && (
                <button type="button" className="dc-link" onClick={() => desfazerRepasse.mutate(r.id)} disabled={desfazerRepasse.isPending}>
                  Desfazer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {p.conferencia.falta > 0 && (
          <Botao variante="secundaria" onClick={() => setRepasse(true)}>
            <Plus /> Registrar repasse
          </Botao>
        )}
        <a className="dc-btn dc-btn--secundaria dc-btn--md" href={`${API_URL}/api/app/financeiro/prestacoes/${p.id}/docx`} download>
          <Download /> Baixar a prestação de contas
        </a>
        <Botao variante="secundaria" onClick={() => guardar.mutate()} ocupado={guardar.isPending}>
          <FolderInput /> Guardar na pasta do cliente
        </Botao>
        {p.conferencia.completo && c.alvara.etapa !== "repassado" && c.alvara.etapa !== "finalizado" && (
          <Botao variante="primaria" onClick={() => marcar.mutate()} ocupado={marcar.isPending}>
            Marcar o alvará como repassado
          </Botao>
        )}
        {p.repasses.every((r) => r.estornado) && (
          <Botao variante="fantasma" onClick={aoDesfazer}>
            Desfazer a prestação de contas
          </Botao>
        )}
      </div>
      {repasse && <NovoRepasse c={c} hoje={hoje} aoFechar={() => setRepasse(false)} aoMudar={aoMudar} />}
    </div>
  );
}

function NovoRepasse({ c, hoje, aoFechar, aoMudar }: { c: ContaDoAlvaraNaTela; hoje: string; aoFechar: () => void; aoMudar: () => void }) {
  const avisar = useAviso();
  const p = c.prestacao!;
  const [f, setF] = useState({ favorecido: c.alvara.cliente?.nome ?? "", documento: "", conta: "", valor: campoDeCentavos(p.conferencia.falta), data: hoje, observacao: "" });
  const valor = centavosDoCampo(f.valor);
  const registrar = useMutation({
    mutationFn: () => api(`/financeiro/prestacoes/${p.id}/repasses`, { json: { favorecido: f.favorecido.trim(), favorecidoDocumento: f.documento.trim() || null, conta: f.conta.trim(), valor, repassadoEm: f.data, observacao: f.observacao.trim() || null } }),
    onSuccess: () => {
      aoMudar();
      avisar("Repasse registrado.");
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Registrar repasse"
      descricao={`Falta repassar ${reais(p.conferencia.falta)} da parte do cliente. Se o dinheiro vai para mais de uma pessoa, registre um repasse para cada uma.`}
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => registrar.mutate()} ocupado={registrar.isPending} disabled={f.favorecido.trim().length < 2 || f.conta.trim().length < 3 || !valor || !f.data}>
            Registrar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Favorecido" htmlFor="rp-fav">
          <input id="rp-fav" value={f.favorecido} maxLength={200} onChange={(e) => setF({ ...f, favorecido: e.target.value })} />
        </Campo>
        <Campo rotulo="CPF ou CNPJ do favorecido (opcional)" htmlFor="rp-doc">
          <input id="rp-doc" inputMode="numeric" value={f.documento} maxLength={20} onChange={(e) => setF({ ...f, documento: e.target.value })} />
        </Campo>
        <Campo rotulo="Conta" htmlFor="rp-conta" ajuda="Banco, agência e conta, ou a chave Pix.">
          <input id="rp-conta" value={f.conta} maxLength={300} onChange={(e) => setF({ ...f, conta: e.target.value })} placeholder="Banco do Brasil, ag. 1234-5, c/c 67890-1" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Valor" htmlFor="rp-valor" erro={f.valor && !valor ? "Valor em reais, como 3.135,00" : null}>
            <input id="rp-valor" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </Campo>
          <Campo rotulo="Repassado em" htmlFor="rp-data">
            <input id="rp-data" type="date" max={hoje} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
          </Campo>
        </div>
      </div>
    </Dialogo>
  );
}

function DesfazerPrestacao({ prestacaoId, aoFechar, aoDesfazer }: { prestacaoId: string; aoFechar: () => void; aoDesfazer: () => void }) {
  const avisar = useAviso();
  const [motivo, setMotivo] = useState("");
  const desfazer = useMutation({
    mutationFn: () => api(`/financeiro/prestacoes/${prestacaoId}/desfazer`, { json: { motivo: motivo.trim() } }),
    onSuccess: () => {
      aoDesfazer();
      avisar("Prestação de contas desfeita. A conta do alvará voltou a esperar a confirmação.");
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Desfazer a prestação de contas?"
      descricao="Só dá para desfazer sem repasse registrado e sem pagamento do honorário. A parcela de êxito é cancelada e a conta volta a esperar a confirmação."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao variante="perigo" onClick={() => desfazer.mutate()} ocupado={desfazer.isPending} disabled={motivo.trim().length < 3}>
            Desfazer
          </Botao>
        </>
      }
    >
      <Campo rotulo="Motivo" htmlFor="dp-motivo">
        <input id="dp-motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="O valor recebido estava errado" />
      </Campo>
    </Dialogo>
  );
}

