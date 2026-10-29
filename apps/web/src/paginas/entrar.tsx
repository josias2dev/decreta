/** Entrar: e-mail e senha, o código da verificação em duas etapas e o "esqueci a senha". */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Marca } from "@/componentes/marca";
import { Botao, Campo, Faixa } from "@/componentes/ui";
import { authCall, authClient } from "@/lib/auth";
import { euQuery } from "@/lib/consultas";

export function CaixaDeEntrada({ titulo, sub, children, pe }: { titulo: string; sub?: ReactNode; children: ReactNode; pe?: ReactNode }) {
  return (
    <div className="dc dc-entrada">
      <div className="dc-entrada__caixa">
        <div className="dc-entrada__marca">
          <Marca />
        </div>
        <section className="dc-painel">
          <div className="dc-painel__corpo">
            <div className="flex flex-col gap-1">
              <h1 className="dc-h1" style={{ fontSize: 22, lineHeight: "28px" }}>
                {titulo}
              </h1>
              {sub && <p className="dc-sub m-0">{sub}</p>}
            </div>
            {children}
          </div>
        </section>
        {pe && <div className="flex justify-center text-[13px] text-[var(--tinta-2)]">{pe}</div>}
      </div>
    </div>
  );
}

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
      <CaixaDeEntrada titulo="Código de verificação" sub={etapa === "codigo" ? "Abra o app autenticador e digite os 6 números do Decreta." : "Digite um dos códigos de recuperação que você guardou."}>
        <form className="dc-form" onSubmit={verificar}>
          <Campo rotulo={etapa === "codigo" ? "Código" : "Código de recuperação"} htmlFor="en-codigo">
            <input id="en-codigo" inputMode={etapa === "codigo" ? "numeric" : "text"} autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
          </Campo>
          <label className="dc-opcao">
            <input type="checkbox" className="dc-checa" checked={confiar} onChange={(e) => setConfiar(e.target.checked)} />
            Não pedir de novo neste aparelho por 30 dias
          </label>
          {erro && <Faixa tipo="erro">{erro}</Faixa>}
          <Botao type="submit" variante="primaria" bloco ocupado={ocupado} disabled={!codigo.trim()}>
            Entrar
          </Botao>
          <button type="button" className="dc-link self-center text-[13px]" onClick={() => (setCodigo(""), setErro(null), setEtapa(etapa === "codigo" ? "reserva" : "codigo"))}>
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
        <button type="button" className="dc-link self-center text-[13px]" onClick={() => (setErro(null), setEtapa("senha"))}>
          Voltar para entrar
        </button>
      </CaixaDeEntrada>
    );
  }

  return (
    <CaixaDeEntrada titulo="Entrar no Decreta" sub="Prazos, publicações e processos do escritório." pe="Conta nova só por convite de um sócio do escritório.">
      <form className="dc-form" onSubmit={entrar}>
        <Campo rotulo="E-mail" htmlFor="en-email">
          <input id="en-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!email} />
        </Campo>
        <Campo rotulo="Senha" htmlFor="en-senha">
          <input id="en-senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus={!!email} />
        </Campo>
        {erro && <Faixa tipo="erro">{erro}</Faixa>}
        <Botao type="submit" variante="primaria" bloco ocupado={ocupado} disabled={!email.includes("@") || !senha}>
          Entrar
        </Botao>
        <button type="button" className="dc-link self-center text-[13px]" onClick={() => (setErro(null), setEtapa("esqueci"))}>
          Esqueci a senha
        </button>
      </form>
    </CaixaDeEntrada>
  );
}
