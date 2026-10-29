/** "Mais" do celular: o resto do menu, o escritório e a conta. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, UserRound } from "lucide-react";
import { MENU, TelaCelular } from "@/componentes/moldura";
import { Avatar } from "@/componentes/ui";
import { euQuery } from "@/lib/consultas";
import { numero } from "@/lib/formato";

/** O que já está na navegação de baixo não se repete aqui. */
const NA_NAVEGACAO = new Set(["/hoje", "/prazos", "/processos", "/clientes"]);

export function MaisPage() {
  const eu = useQuery(euQuery);
  const e = eu.data;
  return (
    <TelaCelular titulo="Mais" sobre={e?.escritorio.nome}>
      {MENU.map((g) => {
        const itens = g.itens.filter((i) => !NA_NAVEGACAO.has(i.to));
        if (!itens.length) return null;
        return (
          <section key={g.titulo} className="dc-secao">
            <span className="dc-rotulo uppercase tracking-[0.08em]">{g.titulo}</span>
            <div className="dc-painel">
              <div className="dc-linhas">
                {itens.map((i) => {
                  const n = e && i.n?.(e.menu);
                  return (
                    <Link key={i.to} to={i.to} className="dc-linhas__item items-center" style={{ minHeight: 48 }}>
                      <i.icone className="size-5 flex-none text-[var(--tinta-2)]" />
                      <span className="flex-1 text-[16px]">{i.rotulo}</span>
                      {n && <span className="dc-num text-[14px] text-[var(--tinta-2)]">{numero(n.n)}</span>}
                      <ChevronRight className="size-4 text-[var(--tinta-3)]" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
      <section className="dc-secao">
        <span className="dc-rotulo uppercase tracking-[0.08em]">Conta</span>
        <div className="dc-painel">
          <Link to="/conta" className="dc-linhas__item items-center" style={{ minHeight: 56 }}>
            {e ? <Avatar pessoa={e.usuario} grande /> : <UserRound className="size-5" />}
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1 text-[16px]">{e?.usuario.nome ?? "Minha conta"}</span>
              <span className="dc-celula__2">{e?.usuario.cargo ?? "Perfil, senha e verificação em duas etapas"}</span>
            </span>
            <ChevronRight className="size-4 text-[var(--tinta-3)]" />
          </Link>
        </div>
      </section>
    </TelaCelular>
  );
}
