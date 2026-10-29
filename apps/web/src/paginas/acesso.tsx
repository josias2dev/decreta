/** Aceitar convite (criando a conta, se for o caso) e redefinir a senha pelo link do e-mail. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Botao, Campo, Carregando, Faixa } from "@/componentes/ui";
import { API_URL } from "@/lib/api";
import { authCall, authClient, papelLabel } from "@/lib/auth";
import { CaixaDeEntrada } from "./entrar";

type Convite = { email: string; papel: string; status: "pending" | "accepted" | "rejected" | "canceled" | "expirado"; escritorio: string };

export function ConvitePage() {
  const { id } = useParams({ from: "/convite/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const convite = useQuery({
    queryKey: ["convite", id],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/convites/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(r.status === 404 ? "nao_encontrado" : "falha");
      return (await r.json()) as Convite;
    },
    retry: false,
  });
  const sessao = useQuery({ queryKey: ["sessao"], queryFn: () => authCall(authClient.getSession()), retry: false });
  const [f, setF] = useState({ nome: "", senha: "", repetir: "" });

  const aceitar = async () => {
    const r = await authCall(authClient.organization.acceptInvitation({ invitationId: id }));
    const orgId = (r as { member?: { organizationId?: string } } | null)?.member?.organizationId;
    if (orgId) await authCall(authClient.organization.setActive({ organizationId: orgId }));
    qc.clear();
    await navigate({ to: "/hoje", replace: true });
  };
  const entrarNaEquipe = useMutation({ mutationFn: aceitar });
  const criarConta = useMutation({
    mutationFn: async () => {
      await authCall(authClient.signUp.email({ email: convite.data!.email, password: f.senha, name: f.nome.trim() }));
      await aceitar();
    },
  });
  const sair = useMutation({
    mutationFn: () => authCall(authClient.signOut()),
    onSettled: () => void sessao.refetch(),
  });

  if (convite.isPending || sessao.isPending) {
    return (
      <CaixaDeEntrada titulo="Convite">
        <Carregando linhas={2} />
      </CaixaDeEntrada>
    );
  }
  const c = convite.data;
  if (!c) {
    return (
      <CaixaDeEntrada titulo="Convite não encontrado" sub="O link pode estar incompleto. Peça a quem convidou para mandar de novo.">
        <Link to="/entrar" className="dc-link">
          Ir para entrar
        </Link>
      </CaixaDeEntrada>
    );
  }
  if (c.status !== "pending") {
    const texto = c.status === "accepted" ? "Este convite já foi aceito. Entre com o seu e-mail e senha." : c.status === "expirado" ? "Este convite venceu. Peça a um sócio para convidar de novo pela tela da Equipe." : "Este convite foi cancelado.";
    return (
      <CaixaDeEntrada titulo={`Equipe de ${c.escritorio}`} sub={texto}>
        <Link to="/entrar" search={{ email: c.email }} className="dc-btn dc-btn--secundaria dc-btn--md dc-btn--bloco">
          Entrar
        </Link>
      </CaixaDeEntrada>
    );
  }

  const logado = sessao.data?.user;
  const titulo = `Equipe de ${c.escritorio}`;
  const sub = (
    <>
      Convite para <strong className="text-[var(--tinta)]">{c.email}</strong> como {papelLabel(c.papel).toLocaleLowerCase("pt-BR")}.
    </>
  );

  if (logado && logado.email.toLowerCase() === c.email.toLowerCase()) {
    return (
      <CaixaDeEntrada titulo={titulo} sub={sub}>
        {entrarNaEquipe.error && <Faixa tipo="erro">{entrarNaEquipe.error.message}</Faixa>}
        <Botao variante="primaria" bloco onClick={() => entrarNaEquipe.mutate()} ocupado={entrarNaEquipe.isPending}>
          Entrar na equipe
        </Botao>
      </CaixaDeEntrada>
    );
  }
  if (logado) {
    return (
      <CaixaDeEntrada titulo={titulo} sub={sub}>
        <Faixa tipo="aviso">Você entrou como {logado.email}. Saia para aceitar com o e-mail do convite.</Faixa>
        <Botao bloco onClick={() => sair.mutate()} ocupado={sair.isPending}>
          Sair desta conta
        </Botao>
      </CaixaDeEntrada>
    );
  }

  const curta = f.senha.length > 0 && f.senha.length < 10;
  const diferente = f.repetir.length > 0 && f.repetir !== f.senha;
  return (
    <CaixaDeEntrada
      titulo={titulo}
      sub={sub}
      pe={
        <span>
          Já tem conta no Decreta?{" "}
          <Link to="/entrar" search={{ email: c.email, redirect: `/convite/${id}` }} className="dc-link text-[13px]">
            Entrar
          </Link>
        </span>
      }
    >
      <form
        className="dc-form"
        onSubmit={(e) => {
          e.preventDefault();
          criarConta.mutate();
        }}
      >
        <Campo rotulo="Seu nome" htmlFor="cv-nome">
          <input id="cv-nome" autoComplete="name" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus />
        </Campo>
        <Campo rotulo="Crie uma senha" htmlFor="cv-senha" erro={curta ? "Pelo menos 10 caracteres" : null} ajuda="Pelo menos 10 caracteres">
          <input id="cv-senha" type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
        </Campo>
        <Campo rotulo="Repita a senha" htmlFor="cv-repetir" erro={diferente ? "Não confere" : null}>
          <input id="cv-repetir" type="password" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
        </Campo>
        {criarConta.error && <Faixa tipo="erro">{criarConta.error.message}</Faixa>}
        <Botao type="submit" variante="primaria" bloco ocupado={criarConta.isPending} disabled={f.nome.trim().length < 2 || f.senha.length < 10 || f.senha !== f.repetir}>
          Criar conta e entrar
        </Botao>
      </form>
    </CaixaDeEntrada>
  );
}

export function RedefinirSenhaPage() {
  const { token } = useSearch({ from: "/redefinir-senha" });
  const [f, setF] = useState({ senha: "", repetir: "" });
  const [feito, setFeito] = useState(false);
  const trocar = useMutation({
    mutationFn: () => authCall(authClient.resetPassword({ newPassword: f.senha, token: token! })),
    onSuccess: () => setFeito(true),
  });
  if (!token) {
    return (
      <CaixaDeEntrada titulo="Link incompleto" sub="Abra o link do e-mail de novo, inteiro, ou peça outro na tela de entrar.">
        <Link to="/entrar" className="dc-link">
          Ir para entrar
        </Link>
      </CaixaDeEntrada>
    );
  }
  if (feito) {
    return (
      <CaixaDeEntrada titulo="Senha nova criada" sub="Entre com ela. Os outros aparelhos vão pedir para entrar de novo.">
        <Link to="/entrar" className="dc-btn dc-btn--primaria dc-btn--md dc-btn--bloco">
          Entrar
        </Link>
      </CaixaDeEntrada>
    );
  }
  const diferente = f.repetir.length > 0 && f.repetir !== f.senha;
  return (
    <CaixaDeEntrada titulo="Criar senha nova">
      <form
        className="dc-form"
        onSubmit={(e) => {
          e.preventDefault();
          trocar.mutate();
        }}
      >
        <Campo rotulo="Senha nova" htmlFor="rs-senha" ajuda="Pelo menos 10 caracteres">
          <input id="rs-senha" type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} autoFocus />
        </Campo>
        <Campo rotulo="Repita" htmlFor="rs-repetir" erro={diferente ? "Não confere" : null}>
          <input id="rs-repetir" type="password" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
        </Campo>
        {trocar.error && <Faixa tipo="erro">{trocar.error.message}</Faixa>}
        <Botao type="submit" variante="primaria" bloco ocupado={trocar.isPending} disabled={f.senha.length < 10 || f.senha !== f.repetir}>
          Salvar senha
        </Botao>
      </form>
    </CaixaDeEntrada>
  );
}
