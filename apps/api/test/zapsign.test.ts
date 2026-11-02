/** O cliente da ZapSign, contra um servidor de mentira. NÃO fala com a ZapSign de verdade. */
import { describe, expect, test } from "bun:test";
import { baixarArquivoAssinado, consultarDocumento, criarDocumentoParaAssinar, ZapSignErro, type ContaZapSign } from "../src/servicos/zapsign.ts";

const CHAVE = "c7f35c84-7893-4087-b4fb-d1f06c23aaaa-8f3e2d1c-bbbb-4cde-9fa0-0123456789ab";

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
    const s = servidor([{ bytes: new Uint8Array([1, 2, 3]) }]);
    const bytes = await baixarArquivoAssinado("https://zapsign.s3.amazonaws.com/assinado.pdf?x=1", s.fetch);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(s.chamadas[0]!.cabecalhos["authorization"]).toBeUndefined();
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
