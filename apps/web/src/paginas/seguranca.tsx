/**
 * Segurança e LGPD (decreta.site/seguranca), aberta a quem não entrou: o que o
 * Decreta faz com os dados, a retenção de cada fornecedor de IA e a lista de
 * quem trata dados do escritório. Só o que o sistema faz hoje; o termo de uso de
 * IA e a política interna apontam para cá.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { useCorDaBarra } from "@/componentes/fundo-ascii";
import { LogoCompleta } from "@/componentes/marca";

const FORNECEDORES = [
  { nome: "Anthropic", para: "Modelos de IA Claude", dados: "O texto de cada pedido à IA. Guarda por até 30 dias e não treina modelos com ele." },
  { nome: "OpenRouter", para: "Acesso aos outros modelos de IA", dados: "O texto de cada pedido à IA, com retenção zero: o provedor do modelo não guarda nada." },
  { nome: "Cloudflare R2", para: "Guarda dos documentos e dos backups", dados: "Os arquivos enviados ao Decreta e os backups, cifrados." },
  { nome: "Resend", para: "E-mails de convite e de troca de senha", dados: "O nome e o e-mail de quem recebe." },
  { nome: "WhatsApp (Meta)", para: "Resumo da manhã, para quem ligar", dados: "Os prazos, as audiências e as tarefas do dia, com o nome dos processos." },
] as const;

export function SegurancaPage() {
  useCorDaBarra("#0b0b0f");
  useEffect(() => {
    document.title = "Segurança e LGPD · Decreta";
    return () => {
      document.title = "Decreta";
    };
  }, []);

  return (
    <div className="lp dc lp-seg" data-theme="escuro">
      <header className="lp-seg__topo">
        <Link className="lp-entrar__site lp-seg__voltar" to="/">
          <ArrowLeft aria-hidden />
          decreta.site
        </Link>
        <Link className="lp-seg__entrar" to="/entrar">
          Entrar
        </Link>
      </header>
      <main className="lp-seg__meio">
        <LogoCompleta className="lp-seg__logo" />
        <div className="lp-seg__cabeca">
          <span className="lp-olho">Segurança e LGPD</span>
          <h1 className="lp-h2">Como o Decreta cuida dos dados do escritório</h1>
          <p className="lp-texto">O que está aqui é o que o sistema faz hoje. Quando algo mudar, esta página muda junto.</p>
        </div>

        <section className="lp-seg__secao" aria-labelledby="seg-ia">
          <h2 id="seg-ia">Inteligência artificial</h2>
          <ul>
            <li>Nenhum fornecedor de IA usa os textos do escritório para treinar modelos.</li>
            <li>Só vai à IA o que a tarefa pede, como o teor da intimação para sugerir o prazo, e só na hora de gerar a resposta. O envio passa por um gateway do Decreta, que guarda as chaves de acesso e limita o gasto.</li>
            <li>Pelo OpenRouter, o pedido vai com retenção zero: o provedor do modelo não guarda o texto. Pela Anthropic, que responde pelos modelos Claude, o pedido fica guardado por até 30 dias e depois é apagado.</li>
            <li>Cliente que recusa o uso de IA fica marcado, e nada dos casos dele vai à IA.</li>
            <li>Documentos da parte contrária passam por uma busca de instruções escondidas para IA, e a IA os lê como informação, nunca como ordem.</li>
            <li>Tudo o que a IA sugere passa por uma pessoa: o prazo só vale depois que alguém da equipe confirma, e a peça fica registrada com quem revisou, quando e a versão que a IA gerou.</li>
          </ul>
        </section>

        <section className="lp-seg__secao" aria-labelledby="seg-dados">
          <h2 id="seg-dados">Onde ficam os dados</h2>
          <ul>
            <li>Cada escritório só enxerga os próprios dados. A separação é feita no próprio banco de dados, linha por linha, e não só nas telas.</li>
            <li>Os documentos enviados ficam no Cloudflare R2.</li>
            <li>Toda noite, às 03:30, sai um backup cifrado (AES-256-GCM). A chave fica fora do servidor, e o backup de domingo é restaurado e conferido.</li>
            <li>A conexão com o Decreta é sempre por HTTPS.</li>
          </ul>
        </section>

        <section className="lp-seg__secao" aria-labelledby="seg-acesso">
          <h2 id="seg-acesso">Acesso</h2>
          <ul>
            <li>Cada pessoa entra com a própria conta, e pode ligar a verificação em duas etapas com o código do aplicativo autenticador.</li>
            <li>A senha é guardada embaralhada (hash), nunca como texto.</li>
            <li>Os sócios veem o registro de quem fez o quê no escritório.</li>
          </ul>
        </section>

        <section className="lp-seg__secao" aria-labelledby="seg-fornecedores">
          <h2 id="seg-fornecedores">Fornecedores que tratam dados</h2>
          <p>Os suboperadores, nos termos da LGPD: as empresas que recebem dados do escritório para o Decreta funcionar.</p>
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
          <p>Fontes públicas: o Decreta consulta o DJEN e o DataJud, do CNJ, pela OAB da equipe e pelo número do processo.</p>
        </section>

        <p className="lp-seg__data">Atualizada em 31 de outubro de 2026.</p>
      </main>
      <footer className="lp-entrar__rodape">
        <span>© 2026 Decreta</span>
      </footer>
    </div>
  );
}
