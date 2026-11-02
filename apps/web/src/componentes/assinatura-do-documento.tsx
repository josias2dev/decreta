/**
 * Assinatura eletrônica de um documento da pasta (contrato de honorários, procuração, termo de IA), pela ZapSign
 * do escritório. Só aparece com o interruptor ligado nas Configurações; sem ele, baixar o documento e anexar o
 * assinado segue como sempre. O arquivo assinado volta sozinho para a mesma pasta quando todos assinam.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Campo, Faixa } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { escritorioQuery } from "@/lib/consultas";
import { diaCompleto, diaDoInstante } from "@/lib/formato";
import type { AssinaturaDoDocumento, Documento } from "@/lib/tipos";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAXIMO_DE_PESSOAS = 6;

const SITUACAO_DA_ASSINATURA = { enviada: "Aguardando assinaturas", assinada: "Assinada por todos", cancelada: "Cancelada" } as const;
const situacaoDaPessoa = (s: string) => (s === "signed" ? "assinou" : s === "refused" ? "recusou" : "falta assinar");

type Pessoa = { nome: string; email: string; telefone: string };
const vazia = (nome = ""): Pessoa => ({ nome, email: "", telefone: "" });

export function AssinaturaNoDocumento({ d }: { d: Documento }) {
  const escritorio = useQuery(escritorioQuery);
  const ligada = !!escritorio.data?.assinaturaLigada;
  const lista = useQuery({ queryKey: ["assinaturas", d.id], queryFn: () => api<{ itens: AssinaturaDoDocumento[] }>(`/documentos/${d.id}/assinaturas`), enabled: ligada });
  const [enviando, setEnviando] = useState(false);
  if (!ligada) return null;
  const itens = lista.data?.itens ?? [];
  const podeEnviar = d.mime === "application/pdf" || d.mime === DOCX;
  if (!podeEnviar && !itens.length) return null;
  return (
    <section className="dc-doc__assinatura" aria-label="Assinatura eletrônica">
      <div className="flex flex-wrap items-center gap-2">
        <span className="dc-doc__assinatura-titulo">Assinatura eletrônica</span>
        {podeEnviar && (
          <Botao pequeno variante="secundaria" onClick={() => setEnviando(true)} className="ml-auto">
            Enviar para assinatura
          </Botao>
        )}
      </div>
      {itens.map((a) => (
        <LinhaDaAssinatura key={a.id} a={a} />
      ))}
      {enviando && <EnviarParaAssinar d={d} aoFechar={() => setEnviando(false)} />}
    </section>
  );
}

function LinhaDaAssinatura({ a }: { a: AssinaturaDoDocumento }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const atualizar = useMutation({
    mutationFn: () => api<AssinaturaDoDocumento>(`/assinaturas/${a.id}/atualizar`, { method: "POST" }),
    onSuccess: (nova) => {
      void qc.invalidateQueries({ queryKey: ["assinaturas", a.documentoId] });
      if (nova.situacao === "assinada") {
        void qc.invalidateQueries({ queryKey: ["documentos"] });
        void qc.invalidateQueries({ queryKey: ["cliente"] });
        void qc.invalidateQueries({ queryKey: ["processo"] });
        avisar("Todos assinaram. O arquivo assinado já está na pasta.");
      } else avisar("Situação conferida na ZapSign.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <div className="dc-doc__assinatura-linha">
      <div className="min-w-0 flex-1">
        <div className="dc-t-corpo">
          {SITUACAO_DA_ASSINATURA[a.situacao]}
          <span className="dc-nota"> · enviada em {diaCompleto(diaDoInstante(a.enviadaEm))}</span>
        </div>
        <div className="dc-nota">{a.signatarios.map((s) => `${s.nome} (${situacaoDaPessoa(s.situacao)})`).join(", ")}</div>
        {a.documentoAssinadoId && (
          <Link to="/documentos" search={{ doc: a.documentoAssinadoId }} className="dc-link">
            Abrir o arquivo assinado
          </Link>
        )}
      </div>
      {a.situacao === "enviada" && (
        <Botao pequeno variante="fantasma" onClick={() => atualizar.mutate()} ocupado={atualizar.isPending}>
          Atualizar
        </Botao>
      )}
    </div>
  );
}

function EnviarParaAssinar({ d, aoFechar }: { d: Documento; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [pessoas, setPessoas] = useState<Pessoa[]>([vazia(d.cliente?.nome ?? "")]);
  const muda = (i: number, campo: keyof Pessoa, valor: string) => setPessoas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));
  const enviar = useMutation({
    mutationFn: () =>
      api<AssinaturaDoDocumento>(`/documentos/${d.id}/assinatura`, {
        json: {
          signatarios: pessoas.map((p) => ({
            nome: p.nome.trim(),
            ...(p.email.trim() ? { email: p.email.trim() } : {}),
            ...(p.telefone.replace(/\D/g, "") ? { telefone: p.telefone.replace(/\D/g, "") } : {}),
          })),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assinaturas", d.id] });
      avisar("Enviado para assinatura. Cada pessoa recebe o link.");
      aoFechar();
    },
  });
  const completo = pessoas.every((p) => p.nome.trim().length >= 2 && (p.email.trim() || p.telefone.replace(/\D/g, "")));
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Enviar para assinatura"
      descricao={`${d.nome} vai pela ZapSign do escritório. Cada pessoa recebe o link por e-mail ou WhatsApp. Quando todas assinarem, o arquivo assinado volta para esta pasta.`}
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => enviar.mutate()} ocupado={enviar.isPending} disabled={!completo}>
            Enviar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        {pessoas.map((p, i) => (
          <fieldset key={i} className="dc-doc__pessoa">
            <legend className="dc-nota">Quem assina{pessoas.length > 1 ? ` (${i + 1})` : ""}</legend>
            <Campo rotulo="Nome completo" htmlFor={`as-nome-${i}`}>
              <input id={`as-nome-${i}`} value={p.nome} onChange={(ev) => muda(i, "nome", ev.target.value)} autoComplete="off" />
            </Campo>
            <Campo rotulo="E-mail" htmlFor={`as-mail-${i}`}>
              <input id={`as-mail-${i}`} type="email" inputMode="email" value={p.email} onChange={(ev) => muda(i, "email", ev.target.value)} autoComplete="off" />
            </Campo>
            <Campo rotulo="Celular com DDD" htmlFor={`as-tel-${i}`} ajuda="Informe o e-mail, o celular ou os dois.">
              <input id={`as-tel-${i}`} inputMode="tel" value={p.telefone} onChange={(ev) => muda(i, "telefone", ev.target.value)} placeholder="(47) 99999-0000" autoComplete="off" />
            </Campo>
            {pessoas.length > 1 && (
              <button type="button" className="dc-link inline-flex items-center gap-1" onClick={() => setPessoas((ps) => ps.filter((_, j) => j !== i))}>
                <X className="size-3.5" aria-hidden /> Tirar esta pessoa
              </button>
            )}
          </fieldset>
        ))}
        {pessoas.length < MAXIMO_DE_PESSOAS && (
          <button type="button" className="dc-link inline-flex items-center gap-1 self-start" onClick={() => setPessoas((ps) => [...ps, vazia()])}>
            <Plus className="size-3.5" aria-hidden /> Outra pessoa assina
          </button>
        )}
        {enviar.error && <Faixa tipo="erro">{mensagemDoErro(enviar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
