/**
 * O documento aberto, como ele é: o PDF página a página, a foto, o Word com a
 * formatação, o texto e o áudio, sobre um fundo cinza, como folhas na mesa.
 * As bibliotecas do PDF e do Word só carregam quando alguém abre um desses.
 * O que não dá para mostrar (Word antigo, planilha) oferece baixar.
 */
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { API_URL } from "@/lib/api";
import { abrirPdf, type PDFDocumentProxy, type RenderTask } from "@/lib/pdf";
import type { Documento } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { IconeDoArquivo } from "./icone-arquivo";

export const urlDoArquivo = (id: string) => `${API_URL}/api/app/documentos/${id}/arquivo`;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
type Forma = "pdf" | "imagem" | "word" | "texto" | "audio";

/** Como o arquivo aparece na tela; nulo quando só baixando. O tipo vem do servidor, que conferiu no envio. */
export function formaDoArquivo(mime: string): Forma | null {
  if (mime === "application/pdf") return "pdf";
  if (/^image\/(png|jpeg|webp|gif)$/.test(mime)) return "imagem";
  if (mime === DOCX) return "word";
  if (mime === "text/plain") return "texto";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** PDF e foto também abrem no próprio navegador, em outra aba (o servidor manda esses dois para ver). */
export const abreNoNavegador = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

/**
 * `naPagina`: as folhas rolam com a página (celular) em vez de rolar dentro
 * do painel (computador).
 */
export function VerDocumento({ d, naPagina, className }: { d: Documento; naPagina?: boolean; className?: string }) {
  const forma = formaDoArquivo(d.mime);
  const arquivo = useQuery({
    queryKey: ["arquivo", d.id],
    queryFn: async ({ signal }) => {
      const r = await fetch(urlDoArquivo(d.id), { credentials: "include", signal });
      if (!r.ok) throw new Error(`http_${r.status}`);
      return r.blob();
    },
    // O áudio toca direto do endereço; o resto precisa do arquivo inteiro na mão.
    enabled: forma !== null && forma !== "audio",
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 2 * 60_000,
    retry: 1,
  });
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [d.id]);

  let corpo: ReactNode;
  if (!forma) corpo = <SemPrevia d={d} />;
  else if (forma === "audio") corpo = <Audio d={d} />;
  else if (arquivo.isError || falhou) corpo = <SemPrevia d={d} erro />;
  else if (!arquivo.data) corpo = <Abrindo />;
  else if (forma === "pdf") corpo = <Pdf blob={arquivo.data} naPagina={naPagina} aoFalhar={() => setFalhou(true)} />;
  else if (forma === "imagem") corpo = <Imagem blob={arquivo.data} nome={d.nome} aoFalhar={() => setFalhou(true)} />;
  else if (forma === "word") corpo = <Word blob={arquivo.data} naPagina={naPagina} aoFalhar={() => setFalhou(true)} />;
  else corpo = <Texto blob={arquivo.data} />;
  return (
    <div className={cn("dc-ver", naPagina && "dc-ver--na-pagina", className)} data-forma={forma ?? "nenhuma"}>
      {corpo}
    </div>
  );
}

function Abrindo() {
  return (
    <div className="dc-ver__folhas" aria-label="Abrindo o documento">
      <div className="dc-ver__folha dc-ver__folha--vazia" />
    </div>
  );
}

function SemPrevia({ d, erro }: { d: Documento; erro?: boolean }) {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(d.nome)?.[1]?.toLowerCase();
  const motivo = erro
    ? "Não deu para abrir este arquivo aqui. Baixe para ver no computador."
    : ext === "doc"
      ? "Arquivo do Word antigo (.doc). Baixe para abrir no Word."
      : d.mime.includes("spreadsheet") || ext === "xls" || ext === "xlsx"
        ? "Planilha. Baixe para abrir no Excel."
        : "Este tipo de arquivo não abre aqui. Baixe para ver no computador.";
  return (
    <div className="dc-ver__aviso">
      <IconeDoArquivo nome={d.nome} mime={d.mime} className="dc-ver__icone" />
      <p>{motivo}</p>
      <a className="dc-btn dc-btn--secundaria dc-btn--sm" href={urlDoArquivo(d.id)}>
        <Download /> Baixar
      </a>
    </div>
  );
}

function Audio({ d }: { d: Documento }) {
  return (
    <div className="dc-ver__aviso">
      <IconeDoArquivo nome={d.nome} mime={d.mime} className="dc-ver__icone" />
      <audio className="dc-ver__audio" controls preload="metadata" src={urlDoArquivo(d.id)} />
    </div>
  );
}

/** Largura útil da área (sem o respiro dos lados), acompanhando o painel quando ele muda de tamanho. */
function useLargura(ref: React.RefObject<HTMLElement | null>) {
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const s = getComputedStyle(el);
      setLargura(Math.floor(el.clientWidth - Number.parseFloat(s.paddingLeft) - Number.parseFloat(s.paddingRight)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return largura;
}

/** Folha na largura do painel, sem passar do tamanho de leitura. */
const LARGURA_MAXIMA = 880;

function Pdf({ blob, naPagina, aoFalhar }: { blob: Blob; naPagina?: boolean; aoFalhar: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  const largura = Math.min(useLargura(area), LARGURA_MAXIMA);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  /** Proporção (altura ÷ largura) de cada página; até ler a página, vale a da primeira. */
  const [proporcoes, setProporcoes] = useState<number[]>([]);
  const [atual, setAtual] = useState(1);
  const falhar = useRef(aoFalhar);
  falhar.current = aoFalhar;

  useEffect(() => {
    let vivo = true;
    let tarefa: Awaited<ReturnType<typeof abrirPdf>> | null = null;
    setPdf(null);
    (async () => {
      tarefa = await abrirPdf(await blob.arrayBuffer());
      const doc = await tarefa.promise;
      const primeira = (await doc.getPage(1)).getViewport({ scale: 1 });
      if (!vivo) return;
      setProporcoes(Array.from({ length: doc.numPages }, () => primeira.height / primeira.width));
      setPdf(doc);
    })().catch(() => vivo && falhar.current());
    return () => {
      vivo = false;
      void tarefa?.destroy();
    };
  }, [blob]);

  // O contador mostra a página que passa pelo primeiro terço da vista.
  useEffect(() => {
    const el = area.current;
    if (!el || !pdf) return;
    const rola: HTMLElement | Window = naPagina ? window : el;
    const contar = () => {
      const linha = naPagina ? window.innerHeight / 3 : el.getBoundingClientRect().top + el.clientHeight / 3;
      let n = 1;
      for (const p of el.querySelectorAll<HTMLElement>("[data-pagina]")) if (p.getBoundingClientRect().top <= linha) n = Number(p.dataset.pagina);
      setAtual(n);
    };
    contar();
    rola.addEventListener("scroll", contar, { passive: true });
    return () => rola.removeEventListener("scroll", contar);
  }, [pdf, naPagina]);

  return (
    <>
      <div ref={area} className="dc-ver__folhas" tabIndex={-1}>
        {!pdf || !largura ? (
        <div className="dc-ver__folha dc-ver__folha--vazia" />
      ) : (
        proporcoes.map((p, i) => (
          <PaginaDoPdf
            key={i}
            pdf={pdf}
            n={i + 1}
            largura={largura}
            proporcao={p}
            raiz={naPagina ? null : area}
            aoMedir={(nova) => setProporcoes((ps) => (ps[i] === nova ? ps : ps.map((x, j) => (j === i ? nova : x))))}
          />
        ))
        )}
      </div>
      {pdf && pdf.numPages > 1 && (
        <span className="dc-ver__contador" aria-live="polite">
          {atual} / {pdf.numPages}
        </span>
      )}
    </>
  );
}

/**
 * Uma página: desenha quando chega perto da vista e apaga quando vai longe,
 * para um processo de 300 páginas não encher a memória do celular.
 */
function PaginaDoPdf({ pdf, n, largura, proporcao, raiz, aoMedir }: { pdf: PDFDocumentProxy; n: number; largura: number; proporcao: number; raiz: React.RefObject<HTMLDivElement | null> | null; aoMedir: (p: number) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [perto, setPerto] = useState(n <= 2);
  const medir = useRef(aoMedir);
  medir.current = aoMedir;

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPerto(!!e?.isIntersecting), { root: raiz?.current ?? null, rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [raiz]);

  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    if (!perto) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let vivo = true;
    let tarefa: RenderTask | null = null;
    (async () => {
      const pagina = await pdf.getPage(n);
      if (!vivo) return;
      const base = pagina.getViewport({ scale: 1 });
      medir.current(base.height / base.width);
      // No celular a página é estreita e a pessoa amplia com os dedos: desenha com folga.
      const dpr = raiz ? Math.min(window.devicePixelRatio || 1, 2) : 3;
      const vista = pagina.getViewport({ scale: (largura * dpr) / base.width });
      canvas.width = Math.floor(vista.width);
      canvas.height = Math.floor(vista.height);
      tarefa = pagina.render({ canvas, viewport: vista });
      await tarefa.promise;
    })().catch(() => {});
    return () => {
      vivo = false;
      tarefa?.cancel();
    };
  }, [pdf, n, largura, perto, raiz]);

  return (
    <div ref={caixa} className="dc-ver__folha" data-pagina={n} style={{ width: largura, height: Math.round(largura * proporcao) }}>
      <canvas ref={tela} aria-label={`Página ${n}`} />
    </div>
  );
}

function useUrl(blob: Blob) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** A foto inteira na área; um clique mostra no tamanho real (para ler um detalhe), outro volta. */
function Imagem({ blob, nome, aoFalhar }: { blob: Blob; nome: string; aoFalhar: () => void }) {
  const url = useUrl(blob);
  const [real, setReal] = useState(false);
  return (
    <div className="dc-ver__folhas dc-ver__folhas--imagem">
      {url && <img className={cn("dc-ver__imagem", real && "dc-ver__imagem--real")} src={url} alt={nome} onError={aoFalhar} onClick={() => setReal((r) => !r)} />}
    </div>
  );
}

function Texto({ blob }: { blob: Blob }) {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void blob.text().then((t) => vivo && setTexto(t));
    return () => {
      vivo = false;
    };
  }, [blob]);
  return (
    <div className="dc-ver__folhas">
      <pre className="dc-ver__folha dc-ver__texto">{texto}</pre>
    </div>
  );
}

/**
 * O Word do jeito que ele é (margens, timbre, negrito), em folhas do tamanho
 * da página, reduzidas para caber. No celular a folha reduzida fica miúda:
 * o texto corre na largura da tela, no tamanho do documento.
 */
function Word({ blob, naPagina, aoFalhar }: { blob: Blob; naPagina?: boolean; aoFalhar: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  const alvo = useRef<HTMLDivElement>(null);
  const largura = useLargura(area);
  const [pronto, setPronto] = useState(false);
  const falhar = useRef(aoFalhar);
  falhar.current = aoFalhar;

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    let vivo = true;
    setPronto(false);
    (async () => {
      const { renderAsync } = await import("docx-preview");
      if (!vivo) return;
      el.replaceChildren();
      await renderAsync(blob, el, undefined, {
        className: "docx",
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        // HTML de fora embutido no Word: não entra na tela.
        renderAltChunks: false,
        renderComments: false,
        useBase64URL: true,
      });
      if (!vivo) return;
      // Link só para a web e e-mail, abrindo fora; o resto vira texto.
      for (const a of el.querySelectorAll("a")) {
        const href = a.getAttribute("href") ?? "";
        if (/^(https?:|mailto:)/i.test(href)) {
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        } else a.removeAttribute("href");
      }
      if (naPagina) paraLerNoCelular(el);
      setPronto(true);
    })().catch(() => vivo && falhar.current());
    return () => {
      vivo = false;
    };
  }, [blob, naPagina]);

  // Reduz a folha (em geral A4, 794px) para caber na largura do painel.
  useLayoutEffect(() => {
    const el = alvo.current;
    const folha = el?.querySelector<HTMLElement>("section.docx");
    if (!el || !folha || !largura || naPagina) return;
    el.style.zoom = "1";
    el.style.zoom = String(Math.min(1, largura / folha.offsetWidth));
  }, [largura, pronto, naPagina]);

  return (
    <div ref={area} className="dc-ver__folhas dc-ver__folhas--word" tabIndex={-1}>
      {!pronto && <div className="dc-ver__folha dc-ver__folha--vazia" />}
      <div ref={alvo} className="dc-ver__word" hidden={!pronto} />
    </div>
  );
}

/**
 * O Word como leitura no celular: sem a largura e as margens da página, o
 * timbre colado ao texto, os recuos grandes encurtados e sem o justificado,
 * que numa coluna estreita abre buracos entre as palavras.
 */
function paraLerNoCelular(el: HTMLElement) {
  for (const folha of el.querySelectorAll<HTMLElement>("section.docx")) {
    folha.style.width = "";
    folha.style.minHeight = "";
    folha.style.padding = "";
  }
  for (const parte of el.querySelectorAll<HTMLElement>("section.docx > header, section.docx > footer")) {
    parte.style.margin = "";
    parte.style.minHeight = "";
  }
  for (const bloco of el.querySelectorAll<HTMLElement>("section.docx [style]")) {
    const s = bloco.style;
    if (s.textIndent) s.textIndent = `min(${s.textIndent}, 2em)`;
    if (s.marginLeft) s.marginLeft = `min(${s.marginLeft}, 12%)`;
    if (s.paddingLeft) s.paddingLeft = `min(${s.paddingLeft}, 12%)`;
    if (s.textAlign === "justify") s.textAlign = "left";
  }
}
