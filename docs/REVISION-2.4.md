# Pingo 2.4 — quadro diário e acompanhamento

## Meu dia e colunas

O quadro reúne tarefas de hoje, pendências atrasadas e compromissos do dia no fuso da conta. Tarefas concluídas aparecem no dia da conclusão, permanecendo no histórico depois. Tarefas antigas sem data têm acesso para organização sem receber datas automaticamente. A lista Google atual fica fixa. Busca, prioridade, etiquetas e botão de arquivados continuam disponíveis.

Compromissos têm cartões próprios por ocorrência. Mover ou concluir esses cartões só muda sua organização no Pingo, sem criar tarefas no Tasks ou excluir eventos. Uma tarefa com evento vinculado aparece uma única vez.

Colunas têm nome, ordem e uma das 24 cores pastéis. A fazer, Em andamento e Concluído preservam suas funções mesmo renomeadas. Excluir Aguardando ou uma coluna personalizada exige outra coluna pendente como destino; os cartões são movidos na mesma operação.

## Datas e Google

O formulário exige data, inicialmente hoje, e oferece dia inteiro, horário único (30 minutos ajustáveis) ou início/fim. Cada tarefa datada recebe um evento gerenciado no calendário de escrita. Reservas existentes são reaproveitadas. IDs persistentes, revisão e reconciliação evitam criar outro bloco na repetição.

Título e data são sincronizados entre tarefa e evento. Uma nova data no Tasks preserva horário e duração conhecidos; mudanças na Agenda atualizam a reserva. Concluir mantém o evento com ✓ e reabrir remove a marca. A confirmação completa exige os dois serviços; erros parciais aparecem separadamente no cartão.

Excluir uma tarefa pede confirmação dos efeitos no Tasks e na Agenda. Excluir seu bloco diretamente no Google preserva a tarefa, interrompe a recriação automática e oferece a decisão de excluir também a tarefa. Criações incertas aguardam reconciliação. Conflitos nos mesmos campos exigem revisão.

Google Tasks não fornece horário pela API. O evento vinculado guarda essa informação. A camada Tarefas do Google Agenda pode exibir a tarefa além do evento; o Pingo não altera essa configuração.

Agendas de leitura e feriados são exibidas sem permissão de escrita no Pingo. Na ausência de uma agenda de feriados na conta, a fonte pública Feriados no Brasil é consultada sem inscrever a conta nela. A coluna informativa Lembretes do dia existe apenas quando houver datas especiais naquele dia. Fontes equivalentes são deduplicadas por título e data.

## E-mail e identidade

E-mails do INBOX de hoje continuam estáticos, lidos e não lidos. O botão + abre uma tarefa com assunto e metadados de origem para revisão; só a confirmação cria a tarefa. Corpo, links de abertura e contexto de e-mail para IA continuam ausentes. A cabeça vetorial do Pingo substitui a letra da marca e o favicon.

## Android

Tarefas com horário podem ter aviso antecipado, início, fim e uma única repetição após dez minutos sem resposta. Ajustes permite desligar o acompanhamento. Sem horário, a tarefa aparece no resumo, sem essas fases.

- Comecei move para Em andamento e guarda o início real, preservando o horário planejado.
- Concluir conclui localmente e envia a mesma operação usada pelo painel.
- Adiar substitui o adiamento pendente: dez minutos antes/início, quinze no fim, sem mudar a agenda.
- Alterar status abre diretamente a tarefa para escolher sua etapa.

Não há conclusão automática. Responder ao fim cancela sua repetição. Concluir, excluir ou reagendar invalida os avisos anteriores. IDs de tarefa, fase e horário reduzem duplicações entre alarme local e FCM. Avisos vencidos são descartados. Tarefas simultâneas são agrupadas.

As ações exigem desbloqueio quando necessário. SQLite versão 2 migra a fila existente sem apagar cache. Botões nativos e interface usam a mesma fila ordenada, transacional, com recibos de operações já confirmadas. Trabalho nativo envia a fila mesmo sem WebView. Offline, a confirmação do Google só aparece após o retorno dos serviços. O instante de um adiamento offline é preservado na reconexão, sem criar um novo adiamento a partir dela.

Protocolo Android 2 habilita botões apenas em clientes compatíveis. Clientes antigos continuam aceitos sem apagar campos novos. Notificações respeitam silêncio, privacidade, permissões e restrições do sistema; a entrega permanece de melhor esforço.

## Entrega e homologação

Versão 2.4.0-beta.1; certificado Android preservado. O agendador compatível é publicado antes do backend que indexa as novas fases. Instaladores Windows e Android são produzidos pelo CI. A versão 2.3 permanece na release anterior.

O titular recebeu o APK para essa homologação e confirmou em 23/10/2026 que o instalou, testou e está funcionando. Os resultados automatizados, nativos, FCM real e Google real estão em VALIDATION.md. O CI aprovou os instaladores Android e Windows.
