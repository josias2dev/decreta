/**
 * Termos de Uso (decreta.site/termos), abertos a quem não entrou. O texto diz só
 * o que o produto faz hoje; os dados de quem responde pelo Decreta (razão social,
 * CNPJ, endereço) entram de `EMPRESA` em @decreta/core quando existirem.
 * A versão do texto é `VERSAO_DOS_TERMOS`: mudou aqui, mude lá.
 */
import { EMPRESA, quemOferece, versaoPorExtenso, VERSAO_DOS_TERMOS } from "@decreta/core";
import { Link } from "@tanstack/react-router";
import { LINK_DO_CONTATO, PaginaLegal, SecaoLegal } from "@/componentes/pagina-legal";

export function TermosPage() {
  const empresa = quemOferece(EMPRESA);
  return (
    <PaginaLegal
      olho="Termos de Uso"
      titulo="Termos de Uso do Decreta"
      intro="As regras para usar o Decreta, em português claro. Ao criar a conta ou aceitar o convite de um escritório, a pessoa aceita estes Termos e a Política de Privacidade."
      atualizada={`Versão de ${versaoPorExtenso(VERSAO_DOS_TERMOS)}.`}
    >
      <SecaoLegal id="termos-o-que-e" titulo="O que é o Decreta">
        {empresa && <p>{empresa}</p>}
        <p>O Decreta é um sistema para escritórios de advocacia acompanharem prazos, publicações e processos. Ele busca as publicações no Diário de Justiça Eletrônico Nacional (DJEN) e as movimentações no DataJud, sugere prazos, resume os autos e ajuda a redigir peças e mensagens. Quem decide é sempre uma pessoa da equipe.</p>
        <p>O Decreta não é um escritório de advocacia, não presta serviço jurídico e não dá parecer.</p>
      </SecaoLegal>

      <SecaoLegal id="termos-conta" titulo="Quem usa e como é a conta">
        <ul>
          <li>O cadastro cria o escritório e a conta de sócio de quem se cadastra. A equipe entra depois, por convite de um sócio. Quem cria a conta declara que pode contratar em nome do escritório.</li>
          <li>Os dados do cadastro devem ser verdadeiros e ficar atualizados. O acesso é pessoal: a senha não se empresta. Recomendamos ligar a verificação em duas etapas.</li>
          <li>Os sócios convidam e tiram pessoas da equipe e veem o registro de quem fez o quê. O escritório responde pelo uso que a equipe faz do Decreta.</li>
          <li>Conta nova começa em avaliação, com limites menores para a IA, para os e-mails de convite e para o WhatsApp, até o Decreta liberar o escritório.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="termos-ia" titulo="Inteligência artificial">
        <ul>
          <li>A IA lê, resume, sugere e redige. Ela pode errar, deixar algo de fora ou entender mal um texto. O que ela produz é um rascunho para uma pessoa conferir.</li>
          <li>Só vai ao provedor de IA o que a tarefa pede: por exemplo, o teor da intimação para sugerir o prazo; trechos dos autos e dos documentos para resumir ou redigir; a pergunta e os dados do escritório que a IA consulta para responder; fotos e PDFs digitalizados para ler; o áudio de um atendimento para virar texto. Isso acontece só na hora de gerar a resposta, por um gateway do Decreta, que guarda as chaves de acesso e limita o gasto.</li>
          <li>Nenhum fornecedor de IA usa o conteúdo do escritório para treinar modelos. Pelo OpenRouter o pedido vai com retenção zero; pela Anthropic, que responde pelos modelos Claude, o pedido fica guardado por até 30 dias e depois é apagado. A lista completa está em <Link to="/seguranca">Segurança e LGPD</Link>.</li>
          <li>Cliente que recusou o uso de IA fica marcado no Decreta, e nada dos casos dele vai à IA.</li>
          <li>A revisão por uma pessoa é obrigatória. O prazo só vale depois que alguém da equipe confirma a data, a peça fica registrada com quem revisou, quando e a versão que a IA gerou, e nenhuma mensagem ao cliente sai sem um advogado aprovar o texto.</li>
          <li>O advogado continua responsável pelo prazo e pelo que protocola. A conta do Decreta é um apoio: ele mostra os dias contados e os que ficaram de fora para facilitar a conferência, mas a data certa é a que o advogado confirma com a publicação e com o sistema do tribunal.</li>
          <li>O Decreta confere as citações de lei, súmula e jurisprudência no acervo que tem e mostra o selo de cada uma. Mesmo assim, confira na fonte oficial antes de protocolar.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="termos-prazos" titulo="Prazos, calendário e fontes públicas">
        <ul>
          <li>As publicações e as movimentações vêm do DJEN e do DataJud, do CNJ, buscadas pela OAB cadastrada na equipe e pelos números de processo do escritório. Essas fontes podem atrasar, falhar ou mudar. A tela de Publicações mostra quando foi a última leitura.</li>
          <li>O Decreta conta os prazos com os feriados nacionais, os feriados forenses que ele tem de cada tribunal e os dias que o escritório marcar. O calendário de um tribunal ou de uma comarca pode estar incompleto ou ter mudado por ato local. Marque em Configurações, na aba Calendário, os dias que faltarem.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="termos-dados" titulo="Os dados do escritório">
        <ul>
          <li>Os dados que o escritório coloca no Decreta (clientes, processos, publicações, documentos, peças, mensagens) continuam sendo do escritório.</li>
          <li>Nesses dados, o escritório é o controlador e o Decreta é o operador, nos termos da LGPD: o Decreta os trata só para prestar o serviço, seguindo as instruções do escritório, e não os usa para treinar modelos nem para outra finalidade.</li>
          <li>O escritório responde por ter o direito de colocar esses dados no Decreta, por avisar seus clientes e por manter o sigilo profissional da sua equipe.</li>
          <li>Como o Decreta cuida dos dados está em <Link to="/privacidade">Política de Privacidade</Link> e em <Link to="/seguranca">Segurança e LGPD</Link>.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="termos-uso" titulo="Uso adequado">
        <ul>
          <li>Não use o Decreta para fim ilícito, nem para tentar ver dados de outro escritório, contornar os limites de uso ou quebrar a segurança do serviço.</li>
          <li>A IA tem limites por pessoa, por minuto e por dia, e um teto de gasto, para proteger o serviço de todos.</li>
          <li>O Decreta pode suspender o acesso de quem descumprir estes Termos ou puser o serviço em risco.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="termos-encerrar" titulo="Exportar os dados e encerrar a conta">
        <ul>
          <li>O sócio baixa uma cópia de tudo quando quiser, em Configurações, na aba Dados: planilhas em CSV e os documentos guardados.</li>
          <li>O sócio também encerra o escritório ali, digitando o nome dele para confirmar. O acesso acaba na hora: ninguém mais entra, e a busca no DJEN e no DataJud e o WhatsApp param.</li>
          <li>Os dados do escritório são apagados de vez 30 dias depois, e não há como recuperá-los depois disso. Baixe a cópia antes de encerrar. Dentro desses 30 dias, quem mudar de ideia fala com o Decreta pelo contato abaixo.</li>
          <li>As cópias de segurança, que são cifradas, saem por rodízio em até 30 dias depois do apagamento. O que a lei exigir que seja guardado fica pelo prazo que ela pedir.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="termos-servico" titulo="O serviço, o preço e as mudanças">
        <ul>
          <li>O Decreta faz o possível para ficar no ar e tem backup diário, mas não promete funcionar sem interrupção: pode haver manutenção, falha de fornecedor ou instabilidade nos sistemas dos tribunais.</li>
          <li>O preço, o plano e a forma de pagamento são combinados com o escritório antes de qualquer cobrança e não fazem parte destes Termos.</li>
          <li>Quando estes Termos mudarem, a versão e a data no pé desta página mudam junto, e uma mudança importante é avisada aos sócios por e-mail antes de valer.</li>
          <li>Estes Termos seguem as leis do Brasil.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="termos-contato" titulo="Contato">
        <p>
          Dúvidas, pedidos e reclamações: fale com o Decreta pelo WhatsApp{" "}
          <a href={LINK_DO_CONTATO} target="_blank" rel="noopener noreferrer">
            {EMPRESA.contato.exibicao}
          </a>
          .
        </p>
      </SecaoLegal>
    </PaginaLegal>
  );
}
