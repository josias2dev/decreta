import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import * as D from "@radix-ui/react-dialog";
import { ArrowLeft, CalendarCheck, FolderOpen, Plus, Search, User } from "lucide-react";
import { useDeferredValue, useEffect, useState, type KeyboardEvent } from "react";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { atualizarPrazos, euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, telefone } from "@/lib/formato";
import type { Busca as Resultado } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { useAviso } from "./avisos";
import { ContaNaTela, contaQuery } from "./data-viva";
import { NovoPrazo } from "./novo-prazo";
import { Botao, Carregando, Cnj, Faixa } from "./ui";

type ProcessoEscolhido = { id: string; titulo: string };

/**
 * Busca do menu (⌘K): processo por número, partes ou título; cliente por nome,
 * CPF/CNPJ ou telefone. E também age: cria prazo, abre processo e confirma o que
 * espera confirmação, sempre mostrando antes a data e a conta. Quem só pode ler não
 * vê as ações, e o servidor recusa do mesmo jeito.
 */
export function Busca({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const celular = useCelular();
  const navigate = useNavigate();
  const eu = useQuery(euQuery);
  const [q, setQ] = useState("");
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [novoPrazo, setNovoPrazo] = useState<{ processo: ProcessoEscolhido | null } | null>(null);
  const termo = useDeferredValue(q.trim());
  const buscando = termo.length >= 2;
  const podeAgir = eu.data?.assinatura?.acesso !== "leitura";
  useEffect(() => {
    if (aberta) return;
    setQ("");
    setConfirmando(null);
  }, [aberta]);
  const r = useQuery({
    queryKey: ["busca", termo],
    queryFn: () => api<Resultado>(`/busca?q=${encodeURIComponent(termo)}`),
    enabled: aberta && (buscando || podeAgir),
    placeholderData: (anterior) => anterior,
  });
  const processos = buscando ? (r.data?.processos ?? []) : [];
  const clientes = buscando ? (r.data?.clientes ?? []) : [];
  const prazos = podeAgir ? (r.data?.prazos ?? []) : [];
  const ir = (destino: { to: "/processos/$id" | "/clientes/$id"; id: string }) => {
    aoFechar();
    void navigate({ to: destino.to, params: { id: destino.id } });
  };
  const criarPrazo = (processo: ProcessoEscolhido | null) => {
    aoFechar();
    setNovoPrazo({ processo });
  };
  const nada = buscando && r.data && !processos.length && !clientes.length && !prazos.length;

  // As setas andam entre o campo e as opções; Enter no campo abre o primeiro resultado.
  const opcoes = (raiz: HTMLElement) => [...raiz.querySelectorAll<HTMLElement>("input, [data-opcao]")];
  const andar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const lista = opcoes(e.currentTarget);
    const alvo = lista[lista.indexOf(document.activeElement as HTMLElement) + (e.key === "ArrowDown" ? 1 : -1)];
    if (!alvo) return;
    e.preventDefault();
    alvo.focus();
  };

  const acoes = podeAgir && (
    <div className="dc-busca-grupo">
      <div className="dc-busca-grupo__titulo">Ações</div>
      <div className="dc-linhas">
        <button type="button" data-opcao className="dc-linhas__item dc-busca-opcao" onClick={() => criarPrazo(null)}>
          <Plus size={16} className="mt-0.5 flex-none text-[var(--tinta-3)]" />
          <span className="dc-celula">
            <span className="dc-celula__1">Criar prazo</span>
          </span>
        </button>
      </div>
    </div>
  );
  const aConfirmar = prazos.length > 0 && (
    <div className="dc-busca-grupo">
      <div className="dc-busca-grupo__titulo">A confirmar</div>
      <div className="dc-linhas">
        {prazos.map((p) => (
          <button key={p.id} type="button" data-opcao data-resultado aria-label={`Confirmar: ${p.tipo}, ${p.processo.titulo}, vence em ${diaCurto(p.fim)}`} className="dc-linhas__item dc-busca-opcao" onClick={() => setConfirmando(p.id)}>
            <CalendarCheck size={16} className="mt-0.5 flex-none text-[var(--tinta-3)]" />
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1">{p.tipo}</span>
              <span className="dc-celula__2">{p.processo.titulo}</span>
            </span>
            <span className="dc-nota dc-num flex-none">{diaCurto(p.fim)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <D.Root open={aberta} onOpenChange={(v) => !v && aoFechar()}>
        <D.Portal>
          <D.Overlay className="dc-veu-dialogo" />
          <D.Content
            className={cn("dc-dialogo dc-dialogo--busca", celular && "dc-celular")}
            onKeyDown={confirmando ? undefined : andar}
            onEscapeKeyDown={(e) => {
              // No passo de confirmar, Esc volta para a lista.
              if (!confirmando) return;
              e.preventDefault();
              setConfirmando(null);
            }}
          >
            <D.Title className="sr-only">{confirmando ? "Confirmar prazo" : "Buscar"}</D.Title>
            <D.Description className="sr-only">{confirmando ? "A data e a conta, antes de confirmar" : "Processos, clientes e ações do escritório"}</D.Description>
            {confirmando ? (
              <ConfirmarDaBusca id={confirmando} aoVoltar={() => setConfirmando(null)} aoFechar={aoFechar} />
            ) : (
              <>
                <div className="dc-busca-campo">
                  {celular ? (
                    <button type="button" className="dc-btn dc-btn--fantasma dc-busca-campo__fechar" aria-label="Fechar" onClick={aoFechar}>
                      <ArrowLeft />
                    </button>
                  ) : (
                    <Search />
                  )}
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || !buscando) return;
                      e.preventDefault();
                      e.currentTarget.closest("[role=dialog]")?.querySelector<HTMLElement>("[data-resultado]")?.click();
                    }}
                    placeholder="Número do processo, parte, cliente, CPF ou telefone"
                    aria-label="Buscar"
                  />
                </div>
                <div className={cn("overflow-y-auto", !celular && "dc-busca-lista")}>
                  {!buscando && acoes}
                  {!buscando && aConfirmar}
                  {!buscando && <p className="dc-nota dc-busca-nota">Digite pelo menos 2 letras ou números para buscar processos e clientes.</p>}
                  {nada && <p className="dc-nota dc-busca-nota">Nada encontrado para “{termo}”.</p>}
                  {buscando && aConfirmar}
                  {processos.length > 0 && (
                    <div className="dc-busca-grupo">
                      <div className="dc-busca-grupo__titulo">Processos</div>
                      <div className="dc-linhas">
                        {processos.map((p) => (
                          <div key={p.id} className="dc-busca-processo">
                            <button type="button" data-opcao data-resultado aria-label={`Abrir ${p.titulo}`} className="dc-linhas__item dc-busca-opcao" onClick={() => ir({ to: "/processos/$id", id: p.id })}>
                              <FolderOpen size={16} className="mt-0.5 flex-none text-[var(--tinta-3)]" />
                              <span className="dc-celula min-w-0">
                                <span className="dc-celula__1">{p.titulo}</span>
                                <span className="dc-celula__2">
                                  <Cnj cnj={p.cnj} tipo={p.tipo} />
                                  {p.orgao && ` · ${p.orgao}`}
                                </span>
                              </span>
                            </button>
                            {podeAgir && (
                              <button type="button" data-opcao aria-label={`Criar prazo em ${p.titulo}`} title="Criar prazo neste processo" className="dc-btn dc-btn--fantasma dc-btn--sm dc-busca-processo__prazo" onClick={() => criarPrazo({ id: p.id, titulo: p.titulo })}>
                                <Plus /> Prazo
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {clientes.length > 0 && (
                    <div className="dc-busca-grupo">
                      <div className="dc-busca-grupo__titulo">Clientes</div>
                      <div className="dc-linhas">
                        {clientes.map((c) => (
                          <button key={c.id} type="button" data-opcao data-resultado className="dc-linhas__item dc-busca-opcao" onClick={() => ir({ to: "/clientes/$id", id: c.id })}>
                            <User size={16} className="mt-0.5 flex-none text-[var(--tinta-3)]" />
                            <span className="dc-celula">
                              <span className="dc-celula__1">{c.nome}</span>
                              {c.telefone && <span className="dc-celula__2 dc-num">{telefone(c.telefone)}</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {buscando && acoes}
                </div>
              </>
            )}
          </D.Content>
        </D.Portal>
      </D.Root>
      {novoPrazo && <NovoPrazo aberto processo={novoPrazo.processo} aoFechar={() => setNovoPrazo(null)} />}
    </>
  );
}

/** O passo antes de confirmar: a data e a conta inteiras, pelas mesmas regras do botão na ficha do prazo. */
function ConfirmarDaBusca({ id, aoVoltar, aoFechar }: { id: string; aoVoltar: () => void; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery(contaQuery({ prazo: id }));
  const c = q.data;
  const confirmar = useMutation({
    mutationFn: () => api(`/prazos/${id}/confirmar`, { method: "POST" }),
    onSuccess: () => {
      atualizarPrazos(qc);
      avisar(`Prazo confirmado: vence em ${diaCompleto(c!.fim)}.`);
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <div className="dc-busca-confirmar">
      <h2 className="dc-dialogo__titulo">Confirmar prazo</h2>
      {c?.prazo && <p className="dc-dialogo__texto">{c.prazo.processo.titulo}</p>}
      {c ? (
        <ContaNaTela conta={c} />
      ) : q.isPending ? (
        <Carregando linhas={3} />
      ) : (
        <Faixa tipo="erro">Não consegui abrir a conta agora. {mensagemDoErro(q.error)}</Faixa>
      )}
      {c?.prazo?.confirmado && <Faixa tipo="ok">Este prazo já está confirmado.</Faixa>}
      <div className="dc-dialogo__acoes">
        <Botao variante="fantasma" autoFocus onClick={aoVoltar}>
          Voltar
        </Botao>
        {c?.prazo &&
          !c.prazo.confirmado &&
          (c.conferencia?.confianca === "baixa" ? (
            // Confiança baixa não confirma num clique: a ficha do prazo abre o ajuste com os números.
            <Link to="/prazos/$id" params={{ id }} className="dc-btn dc-btn--primaria dc-btn--md" onClick={aoFechar}>
              Conferir e confirmar
            </Link>
          ) : (
            <Botao variante="primaria" onClick={() => confirmar.mutate()} ocupado={confirmar.isPending}>
              Confirmar prazo
            </Botao>
          ))}
      </div>
    </div>
  );
}
