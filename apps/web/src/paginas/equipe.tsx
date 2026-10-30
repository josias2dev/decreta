/** Equipe: quem está no escritório, o papel de cada um, a OAB que o DJEN busca e os convites. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MailPlus, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Avatar, Botao, Cabecalho, Campo, Carregando, Faixa, Painel, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { authCall, authClient, ehSocio, papelLabel, PAPEIS, type Papel } from "@/lib/auth";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaDoInstante, telefone } from "@/lib/formato";
import type { ConsultaDaOab, Equipe, PessoaDaEquipe } from "@/lib/tipos";

export const equipeQuery = { queryKey: ["equipe"], queryFn: () => api<Equipe>("/equipe") } as const;

export function EquipePage() {
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const q = useQuery(equipeQuery);
  const qc = useQueryClient();
  const avisar = useAviso();
  const [convidando, setConvidando] = useState(false);
  const [editando, setEditando] = useState<PessoaDaEquipe | null>(null);
  const socio = ehSocio(eu.data?.usuario.papel);
  const cancelar = useMutation({
    mutationFn: (invitationId: string) => authCall(authClient.organization.cancelInvitation({ invitationId })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipe"] });
      avisar("Convite cancelado.");
    },
    onError: (err) => avisar(err instanceof Error ? err.message : mensagemDoErro(err), { erro: true }),
  });
  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      avisar("Link copiado. Mande para a pessoa pelo WhatsApp.");
    } catch {
      avisar(link);
    }
  };

  const e = q.data;
  const sub = e ? `${e.pessoas.length} ${e.pessoas.length === 1 ? "pessoa" : "pessoas"}${e.convites.length ? ` · ${e.convites.length} ${e.convites.length === 1 ? "convite pendente" : "convites pendentes"}` : ""}` : " ";
  const pessoas = !e ? (
    <Carregando />
  ) : (
    <Painel titulo="Pessoas" corpo={false}>
      <div className="dc-linhas">
        {e.pessoas.map((p) => (
          <div key={p.id} className="dc-linhas__item items-center">
            <Avatar pessoa={p} grande />
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1">
                {p.nome}
                {p.id === eu.data?.usuario.id && <span className="ml-1.5 font-normal text-[var(--tinta-3)]">(você)</span>}
                <span className="dc-selo dc-selo--prazo ml-2 align-[1px]">{papelLabel(p.papel)}</span>
              </span>
              <span className="dc-celula__2 truncate">{[p.cargo, p.oab].filter(Boolean).join(" · ")}</span>
              {!celular && <span className="dc-celula__2 truncate">{[p.email, p.whatsapp && `WhatsApp ${telefone(p.whatsapp)}${p.avisoManha ? " · resumo da manhã" : ""}`].filter(Boolean).join(" · ")}</span>}
            </span>
            {(socio || p.id === eu.data?.usuario.id) && (
              <Botao variante="fantasma" pequeno onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                <Pencil /> {!celular && "Editar"}
              </Botao>
            )}
          </div>
        ))}
      </div>
    </Painel>
  );
  const convites = e && e.convites.length > 0 && (
    <Painel titulo="Convites pendentes" corpo={false}>
      <div className="dc-linhas">
        {e.convites.map((c) => (
          <div key={c.id} className="dc-linhas__item items-center">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1 truncate">{c.email}</span>
              <span className="dc-celula__2">
                {papelLabel(c.papel)} · vale até {diaCompleto(diaDoInstante(c.expiraEm))}
              </span>
            </span>
            {c.link && (
              <Botao variante="fantasma" pequeno onClick={() => void copiar(c.link!)}>
                <Copy /> {!celular && "Copiar link"}
              </Botao>
            )}
            {socio && (
              <Botao variante="fantasma" pequeno onClick={() => cancelar.mutate(c.id)}>
                Cancelar
              </Botao>
            )}
          </div>
        ))}
      </div>
    </Painel>
  );
  const aviso = e && !e.emailLigado && <Faixa tipo="aviso">O e-mail do Decreta ainda não está ligado: depois de convidar, copie o link e mande para a pessoa.</Faixa>;
  const dialogos = (
    <>
      <Convidar aberto={convidando} aoFechar={() => setConvidando(false)} papelDeQuemConvida={eu.data?.usuario.papel} />
      {editando && <EditarPessoa p={editando} aoFechar={() => setEditando(null)} socio={socio} eu={eu.data?.usuario.id} />}
    </>
  );

  if (celular) {
    return (
      <TelaCelular
        titulo="Equipe"
        sobre={sub}
        voltar
        direita={
          socio && (
            <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Convidar" onClick={() => setConvidando(true)}>
              <MailPlus />
            </button>
          )
        }
      >
        {aviso}
        {pessoas}
        {convites}
        {dialogos}
      </TelaCelular>
    );
  }
  return (
    <Pagina>
      <Cabecalho
        titulo="Equipe"
        sub={sub}
        acoes={
          socio && (
            <Botao variante="primaria" onClick={() => setConvidando(true)}>
              <MailPlus /> Convidar
            </Botao>
          )
        }
      />
      {aviso}
      <div className="dc-colunas">
        <div className="dc-pilha">
          {pessoas}
          {convites}
        </div>
        <Painel titulo="Como funciona">
          <div className="flex flex-col gap-2 text-[14px] leading-[21px] text-[var(--tinta-2)]">
            <p className="m-0">
              <strong className="text-[var(--tinta)]">Sócio</strong> muda tudo: timbre, avisos, convites e papéis.
            </p>
            <p className="m-0">
              <strong className="text-[var(--tinta)]">Equipe</strong> trabalha nos prazos, processos e clientes.
            </p>
            <p className="m-0">O DJEN é buscado pela OAB de cada advogado. Cadastre a OAB de todos.</p>
            <p className="m-0">Com o WhatsApp cadastrado, a pessoa recebe de manhã o que vence no dia.</p>
          </div>
        </Painel>
      </div>
      {dialogos}
    </Pagina>
  );
}

function Convidar({ aberto, aoFechar, papelDeQuemConvida }: { aberto: boolean; aoFechar: () => void; papelDeQuemConvida?: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState({ email: "", papel: "member" as Papel });
  const convidar = useMutation({
    mutationFn: () => authCall(authClient.organization.inviteMember({ email: f.email.trim().toLowerCase(), role: f.papel })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipe"] });
      avisar("Convite enviado.");
      setF({ email: "", papel: "member" });
      aoFechar();
    },
  });
  // Administração não convida sócio (o Better Auth recusa); a tela nem oferece.
  const papeis = (Object.keys(PAPEIS) as Papel[]).filter((p) => papelDeQuemConvida === "owner" || p !== "owner");
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Convidar para a equipe"
      descricao="A pessoa recebe um link que vale 7 dias para criar a conta."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => convidar.mutate()} ocupado={convidar.isPending} disabled={!/^\S+@\S+\.\S+$/.test(f.email.trim())}>
            Convidar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="E-mail" htmlFor="cv-email">
          <input id="cv-email" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Campo>
        <Campo rotulo="Papel" htmlFor="cv-papel">
          <select id="cv-papel" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}>
            {papeis.map((p) => (
              <option key={p} value={p}>
                {PAPEIS[p]}
              </option>
            ))}
          </select>
        </Campo>
        {convidar.error && <Faixa tipo="erro">{convidar.error.message}</Faixa>}
      </div>
    </Dialogo>
  );
}

const chaveDoNome = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .split(/[^a-z]+/)
    .filter((p) => p.length > 2);

/** O nome do Diário é o da pessoa: o primeiro e o último nome dela aparecem lá. */
function mesmaPessoa(doDiario: string, daEquipe: string) {
  const d = new Set(chaveDoNome(doDiario));
  const e = chaveDoNome(daEquipe);
  return e.length > 0 && d.has(e[0]!) && d.has(e[e.length - 1]!);
}

/**
 * "Conferir no Diário": a OAB digitada errada faz a busca de publicações voltar
 * vazia sem aviso. O Diário mostra o nome de quem tem o número.
 */
function ConferirOab({ numero, uf, nome }: { numero: string; uf: string; nome: string }) {
  const digitos = numero.replace(/\D/g, "");
  const conferir = useMutation({ mutationFn: () => api<ConsultaDaOab>(`/consultas/oab?numero=${digitos}&uf=${uf}`) });
  const { reset } = conferir;
  // Outro número ou outra UF: a conferência anterior não vale mais.
  useEffect(() => reset(), [digitos, uf, reset]);
  if (digitos.length < 2) return null;
  const r = conferir.data;
  const dono = r?.nomes[0];
  const exemplo = r?.exemplo ? " Na demonstração, só a OAB de quem está na equipe aparece." : "";
  return (
    <div className="flex flex-col gap-2">
      {!r && (
        <div>
          <Botao variante="fantasma" pequeno onClick={() => conferir.mutate()} ocupado={conferir.isPending}>
            Conferir no Diário
          </Botao>
        </div>
      )}
      {conferir.error && <Faixa tipo="erro">{mensagemDoErro(conferir.error)}</Faixa>}
      {r?.fonte === "achou" && dono && (
        <Faixa tipo={mesmaPessoa(dono.nome, nome) ? "ok" : "aviso"}>
          {mesmaPessoa(dono.nome, nome)
            ? `No Diário, a ${r.oab} aparece com o nome ${dono.nome} em ${dono.publicacoes === 1 ? "1 publicação" : `${dono.publicacoes} publicações`} dos últimos ${r.dias} dias.`
            : `No Diário, a ${r.oab} aparece com o nome ${dono.nome}, não ${nome}. Confira o número e a UF.`}
          {exemplo}
        </Faixa>
      )}
      {r?.fonte === "nao_achou" && (
        <Faixa tipo="aviso">
          Nenhuma publicação com a {r.oab} nos últimos {r.dias} dias. Se {nome.split(" ")[0]} tem processos, confira o número e a UF.{exemplo}
        </Faixa>
      )}
      {r?.fonte === "falhou" && <Faixa tipo="aviso">O Diário não respondeu agora. Dá para salvar e conferir depois.</Faixa>}
    </div>
  );
}

function EditarPessoa({ p, aoFechar, socio, eu }: { p: PessoaDaEquipe; aoFechar: () => void; socio: boolean; eu?: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const org = useQuery({ queryKey: ["organizacao"], queryFn: () => authCall(authClient.organization.getFullOrganization()), enabled: socio });
  const membro = org.data?.members.find((m) => m.userId === p.id);
  const [f, setF] = useState({
    apelido: p.apelido,
    cargo: p.cargo ?? "",
    oabNumero: p.oabNumero ?? "",
    oabUf: p.oabUf ?? "SC",
    whatsapp: telefone(p.whatsapp),
    avisoManha: p.avisoManha,
    papel: p.papel as Papel,
  });
  const [removendo, setRemovendo] = useState(false);
  const salvar = useMutation({
    mutationFn: async () => {
      await api(`/equipe/${p.id}`, {
        method: "PUT",
        json: { apelido: f.apelido.trim() || null, cargo: f.cargo.trim() || null, oabNumero: f.oabNumero.replace(/\D/g, "") || null, oabUf: f.oabNumero ? f.oabUf : null, whatsapp: f.whatsapp.trim() || null, avisoManha: f.avisoManha },
      });
      if (socio && membro && f.papel !== p.papel) await authCall(authClient.organization.updateMemberRole({ memberId: membro.id, role: f.papel }));
    },
    onSuccess: () => {
      for (const k of ["equipe", "eu", "organizacao"]) void qc.invalidateQueries({ queryKey: [k] });
      avisar("Perfil atualizado.");
      aoFechar();
    },
  });
  const remover = useMutation({
    mutationFn: () => authCall(authClient.organization.removeMember({ memberIdOrEmail: membro?.id ?? p.email })),
    onSuccess: () => {
      for (const k of ["equipe", "eu", "organizacao"]) void qc.invalidateQueries({ queryKey: [k] });
      avisar(`${p.apelido} saiu da equipe.`);
      aoFechar();
    },
  });
  const erro = salvar.error ?? remover.error;
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={p.nome}
      descricao={p.email}
      acoes={
        <>
          {socio && p.id !== eu && !removendo && (
            <Botao variante="fantasma" className="mr-auto text-[var(--vencido)]" onClick={() => setRemovendo(true)}>
              Tirar da equipe
            </Botao>
          )}
          {removendo ? (
            <>
              <Botao variante="fantasma" onClick={() => setRemovendo(false)}>
                Voltar
              </Botao>
              <Botao variante="perigo" onClick={() => remover.mutate()} ocupado={remover.isPending}>
                Tirar {p.apelido}
              </Botao>
            </>
          ) : (
            <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending}>
              Salvar
            </Botao>
          )}
        </>
      }
    >
      {removendo ? (
        <p className="dc-dialogo__texto">
          {p.apelido} perde o acesso ao Decreta deste escritório agora. Prazos e processos de que {p.apelido} cuida ficam sem responsável até alguém assumir.
        </p>
      ) : (
        <div className="dc-form">
          <div className="dc-grade-2">
            <Campo rotulo="Como chamar" htmlFor="ep-apelido">
              <input id="ep-apelido" value={f.apelido} onChange={(e) => setF({ ...f, apelido: e.target.value })} />
            </Campo>
            <Campo rotulo="Cargo" htmlFor="ep-cargo">
              <input id="ep-cargo" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} placeholder="Advogada" />
            </Campo>
            <Campo rotulo="OAB" htmlFor="ep-oab" ajuda="O DJEN é buscado por este número">
              <input id="ep-oab" inputMode="numeric" value={f.oabNumero} onChange={(e) => setF({ ...f, oabNumero: e.target.value })} placeholder="41233" />
            </Campo>
            <Campo rotulo="UF da OAB" htmlFor="ep-uf">
              <select id="ep-uf" value={f.oabUf} onChange={(e) => setF({ ...f, oabUf: e.target.value })}>
                {"AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ").map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
          </div>
          <ConferirOab numero={f.oabNumero} uf={f.oabUf} nome={p.nome} />
          <Campo rotulo="WhatsApp" htmlFor="ep-zap">
            <input id="ep-zap" inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="(47) 99123-4567" />
          </Campo>
          <label className="dc-opcao">
            <input type="checkbox" className="dc-checa" checked={f.avisoManha} onChange={(e) => setF({ ...f, avisoManha: e.target.checked })} />
            Receber de manhã, no WhatsApp, o que vence no dia
          </label>
          {socio && p.id !== eu && (
            <Campo rotulo="Papel" htmlFor="ep-papel">
              <select id="ep-papel" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })} disabled={!membro}>
                {(Object.keys(PAPEIS) as Papel[]).map((x) => (
                  <option key={x} value={x}>
                    {PAPEIS[x]}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </div>
      )}
      {erro && <Faixa tipo="erro">{erro instanceof Error && !("status" in erro) ? erro.message : mensagemDoErro(erro)}</Faixa>}
    </Dialogo>
  );
}
