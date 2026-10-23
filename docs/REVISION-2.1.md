# Revisão 2.1

## Compatibilidade e dados

As novas conversas, mensagens, rotina e metadados dos cartões usam o documento JSONB do workspace, protegido pelo mesmo bloqueio transacional por usuário e pelas revisões/operações existentes. Não requerem novas tabelas nem migração destrutiva. O histórico anterior é normalizado uma única vez como **Conversa anterior**; a persistência ocorre na próxima gravação. Campos opcionais preservam dados quando clientes anteriores enviam tarefas ou preferências sem os campos novos.

Arquivar cartões não conclui nem exclui tarefas no Google. Restaurar preserva checklist e etiquetas. Mover entre colunas pendentes e ordenar cartões não chama Google Tasks; mudar conclusão envia a alteração. `task.metadata`, `task.move`, `column.update`, `conversation.update` e `routine.update` passam pela fila offline e pela mesma API de operações.

## Contratos

- `POST /api/v1/chat`: `message`, `conversationId` e `messageId`. O último identifica uma tentativa e permite repetição sem duplicar a execução. Cada conversa serializa gerações, guarda sua resposta e usa somente seu histórico. Propostas ficam vinculadas às mensagens; aprovar com `conversationId` valida a associação.
- `GET /api/v1/calendar/range?start=…&end=…`: datas ISO com offset, até 370 dias. Expande ocorrências e reconcilia somente o intervalo consultado; o cliente salva o período para uso offline e informa quando não há cópia completa.
- `POST /api/v1/desktop-auth/start`: desafio PKCE S256 e `state`; gera uma tentativa de 10 minutos.
- `POST /api/v1/desktop-auth/authorize`: sessão web e mesma origem; gera código de retorno de uso único válido por 60 segundos.
- `POST /api/v1/desktop-auth/exchange`: `id`, `state`, `code`, `verifier`; consome a tentativa de forma atômica e cria uma sessão Better Auth. O token só sai no corpo HTTPS com `Cache-Control: no-store` e fica no cofre Windows. O protocolo `pingo://auth/callback` transporta apenas código temporário e estado. O backend limita tentativas.
- `/api/v1/mail/body` foi removido. O chat não aceita encaminhamento de corpo de e-mail. A sincronização usa somente `format=metadata`; a caixa mostra os itens do INBOX de hoje no fuso da conta, com `internalDate` e o marcador UNREAD.

## Windows e áudio

O plugin de instância única é registrado antes das demais extensões. O instalador registra o protocolo de retorno. Todas as ações de sair usam o encerramento do processo; a segunda execução foca o painel existente. `scripts/verify-desktop.ps1` verifica abertura repetida, fechamento e reabertura no runner Windows. Fechar as instâncias da versão antiga antes de atualizar evita que processos anteriores permaneçam ativos.

O fluxo antigo `/device` foi mantido para compatibilidade e agora chama a etapa de reivindicação do código exigida pelo Better Auth antes de aprovar. Mensagens reais de falha substituem o erro genérico de expiração.

Movimento reduzido segue automaticamente o sistema. Voz e ronco continuam desligados por padrão e respeitam silêncio e visibilidade. O painel desktop não reproduz o áudio do avatar. Navegadores podem exigir interação local para liberar som; abas ocultas e aplicativos encerrados não reproduzem ronco. A homologação de permissões e áudio em dispositivos reais continua necessária.
