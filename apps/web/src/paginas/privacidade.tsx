/**
 * Política de Privacidade (decreta.site/privacidade), aberta a quem não entrou:
 * quem trata os dados e em que papel, o que a IA recebe, quem mais recebe dados,
 * por quanto tempo ficam e como a pessoa exerce os direitos. Só o que o produto
 * faz hoje; os dados de quem responde pelo Decreta entram de `EMPRESA`.
 */
import { EMPRESA, quemEncarrega, quemOferece, versaoPorExtenso, VERSAO_DOS_TERMOS } from "@decreta/core";
import { Link } from "@tanstack/react-router";
import { TabelaDeFornecedores } from "@/componentes/fornecedores";
import { LINK_DO_CONTATO, PaginaLegal, SecaoLegal } from "@/componentes/pagina-legal";

export function PrivacidadePage() {
  const empresa = quemOferece(EMPRESA);
  const encarregado = quemEncarrega(EMPRESA);
  return (
    <PaginaLegal
      olho="Política de Privacidade"
      titulo="Política de Privacidade do Decreta"
      intro="Quais dados o Decreta trata, para quê, com quem divide e por quanto tempo guarda. O que está aqui é o que o sistema faz hoje."
      atualizada={`Versão de ${versaoPorExtenso(VERSAO_DOS_TERMOS)}.`}
    >
      <SecaoLegal id="priv-papeis" titulo="Quem trata os dados e em que papel">
        {empresa && <p>{empresa}</p>}
        <ul>
          <li>
            <strong>Dados da conta e do uso do Decreta</strong> (de quem trabalha no escritório): o Decreta é o controlador.
          </li>
          <li>
            <strong>Dados dos clientes e dos casos do escritório</strong>: o escritório é o controlador, e o Decreta é o operador, nos termos da LGPD. O Decreta os trata só para prestar o serviço e segue as instruções do escritório.
          </li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="priv-conta" titulo="Dados da conta e do uso">
        <ul>
          <li>O que o Decreta guarda de cada pessoa: nome, e-mail, senha (embaralhada, nunca como texto), cargo, número da OAB e a UF, o WhatsApp, se a pessoa informar, e o aceite dos Termos (a versão e a data).</li>
          <li>Também ficam o registro de acessos (data, endereço de IP e aparelho) e o registro de quem fez o quê no escritório, que os sócios consultam.</li>
          <li>Servem para criar e manter a conta, conferir quem entra, proteger o serviço contra abuso e fraude, mandar os avisos que a pessoa pediu (convite, troca de senha, resumo da manhã) e cumprir a lei. As bases legais são a execução do contrato, o legítimo interesse na segurança do serviço e o cumprimento de obrigação legal.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="priv-casos" titulo="Dados dos clientes e dos casos">
        <ul>
          <li>O escritório coloca no Decreta o que precisa para trabalhar: clientes (nome, CPF ou CNPJ, contatos, endereço), processos e partes, publicações, prazos, audiências, tarefas, atendimentos, alvarás, documentos, peças, mensagens ao cliente e conversas com a IA. Nesses documentos pode haver dados sensíveis, como de saúde.</li>
          <li>O Decreta busca publicações no DJEN e movimentações no DataJud pela OAB da equipe e pelos números de processo do escritório. Do que o DJEN publica, grava só o que é do escritório e descarta o resto.</li>
          <li>Se você é cliente de um escritório que usa o Decreta e quer saber dos seus dados, corrigir ou apagar, fale com o escritório, que é quem decide sobre eles. O Decreta ajuda o escritório a responder.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="priv-ia" titulo="Inteligência artificial">
        <ul>
          <li>Só vai ao provedor de IA o que a tarefa pede, na hora de gerar a resposta: o teor de uma intimação, trechos dos autos e dos documentos, a pergunta e os dados do escritório que a IA consulta para responder, fotos e PDFs digitalizados, o áudio de um atendimento. O envio passa por um gateway do Decreta, que guarda as chaves e limita o gasto.</li>
          <li>Nenhum fornecedor de IA treina modelos com o conteúdo do escritório. Pelo OpenRouter o pedido vai com retenção zero; pela Anthropic o pedido fica guardado por até 30 dias e depois é apagado.</li>
          <li>Cliente que recusou o uso de IA fica marcado, e nada dos casos dele vai à IA.</li>
          <li>Nada que a IA produz vale sem uma pessoa: o prazo só vale depois que alguém da equipe confirma, a peça é revisada por um advogado e a mensagem ao cliente só sai com a aprovação dele. O advogado continua responsável pelo prazo e pelo que protocola.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="priv-fornecedores" titulo="Com quem os dados são divididos">
        <p>O Decreta não vende dados e não usa dados para publicidade. Para funcionar, ele usa os fornecedores abaixo, que são os suboperadores nos termos da LGPD. Alguns deles tratam dados fora do Brasil.</p>
        <TabelaDeFornecedores />
        <p>Fontes públicas: o DJEN e o DataJud, do CNJ, recebem a OAB da equipe e os números de processo do escritório para devolver as publicações e as movimentações.</p>
      </SecaoLegal>

      <SecaoLegal id="priv-site" titulo="O site e a medição de uso">
        <ul>
          <li>Para saber quantas pessoas visitam o site e criam conta, o Decreta conta alguns eventos (uma visita, um clique em criar conta). Cada evento guarda só o nome e o dia e a hora. Não há cookie, o endereço de IP não é gravado e nenhuma pessoa é identificada.</li>
          <li>Depois do cadastro, o Decreta conta marcos de uso do escritório (a OAB cadastrada, a primeira publicação, o primeiro prazo confirmado), também sem dado pessoal.</li>
          <li>Os únicos cookies são o da sessão de quem entrou e, para quem escolhe não repetir o código neste aparelho, o da verificação em duas etapas. Os dois são necessários para o sistema funcionar. Não há cookie de publicidade nem de rastreamento.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="priv-tempo" titulo="Por quanto tempo os dados ficam">
        <ul>
          <li>Os dados ficam enquanto o escritório tiver a conta. O sócio baixa uma cópia de tudo quando quiser e pode encerrar o escritório em Configurações, na aba Dados.</li>
          <li>Ao encerrar, o acesso acaba na hora. Os dados, os documentos e as cópias que o Decreta fez para o escritório são apagados de vez 30 dias depois. As cópias de segurança, cifradas, saem por rodízio em até 30 dias depois disso.</li>
          <li>Depois do apagamento restam só números sem identificação: o gasto com a IA (quantidade e custo, nunca o conteúdo) e os eventos de uso descritos acima, sem o escritório.</li>
          <li>O que a lei exigir que seja guardado fica pelo prazo que ela pedir.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="priv-direitos" titulo="Seus direitos">
        <ul>
          <li>Quem usa o Decreta pode pedir confirmação de que seus dados são tratados, acesso, correção, anonimização ou eliminação, portabilidade e informação sobre com quem eles são divididos, nos termos da LGPD.</li>
          <li>Para os dados da conta, peça pelo contato abaixo. Para os dados dos clientes e dos casos, peça ao escritório.</li>
          <li>Quem não ficar satisfeito pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="priv-seguranca" titulo="Segurança">
        <p>
          Cada escritório só enxerga os próprios dados, a separação é feita no banco, a conexão é sempre por HTTPS e os backups são cifrados. Os detalhes estão em <Link to="/seguranca">Segurança e LGPD</Link>. As regras de uso estão nos <Link to="/termos">Termos de Uso</Link>.
        </p>
      </SecaoLegal>

      <SecaoLegal id="priv-contato" titulo="Contato e encarregado">
        {encarregado && <p>{encarregado}</p>}
        <p>
          Para qualquer assunto sobre dados pessoais, fale com o Decreta pelo WhatsApp{" "}
          <a href={LINK_DO_CONTATO} target="_blank" rel="noopener noreferrer">
            {EMPRESA.contato.exibicao}
          </a>
          .
        </p>
      </SecaoLegal>
    </PaginaLegal>
  );
}
