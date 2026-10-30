/** Entrar: e-mail e senha, o código da verificação em duas etapas e o "esqueci a senha". */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FundoAscii, useCorDaBarra } from "@/componentes/fundo-ascii";
import { LogoCompleta } from "@/componentes/marca";
import { Botao, Campo, Faixa } from "@/componentes/ui";
import { authCall, authClient } from "@/lib/auth";
import { euQuery } from "@/lib/consultas";
import { cn } from "@/lib/util";

/** A moldura das telas de acesso: o fundo em ASCII do hero da landing, a marca grande e o cartão. */
export function CaixaDeEntrada({ titulo, sub, children, pe }: { titulo: string; sub?: ReactNode; children: ReactNode; pe?: ReactNode }) {
  useCorDaBarra("#0b0b0f");
  return (
    <div className="lp dc lp-entrar" data-theme="escuro">
      <FundoAscii miolo=".lp-entrar__meio" />
      <Link className="lp-entrar__site" to="/">
        <ArrowLeft aria-hidden />
        decreta.site
      </Link>
      <main className="lp-entrar__meio">
        <div className="lp-entrar__marca lp-e">
          <LogoCompleta className="lp-entrar__logo" />
        </div>
        <section className="lp-cartao-entrar lp-e lp-e--2">
          <div>
            <h1 className="lp-cartao-entrar__titulo">{titulo}</h1>
            {sub && <p className="lp-cartao-entrar__sub">{sub}</p>}
          </div>
          {children}
          {pe && <div className="lp-cartao-entrar__pe">{pe}</div>}
        </section>
      </main>
      <footer className="lp-entrar__rodape">
        <span className="lp-seguro">
          <Lock aria-hidden />
          Conexão segura · verificação em duas etapas
        </span>
        <span>© 2026 Decreta</span>
      </footer>
    </div>
  );
}

/** Seis casas para o código do app autenticador. Por baixo é um campo só: colar e o preenchimento automático funcionam. */
function CodigoDeSeis({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const [foco, setFoco] = useState(false);
  return (
    <div className="lp-digitos">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={cn("lp-digito", foco && i === Math.min(valor.length, 5) && "is-foco")} aria-hidden>
          {valor[i] ?? ""}
        </span>
      ))}
      <input
        id="en-codigo"
        className="lp-digitos__campo"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Código de 6 números"
        value={valor}
        onChange={(e) => aoMudar(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        autoFocus
      />
    </div>
  );
}

const Seta = () => <ArrowRight className="lp-seta" aria-hidden />;

type Etapa = "senha" | "codigo" | "reserva" | "esqueci" | "enviado";

export function EntrarPage() {
  const search = useSearch({ from: "/entrar" });
  const router = useRouter();
  const qc = useQueryClient();
  const eu = useQuery({ ...euQuery, retry: false });
  const [etapa, setEtapa] = useState<Etapa>("senha");
  const [email, setEmail] = useState(search.email ?? "");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [confiar, setConfiar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Já tem sessão: segue para onde ia.
  useEffect(() => {
    if (eu.data) router.history.replace(search.redirect ?? "/hoje");
  }, [eu.data, router, search.redirect]);
  if (eu.data) return null;

  const pronto = async () => {
    await qc.invalidateQueries({ queryKey: ["eu"] });
    router.history.replace(search.redirect ?? "/hoje");
  };
  const tentar = (fazer: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      await fazer();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu certo agora. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  };

  const entrar = tentar(async () => {
    const r = await authCall(authClient.signIn.email({ email: email.trim().toLowerCase(), password: senha }));
    if ((r as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
      setEtapa("codigo");
      return;
    }
    await pronto();
  });
  const verificar = tentar(async () => {
    if (etapa === "reserva") await authCall(authClient.twoFactor.verifyBackupCode({ code: codigo.trim(), trustDevice: confiar }));
    else await authCall(authClient.twoFactor.verifyTotp({ code: codigo.replace(/\D/g, ""), trustDevice: confiar }));
    await pronto();
  });
  const pedirLink = tentar(async () => {
    await authCall(authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: `${window.location.origin}/redefinir-senha` }));
    setEtapa("enviado");
  });

  if (etapa === "codigo" || etapa === "reserva") {
    return (
      <CaixaDeEntrada
        titulo="Código de verificação"
        sub={etapa === "codigo" ? "Abra o app autenticador e digite os 6 números do Decreta." : "Digite um dos códigos de recuperação que você guardou."}
        pe={
          <button type="button" className="lp-link-sm lp-link-sm--neutro" onClick={() => (setCodigo(""), setErro(null), setEtapa("senha"))}>
            Voltar para entrar
          </button>
        }
      >
        <form className="dc-form" onSubmit={verificar}>
          {etapa === "codigo" ? (
            <CodigoDeSeis valor={codigo} aoMudar={setCodigo} />
          ) : (
            <Campo rotulo="Código de recuperação" htmlFor="en-codigo">
              <input id="en-codigo" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
            </Campo>
          )}
          <label className="lp-opcao">
            <input type="checkbox" checked={confiar} onChange={(e) => setConfiar(e.target.checked)} />
            Não pedir de novo neste aparelho por 30 dias
          </label>
          {erro && <Faixa tipo="erro">{erro}</Faixa>}
          <Botao type="submit" variante="primaria" bloco ocupado={ocupado} disabled={etapa === "codigo" ? codigo.length < 6 : !codigo.trim()}>
            Entrar
            <Seta />
          </Botao>
          <button type="button" className="lp-link-sm self-center" onClick={() => (setCodigo(""), setErro(null), setEtapa(etapa === "codigo" ? "reserva" : "codigo"))}>
            {etapa === "codigo" ? "Perdi o celular: usar um código de recuperação" : "Usar o app autenticador"}
          </button>
        </form>
      </CaixaDeEntrada>
    );
  }

  if (etapa === "esqueci" || etapa === "enviado") {
    return (
      <CaixaDeEntrada titulo="Esqueci a senha" sub={etapa === "enviado" ? undefined : "Mandamos um link para criar uma senha nova."}>
        {etapa === "enviado" ? (
          <Faixa tipo="ok">Se {email} tiver conta no Decreta, o link chega em instantes. Ele vale por 1 hora.</Faixa>
        ) : (
          <form className="dc-form" onSubmit={pedirLink}>
            <Campo rotulo="E-mail" htmlFor="en-email">
              <input id="en-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Campo>
            {erro && <Faixa tipo="erro">{erro}</Faixa>}
            <Botao type="submit" variante="primaria" bloco ocupado={ocupado} disabled={!email.includes("@")}>
              Mandar o link
            </Botao>
          </form>
        )}
        <button type="button" className="lp-link-sm lp-link-sm--neutro self-center" onClick={() => (setErro(null), setEtapa("senha"))}>
          Voltar para entrar
        </button>
      </CaixaDeEntrada>
    );
  }

  return (
    <CaixaDeEntrada titulo="Entrar no Decreta" sub="Prazos, publicações e processos do escritório." pe="Conta nova só por convite de um sócio do escritório.">
      <form className="dc-form" onSubmit={entrar}>
        <Campo rotulo="E-mail" htmlFor="en-email">
          <input id="en-email" type="email" autoComplete="email" placeholder="voce@escritorio.adv.br" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!email} />
        </Campo>
        <div className="dc-campo">
          <div className="lp-campo__linha">
            <label htmlFor="en-senha">Senha</label>
            <button type="button" className="lp-link-sm" onClick={() => (setErro(null), setEtapa("esqueci"))}>
              Esqueci a senha
            </button>
          </div>
          <input id="en-senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus={!!email} />
        </div>
        {erro && <Faixa tipo="erro">{erro}</Faixa>}
        <Botao type="submit" variante="primaria" bloco ocupado={ocupado} disabled={!email.includes("@") || !senha}>
          Entrar
          <Seta />
        </Botao>
      </form>
    </CaixaDeEntrada>
  );
}
