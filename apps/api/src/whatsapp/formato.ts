/**
 * Markdown da IA → marcas do WhatsApp. As instruções já pedem o formato do WhatsApp, mas o modelo
 * escorrega (a mecânica aprendeu isso): a conversão no código é a rede de segurança.
 *
 * - **negrito** e __negrito__ viram *negrito*; títulos (#) viram uma linha em negrito;
 * - [texto](/processos/ID) vira "texto: https://decreta.site/processos/ID" (o WhatsApp não tem link com nome);
 * - caminho interno solto (/prazos/ID) ganha o endereço do Decreta;
 * - tabela vira uma linha por registro; citação (>) e travessão longo saem.
 */
const CAMINHO = /(^|[\s(])(\/(?:processos|prazos|publicacoes|audiencias|clientes|documentos|hoje|agenda|perguntar)\/?[0-9a-f-]{0,36})(?=[\s).,;]|$)/gi;

export function paraWhatsapp(md: string, telas: string): string {
  const base = telas.replace(/\/$/, "");
  const linhas = md.replace(/\r\n?/g, "\n").split("\n");
  const saida: string[] = [];
  for (const bruta of linhas) {
    let l = bruta;
    // Linha separadora de tabela some; linha de tabela vira os campos separados por " · ".
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)) continue;
    if (/^\s*\|.*\|\s*$/.test(l)) l = l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter(Boolean).join(" · ");
    l = l.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/, "*$1*");
    l = l.replace(/^\s*>\s?/, "");
    l = l.replace(/^(\s*)[*•]\s+/, "$1- ");
    saida.push(l);
  }
  let t = saida.join("\n");
  t = t.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/__(.+?)__/g, "_$1_");
  t = t.replace(/\[([^\]]+)\]\((\/[^)\s]+)\)/g, (_m, nome: string, caminho: string) => `${nome}: ${base}${caminho}`);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2");
  t = t.replace(CAMINHO, (_m, antes: string, caminho: string) => `${antes}${base}${caminho}`);
  t = t.replace(/\s+—\s+/g, ": ").replace(/—/g, "-");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
