/**
 * O link de envio que o cliente recebe no WhatsApp: sem login, com validade.
 * Mostra o escritório, a lista do que falta e um botão para mandar a foto.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Camera, Check } from "lucide-react";
import { useRef, useState } from "react";
import { Botao, Carregando, Faixa } from "@/componentes/ui";
import { API_URL } from "@/lib/api";
import { diaCompleto } from "@/lib/formato";
import type { PedidoDeDocumentos } from "@/lib/tipos";

const ERROS: Record<string, string> = {
  link_vencido: "Este link venceu. Peça um novo ao escritório pelo número oficial.",
  nao_encontrado: "Este link não existe. Confira se copiou o endereço inteiro.",
};

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_URL}/api/envio${caminho}`, init);
  const corpo = (await r.json().catch(() => null)) as (T & { erro?: string; detalhe?: string }) | null;
  if (!r.ok) throw new Error(ERROS[corpo?.erro ?? ""] ?? corpo?.detalhe ?? "Não deu certo agora. Tente de novo em alguns minutos.");
  return corpo as T;
}

export function EnviarDocumentosPage() {
  const { org, segredo } = useParams({ from: "/enviar/$org/$segredo" });
  const caminho = `/${encodeURIComponent(org)}/${encodeURIComponent(segredo)}`;
  const entrada = useRef<HTMLInputElement>(null);
  const [recebidos, setRecebidos] = useState<{ nome: string; aviso: string }[]>([]);
  const q = useQuery({ queryKey: ["envio", org, segredo], queryFn: () => pedir<PedidoDeDocumentos>(caminho), retry: false });
  const enviar = useMutation({
    mutationFn: (arquivo: File) => {
      const form = new FormData();
      form.set("arquivo", arquivo);
      return pedir<{ nome: string; aviso: string }>(caminho, { method: "POST", body: form });
    },
    onSuccess: (r) => setRecebidos((atuais) => [...atuais, r]),
  });

  const p = q.data;
  return (
    <div className="dc min-h-dvh bg-[var(--papel)] px-4 py-8">
      <main className="mx-auto flex max-w-[520px] flex-col gap-4">
        {q.isPending ? (
          <Carregando linhas={3} />
        ) : !p ? (
          <Faixa tipo="erro">{q.error?.message ?? "Este link não existe."}</Faixa>
        ) : (
          <>
            <header className="flex flex-col gap-1">
              <span className="text-[13px] font-medium uppercase tracking-wide text-[var(--tinta-3)]">{p.escritorio}</span>
              <h1 className="dc-h1 m-0">Olá, {p.cliente}. Faltam estes documentos:</h1>
            </header>
            <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[23px]">
              {p.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">Tire uma foto bem iluminada de cada documento, ou mande o PDF. O link vale até {diaCompleto(p.validoAte)}.</p>
            <input
              ref={entrada}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-label="Foto ou PDF do documento"
              hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) enviar.mutate(f);
                ev.target.value = "";
              }}
            />
            <Botao variante="primaria" bloco onClick={() => entrada.current?.click()} ocupado={enviar.isPending}>
              <Camera /> Mandar foto ou PDF
            </Botao>
            {enviar.error && <Faixa tipo="erro">{enviar.error.message}</Faixa>}
            {recebidos.map((r, n) => (
              <Faixa key={`${r.nome}-${n}`} tipo="ok">
                <span className="flex items-start gap-1.5">
                  <Check className="mt-0.5 size-4 flex-none" />
                  <span>
                    <strong>{r.nome}</strong>. {r.aviso}
                  </span>
                </span>
              </Faixa>
            ))}
            <p className="m-0 text-[13px] leading-[20px] text-[var(--tinta-3)]">Este escritório nunca pede Pix para liberar valores. Na dúvida, ligue para o número oficial do escritório.</p>
          </>
        )}
      </main>
    </div>
  );
}
