/**
 * E-mail transacional: convites, redefinir senha e confirmar e-mail.
 *
 * Em produção vai pelo Resend (API HTTP, sem SDK). Sem RESEND_API_KEY os
 * e-mails só aparecem no log: as telas continuam funcionando, e os convites
 * têm o link para copiar na tela da Equipe.
 */

export interface Email {
  to: string;
  subject: string;
  /** Parágrafos em texto simples; o HTML é montado aqui, com a marca do Decreta. */
  paragraphs: string[];
  action?: { label: string; url: string };
}

export interface Mailer {
  /** `true` quando o e-mail sai de verdade (a tela usa para dizer "enviamos" ou "copie o link"). */
  readonly enabled: boolean;
  send(email: Email): Promise<void>;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function renderEmail(email: Email): { html: string; text: string } {
  const paras = email.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escape(p)}</p>`).join("");
  const button = email.action
    ? `<p style="margin:22px 0"><a href="${escape(email.action.url)}" style="background:#2f2e38;color:#f7f7fa;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block">${escape(email.action.label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;color:#6b6a76">Se o botão não abrir, copie este endereço no navegador:<br>${escape(email.action.url)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:Geist,Segoe UI,Arial,sans-serif;color:#25252b;font-size:14px">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 20px;font-weight:600;color:#25252b;font-size:16px;letter-spacing:-0.02em">decreta</p>
<div style="background:#ffffff;border:1px solid #e7e7ea;border-radius:12px;padding:22px 22px 8px">${paras}${button}</div>
<p style="margin:16px 0 0;font-size:12px;color:#6b6a76">Você recebeu este e-mail porque alguém usou este endereço no Decreta. Se não foi você, pode ignorar.</p>
</div></body></html>`;
  const text = [...email.paragraphs, ...(email.action ? [`${email.action.label}: ${email.action.url}`] : [])].join("\n\n");
  return { html, text };
}

export function createLogMailer(log: (msg: string, extra?: Record<string, unknown>) => void): Mailer & { sent: Email[] } {
  const sent: Email[] = [];
  return {
    enabled: false,
    sent,
    async send(email) {
      sent.push(email);
      log("e-mail não enviado (sem RESEND_API_KEY)", { to: email.to, subject: email.subject, link: email.action?.url });
    },
  };
}

export function createResendMailer(opts: { apiKey: string; from: string; fetch?: typeof fetch }): Mailer {
  const doFetch = opts.fetch ?? fetch;
  return {
    enabled: true,
    async send(email) {
      const { html, text } = renderEmail(email);
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: opts.from, to: [email.to], subject: email.subject, html, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Resend recusou o e-mail (${res.status}): ${(await res.text()).slice(0, 300)}`);
    },
  };
}

export const PAPEL: Record<string, string> = { owner: "sócio", admin: "administrador", member: "equipe" };
