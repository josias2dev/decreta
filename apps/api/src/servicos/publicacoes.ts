/** "Intimação · laudo pericial"; sem repetir quando o assunto é o próprio tipo ("Citação", não "Citação · citação"). */
export function tituloDaPublicacao(tipo: string | null, assunto: string | null): string {
  const t = tipo ?? "Comunicação";
  return assunto && assunto.toLocaleLowerCase("pt-BR") !== t.toLocaleLowerCase("pt-BR") ? `${t} · ${assunto}` : t;
}
