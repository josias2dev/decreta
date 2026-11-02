/**
 * Onde ficam os arquivos (autos anexados, peças geradas, logo do timbre).
 *
 * Em produção, o R2 (API do S3, pelo cliente nativo do Bun); no
 * desenvolvimento e num VPS sem R2, uma pasta no disco. A chave é
 * `<escritório>/<id do documento>`: o banco guarda a chave, o tipo e o
 * tamanho, e quem serve o arquivo confere o escritório antes de ler daqui.
 */
import { S3Client } from "bun";
import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export interface Armazenamento {
  put(chave: string, bytes: Uint8Array, mime: string): Promise<void>;
  read(chave: string): Promise<Uint8Array>;
  delete(chave: string): Promise<void>;
  /** Apaga tudo do escritório (`<id do escritório>/`, com a barra) e devolve quantos arquivos eram. Outro prefixo é recusado. */
  apagarPrefixo(prefixo: string): Promise<number>;
}

export function chaveDoDocumento(organizationId: string, documentoId: string): string {
  return `${organizationId}/${documentoId}`;
}

const PREFIXO_DE_ESCRITORIO = /^[A-Za-z0-9_-]{1,64}\/$/;

/** O prefixo de um escritório e nada mais: um engano aqui apagaria o armazenamento de todos. */
function prefixoDoEscritorio(prefixo: string): string {
  if (!PREFIXO_DE_ESCRITORIO.test(prefixo)) throw new Error(`prefixo de escritório inválido: "${prefixo}"`);
  return prefixo;
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
    async apagarPrefixo(prefixo) {
      const pasta = caminho(prefixoDoEscritorio(prefixo));
      const arquivos = await readdir(pasta, { recursive: true, withFileTypes: true }).catch((err: NodeJS.ErrnoException) => (err.code === "ENOENT" ? [] : Promise.reject(err)));
      await rm(pasta, { recursive: true, force: true });
      return arquivos.filter((a) => a.isFile()).length;
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
    async apagarPrefixo(prefixo) {
      const alvo = prefixoDoEscritorio(prefixo);
      let apagados = 0;
      let continuar: string | undefined;
      do {
        const pagina = await client.list({ prefix: alvo, maxKeys: 500, continuationToken: continuar });
        for (const { key } of pagina.contents ?? []) {
          await client.delete(key);
          apagados++;
        }
        continuar = pagina.isTruncated ? pagina.nextContinuationToken : undefined;
      } while (continuar);
      return apagados;
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
    async apagarPrefixo(prefixo) {
      const alvo = prefixoDoEscritorio(prefixo);
      const chaves = [...arquivos.keys()].filter((k) => k.startsWith(alvo));
      for (const k of chaves) arquivos.delete(k);
      return chaves.length;
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
