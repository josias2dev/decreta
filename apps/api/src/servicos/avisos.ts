/**
 * Resumo da manhã no WhatsApp: cada pessoa recebe os prazos dela que vencem
 * hoje e os vencidos, as audiências do dia, quantas publicações chegaram e a
 * auditoria da carteira (o que é dela e o que não tem dono),
 * com o link para abrir cada prazo. Sai pelo número do Decreta no wameow.
 */
import { ROTULO_DA_AUDITORIA, telefoneWhatsapp } from "@decreta/core";
import type { PainelDoDia } from "./hoje.ts";

/** No WhatsApp, a auditoria leva no máximo estes itens; o resto fica no Hoje. */
const ACHADOS_NO_WHATSAPP = 5;

export interface Wameow {
  url: string;
  token: string;
  fetch?: typeof fetch;
}

export async function enviarWhatsapp(w: Wameow, numero: string, texto: string): Promise<void> {
  const para = telefoneWhatsapp(numero);
  if (!para) throw new Error(`número de WhatsApp inválido: ${numero}`);
  const res = await (w.fetch ?? fetch)(`${w.url.replace(/\/$/, "")}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${w.token}` },
    body: JSON.stringify({ number: para, text: texto }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`wameow HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

/** O texto da mensagem para uma pessoa. `null` quando não há nada dela no dia (não manda mensagem vazia). */
export function resumoDaManha(painel: PainelDoDia, pessoa: { id: string; apelido: string }, telas: string, opcoes: { saudacao?: boolean } = {}): string | null {
  const meus = painel.itens.filter((i) => i.responsavel?.id === pessoa.id);
  const semDono = painel.itens.filter((i) => i.tipo === "prazo" && !i.responsavel);
  const vencidos = meus.filter((i) => i.urgencia === "vencido");
  const hoje = meus.filter((i) => i.urgencia === "hoje");
  const auds = meus.filter((i) => i.tipo === "audiencia");
  const tarefas = meus.filter((i) => i.tipo === "tarefa");
  const alertas = painel.alertasDaCaptura;
  // Da auditoria da carteira, o que é da pessoa e o que não tem dono.
  const achados = painel.auditoria.itens.filter((a) => a.responsavelId === pessoa.id || a.responsavelId === null);
  if (!vencidos.length && !hoje.length && !auds.length && !tarefas.length && !semDono.length && !painel.contadores.publicacoesNovas && !alertas.length && !achados.length) return null;

  const base = telas.replace(/\/$/, "");
  const link = (i: { tipo: string; id: string; processoId: string | null }) => (i.tipo === "prazo" ? `${base}/prazos/${i.id}` : i.processoId ? `${base}/processos/${i.processoId}` : `${base}/hoje`);
  const linha = (i: PainelDoDia["itens"][number]) => `• ${i.titulo} · ${i.detalhe.split(" · ")[0]}${i.aConfirmar ? " (confirmar)" : ""}\n  ${link(i)}`;
  const partes: string[] = [];
  if (opcoes.saudacao !== false) partes.push(`Bom dia, ${pessoa.apelido}. O seu dia no Decreta, ${painel.rotulo}:`);
  if (vencidos.length) partes.push(`*Vencidos (${vencidos.length})*\n${vencidos.map(linha).join("\n")}`);
  if (hoje.length) partes.push(`*Vencem hoje (${hoje.length})*\n${hoje.map(linha).join("\n")}`);
  if (auds.length) partes.push(`*Audiências hoje (${auds.length})*\n${auds.map((a) => `• ${a.quando} · ${a.titulo} · ${a.detalhe.split(" · ")[0]}\n  ${link(a)}`).join("\n")}`);
  if (tarefas.length) partes.push(`*Tarefas (${tarefas.length})*\n${tarefas.map((t) => `• ${t.titulo}`).join("\n")}`);
  if (semDono.length) partes.push(`*Sem responsável (${semDono.length})*\n${semDono.map(linha).join("\n")}`);
  if (painel.contadores.publicacoesNovas) {
    const n = painel.contadores.publicacoesNovas;
    const semLeitura = painel.contadores.publicacoesSemLeitura;
    const aviso = semLeitura === 0 ? "" : semLeitura === 1 ? "\n1 ficou sem leitura da IA: confira o prazo nela." : `\n${semLeitura} ficaram sem leitura da IA: confira o prazo em cada uma.`;
    partes.push(`${n === 1 ? "1 publicação nova" : `${n} publicações novas`} para revisar: ${base}/publicacoes${aviso}`);
  }
  if (alertas.length) partes.push(`*Captura do DJEN*\n${alertas.map((a) => `• ${a}`).join("\n")}`);
  if (achados.length) {
    const linhas = achados.slice(0, ACHADOS_NO_WHATSAPP).map((a) => `• ${ROTULO_DA_AUDITORIA[a.motivo]} · ${a.titulo}\n  ${a.detalhe}\n  ${base}${a.caminho}`);
    if (achados.length > ACHADOS_NO_WHATSAPP) linhas.push(`• e mais ${achados.length - ACHADOS_NO_WHATSAPP}: ${base}/hoje`);
    partes.push(`*Auditoria da carteira (${achados.length})*\n${linhas.join("\n")}`);
  }
  return partes.join("\n\n");
}

/** Já passou da hora do resumo no fuso do escritório? */
export function horaDoResumo(agora: Date, hora: string, timeZone: string): boolean {
  const local = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);
  return local >= hora;
}
