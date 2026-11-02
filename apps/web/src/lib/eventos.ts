import type { EventoDoSite } from "@decreta/core";
import { API_URL } from "./api";

/**
 * Conta um evento do site (a visita, um clique em criar conta) sem cookie e sem
 * identificar ninguém: vai só o nome. Se não chegar, a pessoa nem percebe.
 */
export function registrarEventoDoSite(nome: EventoDoSite): void {
  void fetch(`${API_URL}/api/eventos`, { method: "POST", credentials: "omit", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ nome }) }).catch(() => {});
}
