/**
 * Segurança e LGPD (decreta.site/seguranca), aberta a quem não entrou: o que o
 * Decreta faz com os dados, a retenção de cada fornecedor de IA e a lista de
 * quem trata dados do escritório. Só o que o sistema faz hoje; o termo de uso de
 * IA e a política interna apontam para cá.
 */
import { TabelaDeFornecedores } from "@/componentes/fornecedores";
import { PaginaLegal, SecaoLegal } from "@/componentes/pagina-legal";

export function SegurancaPage() {
  return (
    <PaginaLegal olho="Segurança e LGPD" titulo="Como o Decreta cuida dos dados do escritório" intro="O que está aqui é o que o sistema faz hoje. Quando algo mudar, esta página muda junto." atualizada="Atualizada em 2 de novembro de 2026.">
      <SecaoLegal id="seg-ia" titulo="Inteligência artificial">
        <ul>
          <li>Nenhum fornecedor de IA usa os textos do escritório para treinar modelos.</li>
          <li>Só vai à IA o que a tarefa pede, como o teor da intimação para sugerir o prazo, e só na hora de gerar a resposta. O envio passa por um gateway do Decreta, que guarda as chaves de acesso e limita o gasto.</li>
          <li>Pelo OpenRouter, o pedido vai com retenção zero: o provedor do modelo não guarda o texto. Pela Anthropic, que responde pelos modelos Claude, o pedido fica guardado por até 30 dias e depois é apagado.</li>
          <li>Cliente que recusa o uso de IA fica marcado, e nada dos casos dele vai à IA.</li>
          <li>Documentos da parte contrária passam por uma busca de instruções escondidas para IA, e a IA os lê como informação, nunca como ordem.</li>
          <li>Tudo o que a IA sugere passa por uma pessoa: o prazo só vale depois que alguém da equipe confirma, e a peça fica registrada com quem revisou, quando e a versão que a IA gerou.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="seg-dados" titulo="Onde ficam os dados">
        <ul>
          <li>Cada escritório só enxerga os próprios dados. A separação é feita no próprio banco de dados, linha por linha, e não só nas telas.</li>
          <li>Os documentos enviados ficam no Cloudflare R2.</li>
          <li>Toda noite, às 03:30, sai um backup cifrado (AES-256-GCM). A chave fica fora do servidor, e o backup de domingo é restaurado e conferido.</li>
          <li>A conexão com o Decreta é sempre por HTTPS.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="seg-acesso" titulo="Acesso">
        <ul>
          <li>Cada pessoa entra com a própria conta, e pode ligar a verificação em duas etapas com o código do aplicativo autenticador.</li>
          <li>A senha é guardada embaralhada (hash), nunca como texto.</li>
          <li>Os sócios veem o registro de quem fez o quê no escritório.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="seg-fornecedores" titulo="Fornecedores que tratam dados">
        <p>Os suboperadores, nos termos da LGPD: as empresas que recebem dados do escritório para o Decreta funcionar.</p>
        <TabelaDeFornecedores />
        <p>Fontes públicas: o Decreta consulta o DJEN e o DataJud, do CNJ, pela OAB da equipe e pelo número do processo.</p>
      </SecaoLegal>
    </PaginaLegal>
  );
}
