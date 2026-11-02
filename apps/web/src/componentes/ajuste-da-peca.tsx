/**
 * Pedir ajuste por conversa: a IA propõe, o texto só muda quando a pessoa aplicar.
 * A prévia mostra o antes e o depois, com o que saiu e o que entrou colorido, e dá
 * para aplicar, pedir mais um ajuste em cima da proposta ou descartar.
 */
import { diferencas, type ParteDaDiferenca } from "@decreta/core";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Faixa, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import type { AjusteDaPeca } from "@/lib/tipos";

/** Trecho igual mais longo que isso aparece só nas pontas: o que interessa é o que mudou, e a primeira mudança já à vista. */
const IGUAL_LONGO = 240;
const PONTA = 100;

function Parte({ parte, primeira, ultima }: { parte: ParteDaDiferenca; primeira: boolean; ultima: boolean }) {
  if (parte.tipo === "removido") return <del>{parte.texto}</del>;
  if (parte.tipo === "adicionado") return <ins>{parte.texto}</ins>;
  if (parte.texto.length <= IGUAL_LONGO) return <>{parte.texto}</>;
  const corte = <span className="dc-diferenca__corte"> … </span>;
  return (
    <>
      {!primeira && parte.texto.slice(0, PONTA)}
      {corte}
      {!ultima && parte.texto.slice(-PONTA)}
    </>
  );
}

export function AjusteDaPecaPainel({ pecaId, texto, aoAplicar, aplicando }: { pecaId: string; texto: string; aoAplicar: (novo: string) => void; aplicando: boolean }) {
  const [pedido, setPedido] = useState("");
  const [mais, setMais] = useState("");
  const [proposta, setProposta] = useState<(AjusteDaPeca & { texto: string }) | null>(null);
  const [pedidos, setPedidos] = useState<string[]>([]);
  const [recusa, setRecusa] = useState<string | null>(null);

  const pedir = useMutation({
    mutationFn: (corpo: { pedido: string; base?: string; anteriores: string[] }) => api<AjusteDaPeca>(`/pecas/${pecaId}/ajuste`, { json: corpo }),
    onSuccess: (r, corpo) => {
      if (r.texto === null) {
        setRecusa(r.recusa ?? "A IA não conseguiu fazer este ajuste.");
        return;
      }
      setRecusa(null);
      setProposta({ ...r, texto: r.texto });
      setPedidos([...corpo.anteriores, corpo.pedido]);
      setMais("");
    },
  });
  const descartar = () => {
    setProposta(null);
    setPedidos([]);
    setPedido("");
    setMais("");
    setRecusa(null);
    pedir.reset();
  };
  const aplicar = () => {
    if (proposta) aoAplicar(proposta.texto);
    descartar();
  };
  const partes = proposta ? diferencas(texto, proposta.texto) : [];
  const mudou = partes.some((p) => p.tipo !== "igual");

  return (
    <Painel titulo="Pedir ajuste" acao={<span className="dc-nota">com prévia</span>}>
      <div className="dc-campo">
        <textarea aria-label="O que ajustar na peça" rows={2} value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Tire o último parágrafo do mérito e reforce a prova do laudo." />
      </div>
      {!proposta && recusa && <Faixa tipo="aviso">{recusa}</Faixa>}
      {!proposta && pedir.error && <Faixa tipo="erro">{mensagemDoErro(pedir.error)}</Faixa>}
      <Botao bloco onClick={() => pedir.mutate({ pedido, anteriores: [] })} ocupado={pedir.isPending && !proposta} disabled={pedido.trim().length < 3}>
        <Sparkles /> {pedir.isPending && !proposta ? "Ajustando…" : "Ver a prévia"}
      </Botao>
      {proposta && (
        <Dialogo
          aberto
          aoFechar={descartar}
          titulo="Antes e depois"
          descricao={proposta.resumo ?? undefined}
          className="dc-dialogo--diferenca"
          acoes={
            <>
              <Botao variante="fantasma" onClick={descartar}>
                Descartar
              </Botao>
              <Botao onClick={() => pedir.mutate({ pedido: mais, base: proposta.texto, anteriores: pedidos })} ocupado={pedir.isPending} disabled={mais.trim().length < 3}>
                Ajustar
              </Botao>
              <Botao variante="primaria" onClick={aplicar} ocupado={aplicando} disabled={!mudou}>
                Aplicar
              </Botao>
            </>
          }
        >
          {proposta.avisos.map((a) => (
            <Faixa key={a} tipo="aviso">
              {a}
            </Faixa>
          ))}
          {proposta.naoAplicadas.length > 0 && <Faixa tipo="aviso">{proposta.naoAplicadas.length === 1 ? "Uma troca não entrou" : `${proposta.naoAplicadas.length} trocas não entraram`}: a IA citou um trecho que não está no texto.</Faixa>}
          {pedir.error && <Faixa tipo="erro">{mensagemDoErro(pedir.error)}</Faixa>}
          {recusa && <Faixa tipo="aviso">{recusa}</Faixa>}
          {mudou ? (
            <>
              <p className="dc-diferenca__legenda">
                <del>removido</del> <ins>adicionado</ins>
              </p>
              <div className="dc-diferenca" tabIndex={0} aria-label="O texto, com o que saiu e o que entrou">
                {partes.map((p, i) => (
                  <Parte key={i} parte={p} primeira={i === 0} ultima={i === partes.length - 1} />
                ))}
              </div>
            </>
          ) : (
            <p className="dc-citacoes__nota">A IA não propôs mudança no texto.</p>
          )}
          <div className="dc-campo">
            <textarea aria-label="O que mais ajustar" rows={2} value={mais} onChange={(e) => setMais(e.target.value)} placeholder="Para pedir mais uma mudança nesta proposta." />
          </div>
        </Dialogo>
      )}
    </Painel>
  );
}
