/**
 * Rolagem das listas: no computador a tela fica parada (título, busca e
 * filtros) e só a lista rola; no quadro, cada coluna rola sozinha. As barras
 * de rolagem ficam escondidas (app.css); roda do mouse, toque e teclado rolam.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/util";

/**
 * Listas que mudam pelo endereço (filtro, busca, aba): ao trocar, voltam ao
 * começo, como a página fazia. Ao voltar para a tela, a posição volta junto.
 */
export const VOLTAM_AO_TOPO = ["processos", "clientes", "prazos", "publicacoes", "publicacao"].map((id) => `[data-scroll-restoration-id="${id}"]`);

/** A folha do computador (moldura.tsx) rola por dentro: abre cada tela no começo e volta à posição no "voltar". */
export const FOLHA = '[data-scroll-restoration-id="folha"]';

/**
 * A parte da tela que rola. `id` guarda a posição para quando a pessoa voltar
 * à tela (o roteador lê o data-scroll-restoration-id); quando `topo` muda
 * (outra busca, outra semana), volta ao começo.
 */
export function Rolagem({ id, topo, className, children }: { id: string; topo?: unknown; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const antes = useRef(topo);
  useEffect(() => {
    if (Object.is(antes.current, topo)) return;
    antes.current = topo;
    ref.current?.scrollTo({ top: 0 });
  }, [topo]);
  return (
    <div ref={ref} className={cn("dc-rola", className)} data-scroll-restoration-id={id}>
      {children}
    </div>
  );
}

/**
 * Quadro (kanban) que ocupa a tela. Com mais colunas do que cabem, a roda do
 * mouse fora de uma coluna comprida leva o quadro para o lado.
 */
export function Quadro({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const quadro = ref.current;
    if (!quadro) return;
    const aoRodar = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || quadro.scrollWidth <= quadro.clientWidth) return;
      const coluna = (e.target as Element).closest(".dc-quadro__corpo");
      if (coluna && coluna.scrollHeight > coluna.clientHeight) return;
      e.preventDefault();
      quadro.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    };
    quadro.addEventListener("wheel", aoRodar, { passive: false });
    return () => quadro.removeEventListener("wheel", aoRodar);
  }, []);
  return (
    <div ref={ref} className={cn("dc-quadro", className)} data-scroll-restoration-id={id}>
      {children}
    </div>
  );
}

/** Coluna do quadro: o topo fica e os cartões rolam por baixo dele. */
export function ColunaDoQuadro({ id, titulo, valor, sub, children }: { id: string; titulo: ReactNode; valor: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="dc-quadro__coluna">
      <div className="dc-quadro__topo">
        <span className="dc-quadro__nome" title={typeof titulo === "string" ? titulo : undefined}>
          {titulo}
        </span>
        <span className="dc-quadro__n">{valor}</span>
        {sub && <span className="dc-quadro__sub">{sub}</span>}
      </div>
      <div className="dc-quadro__corpo dc-rola" data-scroll-restoration-id={id}>
        {children}
      </div>
    </section>
  );
}

/**
 * Fim da lista: quando aparece na tela (rolando a lista ou a página), carrega
 * a próxima página. O botão "Carregar mais" continua ao lado.
 */
export function AoChegarNoFim({ aoChegar, ativo }: { aoChegar: () => void; ativo: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const chamar = useRef(aoChegar);
  chamar.current = aoChegar;
  useEffect(() => {
    const fim = ref.current;
    if (!fim || !ativo) return;
    const olho = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && chamar.current(), { rootMargin: "0px 0px 240px 0px" });
    olho.observe(fim);
    return () => olho.disconnect();
  }, [ativo]);
  return <div ref={ref} className="dc-fim-da-lista" aria-hidden />;
}
