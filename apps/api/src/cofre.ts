/**
 * O cofre das chaves que o escritório nos entrega (Asaas, ZapSign): cifradas com
 * AES-256-GCM antes de ir para o banco, e decifradas só na hora de falar com o
 * provedor. A chave nunca sai pela API, não aparece em log e não vai para a
 * cópia dos dados do escritório.
 *
 * A chave de cifra sai do segredo do servidor (HKDF), e o id do escritório entra
 * como dado autenticado: copiar a linha de um escritório para o outro não abre.
 * Formato guardado: `v1.<iv>.<tag>.<texto cifrado>`, tudo em base64url.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSAO = "v1";
const SAL = "decreta-cofre-v1";
const USO = "chaves-dos-provedores";

export interface Cofre {
  /** `contexto` (o id do escritório) amarra a cifra: só abre com o mesmo contexto. */
  cifrar(texto: string, contexto: string): string;
  decifrar(guardado: string, contexto: string): string;
}

/**
 * O segredo do cofre. Sem COFRE_SECRET vale o da sessão, para o servidor não parar; em produção isso é um risco de operação:
 * trocar o segredo da sessão faria as chaves guardadas não abrirem mais. Por isso o aviso ao subir.
 */
export function segredoDoCofre(env: { COFRE_SECRET: string; BETTER_AUTH_SECRET: string }, opcoes: { producao: boolean; log: (msg: string) => void }): string {
  if (env.COFRE_SECRET) return env.COFRE_SECRET;
  if (opcoes.producao) opcoes.log("AVISO: COFRE_SECRET vazio em produção. As chaves do Asaas e da ZapSign estão cifradas com o BETTER_AUTH_SECRET: se ele for trocado, elas não abrem mais. Defina COFRE_SECRET antes de guardar chaves (veja deploy/INSTALL.md).");
  return env.BETTER_AUTH_SECRET;
}

export function criarCofre(segredo: string): Cofre {
  if (segredo.length < 32) throw new Error("O segredo do cofre precisa ter pelo menos 32 caracteres.");
  const chave = Buffer.from(hkdfSync("sha256", segredo, SAL, USO, 32));
  return {
    cifrar(texto, contexto) {
      const iv = randomBytes(12);
      const cifra = createCipheriv("aes-256-gcm", chave, iv);
      cifra.setAAD(Buffer.from(contexto));
      const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
      return [VERSAO, iv.toString("base64url"), cifra.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
    },
    decifrar(guardado, contexto) {
      const [versao, iv, tag, dados] = guardado.split(".");
      if (versao !== VERSAO || !iv || !tag || !dados) throw new Error("Chave guardada fora do formato.");
      try {
        const decifra = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64url"));
        decifra.setAAD(Buffer.from(contexto));
        decifra.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decifra.update(Buffer.from(dados, "base64url")), decifra.final()]).toString("utf8");
      } catch {
        // A mensagem do erro nunca leva o texto nem o motivo de dentro.
        throw new Error("Não deu para abrir a chave guardada.");
      }
    },
  };
}
