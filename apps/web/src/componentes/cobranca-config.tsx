/**
 * Configurações > Financeiro (só os sócios): o Asaas do escritório (a chave, o aviso de pagamento, o Pix Automático), a régua
 * de lembretes pelo WhatsApp e a assinatura eletrônica pela ZapSign. Cada escritório usa a própria conta. A chave
 * guardada nunca volta para a tela: só se está guardada.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Botao, Campo, Carregando, Faixa, Interruptor, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCompleto, diaDoInstante } from "@/lib/formato";
import type { EstadoDaCobranca, PassoDaRegua } from "@/lib/tipos";

const QUANDO: [number, string][] = [
  [-7, "7 dias antes do vencimento"],
  [-5, "5 dias antes do vencimento"],
  [-3, "3 dias antes do vencimento"],
  [-1, "1 dia antes do vencimento"],
  [0, "No dia do vencimento"],
  [1, "1 dia depois do vencimento"],
  [3, "3 dias depois do vencimento"],
  [5, "5 dias depois do vencimento"],
  [7, "7 dias depois do vencimento"],
  [15, "15 dias depois do vencimento"],
  [30, "30 dias depois do vencimento"],
];
const rotuloDoQuando = (dias: number) => QUANDO.find(([d]) => d === dias)?.[1] ?? (dias < 0 ? `${-dias} dias antes do vencimento` : dias === 0 ? "No dia do vencimento" : `${dias} dias depois do vencimento`);

export const estadoDaCobrancaQuery = { queryKey: ["financeiro", "cobranca"], queryFn: () => api<EstadoDaCobranca>("/financeiro/cobranca") } as const;

export function ConfigDoFinanceiro({ demonstracao }: { demonstracao: boolean }) {
  const q = useQuery(estadoDaCobrancaQuery);
  if (!q.data) return <Carregando />;
  const e = q.data;
  return (
    <div className="dc-pilha">
      {demonstracao && <Faixa tipo="nota">Na demonstração a cobrança e a assinatura ficam desligadas: os clientes e os valores são inventados.</Faixa>}
      {!e.cofreLigado && <Faixa tipo="erro">O servidor ainda não tem o cofre das chaves ligado. Sem ele, o Decreta não guarda a chave do Asaas nem a da ZapSign. Fale com o suporte.</Faixa>}
      <CartaoDoAsaas e={e} bloqueado={demonstracao || !e.cofreLigado} />
      <ReguaDeLembretes e={e} />
      <CartaoDaZapSign e={e} bloqueado={demonstracao || !e.cofreLigado} />
    </div>
  );
}

function useAtualizarConfig() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["financeiro", "cobranca"] });
}

/* ---------------- Asaas ---------------- */

function CartaoDoAsaas({ e, bloqueado }: { e: EstadoDaCobranca; bloqueado: boolean }) {
  const avisar = useAviso();
  const atualizar = useAtualizarConfig();
  const [trocando, setTrocando] = useState(false);
  const [chave, setChave] = useState("");
  const [ambiente, setAmbiente] = useState<"producao" | "sandbox">(e.asaas.ambiente ?? "producao");
  const guardar = useMutation({
    mutationFn: () => api<{ avisoLigado: boolean; erroDoAviso: string | null }>("/financeiro/cobranca/asaas", { method: "PUT", json: { chave: chave.trim(), ambiente } }),
    onSuccess: async (r) => {
      setChave("");
      setTrocando(false);
      await atualizar();
      if (r.avisoLigado) avisar("Asaas ligado. Os pagamentos dão a baixa sozinhos.");
      else avisar(r.erroDoAviso ?? "A chave foi guardada, mas o aviso de pagamento não foi criado.", { erro: true });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const refazer = useMutation({
    mutationFn: () => api<{ avisoLigado: boolean; erroDoAviso: string | null }>("/financeiro/cobranca/asaas/aviso", { json: {} }),
    onSuccess: async (r) => {
      await atualizar();
      if (r.avisoLigado) avisar("Aviso de pagamento criado no Asaas.");
      else avisar(r.erroDoAviso ?? "O aviso não foi criado.", { erro: true });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const tirar = useMutation({
    mutationFn: () => api("/financeiro/cobranca/asaas", { method: "DELETE" }),
    onSuccess: async () => {
      await atualizar();
      avisar("Chave do Asaas tirada do Decreta. A baixa volta a ser manual.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const opcoes = useMutation({
    mutationFn: (corpo: { pixAutomatico: boolean }) => api("/financeiro/cobranca/opcoes", { method: "PUT", json: corpo }),
    onSuccess: atualizar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const editavel = e.podeEditar && !bloqueado;
  const formulario = (!e.asaas.configurado || trocando) && editavel;
  return (
    <Painel titulo="Cobrança pelo Asaas">
      <div className="flex flex-col gap-4">
        <p className="m-0 dc-t-corpo text-[var(--tinta-2)]">
          Cada escritório usa a própria conta do Asaas: o dinheiro cai na sua conta, e o Decreta só emite a cobrança e dá a baixa quando o Asaas avisa o pagamento. O cliente paga por Pix, boleto ou cartão pelo link. Sem a chave, o Financeiro funciona só com a baixa manual.
        </p>
        {e.asaas.configurado && !trocando && (
          <div className="flex flex-col gap-2">
            <Faixa tipo="ok">Asaas ligado ({e.asaas.ambiente === "producao" ? "produção" : "sandbox, só testes"}). A chave está guardada cifrada e não aparece mais na tela.</Faixa>
            {e.asaas.avisoLigado ? (
              <p className="m-0 dc-nota">O aviso de pagamento está ligado{e.asaas.conferidaEm ? ` (conferido em ${diaCompleto(diaDoInstante(e.asaas.conferidaEm))})` : ""}: cada pagamento dá a baixa sozinho, uma vez só.</p>
            ) : (
              <Faixa tipo="aviso">O aviso de pagamento não foi criado no Asaas. A cobrança sai, mas a baixa fica manual até o aviso ser refeito.</Faixa>
            )}
            {editavel && (
              <div className="flex flex-wrap gap-2">
                {!e.asaas.avisoLigado && (
                  <Botao variante="secundaria" onClick={() => refazer.mutate()} ocupado={refazer.isPending}>
                    Refazer o aviso de pagamento
                  </Botao>
                )}
                <Botao variante="secundaria" onClick={() => setTrocando(true)}>
                  Trocar a chave
                </Botao>
                <Botao variante="fantasma" onClick={() => tirar.mutate()} ocupado={tirar.isPending}>
                  Tirar a chave
                </Botao>
              </div>
            )}
          </div>
        )}
        {formulario && (
          <form
            className="dc-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              guardar.mutate();
            }}
          >
            <Campo rotulo="Chave de API do Asaas" htmlFor="as-chave" ajuda="No Asaas: Integrações > Chaves de API. Ela começa com $aact_ e fica guardada cifrada.">
              <input id="as-chave" type="password" autoComplete="off" spellCheck={false} value={chave} onChange={(ev) => setChave(ev.target.value)} placeholder="$aact_…" />
            </Campo>
            <Campo rotulo="Ambiente" htmlFor="as-amb">
              <select id="as-amb" value={ambiente} onChange={(ev) => setAmbiente(ev.target.value as "producao" | "sandbox")}>
                <option value="producao">Produção (cobranças de verdade)</option>
                <option value="sandbox">Sandbox (só testes)</option>
              </select>
            </Campo>
            <div className="flex gap-2">
              <Botao type="submit" variante="primaria" ocupado={guardar.isPending} disabled={chave.trim().length < 20}>
                Guardar e conferir
              </Botao>
              {trocando && (
                <Botao variante="fantasma" onClick={() => setTrocando(false)}>
                  Cancelar
                </Botao>
              )}
            </div>
          </form>
        )}
        {!e.podeEditar && <p className="m-0 dc-nota">Só os sócios mudam a cobrança.</p>}
        <div className="flex flex-col gap-3 border-t border-[var(--borda)] pt-4">
          <Interruptor
            rotulo="Pix Automático nas mensalidades"
            ajuda="O cliente autoriza uma vez e as cobranças dos meses seguintes saem sozinhas por Pix. O Asaas exige CNPJ ativo há mais de 6 meses: o advogado pessoa física fica com Pix avulso e boleto."
            ligado={e.pixAutomatico}
            aoMudar={(v) => opcoes.mutate({ pixAutomatico: v })}
            desligado={!editavel}
          />
          <Interruptor rotulo="Nota fiscal (NFS-e) pelo Asaas" ajuda="Desligada. Depende dos dados fiscais do escritório (município, código do serviço e regime) e o Decreta ainda não emite a nota." ligado={false} aoMudar={() => {}} desligado />
        </div>
      </div>
    </Painel>
  );
}

/* ---------------- Régua de lembretes ---------------- */

function ReguaDeLembretes({ e }: { e: EstadoDaCobranca }) {
  const avisar = useAviso();
  const atualizar = useAtualizarConfig();
  const [ligada, setLigada] = useState(e.regua.ligada);
  const [passos, setPassos] = useState<PassoDaRegua[]>(e.regua.passos);
  const [sujo, setSujo] = useState(false);
  const mexe = (novos: PassoDaRegua[]) => {
    setPassos(novos);
    setSujo(true);
  };
  const salvar = useMutation({
    mutationFn: () => api("/financeiro/cobranca/opcoes", { method: "PUT", json: { regua: { ligada, passos: [...passos].sort((a, b) => a.dias - b.dias) } } }),
    onSuccess: async () => {
      setSujo(false);
      await atualizar();
      avisar(ligada ? "Régua aprovada e ligada. Os lembretes nascem como rascunho." : "Régua salva, desligada.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const usados = new Set(passos.map((p) => p.dias));
  return (
    <Painel titulo="Lembretes de cobrança no WhatsApp">
      <div className="flex flex-col gap-4">
        <p className="m-0 dc-t-corpo text-[var(--tinta-2)]">
          A régua deixa um rascunho de mensagem para cada parcela que chega num dos momentos abaixo, com o texto que você aprova aqui. Nada sai sozinho: um advogado com OAB confere e aprova cada mensagem, no mesmo fluxo das mensagens ao cliente.
        </p>
        <Interruptor
          rotulo="Ligar a régua de lembretes"
          ajuda="Ao salvar com a régua ligada, os textos abaixo ficam aprovados pelo escritório."
          ligado={ligada}
          aoMudar={(v) => {
            setLigada(v);
            setSujo(true);
          }}
          desligado={!e.podeEditar}
        />
        {passos.map((p, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--borda)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Quando" value={p.dias} onChange={(ev) => mexe(passos.map((x, j) => (j === i ? { ...x, dias: Number(ev.target.value) } : x)))} disabled={!e.podeEditar}>
                {[...new Set([...QUANDO.map(([d]) => d), p.dias])]
                  .sort((a, b) => a - b)
                  .filter((d) => d === p.dias || !usados.has(d))
                  .map((d) => (
                    <option key={d} value={d}>
                      {rotuloDoQuando(d)}
                    </option>
                  ))}
              </select>
              {e.podeEditar && (
                <button type="button" className="dc-link ml-auto" onClick={() => mexe(passos.filter((_, j) => j !== i))}>
                  Tirar
                </button>
              )}
            </div>
            <textarea aria-label="Texto do lembrete" rows={4} value={p.texto} maxLength={1200} onChange={(ev) => mexe(passos.map((x, j) => (j === i ? { ...x, texto: ev.target.value } : x)))} disabled={!e.podeEditar} />
          </div>
        ))}
        <p className="m-0 dc-nota">Campos do texto: {"{cliente}"}, {"{descricao}"}, {"{valor}"}, {"{vencimento}"}, {"{link}"} e {"{escritorio}"}. Sem cobrança emitida, a linha do {"{link}"} sai do texto.</p>
        {e.podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!sujo || (ligada && passos.length === 0)}>
              Aprovar e salvar
            </Botao>
            {passos.length < 6 && (
              <Botao
                variante="secundaria"
                onClick={() => {
                  const livre = QUANDO.map(([d]) => d).find((d) => !usados.has(d)) ?? 0;
                  mexe([...passos, { dias: livre, texto: e.textosPadrao.find((x) => x.dias === livre)?.texto ?? e.textosPadrao[1]?.texto ?? "" }]);
                }}
              >
                Acrescentar lembrete
              </Botao>
            )}
            {passos.length === 0 && (
              <Botao variante="fantasma" onClick={() => mexe(e.textosPadrao)}>
                Começar pelos textos sugeridos
              </Botao>
            )}
          </div>
        )}
        {e.regua.aprovadaEm && <p className="m-0 dc-nota">Última aprovação em {diaCompleto(diaDoInstante(e.regua.aprovadaEm))}.</p>}
      </div>
    </Painel>
  );
}

/* ---------------- ZapSign ---------------- */

function CartaoDaZapSign({ e, bloqueado }: { e: EstadoDaCobranca; bloqueado: boolean }) {
  const avisar = useAviso();
  const atualizar = useAtualizarConfig();
  const [chave, setChave] = useState("");
  const [ambiente, setAmbiente] = useState<"producao" | "sandbox">(e.zapsign.ambiente ?? "producao");
  const [trocando, setTrocando] = useState(false);
  const guardar = useMutation({
    mutationFn: (corpo: { chave?: string; ambiente?: "producao" | "sandbox"; ligada?: boolean }) => api("/financeiro/cobranca/zapsign", { method: "PUT", json: corpo }),
    onSuccess: async () => {
      setChave("");
      setTrocando(false);
      await atualizar();
      avisar("Assinatura eletrônica atualizada.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const tirar = useMutation({
    mutationFn: () => api("/financeiro/cobranca/zapsign", { method: "DELETE" }),
    onSuccess: async () => {
      await atualizar();
      avisar("Chave da ZapSign tirada do Decreta.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const editavel = e.podeEditar && !bloqueado;
  const formulario = (!e.zapsign.configurado || trocando) && editavel;
  return (
    <Painel titulo="Assinatura eletrônica pela ZapSign">
      <div className="flex flex-col gap-4">
        <p className="m-0 dc-t-corpo text-[var(--tinta-2)]">
          O contrato de honorários, a procuração e o termo de uso de IA saem da pasta do cliente para assinatura, pela ZapSign do escritório (a API está nos planos Equipe da ZapSign), e o arquivo assinado volta para a mesma pasta. Sem a chave, o fluxo de baixar o documento e anexar o assinado continua como sempre.
        </p>
        {e.zapsign.configurado && !trocando && (
          <div className="flex flex-col gap-3">
            <Interruptor
              rotulo="Assinatura eletrônica ligada"
              ajuda={`Chave guardada cifrada (${e.zapsign.ambiente === "producao" ? "produção" : "sandbox: sem validade jurídica"}).`}
              ligado={e.zapsign.ligada}
              aoMudar={(v) => guardar.mutate({ ligada: v })}
              desligado={!editavel}
            />
            {editavel && (
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundaria" onClick={() => setTrocando(true)}>
                  Trocar a chave
                </Botao>
                <Botao variante="fantasma" onClick={() => tirar.mutate()} ocupado={tirar.isPending}>
                  Tirar a chave
                </Botao>
              </div>
            )}
          </div>
        )}
        {formulario && (
          <form
            className="dc-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              guardar.mutate({ chave: chave.trim(), ambiente });
            }}
          >
            <Campo rotulo="Token da API da ZapSign" htmlFor="zs-chave" ajuda="Nas configurações da ZapSign, em Integrações. Fica guardado cifrado.">
              <input id="zs-chave" type="password" autoComplete="off" spellCheck={false} value={chave} onChange={(ev) => setChave(ev.target.value)} />
            </Campo>
            <Campo rotulo="Ambiente" htmlFor="zs-amb">
              <select id="zs-amb" value={ambiente} onChange={(ev) => setAmbiente(ev.target.value as "producao" | "sandbox")}>
                <option value="producao">Produção (assinaturas com validade jurídica)</option>
                <option value="sandbox">Sandbox (só testes, sem validade jurídica)</option>
              </select>
            </Campo>
            <div className="flex gap-2">
              <Botao type="submit" variante="primaria" ocupado={guardar.isPending} disabled={chave.trim().length < 20}>
                Guardar a chave
              </Botao>
              {trocando && (
                <Botao variante="fantasma" onClick={() => setTrocando(false)}>
                  Cancelar
                </Botao>
              )}
            </div>
          </form>
        )}
        {!e.podeEditar && <p className="m-0 dc-nota">Só os sócios mudam a assinatura eletrônica.</p>}
      </div>
    </Painel>
  );
}
