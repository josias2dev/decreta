/**
 * Onde ficam os arquivos (autos anexados, peças geradas, logo do timbre).
 *
 * Em produção, o R2 (API do S3, pelo cliente nativo do Bun); no
 * desenvolvimento e num VPS sem R2, uma pasta no disco. A chave é
 * `<escritório>/<id do documento>`: o banco guarda a chave, o tipo e o
 * tamanho, e quem serve o arquivo confere o escritório antes de ler daqui.
 */
import { S3Client } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export interface Armazenamento {
  put(chave: string, bytes: Uint8Array, mime: string): Promise<void>;
  read(chave: string): Promise<Uint8Array>;
  delete(chave: string): Promise<void>;
}

export function chaveDoDocumento(organizationId: string, documentoId: string): string {
  return `${organizationId}/${documentoId}`;
}

/** Pasta local. A chave nunca sai da pasta (`../` é recusado). */
export function armazenamentoEmDisco(dir: string): Armazenamento {
  const raiz = resolve(dir);
  const caminho = (chave: string) => {
    const p = resolve(raiz, chave);
    if (!p.startsWith(raiz + sep)) throw new Error(`chave de arquivo inválida: ${chave}`);
    return p;
  };
  return {
    async put(chave, bytes) {
      const p = caminho(chave);
      await mkdir(dirname(p), { recursive: true });
      await Bun.write(p, bytes);
    },
    async read(chave) {
      return new Uint8Array(await Bun.file(caminho(chave)).arrayBuffer());
    },
    async delete(chave) {
      await rm(caminho(chave), { force: true });
    },
  };
}

export interface ConfigS3 {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** R2 (ou outro S3). O bucket é privado: nada aqui gera URL pública. */
export function armazenamentoS3(config: ConfigS3): Armazenamento {
  const client = new S3Client({ ...config, region: "auto" });
  return {
    async put(chave, bytes, mime) {
      await client.write(chave, bytes, { type: mime });
    },
    async read(chave) {
      return new Uint8Array(await client.file(chave).arrayBuffer());
    },
    async delete(chave) {
      await client.delete(chave);
    },
  };
}

/** Em memória, para testes. */
export function armazenamentoEmMemoria(): Armazenamento & { arquivos: Map<string, { bytes: Uint8Array; mime: string }> } {
  const arquivos = new Map<string, { bytes: Uint8Array; mime: string }>();
  return {
    arquivos,
    async put(chave, bytes, mime) {
      arquivos.set(chave, { bytes: bytes.slice(), mime });
    },
    async read(chave) {
      const a = arquivos.get(chave);
      if (!a) throw new Error(`arquivo ${chave} não existe`);
      return a.bytes.slice();
    },
    async delete(chave) {
      arquivos.delete(chave);
    },
  };
}

export interface EnvDoArmazenamento {
  ARQUIVOS: "disco" | "r2";
  ARQUIVOS_DIR: string;
  R2_ENDPOINT?: string;
  R2_BUCKET?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

export function armazenamentoDoEnv(env: EnvDoArmazenamento): Armazenamento {
  if (env.ARQUIVOS === "disco") return armazenamentoEmDisco(env.ARQUIVOS_DIR);
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("ARQUIVOS=r2 pede R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY");
  }
  return armazenamentoS3({ endpoint: R2_ENDPOINT, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY });
}
