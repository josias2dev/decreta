/** Quem trata dados do escritório para o Decreta funcionar (os suboperadores da LGPD): a mesma lista em Segurança e em Privacidade. */
const FORNECEDORES = [
  { nome: "Anthropic", para: "Modelos de IA Claude", dados: "O texto de cada pedido à IA. Guarda por até 30 dias e não treina modelos com ele." },
  { nome: "OpenRouter", para: "Acesso aos outros modelos de IA", dados: "O texto de cada pedido à IA, com retenção zero: o provedor do modelo não guarda nada." },
  { nome: "Cloudflare R2", para: "Guarda dos documentos e dos backups", dados: "Os arquivos enviados ao Decreta e os backups, cifrados." },
  { nome: "Resend", para: "E-mails de convite e de troca de senha", dados: "O nome e o e-mail de quem recebe." },
  { nome: "WhatsApp (Meta)", para: "Resumo da manhã, para quem ligar", dados: "Os prazos, as audiências e as tarefas do dia, com o nome dos processos." },
  { nome: "Sentry", para: "Aviso de erros técnicos", dados: "A mensagem do erro e identificadores internos, nunca o conteúdo de processos nem de documentos." },
] as const;

export function TabelaDeFornecedores() {
  return (
    <div className="lp-seg__tabela" role="table" aria-label="Fornecedores que tratam dados">
      <div className="lp-seg__linha lp-seg__linha--topo" role="row">
        <span role="columnheader">Fornecedor</span>
        <span role="columnheader">Para quê</span>
        <span role="columnheader">Que dados</span>
      </div>
      {FORNECEDORES.map((f) => (
        <div key={f.nome} className="lp-seg__linha" role="row">
          <strong role="cell">{f.nome}</strong>
          <span role="cell">{f.para}</span>
          <span role="cell">{f.dados}</span>
        </div>
      ))}
    </div>
  );
}
