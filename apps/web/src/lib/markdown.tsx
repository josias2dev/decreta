/**
 * Markdown das respostas da IA, sem HTML cru: parágrafos, listas (com um nível
 * de recuo), tabelas, citações, código, **negrito**, *itálico* e links. Link
 * para uma tela do Decreta ("/processos/ID") abre dentro do app; para um
 * documento, abre o arquivo; para fora, só http(s), em outra aba. Texto pela
 * metade (a resposta ainda chegando) aparece como texto até fechar.
 */
import { useRouter } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { API_URL } from "./api";

type Bloco =
  | { tipo: "p"; linhas: string[] }
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "lista"; ordenada: boolean; inicio: number; itens: { texto: string; filhos: string[]; ordenada: boolean }[] }
  | { tipo: "tabela"; cabeca: string[]; linhas: string[][]; alinhar: ("left" | "right" | "center" | undefined)[] }
  | { tipo: "citacao"; linhas: string[] }
  | { tipo: "codigo"; texto: string }
  | { tipo: "hr" };

const ITEM = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/;
const celulas = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
const ehSeparador = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function blocosDoMarkdown(md: string): Bloco[] {
  const linhas = md.replace(/\r/g, "").split("\n");
  const saida: Bloco[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i]!;
    if (!l.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(l)) {
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```/.test(linhas[i]!)) corpo.push(linhas[i++]!);
      i++;
      saida.push({ tipo: "codigo", texto: corpo.join("\n") });
      continue;
    }
    const t = /^(#{1,6})\s+(.*)$/.exec(l.trim());
    if (t) {
      saida.push({ tipo: "titulo", nivel: t[1]!.length, texto: t[2]!.replace(/\s*#+\s*$/, "") });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      saida.push({ tipo: "hr" });
      i++;
      continue;
    }
    if (l.trim().startsWith("|") && i + 1 < linhas.length && ehSeparador(linhas[i + 1]!)) {
      const cabeca = celulas(l);
      const alinhar = celulas(linhas[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : undefined));
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && linhas[i]!.trim().startsWith("|")) corpo.push(celulas(linhas[i++]!));
      saida.push({ tipo: "tabela", cabeca, linhas: corpo, alinhar });
      continue;
    }
    if (/^\s*>/.test(l)) {
      const corpo: string[] = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i]!)) corpo.push(linhas[i++]!.replace(/^\s*>\s?/, ""));
      saida.push({ tipo: "citacao", linhas: corpo });
      continue;
    }
    const item = ITEM.exec(l);
    if (item) {
      const recuoBase = item[1]!.length;
      const ordenada = /\d/.test(item[2]!);
      const lista: Extract<Bloco, { tipo: "lista" }> = { tipo: "lista", ordenada, inicio: ordenada ? Number.parseInt(item[2]!, 10) : 1, itens: [] };
      while (i < linhas.length) {
        const atual = linhas[i]!;
        if (!atual.trim()) {
          // Linha em branco entre itens não fecha a lista.
          const prox = linhas[i + 1];
          if (prox && ITEM.exec(prox)) {
            i++;
            continue;
          }
          break;
        }
        const m = ITEM.exec(atual);
        if (m && m[1]!.length <= recuoBase + 1) {
          lista.itens.push({ texto: m[3]!, filhos: [], ordenada: /\d/.test(m[2]!) });
        } else if (m && lista.itens.length) {
          lista.itens.at(-1)!.filhos.push(m[3]!);
        } else if (lista.itens.length && /^\s+\S/.test(atual)) {
          lista.itens.at(-1)!.texto += ` ${atual.trim()}`;
        } else break;
        i++;
      }
      saida.push(lista);
      continue;
    }
    const corpo: string[] = [];
    while (i < linhas.length && linhas[i]!.trim() && !ITEM.exec(linhas[i]!) && !/^(#{1,6})\s/.test(linhas[i]!.trim()) && !/^\s*```/.test(linhas[i]!) && !(linhas[i]!.trim().startsWith("|") && ehSeparador(linhas[i + 1] ?? ""))) {
      corpo.push(linhas[i++]!);
    }
    if (!corpo.length) corpo.push(linhas[i++]!);
    saida.push({ tipo: "p", linhas: corpo });
  }
  return saida;
}

/* ------------------------------------------------------------------ */

/** Telas do Decreta que a IA pode citar. */
const INTERNO = /^\/(processos|prazos|publicacoes|audiencias|clientes|documentos|pecas|agenda|negocios|alvaras)(\/[\w-]+)?\/?(\?[\w=&%.-]*)?$/;

function Ligacao({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const alvo = href.trim();
  const doc = /^\/documentos\/([0-9a-f-]{36})$/i.exec(alvo);
  if (doc) {
    return (
      <a className="dc-md__ref" href={`${API_URL}/api/app/documentos/${doc[1]}/arquivo`} target="_blank" rel="noopener">
        {children}
      </a>
    );
  }
  if (INTERNO.test(alvo)) {
    return (
      <a
        className="dc-md__ref"
        href={alvo}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          router.history.push(alvo);
        }}
      >
        {children}
      </a>
    );
  }
  if (/^https?:\/\//i.test(alvo)) {
    return (
      <a className="dc-md__link" href={alvo} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <>{children}</>;
}

const INLINE = /(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\s]+\))|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|((?<![\w*])\*(?!\s)[^*\n]+?(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)[^_\n]+?(?<!\s)_(?![\w]))/g;

export function Inline({ texto }: { texto: string }): ReactNode {
  const saida: ReactNode[] = [];
  let fim = 0;
  let n = 0;
  for (const m of texto.matchAll(INLINE)) {
    if (m.index! > fim) saida.push(texto.slice(fim, m.index));
    const t = m[0];
    const k = n++;
    if (m[1]) saida.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (m[2]) {
      const [, rotulo, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      saida.push(
        <Ligacao key={k} href={href!}>
          <Inline texto={rotulo!} />
        </Ligacao>,
      );
    } else if (m[3])
      saida.push(
        <strong key={k}>
          <Inline texto={t.slice(2, -2)} />
        </strong>,
      );
    else
      saida.push(
        <em key={k}>
          <Inline texto={t.slice(1, -1)} />
        </em>,
      );
    fim = m.index! + t.length;
  }
  if (fim < texto.length) saida.push(texto.slice(fim));
  return <>{saida}</>;
}

function Linhas({ linhas }: { linhas: string[] }) {
  return (
    <>
      {linhas.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Inline texto={l.trim()} />
        </Fragment>
      ))}
    </>
  );
}

export function Markdown({ texto, className }: { texto: string; className?: string }) {
  const blocos = blocosDoMarkdown(texto);
  return (
    <div className={className ? `dc-md ${className}` : "dc-md"}>
      {blocos.map((b, i) => {
        switch (b.tipo) {
          case "p":
            return (
              <p key={i}>
                <Linhas linhas={b.linhas} />
              </p>
            );
          case "titulo":
            return b.nivel <= 2 ? (
              <h3 key={i}>
                <Inline texto={b.texto} />
              </h3>
            ) : (
              <h4 key={i}>
                <Inline texto={b.texto} />
              </h4>
            );
          case "hr":
            return <hr key={i} />;
          case "codigo":
            return (
              <pre key={i}>
                <code>{b.texto}</code>
              </pre>
            );
          case "citacao":
            return (
              <blockquote key={i}>
                <Linhas linhas={b.linhas} />
              </blockquote>
            );
          case "tabela":
            return (
              <div key={i} className="dc-md__tabela">
                <table>
                  <thead>
                    <tr>
                      {b.cabeca.map((c, j) => (
                        <th key={j} style={{ textAlign: b.alinhar[j] }}>
                          <Inline texto={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.linhas.map((l, j) => (
                      <tr key={j}>
                        {b.cabeca.map((_, k) => (
                          <td key={k} style={{ textAlign: b.alinhar[k] }}>
                            <Inline texto={l[k] ?? ""} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "lista": {
            const Tag = b.ordenada ? "ol" : "ul";
            return (
              <Tag key={i} start={b.ordenada && b.inicio !== 1 ? b.inicio : undefined}>
                {b.itens.map((it, j) => (
                  <li key={j}>
                    <Inline texto={it.texto} />
                    {it.filhos.length > 0 && (
                      <ul>
                        {it.filhos.map((f, k) => (
                          <li key={k}>
                            <Inline texto={f} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </Tag>
            );
          }
        }
      })}
    </div>
  );
}
