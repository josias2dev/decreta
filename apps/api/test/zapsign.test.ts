/** O cliente da ZapSign, contra um servidor de mentira. NÃO fala com a ZapSign de verdade. */
import { describe, expect, test } from "bun:test";
import { baixarArquivoAssinado, consultarDocumento, criarDocumentoParaAssinar, TETO_DO_ARQUIVO_ASSINADO_BYTES, ZapSignErro, type ContaZapSign } from "../src/servicos/zapsign.ts";

const CHAVE = "c7f35c84-7893-4087-b4fb-d1f06c23aaaa-8f3e2d1c-bbbb-4cde-9fa0-0123456789ab";
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

function servidor(respostas: { status?: number; corpo?: unknown; bytes?: Uint8Array }[]) {
  const chamadas: { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, metodo: init?.method ?? "GET", cabecalhos: Object.fromEntries(new Headers(init?.headers).entries()), corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const r = respostas[chamadas.length - 1] ?? {};
    if (r.bytes) return new Response(r.bytes as unknown as ConstructorParameters<typeof Response>[0], { status: r.status ?? 200 });
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: f, chamadas };
}
const conta = (s: { fetch: typeof fetch }, ambiente: ContaZapSign["ambiente"] = "sandbox"): ContaZapSign => ({ chave: CHAVE, ambiente, fetch: s.fetch });

describe("pedidos à ZapSign", () => {
  test("envia o DOCX para assinar: o ambiente escolhe o endereço, a chave vai no Authorization, e cada signatário leva o seu aviso", async () => {
    const s = servidor([
      {
        corpo: {
          token: "doc_tok",
          status: "pending",
          signers: [
            { name: "Marina Duarte", token: "sig_1", sign_url: "https://app.zapsign.com.br/verificar/sig_1", status: "new" },
            { name: "Beatriz Souza", token: "sig_2", sign_url: "https://app.zapsign.com.br/verificar/sig_2", status: "new" },
          ],
        },
      },
    ]);
    const r = await criarDocumentoParaAssinar(conta(s), {
      nome: "Contrato de honorários",
      arquivo: { tipo: "docx", bytes: new Uint8Array([80, 75, 3, 4]) },
      referencia: "doc-1",
      signatarios: [
        { nome: "Marina Duarte", email: "marina@exemplo.com.br", telefone: "47991234567" },
        { nome: "Beatriz Souza", email: "beatriz@souza.adv.br" },
      ],
    });
    expect(r).toEqual({
      token: "doc_tok",
      situacao: "pending",
      signatarios: [
        { nome: "Marina Duarte", email: "marina@exemplo.com.br", telefone: "47991234567", situacao: "new", link: "https://app.zapsign.com.br/verificar/sig_1" },
        { nome: "Beatriz Souza", email: "beatriz@souza.adv.br", situacao: "new", link: "https://app.zapsign.com.br/verificar/sig_2" },
      ],
    });
    const c = s.chamadas[0]!;
    expect(c.url).toBe("https://sandbox.api.zapsign.com.br/api/v1/docs/");
    expect(c.metodo).toBe("POST");
    expect(c.cabecalhos["authorization"]).toBe(`Bearer ${CHAVE}`);
    expect(c.corpo).toMatchObject({ name: "Contrato de honorários", base64_docx: "UEsDBA==", lang: "pt-br", external_id: "doc-1" });
    expect(c.corpo.base64_pdf).toBeUndefined();
    expect(c.corpo.signers).toEqual([
      { name: "Marina Duarte", email: "marina@exemplo.com.br", auth_mode: "assinaturaTela", send_automatic_email: true, send_automatic_whatsapp: true, phone_country: "55", phone_number: "47991234567" },
      { name: "Beatriz Souza", email: "beatriz@souza.adv.br", auth_mode: "assinaturaTela", send_automatic_email: true, send_automatic_whatsapp: false },
    ]);
  });

  test("PDF vai como base64_pdf, em produção", async () => {
    const s = servidor([{ corpo: { token: "t", status: "pending", signers: [] } }]);
    await criarDocumentoParaAssinar(conta(s, "producao"), { nome: "Procuração", arquivo: { tipo: "pdf", bytes: new Uint8Array([37, 80, 68, 70]) }, referencia: "d", signatarios: [{ nome: "A", email: "a@b.com" }] });
    expect(s.chamadas[0]!.url).toBe("https://api.zapsign.com.br/api/v1/docs/");
    expect(s.chamadas[0]!.corpo.base64_pdf).toBe("JVBERg==");
    expect(s.chamadas[0]!.corpo.base64_docx).toBeUndefined();
  });

  test("consulta o documento: situação, signatários e o link do arquivo assinado (que dura pouco)", async () => {
    const s = servidor([{ corpo: { token: "doc_tok", status: "signed", signed_file: "https://zapsign.s3.amazonaws.com/assinado.pdf?x=1", signers: [{ name: "Marina Duarte", token: "s1", sign_url: "https://app.zapsign.com.br/verificar/s1", status: "signed" }] } }]);
    const r = await consultarDocumento(conta(s), "doc_tok");
    expect(r).toEqual({ situacao: "signed", arquivoAssinado: "https://zapsign.s3.amazonaws.com/assinado.pdf?x=1", signatarios: [{ nome: "Marina Duarte", situacao: "signed", link: "https://app.zapsign.com.br/verificar/s1" }] });
    expect(s.chamadas[0]).toMatchObject({ metodo: "GET", url: "https://sandbox.api.zapsign.com.br/api/v1/docs/doc_tok/" });
  });

  test("ainda sem assinatura: o arquivo assinado é nulo", async () => {
    const s = servidor([{ corpo: { token: "t", status: "pending", signed_file: null, signers: [] } }]);
    expect((await consultarDocumento(conta(s), "t")).arquivoAssinado).toBeNull();
  });

  test("baixa o arquivo assinado do link temporário, sem mandar a chave para outro endereço", async () => {
    const s = servidor([{ bytes: PDF }]);
    const bytes = await baixarArquivoAssinado("https://zapsign.s3.amazonaws.com/assinado.pdf?x=1", s.fetch);
    expect([...bytes]).toEqual([...PDF]);
    expect(s.chamadas[0]!.cabecalhos["authorization"]).toBeUndefined();
  });
});

describe("o arquivo assinado só vem de onde a ZapSign guarda", () => {
  const recusa = async (url: string, f: typeof fetch) => {
    await expect(baixarArquivoAssinado(url, f)).rejects.toBeInstanceOf(ZapSignErro);
  };

  test("o host precisa ser o da ZapSign: nada de outro lugar, de http ou de endereço de dentro do servidor", async () => {
    const s = servidor([{ bytes: PDF }]);
    for (const url of [
      "http://zapsign.s3.amazonaws.com/a.pdf",
      "https://outro.s3.amazonaws.com/a.pdf",
      "https://zapsign.s3.amazonaws.com.evil.net/a.pdf",
      "https://zapsign.s3.amazonaws.com@evil.net/a.pdf",
      "https://evil.net/zapsign.s3.amazonaws.com/a.pdf",
      "https://evilzapsign.com.br/a.pdf",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/a.pdf",
      "https://zapsign.s3.amazonaws.com:8443/a.pdf",
      "file:///etc/passwd",
      "nem é endereço",
    ]) await recusa(url, s.fetch);
    expect(s.chamadas).toHaveLength(0);
  });

  test("aceita o S3 da documentação e o domínio da ZapSign", async () => {
    for (const url of ["https://zapsign.s3.amazonaws.com/a.pdf?AWSAccessKeyId=x&Signature=y", "https://app.zapsign.com.br/a.pdf", "https://zapsign.com.br/a.pdf"]) {
      const s = servidor([{ bytes: PDF }]);
      expect([...(await baixarArquivoAssinado(url, s.fetch))]).toEqual([...PDF]);
    }
  });

  test("não segue redirecionamento sozinho: para outro lugar, recusa; para a própria ZapSign, vai", async () => {
    const urls: string[] = [];
    const inits: RequestInit[] = [];
    const redireciona = (para: string) =>
      (async (url: string, init: RequestInit) => {
        urls.push(url);
        inits.push(init);
        return url === para ? new Response(PDF, { status: 200 }) : new Response(null, { status: 302, headers: { location: para } });
      }) as unknown as typeof fetch;
    await recusa("https://zapsign.s3.amazonaws.com/a.pdf", redireciona("https://evil.net/a.pdf"));
    expect(urls).toEqual(["https://zapsign.s3.amazonaws.com/a.pdf"]);
    expect(inits[0]!.redirect).toBe("manual");
    expect([...(await baixarArquivoAssinado("https://app.zapsign.com.br/a", redireciona("https://zapsign.s3.amazonaws.com/b.pdf")))]).toEqual([...PDF]);
  });

  test("redirecionamento sem fim para na terceira volta", async () => {
    let voltas = 0;
    const f = (async () => {
      voltas++;
      return new Response(null, { status: 302, headers: { location: `https://app.zapsign.com.br/${voltas}` } });
    }) as unknown as typeof fetch;
    await recusa("https://app.zapsign.com.br/0", f);
    expect(voltas).toBeLessThanOrEqual(4);
  });

  test("o que não é PDF não entra na pasta do cliente", async () => {
    await recusa("https://zapsign.s3.amazonaws.com/a.pdf", servidor([{ bytes: new TextEncoder().encode("<html>erro</html>") }]).fetch);
    await recusa("https://zapsign.s3.amazonaws.com/a.pdf", servidor([{ bytes: new Uint8Array(0) }]).fetch);
  });

  test("passou do teto de tamanho, para de baixar, mesmo sem o tamanho anunciado", async () => {
    let lidos = 0;
    const pedaco = new Uint8Array(1024 * 1024).fill(1);
    pedaco.set(PDF);
    const infinito = (async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            lidos += pedaco.length;
            c.enqueue(pedaco);
          },
        }),
      )) as unknown as typeof fetch;
    await recusa("https://zapsign.s3.amazonaws.com/a.pdf", infinito);
    expect(lidos).toBeLessThan(TETO_DO_ARQUIVO_ASSINADO_BYTES * 2);
    const anunciado = (async () => new Response(PDF, { headers: { "content-length": String(TETO_DO_ARQUIVO_ASSINADO_BYTES + 1) } })) as unknown as typeof fetch;
    await recusa("https://zapsign.s3.amazonaws.com/a.pdf", anunciado);
  });

  test("não baixou: a mensagem diz o host, nunca o link assinado inteiro", async () => {
    try {
      await baixarArquivoAssinado("https://evil.net/a.pdf?Signature=segredo", servidor([]).fetch);
      throw new Error("devia falhar");
    } catch (err) {
      expect((err as Error).message).toContain("evil.net");
      expect((err as Error).message).not.toContain("segredo");
    }
  });
});

describe("erros da ZapSign", () => {
  test("recusa vira frase para a pessoa, sem a chave", async () => {
    const s = servidor([{ status: 401, corpo: { detail: "Invalid token." } }]);
    try {
      await criarDocumentoParaAssinar(conta(s), { nome: "x", arquivo: { tipo: "pdf", bytes: new Uint8Array([1]) }, referencia: "d", signatarios: [{ nome: "A", email: "a@b.com" }] });
      throw new Error("devia falhar");
    } catch (err) {
      expect(err).toBeInstanceOf(ZapSignErro);
      expect((err as ZapSignErro).status).toBe(401);
      expect((err as Error).message).toContain("chave");
      expect((err as Error).message).not.toContain(CHAVE);
      expect(JSON.stringify(err)).not.toContain(CHAVE);
    }
  });

  test("sem resposta a tempo: erro com status 0", async () => {
    const f = (async () => {
      throw new DOMException("sem resposta", "TimeoutError");
    }) as unknown as typeof fetch;
    await expect(consultarDocumento({ chave: CHAVE, ambiente: "sandbox", fetch: f }, "t")).rejects.toMatchObject({ status: 0 });
  });
});
