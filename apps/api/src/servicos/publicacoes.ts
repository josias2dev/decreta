/** A fila e as novas tentativas terminam bem antes disso. */
const LEITURA_PARADA_DEPOIS_MS = 3_600_000;

/** Chegou há tempo demais para ainda não ter leitura nenhuma: a rotina de fundo não rodou. */
export function leituraParada(chegouEm: Date): boolean {
  return Date.now() - chegouEm.getTime() > LEITURA_PARADA_DEPOIS_MS;
}

/** "Intimação · laudo pericial"; sem repetir quando o assunto é o próprio tipo ("Citação", não "Citação · citação"). */
export function tituloDaPublicacao(tipo: string | null, assunto: string | null): string {
  const t = tipo ?? "Comunicação";
  return assunto && assunto.toLocaleLowerCase("pt-BR") !== t.toLocaleLowerCase("pt-BR") ? `${t} · ${assunto}` : t;
}
