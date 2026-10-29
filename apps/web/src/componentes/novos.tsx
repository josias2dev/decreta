/** Cadastros rápidos: cliente, processo e atendimento (atalhos da tela Hoje e das listas). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useState, type FormEvent } from "react";
import { api, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import type { Canal, ClienteNaLista, Pagina } from "@/lib/tipos";
import { useAviso } from "./avisos";
import { Dialogo } from "./dialogo";
import { Botao, Campo, Faixa } from "./ui";

export function NovoCliente({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar?: (c: { id: string; nome: string }) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const avisar = useAviso();
  const [f, setF] = useState({ nome: "", tipo: "pf" as "pf" | "pj", documento: "", telefone: "", email: "" });
  const criar = useMutation({
    mutationFn: () => api<{ id: string }>("/clientes", { json: { ...f, documento: f.documento || null, telefone: f.telefone || null, email: f.email || null } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar("Cliente cadastrado.");
      aoFechar();
      setF({ nome: "", tipo: "pf", documento: "", telefone: "", email: "" });
      if (aoCriar) aoCriar({ id: r.id, nome: f.nome });
      else void navigate({ to: "/clientes/$id", params: { id: r.id } });
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    criar.mutate();
  };
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo cliente"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" type="submit" form="novo-cliente" ocupado={criar.isPending} disabled={f.nome.trim().length < 2}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <form id="novo-cliente" className="dc-form" onSubmit={enviar}>
        <div className="flex gap-4">
          <label className="dc-opcao">
            <input type="radio" name="tipo" checked={f.tipo === "pf"} onChange={() => setF({ ...f, tipo: "pf" })} /> Pessoa física
          </label>
          <label className="dc-opcao">
            <input type="radio" name="tipo" checked={f.tipo === "pj"} onChange={() => setF({ ...f, tipo: "pj" })} /> Empresa
          </label>
        </div>
        <Campo rotulo="Nome" htmlFor="cli-nome">
          <input id="cli-nome" autoFocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoComplete="off" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo={f.tipo === "pf" ? "CPF" : "CNPJ"} htmlFor="cli-doc">
            <input id="cli-doc" inputMode="numeric" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
          </Campo>
          <Campo rotulo="WhatsApp ou telefone" htmlFor="cli-tel">
            <input id="cli-tel" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="(47) 99999-0000" />
          </Campo>
        </div>
        <Campo rotulo="E-mail" htmlFor="cli-email">
          <input id="cli-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Campo>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </form>
    </Dialogo>
  );
}

/** Escolher um cliente já cadastrado pelo nome (ou cadastrar um novo ali mesmo). */
export function EscolherCliente({ valor, aoEscolher }: { valor: { id: string; nome: string } | null; aoEscolher: (c: { id: string; nome: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);
  const termo = useDeferredValue(q.trim());
  const r = useQuery({ queryKey: ["clientes", "escolher", termo], queryFn: () => api<Pagina<ClienteNaLista>>(`/clientes?busca=${encodeURIComponent(termo)}`), enabled: termo.length >= 2 && !valor });
  if (valor) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--borda-forte)] px-3 py-1.5">
        <span className="truncate font-medium">{valor.nome}</span>
        <button type="button" className="dc-link" onClick={() => aoEscolher(null)}>
          Trocar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF ou telefone" aria-label="Buscar cliente" autoComplete="off" />
      {termo.length >= 2 && (
        <div className="dc-painel dc-linhas" style={{ maxHeight: 180, overflowY: "auto" }}>
          {r.data?.itens.slice(0, 6).map((c) => (
            <button key={c.id} type="button" className="dc-linhas__item w-full cursor-pointer border-0 bg-transparent text-left hover:bg-[var(--superficie-2)]" onClick={() => aoEscolher({ id: c.id, nome: c.nome })}>
              <span className="dc-celula">
                <span className="dc-celula__1">{c.nome}</span>
                {c.documento && <span className="dc-celula__2 dc-num">{c.documento}</span>}
              </span>
            </button>
          ))}
          <button type="button" className="dc-linhas__item w-full cursor-pointer border-0 bg-transparent text-left text-[var(--acento)] hover:bg-[var(--superficie-2)]" onClick={() => setNovo(true)}>
            Cadastrar “{termo}” como cliente novo
          </button>
        </div>
      )}
      <NovoCliente aberto={novo} aoFechar={() => setNovo(false)} aoCriar={(c) => aoEscolher(c)} />
    </div>
  );
}

export function NovoProcesso({ aberto, aoFechar, cliente }: { aberto: boolean; aoFechar: () => void; cliente?: { id: string; nome: string } | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const vazio = { cnj: "", extrajudicial: false, titulo: "", poloCliente: "ativo" as "ativo" | "passivo", outraParte: "", orgao: "", comarca: "", classe: "", responsavelId: "" };
  const [f, setF] = useState(vazio);
  const [cli, setCli] = useState<{ id: string; nome: string } | null>(cliente ?? null);
  const criar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/processos", {
        json: {
          tipo: f.extrajudicial ? "extrajudicial" : "judicial",
          cnj: f.extrajudicial ? null : f.cnj,
          titulo: f.titulo.trim() || undefined,
          clienteId: cli?.id ?? null,
          poloCliente: f.poloCliente,
          orgao: f.orgao || null,
          comarca: f.comarca || null,
          classe: f.classe || null,
          responsavelId: f.responsavelId || undefined,
          partes: [
            ...(cli ? [{ nome: cli.nome, polo: f.poloCliente, papel: f.poloCliente === "ativo" ? "Autor" : "Réu", cliente: true }] : []),
            ...(f.outraParte.trim() ? [{ nome: f.outraParte.trim(), polo: f.poloCliente === "ativo" ? "passivo" : "ativo", papel: f.poloCliente === "ativo" ? "Réu" : "Autor" }] : []),
          ],
        },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["processos"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar(f.extrajudicial ? "Caso cadastrado." : "Processo cadastrado. Os andamentos chegam do DataJud em instantes.");
      aoFechar();
      setF(vazio);
      void navigate({ to: "/processos/$id", params: { id: r.id } });
    },
  });
  const pronto = f.extrajudicial ? f.titulo.trim().length >= 2 : f.cnj.replace(/\D/g, "").length === 20;
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo processo"
      descricao="Com o número, o Decreta descobre o tribunal e busca os andamentos no DataJud."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" type="submit" form="novo-processo" ocupado={criar.isPending} disabled={!pronto}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <form
        id="novo-processo"
        className="dc-form"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate();
        }}
      >
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.extrajudicial} onChange={(e) => setF({ ...f, extrajudicial: e.target.checked })} /> Caso extrajudicial (sem número)
        </label>
        {f.extrajudicial ? (
          <Campo rotulo="Título do caso" htmlFor="pr-titulo">
            <input id="pr-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Revisão do contrato social" />
          </Campo>
        ) : (
          <Campo rotulo="Número do processo (CNJ)" htmlFor="pr-cnj">
            <input id="pr-cnj" className="dc-num" inputMode="numeric" value={f.cnj} onChange={(e) => setF({ ...f, cnj: e.target.value })} placeholder="0000000-00.0000.0.00.0000" autoFocus />
          </Campo>
        )}
        <Campo rotulo="Cliente">
          <EscolherCliente valor={cli} aoEscolher={setCli} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="O cliente é" htmlFor="pr-polo">
            <select id="pr-polo" value={f.poloCliente} onChange={(e) => setF({ ...f, poloCliente: e.target.value as "ativo" | "passivo" })}>
              <option value="ativo">Autor (polo ativo)</option>
              <option value="passivo">Réu (polo passivo)</option>
            </select>
          </Campo>
          <Campo rotulo="Outra parte" htmlFor="pr-outra">
            <input id="pr-outra" value={f.outraParte} onChange={(e) => setF({ ...f, outraParte: e.target.value })} />
          </Campo>
          <Campo rotulo="Vara ou órgão" htmlFor="pr-orgao">
            <input id="pr-orgao" value={f.orgao} onChange={(e) => setF({ ...f, orgao: e.target.value })} placeholder="2ª Vara Cível" />
          </Campo>
          <Campo rotulo="Comarca" htmlFor="pr-comarca">
            <input id="pr-comarca" value={f.comarca} onChange={(e) => setF({ ...f, comarca: e.target.value })} placeholder="Joinville" />
          </Campo>
        </div>
        <Campo rotulo="Responsável" htmlFor="pr-resp">
          <select id="pr-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Eu</option>
            {eu.data?.equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </form>
    </Dialogo>
  );
}

const CANAIS: { id: Canal; rotulo: string }[] = [
  { id: "presencial", rotulo: "Presencial" },
  { id: "telefone", rotulo: "Telefone" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "video", rotulo: "Vídeo" },
  { id: "email", rotulo: "E-mail" },
];

export function NovoAtendimento({ aberto, aoFechar, cliente, processoId }: { aberto: boolean; aoFechar: () => void; cliente?: { id: string; nome: string } | null; processoId?: string | null }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [cli, setCli] = useState<{ id: string; nome: string } | null>(cliente ?? null);
  const [canal, setCanal] = useState<Canal>("presencial");
  const [resumo, setResumo] = useState("");
  const [organizando, setOrganizando] = useState(false);
  const salvar = useMutation({
    mutationFn: () => api(`/clientes/${cli!.id}/atendimentos`, { json: { canal, resumo, processoId: processoId ?? null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      avisar("Atendimento registrado.");
      setResumo("");
      aoFechar();
    },
  });
  /** A IA arruma o que foi anotado às pressas em resumo, pedidos e próximos passos. */
  const organizar = async () => {
    setOrganizando(true);
    try {
      const r = await api<{ situacao: "pronto" | "recusa"; conteudo: { resumo: string; pedidos: string[]; documentosPendentes: string[]; proximosPassos: string[]; recusa?: string } }>("/ia/atendimento", { json: { transcricao: resumo } });
      const c = r.conteudo;
      if (r.situacao === "recusa") {
        avisar(c.recusa ?? "A IA não conseguiu organizar este texto.", { erro: true });
        return;
      }
      const bloco = (t: string, l: string[]) => (l.length ? `\n\n${t}:\n${l.map((x) => `- ${x}`).join("\n")}` : "");
      setResumo(`${c.resumo}${bloco("Pedidos", c.pedidos)}${bloco("Documentos pendentes", c.documentosPendentes)}${bloco("Próximos passos", c.proximosPassos)}`);
    } catch (err) {
      avisar(mensagemDoErro(err), { erro: true });
    } finally {
      setOrganizando(false);
    }
  };
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Registrar atendimento"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!cli || resumo.trim().length < 3}>
            Registrar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Cliente">
          <EscolherCliente valor={cli} aoEscolher={setCli} />
        </Campo>
        <div className="dc-chips" role="radiogroup" aria-label="Canal">
          {CANAIS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={canal === c.id} className={`dc-chip${canal === c.id ? " is-on" : ""}`} onClick={() => setCanal(c.id)}>
              {c.rotulo}
            </button>
          ))}
        </div>
        <Campo rotulo="O que foi conversado" htmlFor="at-resumo">
          <textarea id="at-resumo" rows={6} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Anote do jeito que vier. A IA organiza em resumo, pedidos e próximos passos." />
        </Campo>
        {eu.data?.ia && (
          <div>
            <Botao variante="ia" pequeno onClick={organizar} ocupado={organizando} disabled={resumo.trim().length < 20}>
              Organizar com IA
            </Botao>
          </div>
        )}
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
