# Correção 2.4.1

## Falhas corrigidas

A resposta sanitizada da API omitia outbox/cursor. O worker Android guardava essa resposta como cache e a próxima edição tentava executar outbox.some. O backend agora devolve coleções vazias, sem expor trabalhos e cursores do servidor, e o cliente normaliza caches anteriores incompletos.

Horários equivalentes em UTC e com offset causavam alterações artificiais de revisão. A reconciliação compara instantes e a identidade do agendamento usa formato canônico. A ação de notificação aceita revisão anterior apenas para o mesmo agendamento válido; nunca sobrescreve título ou horário atual com dados antigos. Avisos de tarefas concluídas, removidas ou reagendadas são rejeitados.

O formulário apresenta o último dia inclusivo e converte para fim exclusivo na API. Alternar um compromisso de horário para dia inteiro inicializa pelo menos um dia válido.

## Android

O conteúdo customizado recolhido tem 48 dp, respeitando o limite Android 12+, com título e quatro ações. O sistema ainda controla agrupamento, privacidade e apresentação. O toque no corpo contém somente o identificador do aviso; a interface Android abre Meu dia e fecha editores eventualmente abertos.

Os botões usam Activity protegida pelo desbloqueio e a mesma fila transacional da interface. O worker pode avançar uma ação independente quando outra tarefa exige revisão; dependências da mesma tarefa permanecem em ordem. Falhas de envio geram aviso de revisão, sem afirmar confirmação Google.

SQLite v3 preserva os registros existentes e permite uma nova tentativa das ações task.checkIn anteriormente rejeitadas. Os demais erros não são descartados.

## Resposta da interface

Salvar termina após a transação local. O envio continua em segundo plano; gerações do cliente impedem que resposta antiga apague novas mudanças. A conversa aguarda explicitamente a gravação da sessão antes de chamar a IA. O backend confirma a operação local e usa after do Next.js para sincronizar Google, conservando a fila persistente como recuperação.

Diálogos bloqueiam a página enquanto abertos e preservam a posição de rolagem ao fechar. Organizar datas foi removido sem atribuir datas às tarefas antigas.

## Validação

114 testes de domínio/cliente, 21 de navegador e 12 testes unitários Android. Instrumentação Android 16 verifica ações sem WebView, persistência após reabertura e acionamento direto do botão Concluir do conteúdo recolhido. Instaladores são produzidos pelo CI. Testes de produção usam conta artificial temporária, removida ao terminar. A aprovação física desta correção é distinta da homologação da 2.4.0.
