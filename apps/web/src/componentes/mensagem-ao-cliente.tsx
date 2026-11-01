/**
 * Mensagem ao cliente no WhatsApp: o rascunho (da IA, ou a lista do que falta
 * na pasta) aparece para o advogado revisar, com a prévia de como o cliente
 * vai ler. Nada sai sem o clique em "Aprovar e enviar".
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Botao, Campo, Faixa, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCurto, diaDoInstante, hora } from "@/lib/formato";
import type { MensagemAoCliente } from "@/lib/tipos";

interface Props {
  /** De quem são as mensagens: do prazo (decisão) ou do cliente (cobrança). */
  filtro: { prazo: string } | { cliente: string };
  /** Como pedir um rascunho novo. Sem isso, a tela só mostra o que já existe. */
  gerar?: { rotulo: string; caminho: string };
  titulo?: string;
}

export function MensagensAoCliente({ filtro, gerar, titulo = "Mensagem ao cliente" }: Props) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const busca = "prazo" in filtro ? `prazo=${filtro.prazo}` : `cliente=${filtro.cliente}`;
  const chave = ["mensagens-cliente", busca];
  const q = useQuery({
    queryKey: chave,
    queryFn: () => api<{ itens: MensagemAoCliente[] }>(`/mensagens-cliente?${busca}`),
    // Outra pessoa pode estar enviando: a resposta do WhatsApp demora até 20 segundos.
    refetchInterval: (consulta) => (consulta.state.data?.itens.some((m) => m.situacao === "enviando" && !m.envioIncerto) ? 15_000 : false),
  });
  // Devolve a promessa: o botão só reabilita depois que a lista nova chegou.
  const atualizar = () => qc.invalidateQueries({ queryKey: ["mensagens-cliente"] });
  const invalidar = useMutation({
    mutationFn: (id: string) => api(`/mensagens-cliente/${id}/invalidar-link`, { method: "POST" }),
    onSuccess: async () => {
      await atualizar();
      avisar("Link invalidado. Quem o abrir vai ver que venceu.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const novo = useMutation({
    mutationFn: () => api<MensagemAoCliente>(gerar!.caminho, { method: "POST" }),
    onSuccess: atualizar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const itens = q.data?.itens ?? [];
  const rascunho = itens.find((m) => m.situacao === "rascunho" || m.situacao === "falhou");
  const enviando = itens.filter((m) => m.situacao === "enviando");
  const enviadas = itens.filter((m) => m.situacao === "enviada");
  if (!rascunho && !enviando.length && !enviadas.length && !gerar) return null;

  return (
    <Painel titulo={titulo}>
      <div className="flex flex-col gap-3">
        {enviando.map((m) => (
          <EmEnvio key={m.id} m={m} aoMudar={atualizar} />
        ))}
        {rascunho ? (
          <Rascunho key={rascunho.id} m={rascunho} aoMudar={atualizar} />
        ) : (
          gerar && (
            <div className="flex flex-col items-start gap-2">
              <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">Você revisa o texto antes: nada sai no WhatsApp sem a sua aprovação.</p>
              <Botao onClick={() => novo.mutate()} ocupado={novo.isPending}>
                <MessageCircle /> {gerar.rotulo}
              </Botao>
            </div>
          )
        )}
        {enviadas.map((m) => (
          <p key={m.id} className="m-0 flex items-start gap-1.5 text-[13px] leading-[20px] text-[var(--tinta-2)]">
            <Check className="mt-0.5 size-3.5 flex-none" />
            <span>
              Enviada{m.aprovadaPor ? ` por ${m.aprovadaPor.apelido}` : ""} em {diaCurto(diaDoInstante(m.enviadaEm ?? m.criadaEm))} às {hora(m.enviadaEm ?? m.criadaEm)}
              {m.para ? ` para ${m.para}` : ""}
              {m.tipo === "documentos" ? ` · ${m.recebidos === 1 ? "1 arquivo recebido" : `${m.recebidos} arquivos recebidos`}` : ""}
              {m.tipo === "documentos" && m.linkValeAte && new Date(m.linkValeAte).getTime() > Date.now() && (
                <>
                  {" · link vale até "}
                  {diaCurto(diaDoInstante(m.linkValeAte))}
                  {" · "}
                  <button type="button" className="dc-link" title="Para o link mandado ao número errado, ou quando o cliente já mandou tudo" onClick={() => invalidar.mutate(m.id)} disabled={invalidar.isPending}>
                    Invalidar link
                  </button>
                </>
              )}
            </span>
          </p>
        ))}
      </div>
    </Painel>
  );
}

function EmEnvio({ m, aoMudar }: { m: MensagemAoCliente; aoMudar: () => void }) {
  const avisar = useAviso();
  const conferir = useMutation({
    mutationFn: (saiu: boolean) => api<MensagemAoCliente>(`/mensagens-cliente/${m.id}/conferir-envio`, { method: "POST", json: { saiu } }),
    onSuccess: (_r, saiu) => {
      aoMudar();
      avisar(saiu ? "Marcada como enviada." : "A mensagem voltou para você revisar. Nada foi enviado.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  if (!m.envioIncerto) return <Faixa tipo="ia">Enviando a mensagem para {m.cliente.nome} no WhatsApp.</Faixa>;
  return (
    <>
      <Faixa tipo="aviso">
        Não conseguimos confirmar se esta mensagem saiu. Confira a conversa com {m.cliente.nome} no WhatsApp{m.para ? ` (${m.para})` : ""}: o Decreta não manda de novo sem você dizer.
      </Faixa>
      <div aria-label="Mensagem a conferir" className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--borda)] bg-[var(--superficie-2)] p-3 text-[14px] leading-[21px]">
        {m.previa}
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao variante="primaria" onClick={() => conferir.mutate(true)} ocupado={conferir.isPending && conferir.variables}>
          <Check /> A mensagem saiu
        </Botao>
        <Botao variante="fantasma" onClick={() => conferir.mutate(false)} ocupado={conferir.isPending && !conferir.variables}>
          Não saiu, voltar a revisar
        </Botao>
      </div>
    </>
  );
}

function Rascunho({ m, aoMudar }: { m: MensagemAoCliente; aoMudar: () => void }) {
  const avisar = useAviso();
  const [texto, setTexto] = useState(m.texto);
  useEffect(() => setTexto(m.texto), [m.texto]);
  const enviar = useMutation({
    mutationFn: () => api<MensagemAoCliente>(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: { texto } }),
    onSuccess: () => {
      aoMudar();
      avisar("Mensagem enviada no WhatsApp do cliente.");
    },
    // O erro também muda a mensagem (falhou, ou pede conferência): a lista precisa mostrar isso.
    onError: (err) => {
      aoMudar();
      avisar(mensagemDoErro(err), { erro: true });
    },
  });
  const descartar = useMutation({
    mutationFn: () => api(`/mensagens-cliente/${m.id}/descartar`, { method: "POST" }),
    onSuccess: aoMudar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  // A prévia do servidor tem o texto salvo; a do que está sendo editado troca só o corpo.
  const previa = m.previa.replace(m.texto, () => texto.trim());
  const campo = `msg-${m.id}`;

  return (
    <>
      {m.situacao === "falhou" ? (
        <Faixa tipo="erro">Esta mensagem não saiu. Confira o texto e tente de novo.</Faixa>
      ) : (
        <Faixa tipo="ia">
          {m.tipo === "decisao"
            ? "Rascunho da IA a partir do briefing. Revise: nada sai sem a sua aprovação, e a mensagem não dá parecer sobre o caso."
            : "Lista do que falta, tirada da conferência da pasta. O link de envio, sem senha e válido por 7 dias, entra quando você aprovar."}
        </Faixa>
      )}
      <Campo rotulo={`Texto para ${m.cliente.nome}`} htmlFor={campo}>
        <textarea id={campo} rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </Campo>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[var(--tinta-2)]">Como o cliente vai ler{m.para ? ` (${m.para})` : ""}</span>
        <div aria-label="Prévia da mensagem" className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--borda)] bg-[var(--superficie-2)] p-3 text-[14px] leading-[21px]">
          {previa}
        </div>
      </div>
      {!m.numeroOficial && <Faixa tipo="aviso">Cadastre o WhatsApp oficial do escritório nas configurações: ele vai no rodapé contra o golpe do falso advogado.</Faixa>}
      <div className="flex flex-wrap gap-2">
        <Botao variante="primaria" onClick={() => enviar.mutate()} ocupado={enviar.isPending} disabled={texto.trim().length < 2}>
          <Send /> Aprovar e enviar
        </Botao>
        <Botao variante="fantasma" onClick={() => descartar.mutate()} ocupado={descartar.isPending}>
          Descartar
        </Botao>
      </div>
    </>
  );
}
