/**
 * A moldura das páginas abertas de texto (Termos de Uso, Política de Privacidade,
 * Segurança e LGPD): o mesmo topo, a mesma largura de leitura e o mesmo rodapé,
 * com os links dos três documentos.
 */
import { EMPRESA } from "@decreta/core";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useCorDaBarra } from "@/componentes/fundo-ascii";
import { LogoCompleta } from "@/componentes/marca";

/** O contato que já existe no site: o WhatsApp da equipe. */
export const LINK_DO_CONTATO = `https://wa.me/${EMPRESA.contato.whatsapp}`;

/** Os três documentos abertos, no rodapé de toda tela sem login. */
export function LinksLegais() {
  return (
    <nav className="lp-legais" aria-label="Documentos legais">
      <Link to="/termos">Termos de Uso</Link>
      <Link to="/privacidade">Privacidade</Link>
      <Link to="/seguranca">Segurança e LGPD</Link>
    </nav>
  );
}

export function PaginaLegal({ olho, titulo, intro, atualizada, children }: { olho: string; titulo: string; intro: ReactNode; atualizada: string; children: ReactNode }) {
  useCorDaBarra("#0b0b0f");
  useEffect(() => {
    document.title = `${olho} · Decreta`;
    return () => {
      document.title = "Decreta";
    };
  }, [olho]);

  return (
    <div className="lp dc lp-seg" data-theme="escuro">
      <header className="lp-seg__topo">
        <Link className="lp-entrar__site lp-seg__voltar" to="/">
          <ArrowLeft aria-hidden />
          decreta.site
        </Link>
        <Link className="lp-seg__entrar" to="/entrar">
          Entrar
        </Link>
      </header>
      <main className="lp-seg__meio">
        <LogoCompleta className="lp-seg__logo" />
        <div className="lp-seg__cabeca">
          <span className="lp-olho">{olho}</span>
          <h1 className="lp-h2">{titulo}</h1>
          <p className="lp-texto">{intro}</p>
        </div>
        {children}
        <p className="lp-seg__data">{atualizada}</p>
      </main>
      <footer className="lp-entrar__rodape">
        <LinksLegais />
        <span>© 2026 Decreta</span>
      </footer>
    </div>
  );
}

/** Uma seção do texto, com o título no mesmo nível em todas as páginas legais. */
export function SecaoLegal({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="lp-seg__secao" aria-labelledby={id}>
      <h2 id={id}>{titulo}</h2>
      {children}
    </section>
  );
}
