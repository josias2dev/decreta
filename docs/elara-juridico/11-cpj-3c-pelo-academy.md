# CPJ-3C pelo Academy

Análise feita em 02/11/2026 a partir do material de treinamento do Preâmbulo Academy (plataforma Moodle em que a Preâmbulo ensina o CPJ-3C aos clientes), numa conta já autenticada. **O sistema em si não foi usado.** Nada foi testado: tudo o que está aqui vem de vídeos narrados em tela, descrições de aula e notas de versão. O material pode estar defasado em relação à versão atual, e uma aula pode mostrar um cadastro de teste que o cliente real não vê do mesmo jeito.

**Datas e versões que apareceram:** vídeos da trilha "Primeiros Passos" gravados em 9, 17, 18 e 19/12/2025; vídeo do CPJ-3C+ de 8/05/2026; páginas do CPJ-Connect atualizadas em 25/03/2026; notas de versão de H.04.07 a **H.04.63**, a mais recente, que cita uma "release de 02/10" (sem ano) e prazos fiscais de 01/10/2026.

**Como li os vídeos:** são gravações de tela com narração, publicadas no YouTube como "não listado" e embutidas no Academy. Li a transcrição automática em português de 21 deles (alguns só em parte) e a descrição de todas as aulas das quatro trilhas abertas. A transcrição tem erros de reconhecimento, e onde um termo ficou duvidoso, como o nome de um sistema de tribunal, evitei repeti-lo. Os PDFs de apoio não foram abertos (ver "O que não foi visto").

**Limite principal:** das 16 trilhas do catálogo de produto, só consegui abrir 4. As de equipe (Prazistas, Cadastro, Controladoria, Financeiro Básico) e a de Primeiros Passos pedem autoinscrição, e eu não me inscrevo em curso novo. Por isso **não vi o que o produto ensina sobre contagem de prazo nem sobre financeiro**, os dois temas mais valiosos para nós.

Vocabulário: "ficha" ou "pasta" é o processo cadastrado; "PJ" (protocolo jurídico) é o número interno da pasta; "tramitação" é o histórico de andamentos e tarefas da pasta; "agenda" é a fila de tarefas de uma pessoa ou equipe.

Siglas das fontes: **Guia** = curso "Guia de funcionalidades do CPJ-3C"; **Novidades** = curso "Novidades | CPJ-3C" (notas de versão H.04); **3C+** = "Guia de Funcionalidades CPJ-3C+"; **Upgrade** = "Formação CPJ-3C Upgrade".

## Mapa do produto

| Área | O que o material mostra | Onde vi |
|---|---|---|
| Produtos da família | **CPJ-3C** (cliente instalado no computador, com servidor próprio), **CPJ-3C+** (versão web na nuvem, entrada pelo mesmo login), **CPJ-Connect** (consulta web/mobile para advogados e clientes), **CPJ-Safe** (cofre de certificados), **CPJ-Cobrança** e **Office.adv** (cursos próprios, não abertos), Preâmbulo Hub (portal com loja, Academy, suporte e status dos serviços) | Guia, 3C+, categorias do catálogo |
| Módulos do CPJ-3C | Portal Preâmbulo, Dashboard, Pessoas, Processo, Minhas Atividades, grupo financeiro (de "Caixas e Bancos" até "Coletor"), Notificações, Tabelas, Miscelâneas, Configurações, Publicações, Sobre. É possível "desancorar" um módulo para ter duas telas | Guia · Primeiro acesso |
| Processos e pastas | Pasta com número de ficha e número PJ; ficha incidente ligada à principal; busca por PJ, ficha, número CNJ ou CPF; tabelas de ação, matéria, tema, fase, juízo e grupo de trabalho | Guia · Cadastro de processos; 3C+ |
| Pessoas | Cadastro único de cliente, parte contrária, fornecedor, colaborador e usuário; CPF/CNPJ evita duplicidade | Guia · Módulo de pessoas; 3C+ |
| Tarefas e agenda | Módulo Minhas Atividades: tarefas por pessoa ou equipe; tratar como concluir, não cumprir, reagendar ou adiar; filtros e etiquetas | Guia · Minhas Atividades |
| Prazos | Prazo fatal e prazo interno separados; eventos com contagem automática; recesso configurável; recálculo ao mudar a classificação | Guia · Tramitação, Workflow de Publicações; Novidades |
| Eventos e fluxos | Tabela de eventos por tipo, com sigla, fluxo (workflow) e fase; encadeamento de tarefas ao gerar, cumprir ou não cumprir | Guia · Tabela de eventos |
| Publicações (Diário) | Robô recebe no módulo Publicações e importa para Minhas Atividades; fluxo vincular à pasta, lançar prazo, validar prazo; classificação que aprende | Guia · Workflow de Publicações |
| Intimação eletrônica | Serviço separado, por painel de cada tribunal; cadastro de sistemas com QR Code ou certificado A1; bloqueio de fases por planilha | Guia · Intimação Eletrônica |
| Multifonte | Segunda fonte de publicações para conferência, que fica "estacionada" no módulo Publicações | Guia · Auditoria com Multifonte |
| Monitoramento de processos | Robô que busca andamentos pelo número CNJ; inclusão em lote por CSV/TXT; notificações por regra | Guia · Monitoramento |
| Protocolo eletrônico | API para protocolar pela tarefa; tarefa trava até o robô devolver o comprovante | Guia · API de protocolo |
| Robôs de automação | Lista numerada em Miscelâneas: RB010, RB108, RB115, RB125, RB149, RB152 | Guia · seções "RB" |
| Importação | RB152, importador genérico por planilha Excel (processos, envolvidos, tramitações, documentos) | Guia · RB152 |
| Financeiro | Títulos a pagar e a receber, SPF (solicitação de providência financeira), conta corrente por pasta; só vi pelas notas de versão | Novidades; 3C+ |
| Nota fiscal e tributos | NFS-e com fornecedor Tecnospeed, tabela de tributos, apuração própria de PIS/COFINS, campos do IBS/CBS, CNPJ alfanumérico | Novidades |
| Preâmbulo Bank | Boleto integrado e pagamento por chave Pix (PreambuloPay) | Novidades · H.04.43 e H.04.53 |
| Timesheet | Cronômetro por tarefa, lançamento manual, aula em pacote SCORM | Guia; 3C+ |
| Documentos | Anexo à tarefa e à tramitação, tipificação para protocolo, aba de documentos na pasta | Guia · API de protocolo; 3C+ |
| Relatórios e BI | Relatórios por módulo (PDF, Excel, etiqueta) com agendamento; RB010 com cubos; reportBuilder | Guia; 3C+ |
| Permissões e auditoria | Perfis, restrições por usuário, política de senha, log de entrada e saída (RB108), CPJ-Safe | Guia · Perfil e Cadastro de usuários; Novidades |
| Portal do cliente | CPJ-Connect somente de consulta, com usuário externo | Guia · CPJ-Connect |
| IA | Só uma menção: a classificação de publicações "ensina" a IA do escritório. Não vi curso de IA | Guia · Workflow de Publicações |
| Marcadores | Etiquetas próprias para processos, tramitações e tarefas, com relatório em Excel | Guia · Marcadores; Novidades |
| Manutenções em lote | Redistribuir processos e agendas, atribuir compromissos à equipe, cancelar tarefas em lote | Guia · Manutenções Básicas |

## Detalhes que importam

### Prazos e como são calculados

O que o material mostra, e o que não mostra:

- **Dois prazos por tarefa.** Ao lançar um evento do tipo prazo na tramitação, a pessoa informa o **prazo fatal** (o prazo processual) e o **prazo interno** (o dia em que a tarefa cai na agenda de quem vai cumprir, por exemplo dois ou três dias antes). Na aula, as datas foram escolhidas à mão num calendário (Guia · Tramitação).
- **Recesso:** na mesma aula, o instrutor recuou o prazo interno porque ele cairia no recesso, e disse que isso decorre de uma lógica do sistema. O recesso é configurável, segundo a nota de versão H.04.15 (Novidades). Não ficou claro se o sistema bloqueia a data ou apenas avisa.
- **Contagem automática:** na aula de publicações, as tarefas "apelação" e "guia" aparecem "com contagem automática", ou seja, a regra de contagem fica no cadastro do evento. Ao copiar um evento para criar outro, há a opção "copiar prazo", e o instrutor recomenda não marcá-la sem saber o que ela leva junto (Guia · Tabela de eventos). **Não há aula, no material aberto, sobre como configurar ou conferir essa contagem**; o instrutor diz que haverá um vídeo, que não está nas trilhas que abri. Não vi dias úteis, feriados nem tribunal.
- **Validar prazo:** o fluxo de publicações permite uma etapa opcional em que outra pessoa ou equipe valida os prazos lançados antes de as tarefas serem criadas (Guia · Workflow de Publicações).
- **Recálculo por classificação:** a versão H04.057 permite que, ao mudar a classificação de um compromisso, o sistema recalcule as regras de eventos e exija a atualização da grade de tarefas, para não ficarem eventos de regras diferentes das escolhidas (Novidades).
- **Aviso sobre monitoramento:** a descrição da aula de notificações do monitoramento diz que ele é auxiliar e **não vale para prazos**, que dependem de publicação ou intimação (Guia · Monitoramento).
- **Regra contra prazo sem dono (H04.051):** toda agenda de pessoa que receba tarefa ou prazo precisa ter um usuário ativo vinculado; sem isso o sistema bloqueia a atribuição. Agendas de equipe ficam fora da regra, e o que já estava atribuído não muda (Guia · Regra de segurança para agendas).
- **Ausências (H04.049 e H.04.61):** módulo para cadastrar afastamentos e responsáveis pelo monitoramento, com e-mail em caso de conflito entre tarefa e ausência. A distribuição não atribui tarefa a quem está ausente e passa para o próximo da lista (Novidades).
- **Janela de datas:** o grid de tarefas ganhou períodos de ±60, ±90 e ±180 dias, liberados por uma opção nas preferências (H04.057).

### Publicações, intimações e conferência

- **Dois serviços diferentes.** Publicação é a que sai no Diário Oficial; intimação eletrônica é a que fica no painel do advogado de cada sistema de tribunal. A Preâmbulo entrega um link para o "painel de intimações" e uma planilha de bloqueio (Guia · Intimação Eletrônica).
- **Painel de intimações:** o escritório cadastra cada sistema de tribunal com **QR Code ou certificado A1**; o painel mostra o status do login e classifica o problema, quando há (descrição da aula, não vi o vídeo).
- **Bloqueio de fases por planilha:** se um sistema entrega fases que o escritório não quer, ele marca as fases numa planilha e pede o bloqueio à equipe de publicações da Preâmbulo. O instrutor avisa do risco de bloquear a única fase que entrega as intimações daquele sistema e recomenda começar sem bloquear: a fase extra serve de conferência.
- **Caminho da publicação:** o robô a recebe no módulo Publicações e ela é "importada" para Minhas Atividades, onde é tratada. Tarefas do fluxo: **vincular publicação à pasta**, **lançar prazo**, **avaliar publicação duplicada** e, se configurada, **validar prazo** (Guia · Workflow de Publicações e Tratando as publicações).
- **Vincular à pasta:** quando o robô não acha a pasta, a pessoa busca pelo número do processo, cria a pasta se não existir, informa o número PJ e conclui. Se a publicação não for do escritório (homônimo, processo substabelecido), ela é baixada com a justificativa "não pertence ao escritório". O sistema pergunta se deve guardar uma "equivalência" (um dado extra para reconhecer publicações futuras daquela pasta). A orientação é responder não: com uma pasta por processo, mesmo para agravo e carta precatória, o número CNJ da pasta já é o que o robô usa para reconhecer a publicação.
- **Lançar prazo:** a pessoa classifica a publicação e escolhe entre gerar tarefas, baixar **sem prazo** com justificativa ou **devolver** a publicação ao passo anterior (pasta errada).
- **Classificação que aprende:** no começo a classificação é manual; ao classificar, o sistema **sugere os eventos** que o escritório costuma gerar naquele caso (por exemplo manifestação, ligar para o cliente, atualizar o sistema do cliente). A pessoa mantém, remove ou acrescenta tarefas, e o sistema passa a classificar sozinho conforme a recorrência. O instrutor diz que a classificação "começa a moldar a sua inteligência artificial". Não vi nenhum detalhe técnico além dessa narração.
- **Duplicidade e agrupamento:** o robô avisa quando o mesmo arquivo de publicação chega mais de uma vez; a pessoa descarta ou manda para o advogado, e a tarefa vira "lançar prazo". Um quadrado vermelho na tarefa agrupa as publicações da mesma pasta.
- **Roteamento por célula:** a publicação entra numa "célula de publicações" e pode ser distribuída por subequipes (cível, trabalhista, grupos de trabalho por cliente ou matéria). O instrutor oferece ajuda da Preâmbulo para montar esse desenho.
- **Multifonte:** segunda fonte de publicações para ter segurança caso a primeira falhe. Ela **não** vai para Minhas Atividades, para não duplicar, e fica no módulo Publicações. Segundo a descrição da aula de filtros (não vi o vídeo), os filtros incluem "a verificar", ignorado, conferido, importado, duplicado e com erro, e a pessoa vincula, confere e só então importa (Guia · Auditoria com Multifonte).
- **DJEN (RB125):** o robô cria a ficha a partir do teor da publicação do DJEN, ou apenas lança o andamento se a ficha já existe. Ele falha se houver campos obrigatórios que a publicação não traz, e oferece valores padrão para a ficha nova (grupo de trabalho, matéria, tema, ação, rito, responsável). Pesquisa por número CNJ ou nome da parte, por tribunal e por período (Guia · RB125).

### Eventos, fluxos e encadeamento

- **Tipos de evento:** andamento, audiência, prazo, verificação, reunião, viagem, telefonar e outros. **Andamento não gera tarefa**; é só registro ou anexo. Os demais geram uma "tarefa filha" (realizar audiência, elaborar peça, cumprir tarefa) (Guia · Tabela de eventos).
- **Tabela de eventos:** cada evento tem sigla, descrição, tipo, fluxo, fase e opções como "linha do tempo", "liberar lançar encadeamento" e "solicitar pessoa para cumprir tarefa". Todo evento deve estar ligado a um fluxo. O fluxo mais simples é o "cumprimento de tarefa simplificado".
- **Fase do processo:** um evento pode mudar a fase da pasta (conhecimento, recursal). A fase aparece ao lado da pasta e serve para mapear a carteira.
- **Fragilidade assumida:** o instrutor pede que poucas pessoas possam criar eventos, porque tabelas bagunçadas atrapalham relatórios e automações. O exemplo dele é um evento genérico de "manifestação" que impede saber se já se juntou procuração, e a solução é criar um evento próprio.
- **Encadeamento:** a regra dispara em três momentos, ao **gerar**, ao **cumprir** ou ao **não cumprir** uma tarefa. Exemplo da aula: reunião com cliente, ao cumprir, gera "analisar documentação", que ao cumprir gera "cadastrar pasta do processo". Outro exemplo: não cumprir "embargos" gera "apelação". O sistema mostra uma janela de "tarefas encadeadas" e a pessoa confirma com "aplicar o encadeamento" (Guia · Encadeamento).
- **Detalhes de versão:** tarefas encadeadas opcionais podem vir marcadas ou desmarcadas por padrão (H04.049.002); o encadeamento pode solicitar um serviço, sem contratar (H04.053); em tarefas de fluxo com vínculo 6, a tarefa filha pode editar o texto da principal, com permissão própria e registro no histórico (H.04.63).

### Monitoramento e protocolo

- **Monitoramento:** robô que busca andamentos públicos de processos com número CNJ. A inclusão se faz pelo ícone do tribunal, escolhendo a instância, ou em lote por CSV ou TXT, e os status são validando, cadastrado e erro. Uma permissão de perfil controla quem inclui ou exclui (descrição das aulas).
- **Notificações do monitoramento (aula vista):** por padrão os andamentos capturados **não** vão para a tramitação. A configuração permite registrar automaticamente, com período mínimo de **7 dias** para trás (sem período, o robô registraria todo o histórico), criar tarefa só numa janela de horário (por exemplo das 22h às 6h) e definir regras por script e palavras-chave, com envio por e-mail. O tipo do evento vinculado decide se só registra (andamento) ou também gera tarefa (verificação). O botão de pré-cadastro voltou para processos monitorados com status cadastrado (H.04.61).
- **API de protocolo (aula vista):** na tarefa de protocolo, a pessoa tipifica cada documento com o nome que o tribunal usa, anexa quantos precisar e escolhe "contratar". Abre-se um formulário com a numeração CNJ (vinda da ficha) e campos obrigatórios; o envio vai ao painel de protocolos. A tarefa fica **travada**, com um ícone de mão azul, até o robô devolver sucesso ou erro, e o comprovante é anexado sozinho. Há filtros para "aguardando conclusão de serviço" e para serviços contratados pendentes, esse último restrito por perfil. Quando o protocolo integrado volta negado, a nota H.04.63 permite trocar o documento e reenviar.

### Equipe, agenda e manutenções

- **Redistribuição:** manutenções básicas para redistribuir processos e agendas, atribuir compromissos à equipe (com filtro por vários grupos de trabalho desde a H04.055) e cancelar tarefas em lote. Pela descrição, a aula "Cuidados essenciais" é um alerta sobre o risco dessas ferramentas (não vi o vídeo).
- **Monitoramento entre coordenadores:** uma permissão deixa um coordenador ver a agenda de outros da mesma equipe (H04.057). Existe também o filtro "monitorada por mim" (H04.051).
- **Robôs RB115 e RB149:** atribuição de agenda em lote e atualização de capa do processo em lote (descrição das aulas).

### Financeiro, notas fiscais e Bank

Tudo o que sei vem das notas de versão; **não vi nenhuma aula de financeiro**.

- **Nota fiscal de serviço:** emissão após a baixa do título (opção desligada por padrão), competência da nota seguindo a data do título, e padronização do texto de discriminação para quem usa o fornecedor Tecnospeed (H.04.45 e H.04.63).
- **Tributos:** tabela de tributos ligada a um tributo padrão do sistema, memória de cálculo guardada na nota, apuração própria de PIS e COFINS com alíquotas parametrizáveis.
- **Reforma tributária:** campos CST e CCT no cadastro do emitente para enviar IBS/CBS na NFS-e (H.04.57 e H.04.59), mais o novo layout NT008 (DANFE 2.0). Também adaptaram o **CNPJ alfanumérico** (julho de 2026), com boletos homologados nos bancos (H04.053). Uma parte grande das notas de versão é conformidade fiscal.
- **Preâmbulo Bank:** boleto integrado com fluxo automatizado (H.04.43) e pagamento por chave Pix no cadastro de pessoas, na SPF e no pagamento de título, para clientes da PreambuloPay (H04.053).
- **SPF:** é o pedido de providência financeira ligado à tarefa. Os comprovantes anexados passam à tarefa anterior da cadeia (por exemplo a de protocolo), e a SPF com todos os títulos baixados não pode mais ser cancelada. Os eventos de SPF na tramitação mostram número, natureza, resumo e situação.
- **Timesheet:** cronômetro com play e stop, arredondamento por minuto, lançamento manual e finalização automática ao concluir a tarefa (3C+). A restrição de "supervisor de timesheet" fica no cadastro do usuário.
- **Cursos de finanças:** "Formação Financeiro Básico" (2h, não aberto) e "Financeiro Avançado" (2h, pago, com chave de inscrição obtida pelo comercial).
- **Honorários, repasse e faturamento:** não apareceram. A pasta do 3C+ tem as abas "Contratação", "Conta Corrente" e "Depósitos e Recursos", sem detalhe.

### Relatórios e BI

- **Relatórios padrão:** cada módulo tem os seus, acessados pelo ícone de impressora, em PDF, Excel e etiqueta (a etiqueta é para pasta física e é pouco usada). Cada relatório pede filtros, como período, situação da tarefa, agenda e matéria (Guia · Gerador de relatório padrão).
- **Geração automática:** o mesmo relatório pode ser agendado por dias da semana, meses, ano e horário, com o período calculado a partir da data de execução. Os gerados ficam numa lista de "relatórios solicitados", que o instrutor recomenda limpar de vez em quando.
- **RB010, BI de produtividade:** filtra por tipo de evento, data de cumprimento ou de agenda, situação, grupo de trabalho, evento e categoria de pessoa, e monta um **cubo** que a pessoa remodela arrastando colunas, com valores absolutos ou percentuais. O instrutor avisa que períodos grandes deixam a montagem lenta (Guia · RB010).
- **reportBuilder (3C+):** o manual diz que o escritório monta as próprias consultas escolhendo assuntos e campos, sem abrir chamado de desenvolvimento, sobre um catálogo de **mais de 200 conjuntos de dados e quase 3 mil campos**, com dados separados por cliente. Segundo o manual, a versão instalada já oferecia isso e agora a nuvem também.
- **Dashboard:** na tela inicial do 3C+, tarefas em atraso, que vencem hoje e em 1, 2 e 3 dias, por tipo (audiência, verificação, prazo), não atribuídas e cumpridas no mês. No 3C, o instrutor avisa que o Dashboard mostra o sistema inteiro e não só o usuário.
- **Cursos pagos:** "Gerador de Relatórios" (2h) e "Gerador de Documentos" (2h), vendidos à parte. Só vi o texto de apresentação; nenhuma aula aberta mostra a geração de documentos a partir de modelos.

### Permissões, auditoria e segurança

- **Perfis:** cada usuário é ligado a um perfil que define tabelas que pode manter, acesso a processos sigilosos, exclusão de processo, envio ao arquivo morto, liberação de SPF, acesso a caixas e bancos e conta corrente, alteração de preferências e controle de agendas. A dica do instrutor é **copiar um perfil** e retirar só uma permissão (Guia · Perfil de usuários).
- **Usuário:** login individual por pessoa, para os relatórios identificarem quem fez o quê. Restrições opcionais por grupo de trabalho, unidade, estado, município e região, além de bloqueio após N dias, horário e fim de semana. A boa prática dos materiais é **inativar, nunca excluir**, usuário (nomes das seções do PDF).
- **Política de acesso (H.04.45):** histórico das últimas 30 senhas por usuário, bloqueio de reutilização das 5 mais recentes e critérios de complexidade definidos no servidor do CPJ-3C.
- **Granularidade:** há uma permissão própria para editar informações complementares do processo, separada da de editar a capa (H04.055).
- **Log de acesso (RB108):** entradas e saídas dos usuários e tempo online, com exportação em Excel. Só registra depois de instalado e **não é retroativo**. É log de acesso, não de ações.
- **Histórico de ações:** a nota H.04.63 menciona histórico da tarefa principal, que registra edições feitas pelas filhas. Não vi uma trilha de auditoria geral.
- **CPJ-Safe:** cofre de certificados e credenciais que registra cada acesso com IP, data, hora e geolocalização, facilita trocar o responsável sem perder o acesso aos processos e assina documentos por extensão do navegador (PDF "Guia do CPJ-Safe", só descrição).

### Portal do cliente (CPJ-Connect)

- **O que é:** plataforma web e mobile de **somente consulta**. O usuário não altera nem conclui tarefas. Dá para fixar no celular (Guia · CPJ-Connect).
- **Telas:** Dashboard com gráficos filtráveis por grupo e matéria e exportáveis para Excel; agenda com filtros ("monitoradas por mim", pedidas a outros, por identificador); processos com abas de cadastro, tramitação (andamentos externos) e documentos, com download. Para o usuário interno administrador, as preferências personalizam o Connect; para os demais, só o tamanho da fonte.
- **Usuário externo:** criado na tabela de usuários com o tipo de acesso "externo, consulta via CPJ Connect". Para o cliente ver só os próprios processos, é preciso preencher o **código da pessoa** e também repetir esse código no campo de código da agenda. A janela inicial deve ser a de processos; nunca marcar administrador nem dashboard, porque isso expõe o escritório inteiro. É possível bloquear o acesso após N dias e limitar horário e fim de semana (vídeo "Como criar usuários externos").
- **Notificações ao cliente:** a H04.053 permite escolher quais status de contratação de serviço avisam o cliente. Não vi, no material aberto, envio de andamento ao cliente em linguagem simples nem WhatsApp.

### Importação e robôs

- **RB152, importador genérico:** carrega uma **planilha Excel** já parametrizada. Valida se o processo já existe (ele não pode existir para importar) e, para os envolvidos, procura a pessoa por CPF, CNPJ ou código único e **cria o cadastro se ela não existir**. Cenários cobertos: ficha principal e incidente, envolvidos, tarefa com documento na tramitação e documentos no processo. A apresentação diz que o profissional consegue importar **sem ajuda da Preâmbulo**.
- **RB149:** atualiza capas em lote. **RB125:** cria fichas a partir do DJEN. **RB115:** atribuição de agenda em lote. **RB010:** BI. **RB108:** log de acesso.
- **Acesso aos robôs:** todos ficam em Miscelâneas, "Robôs de automação". Na aula do RB125, o instrutor avisa que campos obrigatórios nas preferências impedem a criação da ficha.

### Cadastro de processos e numeração

- **Dois números por pasta:** número da ficha (preto) e **número PJ** (vermelho), gerado uma só vez e nunca reaproveitado. A ficha incidente ganha o número seguinte ao da principal (27200 e 27201, no exemplo). Buscar pelo número de qualquer uma das duas pastas traz a principal e as incidentes juntas (Guia · Criação de ficha incidente).
- **Incidente:** ao criar, é possível copiar dados básicos, envolvidos e pedidos, e **inverter autor e réu** (quando o recurso é da parte contrária). O instrutor recomenda sempre cadastrar com a numeração CNJ.
- **Campos obrigatórios:** ficam em Preferências; a H.04.59 acrescentou Rito, Número do processo e Juízo como obrigatórios para a ficha incidental, desligados por padrão.
- **3C+:** ao digitar um número na busca, o sistema pergunta se ele é PJ, ficha ou número de processo (a descrição do curso diz que ele identifica sozinho, e a aula mostra a pergunta). A pasta tem abas Dados Básicos, Administrativo, Envolvidos e Pedidos, Tramitação, Contratação, Conta Corrente, Depósitos e Recursos, Documentos e Incidentes.

### IA

O material aberto quase não fala de IA. O que existe é a classificação de publicações que aprende (descrita acima) e o recurso de sugerir eventos a partir dela. **Não vi** leitura automática do teor, resumo, geração de peça, jurisprudência, nem curso chamado de IA. Existe uma categoria "Agnes" no catálogo, mas não consegui abri-la nem entendi do que se trata.

## Como o produto é implantado e ensinado

### Instalação e plataforma

- O CPJ-3C é um **programa instalado no computador**: a equipe técnica da Preâmbulo instala em cada máquina e o login individual é feito numa janela do próprio programa (Guia · Primeiro acesso). Há um servidor do CPJ-3C onde se configuram, por exemplo, critérios de senha (Novidades · H.04.45).
- Existe um **guia para instalar o Windows 11 IoT Enterprise LTSC num Mac** como complemento da instalação do CPJ. Isso indica, por inferência minha, que o cliente instalado só roda em Windows e que quem usa Mac precisa de uma máquina virtual.
- O **CPJ-3C+** é a versão web, na nuvem, com a mesma conta. O curso dele cobre Dashboard, Pessoas, Processos (com ficha incidente e tramitação com prazo fatal e interno), Tarefas e Timesheet, mais o manual do reportBuilder. **Não cobre** publicações, financeiro nem os outros módulos do 3C. A nota H.04.61 cita a entrada pela conta única Preâmbulo (SSO).
- O Preâmbulo Hub reúne a loja de produtos e serviços, o acesso ao Academy (individual por pessoa), o suporte (chamados, helpdesk, acesso remoto por TeamViewer) e o status das publicações dos tribunais. No canto superior direito do 3C, painéis ficam verdes quando os serviços funcionam e vermelhos quando falham.
- A cada login o sistema mostra um aviso sobre backup e agenda, que pode ser silenciado. Não li o conteúdo do aviso.

### Catálogo do Academy

| Curso | Horas anunciadas | Situação nesta conta |
|---|---|---|
| Primeiros Passos CPJ-3C | 6h | pede autoinscrição, não abri |
| Guia de funcionalidades do CPJ-3C | 4h | aberto: 27 seções, 43 vídeos, 5 vídeos em páginas, 21 PDFs, 1 pacote SCORM, 3 links |
| Formação Time de Prazistas | 4h | pede autoinscrição |
| Formação Time de Cadastro | 4h | pede autoinscrição |
| Formação Time de Controladoria | 4h | pede autoinscrição |
| Formação Financeiro Básico | 2h | pede autoinscrição |
| Novidades (CPJ-3C) | 13 min | aberto: notas de H.04.07 a H.04.63, cada uma com PDF "Descritivo" |
| Formação CPJ-3C Upgrade | 2h (6h na listagem da categoria) | aberto: 5 módulos, quiz, mentoria ao vivo, certificado |
| Guia de Funcionalidades CPJ-3C+ | 6h | aberto: 9 vídeos, 9 PDFs e o manual do reportBuilder |
| CPJ-3C Financeiro Avançado | 2h | pago, chave de inscrição pelo comercial |
| CPJ-3C Gerador de Relatórios | 2h | pago |
| CPJ-3C Gerador de Documentos | 2h | pago |
| CPJ-Cobrança: Primeiros passos | 8h (5 aulas) | pede autoinscrição |
| CPJ-Cobrança: Guia de funcionalidades | 4h53 | pede autoinscrição |
| Office.adv: Formação e Novidades | 4h e 13 min | pede autoinscrição |

Há ainda categorias antigas (CPJ-3C, Implementação, Cobrança, Agnes) e a categoria Hub, de treinamento interno da Preâmbulo, que não abri.

O que isso revela sobre a complexidade:

- **São 16 cursos de produto**, e a conta abre só 4. Somando as cargas anunciadas, uma pessoa de prazos ou de cadastro faz cerca de **14 horas** (Primeiros Passos 6h, formação da equipe 4h, Guia 4h), e o financeiro soma mais 2h, fora cursos pagos.
- **Papéis:** o catálogo separa trilhas por função (prazista, cadastro, controladoria, financeiro básico e avançado). No que está visível, não há trilha para "advogado" nem para "administrador".
- **O treinamento parece pressupor equipes especializadas:** um time só de prazos, outro só de cadastro e outro de controladoria. É leitura minha dos nomes das trilhas.
- **Os vídeos do Guia têm de cerca de 2 a mais de 13 minutos** nos que li (estimativa pelo tamanho da transcrição), são gravações de tela com narração e não têm perguntas dentro do vídeo. A trilha Primeiros Passos tem numeração até pelo menos 27 nos títulos do YouTube.
- **A trilha Upgrade** tem módulos liberados em sequência, quiz, mentoria ao vivo e certificado, e foi feita para quem migrou para a versão mais recente.
- **Suporte além da aula:** helpdesk, consultoria e implementação aparecem várias vezes como saída ("fique tranquilo, a Preâmbulo ajuda") para perfis, células de publicação, restrições e tabelas.
- **Cadência de versões:** de H.04.43 a H.04.63, de duas em duas. Boa parte das notas é fiscal (NFS-e, IBS/CBS, CNPJ alfanumérico, NT008).
- **Não vi** prazo de implantação, nem número de semanas, em nenhuma página aberta.

## O que não foi visto

- **Trilhas que exigem inscrição:** Primeiros Passos, Prazistas, Cadastro, Controladoria, Financeiro Básico, CPJ-Cobrança e Office.adv. É provável que a aula de contagem automática de prazo, que o instrutor cita, esteja numa delas.
- **Cursos pagos:** Financeiro Avançado, Gerador de Relatórios e Gerador de Documentos (só o texto de apresentação).
- **Vídeos do Guia que não li, só tenho a descrição:** como visualizar tarefas, tratamento de tarefas, criar tarefa, filtros e etiquetas, módulo de pessoas, pesquisar e criar pasta, tramitação em lote, workflow de cumprimento de tarefa simplificado, painel de intimações, filtros do multifonte, monitoramento (duas das três aulas), marcadores, manutenções (as quatro), Timesheet, importações do RB152 (quatro das cinco), RB149 e RB115. Também não vi três vídeos do CPJ-Connect (como acessar, personalizar e fixar no celular) nem o link da diferença entre usuário interno e externo. No 3C+, li só a apresentação; os outros oito vídeos ficaram só com descrição.
- **PDFs e pacote SCORM:** não baixei nem abri. Nomes que podem valer o download estão no fim do relatório.
- **Telas:** só li o que o instrutor narra. Não fiz capturas de tela dos vídeos.
- **Quiz, mentoria e certificado:** não abri nem respondi.
- **Sistema real:** nada foi testado. Não sei como o cálculo de prazo se comporta com feriado local, recesso ou tribunal, nem o que o robô de publicações acerta ou erra.
- **Preço:** nenhuma página aberta trouxe preço de plano, de publicações ou de cursos.
- **Preâmbulo IA e Preâmbulo Bank:** sem aula própria. Bank só aparece nas notas de versão.

## O que levar para o Decreta

1. **Prazo fatal e prazo interno como dois campos.** O CPJ-3C pede os dois e a agenda do advogado usa o interno (por exemplo dois dias antes). O Decreta já calcula o fatal com regra e feriado, conforme o [documento do Astrea](06-astrea-por-dentro.md); vale oferecer também o dia de trabalho derivado dele.
2. **Contagem como regra do evento, ensinada em aula à parte.** No CPJ-3C a regra vive no cadastro do evento. O material aberto não explica a contagem e não mostra o resultado com regra, feriado e tribunal à vista. Se o Decreta mostrar qual regra, qual feriado e qual tribunal entraram no cálculo, ocupa um espaço em que o material fica mudo.
3. **Prazo sem dono.** A regra H04.051 (bloquear atribuição a agenda sem usuário ativo) e a distribuição que pula quem está ausente corrigem falhas reais de quem perde prazo. Alertar quando um prazo não tem responsável ativo é barato de fazer.
4. **Etapa de validação de prazo.** Segunda pessoa confere antes de criar as tarefas, como opção por escritório.
5. **Classificação com sugestão revisável.** O CPJ-3C aprende pela recorrência, e a pessoa precisa classificar à mão no começo. Uma IA que classifica e sugere desde o primeiro dia, com a mesma tela de manter, tirar ou acrescentar, é um ganho claro, desde que a decisão siga com a pessoa.
6. **Estados explícitos da publicação.** Vincular à pasta, lançar prazo, duplicada, "não pertence ao escritório" (com justificativa) e "devolver". São quatro saídas bem nomeadas, fáceis de auditar.
7. **Segunda fonte para conferência.** O Multifonte existe porque nenhuma fonte é completa. Um estado "conferido" para a publicação vista em duas fontes, sem duplicar a tarefa, resolve a mesma insegurança.
8. **Intimação eletrônica sem planilha.** Hoje o cliente do CPJ-3C bloqueia fases mandando uma planilha à Preâmbulo. Deixar o próprio escritório filtrar fases e sistemas na tela seria mais simples.
9. **Encadeamento de tarefas.** A regra "ao cumprir X, criar Y" (reunião, análise de documentos, cadastro da pasta) é um fluxo que escritórios pedem. Convém oferecer modelos prontos em vez de uma tabela de eventos que exige treinamento e acesso restrito.
10. **Portal do cliente seguro por padrão.** No CPJ-Connect, o cliente vê só o que o cadastro manual do código da pessoa e da agenda permite, e o treinamento avisa para nunca marcar administrador nem dashboard. O Decreta pode gerar o acesso do cliente com permissão mínima já aplicada, sem passos que podem expor o escritório.
11. **Segurança de conta.** Histórico de 30 senhas, bloqueio das 5 últimas, bloqueio por dias, horário e fim de semana, e um log de acesso que **não é retroativo** e só mostra entrada e saída. Um registro de ações (quem mudou qual prazo) seria mais forte do que esse log.
12. **Importação.** O Astrea resolve o acervo pela busca em lote por OAB; o CPJ-3C, por planilha que cria pessoas por CPF e só aceita processo que ainda não existe. O cliente que migra de outro sistema ainda precisa de uma planilha com validação de duplicidade.
13. **Número interno estável e incidente como filho.** O número PJ nunca se repete, e a pasta incidente herda os dados e pode inverter os polos. A busca do 3C+ que pergunta se o número digitado é PJ, ficha ou processo é um bom detalhe.
14. **O custo de ensinar é a principal lição.** Cerca de 14 horas de trilha por pessoa, 16 cursos, trilhas por função, mentoria ao vivo e cursos pagos. O primeiro uso por módulo do Astrea e o objetivo de zero treinamento continuam sendo o melhor contraponto.
15. **Estado da nuvem.** O CPJ-3C+ cobre hoje só Dashboard, Pessoas, Processos, Tarefas e Timesheet no treinamento, e o reportBuilder chegou depois. Um produto web desde o início tem vantagem, mas a Preâmbulo está levando o resto para a nuvem e vale rever esse quadro em alguns meses.
16. **Fiscal pesa.** Parte grande do ciclo de versões é NFS-e, IBS/CBS e CNPJ alfanumérico. Se o Decreta quiser faturamento, convém usar um emissor externo em vez de construir isso.

### Onde o Decreta já tem vantagem, pelo que o material permite ver

- **Prazo com regra, feriado e confirmação:** já anotado no documento do Astrea. No CPJ-3C o que se vê é data escolhida em calendário; a contagem automática é regra do evento e não foi demonstrada.
- **IA incluída:** a classificação que aprende é a única IA citada e depende de o escritório classificar muito no começo.
- **Instalação:** o Decreta não pede instalação, Windows nem servidor, e não precisa de guia para Mac.

### Onde o CPJ-3C é mais forte

- **Profundidade de fluxo:** equipes de publicação por matéria, validação de prazo, encadeamento, fases do processo e protocolo integrado ao tribunal, com comprovante anexado.
- **Cobertura de fontes:** publicações do Diário, intimação eletrônica por painel, multifonte, DJEN e monitoramento, cada um com seu robô e seu estado.
- **Financeiro e fiscal:** NFS-e, tributos, boleto e Pix pelo Bank, e SPF ligado à tarefa, embora eu só tenha visto isso em notas de versão.
- **Suporte humano:** consultoria, helpdesk, mentoria ao vivo e cursos para cada papel.
