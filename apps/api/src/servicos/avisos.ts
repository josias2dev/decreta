/**
 * Resumo da manhã no WhatsApp: cada pessoa recebe os prazos dela que vencem
 * hoje e os vencidos, as audiências do dia e quantas publicações chegaram,
 * com o link para abrir cada prazo. Sai pelo número do Decreta no wameow.
 */
import { telefoneWhatsapp } from "@decreta/core";
import type { PainelDoDia } from "./hoje.ts";

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
  if (!vencidos.length && !hoje.length && !auds.length && !tarefas.length && !semDono.length && !painel.contadores.publicacoesNovas) return null;

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
    partes.push(`${n === 1 ? "1 publicação nova" : `${n} publicações novas`} para revisar: ${base}/publicacoes`);
  }
  return partes.join("\n\n");
}

/** Já passou da hora do resumo no fuso do escritório? */
export function horaDoResumo(agora: Date, hora: string, timeZone: string): boolean {
  const local = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);
  return local >= hora;
}
