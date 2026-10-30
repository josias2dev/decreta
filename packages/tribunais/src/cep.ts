/**
 * O endereço pelo CEP: ViaCEP e, se ela não responder, a BrasilAPI. As duas
 * pedem uso como o de uma pessoa (nada de varrer CEPs), então a resposta fica
 * guardada em memória.
 */
import { cepComMascara, type Endereco } from "@decreta/core";
import { z } from "zod";

export const VIACEP_URL = "https://viacep.com.br/ws";
export const BRASILAPI_CEP_URL = "https://brasilapi.com.br/api/cep/v1";

export class ErroDoCep extends Error {}

const texto = z.preprocess((v) => (v == null || v === "" ? undefined : String(v)), z.string().optional());

const viaCepSchema = z.object({ cep: texto, logradouro: texto, bairro: texto, localidade: texto, uf: texto, erro: z.unknown().optional() }).loose();
const brasilApiSchema = z.object({ cep: texto, street: texto, neighborhood: texto, city: texto, state: texto }).loose();

const guardados = new Map<string, Endereco | null>();

/** O endereço do CEP (sem número). `null` quando o CEP não existe; erro quando nenhuma fonte respondeu. */
export async function buscarCep(cep: string, opcoes: { fetch?: typeof fetch; timeout?: number } = {}): Promise<Endereco | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  if (guardados.has(d)) return guardados.get(d)!;
  const fetchImpl = opcoes.fetch ?? fetch;
  const pedir = (url: string) => fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 6_000) });
  let naoTem = 0;
  try {
    const res = await pedir(`${VIACEP_URL}/${d}/json/`);
    if (res.status === 400) naoTem++;
    else if (res.ok) {
      const r = viaCepSchema.safeParse(await res.json().catch(() => null));
      // CEP que não existe volta 200 com {"erro": true}.
      if (r.success && r.data.erro !== undefined && r.data.erro !== false && r.data.erro !== "false") naoTem++;
      else if (r.success && r.data.localidade) {
        const e: Endereco = { logradouro: r.data.logradouro ?? null, numero: null, complemento: null, bairro: r.data.bairro ?? null, cidade: r.data.localidade, uf: r.data.uf ?? null, cep: cepComMascara(d) };
        return guardar(d, e);
      }
    }
  } catch {
    // Tenta a BrasilAPI.
  }
  try {
    const res = await pedir(`${BRASILAPI_CEP_URL}/${d}`);
    if (res.status === 404) naoTem++;
    else if (res.ok) {
      const r = brasilApiSchema.safeParse(await res.json().catch(() => null));
      if (r.success && r.data.city) return guardar(d, { logradouro: r.data.street ?? null, numero: null, complemento: null, bairro: r.data.neighborhood ?? null, cidade: r.data.city, uf: r.data.state ?? null, cep: cepComMascara(d) });
    }
  } catch {
    // Nenhuma respondeu.
  }
  if (naoTem === 2) return guardar(d, null);
  throw new ErroDoCep("Nem a ViaCEP nem a BrasilAPI responderam.");
}

function guardar(d: string, e: Endereco | null): Endereco | null {
  if (guardados.size > 5_000) guardados.delete(guardados.keys().next().value!);
  guardados.set(d, e);
  return e;
}
