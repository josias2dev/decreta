/** Conversa com a IA (chat do processo e Perguntar): mensagens, a resposta chegando aos poucos e o campo. */
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { mensagemDoErro } from "@/lib/api";
import type { MensagemIa } from "@/lib/tipos";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/util";
import { AvisoDoLimite, usoDaIaQuery } from "./limite-da-ia";
import { MarcaIa } from "./ui";

export function Conversa({
  mensagens,
  enviar,
  sugestoes = [],
  rodape,
  placeholder,
  vazio,
  fixo,
}: {
  mensagens: MensagemIa[];
  /** Manda a pergunta e chama `aoChegar` com o texto acumulado da resposta. */
  enviar: (texto: string, aoChegar: (t: string) => void) => Promise<void>;
  sugestoes?: string[];
  rodape: string;
  placeholder: string;
  vazio?: ReactNode;
  /** No celular, o campo fica preso embaixo da tela. */
  fixo?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [pergunta, setPergunta] = useState<string | null>(null);
  const [resposta, setResposta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const ocupado = pergunta !== null;

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensagens.length, resposta, pergunta]);

  async function mandar(t: string) {
    const limpo = t.trim();
    if (!limpo || ocupado) return;
    setTexto("");
    setErro(null);
    setPergunta(limpo);
    setResposta("");
    try {
      await enviar(limpo, setResposta);
    } catch (err) {
      setErro(mensagemDoErro(err));
      setTexto(limpo);
    } finally {
      setPergunta(null);
      setResposta(null);
      void qc.invalidateQueries({ queryKey: usoDaIaQuery.queryKey });
    }
  }
  const aoEnviar = (e: FormEvent) => {
    e.preventDefault();
    void mandar(texto);
  };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void mandar(texto);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="dc-conversa" aria-live="polite">
        {mensagens.length === 0 && !pergunta && vazio}
        {mensagens.map((m) => (
          <Mensagem key={m.id} papel={m.papel} texto={m.texto} autor={m.autor?.apelido} />
        ))}
        {pergunta && <Mensagem papel="pessoa" texto={pergunta} />}
        {pergunta && <Mensagem papel="ia" texto={resposta || ""} escrevendo />}
        <div ref={fim} />
      </div>
      {erro && <p className="m-0 text-[13px] text-[var(--vencido)]">{erro}</p>}
      <div className={cn("flex flex-col gap-2", fixo && "dc-conversa__campo-fixo")}>
        {sugestoes.length > 0 && mensagens.length < 2 && !ocupado && (
          <div className="dc-chips">
            {sugestoes.map((s) => (
              <button key={s} type="button" className="dc-chip" onClick={() => void mandar(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <AvisoDoLimite />
        <form className="dc-perguntar-campo" onSubmit={aoEnviar}>
          <textarea rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} placeholder={placeholder} aria-label={placeholder} />
          <button type="submit" className="dc-btn dc-btn--ia dc-btn--sm" aria-label="Enviar" disabled={!texto.trim() || ocupado}>
            <ArrowUp /> Enviar
          </button>
        </form>
        <span className="dc-nota">{rodape}</span>
      </div>
    </div>
  );
}

function Mensagem({ papel, texto, autor, escrevendo }: { papel: "pessoa" | "ia"; texto: string; autor?: string; escrevendo?: boolean }) {
  if (papel === "pessoa") {
    return (
      <div className="dc-msg dc-msg--pessoa">
        {texto}
        {autor && <div className="dc-msg__pe text-[inherit] opacity-70">{autor}</div>}
      </div>
    );
  }
  return (
    <div className="dc-msg dc-msg--ia" aria-busy={escrevendo || undefined}>
      <div className="mb-1">
        <MarcaIa />
      </div>
      {/* A IA costuma mandar listas e negrito mesmo pedindo texto simples. */}
      <Markdown texto={texto} escrevendo={escrevendo && !!texto} />
      {escrevendo && !texto && <span className="text-[var(--tinta-2)]">Lendo os autos…</span>}
    </div>
  );
}
