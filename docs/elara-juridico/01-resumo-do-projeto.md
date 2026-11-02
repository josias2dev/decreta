# Resumo do projeto

O **Elara Jurídico** é um sistema de gestão para escritórios de advocacia, com IA embutida. Ele concentra num só lugar a parte processual, o atendimento ao cliente e a parte financeira. O que está no ar é uma demonstração com dados fictícios de um escritório chamado "Castro & Monteiro". É uma versão local, ainda sem deploy, assinada por Luana Fernandes Miranda (ELARA Tecnologia), e roda sobre Supabase.

**O que já funciona (tem tela e dados)**

- **Dashboard:** mostra os números do escritório: clientes ativos, processos judiciais e extrajudiciais, prazos que vencem hoje, audiências do dia, alvarás aguardando saque, o valor pendente em alvarás e a agenda dos próximos 7 dias. Tem atalhos para criar atendimento, cliente, processo e alvará.
- **Clientes:** cadastro e listagem de clientes.
- **Processos judiciais:** cadastro pelo número CNJ, com filtros por situação e por responsável, além de um contador de quantos processos cada advogado tem. Inclui:
  - **Movimentações:** o histórico de cada processo.
  - **Prazos:** controle de vencimentos com status ("em aberto", "a conferir", custas, documentos) por responsável.
  - **Audiências:** as próximas, as já realizadas e o cadastro de novas.
  - **Atualização processual:** consulta o processo na API pública do CNJ (DataJud) e detecta o tribunal sozinho pelo número.
- **Extrajudiciais:** casos que não estão na Justiça, como INSS, DETRAN e cartório. Registra protocolo, órgão, etiqueta (previdenciário, família, sucessões, trânsito etc.) e a situação: em análise, exigência, deferido, indeferido e assim por diante.
- **Novos Negócios:** triagem de casos novos, que aponta o que ainda falta na pasta antes de o caso ser repassado.
- **Documentos:** arquivos ligados a cada cliente e processo.
- **Assessoria:** clientes com contrato de acompanhamento contínuo, com uma área de demandas e prazos separada da tela de prazos. Uma demanda pode virar processo.
- **Alvarás:** acompanha o dinheiro liberado pela Justiça em todas as etapas: depositado, solicitado, emitido, a receber, sacado, repassado ao cliente e finalizado.
- **Financeiro:** honorários contratados, parcelas, valores recebidos e valores em atraso.
- **Atendimento:** registro de cada atendimento por tipo (WhatsApp, presencial, telefone ou vídeo). Dá para gravar áudio no próprio sistema ou subir o arquivo, ver relatórios por tipo e por mês e gerar documentos como notificações.
- **Elara IA:** um chat jurídico geral, mais transcrição de áudio, resumo do atendimento, resumo do processo, pesquisa de jurisprudência e geração de documentos. Cada processo também tem um chat próprio.
- **Relatórios:** processos por advogado e por situação.
- **Tarefas:** pendências internas (minhas, da equipe e concluídas).
- **Administração:** usuários, permissões, configurações (dados do escritório, modelos, integrações, segurança) e um "Painel da Sócia", que parece ser a visão gerencial da sócia do escritório.

**O que ainda não existe (só a tela com o aviso "em desenvolvimento")**

Contratos, Procurações, Cobranças e NF-e. O próprio sistema diz que esses módulos administrativos vão ficar separados da parte jurídica.

Resumindo: o produto já cobre bem o dia a dia jurídico (processos, prazos, audiências, alvarás, atendimento e IA). Os diferenciais são a consulta automática ao DataJud, o controle detalhado de alvarás e a IA aplicada a atendimentos e processos. A parte administrativa e fiscal ainda está incompleta: faltam nota fiscal, cobrança e contratos. Pela tela não deu para saber o quanto a IA entrega na prática nem se as integrações funcionam de verdade, porque não fiz nenhuma consulta nem criei nenhum registro.

Para ler as telas, passei pelo menu da sua aba e depois a deixei de volta em "Extrajudiciais".
