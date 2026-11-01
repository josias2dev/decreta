/** Criar conta: a pessoa, o escritório e o primeiro acesso, de uma vez. Depois, a configuração inicial em /comecar. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Botao, Campo, Faixa } from "@/componentes/ui";
import { API_URL } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { marcarComecarAberto } from "./comecar";
import { CaixaDeEntrada } from "./entrar";

export function CadastroPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const eu = useQuery({ ...euQuery, retry: false });
  const [f, setF] = useState({ nome: "", email: "", senha: "", escritorio: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Já tem sessão: vai para o dia.
  useEffect(() => {
    if (eu.data) router.history.replace("/hoje");
  }, [eu.data, router]);
  if (eu.data) return null;

  const curta = f.senha.length > 0 && f.senha.length < 10;
  const pronto = f.nome.trim().length >= 2 && f.email.includes("@") && f.senha.length >= 10 && f.escritorio.trim().length >= 2;

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch(`${API_URL}/api/cadastro`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome: f.nome.trim(), email: f.email.trim().toLowerCase(), senha: f.senha, escritorio: f.escritorio.trim() }),
      });
      const corpo = (await r.json().catch(() => null)) as { detalhe?: string; sessao?: boolean } | null;
      if (!r.ok) throw new Error(corpo?.detalhe ?? (r.status === 429 ? "Muitas contas criadas deste endereço. Espere uma hora e tente de novo." : "Não deu certo agora. Tente de novo em instantes."));
      await qc.invalidateQueries({ queryKey: ["eu"] });
      marcarComecarAberto();
      // Sem sessão (raro): entra com a conta recém-criada e cai no /comecar.
      if (corpo?.sessao === false) router.history.replace(`/entrar?${new URLSearchParams({ email: f.email.trim().toLowerCase(), redirect: "/comecar" })}`);
      else router.history.replace("/comecar");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu certo agora. Tente de novo em instantes.");
      setOcupado(false);
    }
  };

  return (
    <CaixaDeEntrada
      titulo="Criar conta no Decreta"
      sub="O escritório e a sua conta de sócio, em um minuto. A equipe entra depois, por convite."
      pe={
        <Link to="/entrar" className="dc-link text-[13px]">
          Já tenho conta
        </Link>
      }
    >
      <form className="dc-form" onSubmit={criar}>
        <Campo rotulo="Seu nome" htmlFor="ca-nome">
          <input id="ca-nome" autoComplete="name" placeholder="Beatriz Souza" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus />
        </Campo>
        <Campo rotulo="E-mail" htmlFor="ca-email">
          <input id="ca-email" type="email" autoComplete="email" placeholder="voce@escritorio.adv.br" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Campo>
        <Campo rotulo="Senha" htmlFor="ca-senha" erro={curta ? "Pelo menos 10 caracteres" : null} ajuda="Pelo menos 10 caracteres">
          <input id="ca-senha" type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
        </Campo>
        <Campo rotulo="Nome do escritório" htmlFor="ca-escritorio" ajuda="Como aparece nas peças e nas mensagens ao cliente. Dá para mudar depois.">
          <input id="ca-escritorio" autoComplete="organization" placeholder="Souza & Mendes Advocacia" value={f.escritorio} onChange={(e) => setF({ ...f, escritorio: e.target.value })} />
        </Campo>
        {erro && <Faixa tipo="erro">{erro}</Faixa>}
        <Botao type="submit" variante="primaria" bloco ocupado={ocupado} disabled={!pronto}>
          Criar conta
          <ArrowRight className="lp-seta" aria-hidden />
        </Botao>
      </form>
    </CaixaDeEntrada>
  );
}
