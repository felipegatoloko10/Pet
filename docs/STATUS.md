# Estado da entrega

## Agendador em nuvem — ativo

O protocolo 2 está publicado com índice D1 por revisão, proteção contra confirmações antigas, lease e repetição, status autenticado, expansão de recorrências em segundo plano e deduplicação de push por assinatura. O horário da rotina é ancorado na última execução para que sincronizações do app aberto não o adiem. A base tem 71 testes unitários/simulados, além de 15 verificações no runtime Workers/D1 local com backend simulado.

Ativado em 23/10/2026: Worker `pingo-scheduler` em `https://pingo-scheduler.pingo-feh-38dc10.workers.dev`, D1 exclusivo `pingo-jobs`, cron por minuto e backend `pingo-gilt.vercel.app` com `SCHEDULER_URL` configurado. Uma conta convidada existente foi indexada; novas conexões e alterações publicam seus índices automaticamente. Nenhum plano pago foi ativado.

Homologação de infraestrutura em produção: em **2026-10-23 15:06:20 UTC**, o cron processou um lembrete de conta temporária, chamou o backend e criou o aviso, com uma conclusão e zero repetições. A conta de teste e seus trabalhos foram removidos. O teste não usou Google ou IA; não criou compromissos nas contas reais. A confirmação de exibição do Web Push em cada dispositivo ainda depende de sua permissão e ambiente.

## Avatar 2.2

Avatar recortado com transparência de documento e WebView, barra de conversa, 24 estados vetoriais animados, redimensionamento persistente, passagem do cursor no espaço vazio e revisão de propostas na sessão correspondente do painel. A conversa usa a API existente, com identificadores persistentes para retentar respostas incertas sem duplicar operações, sem compartilhar a fila offline do painel.

61 testes unitários/simulados e 13 testes de navegador cobrem a base e o novo avatar, incluindo isolamento do cache offline após troca de sessão. A homologação com chave real de IA continua pendente; os testes não usam créditos de provedores. Os testes nativos Windows verificam instância única, tamanho persistente e fechamento das duas janelas; transparência do compositor e passagem do cursor são conferidas quando o runner fornece desktop interativo.

## Revisão 2.1

A revisão visual `2.1.0-beta.2` traz fundo verde suave, navegação compacta, colunas pastel, cartões brancos e ações em amarelo. Agenda, conversas, ajustes e painel desktop compartilham a aparência. A revisão preserva os fluxos, contratos de API e dados da versão anterior.

Kanban inicial com ordenação, etiquetas, checklists e arquivamento; conversas separadas, rotina semanal, caixa estática de e-mails de hoje, calendário mensal/anual e retorno automático do login desktop. Detalhes e compatibilidade em [REVISION-2.1.md](REVISION-2.1.md).

## Implementado

- Monorepo com Next.js 16, React/TypeScript compartilhado e desktop Tauri 2.
- Meu dia, Kanban por lista, colunas personalizadas, movimentação por arrastar ou seletor, CRUD de tarefas e agenda diária/semanal.
- Convites limitados, Better Auth, autorização de dispositivo, identidade e conexão Workspace separadas.
- Neon exclusivo, migrações Drizzle, operações idempotentes, revisões e isolamento de conta derivado da sessão.
- Google Tasks nos dois sentidos, fila persistente, reconciliação de criação incerta e tela de comparação de conflitos. Um marcador nas notas permite reconciliar criações do Tasks, que não oferece campos privados.
- Calendar incremental, reset 410 sem trocar IDs locais, ocorrências em cache de 30 dias anteriores a 90 dias futuros e canais de mudanças com renovação.
- Gmail somente por metadados do INBOX de hoje, lidos e não lidos, sem corpo, links, transformação em tarefa ou avisos individuais.
- SQLite no desktop e IndexedDB na web, gravação atômica de cache/fila e shell web offline.
- Avatar SVG com estados locais, carinho, personalização, silêncio, sono, voz/ronco opcionais, foco e pausa de animação oculta ou movimento reduzido.
- OpenAI/Gemini/Claude por chave individual criptografada, histórico de conversa, ferramentas com escopo de conta e aprovação de sugestões, exclusões e convites. Máximo de duas gerações proativas por dia.
- Lembretes locais e índice de trabalhos Cloudflare/D1. Web Push com assinatura isolada por conta e limpeza ao sair.
- Importação WPF com prévia, escolha de destinos e IDs estáveis; versão original preservada em `legacy/wpf-v1`.

## Evidências

- 55 testes unitários/simulados: domínio, Google, offline, criptografia, rotina configurável, ferramentas de IA e expiração/repetição do retorno desktop.
- 10 testes de navegador: painel, celular, acesso sem sessão, recarga offline com sincronização única, aprovação da IA, arraste por mouse/teclado, arquivamento e conversas separadas.
- Verificação real da API com duas contas artificiais na branch de desenvolvimento Neon: sessões, isolamento, idempotência, conflitos, aprovação e propriedade das assinaturas push. As contas são removidas ao terminar.
- 50 verificações WPF legadas preservadas e passando.
- Compilação web, frontend desktop e instalador Windows pelo GitHub Actions. O fluxo de publicação é bloqueado se a verificação do código/navegador falhar.

## Ativação e homologação pendentes

O beta continua por convite. Ainda são necessários os passos abaixo para homologação completa:

1. OAuth Google configurado no projeto exclusivo `pingo-512421`, com APIs habilitadas, redirects e dois usuários de teste. Login real e primeira importação Workspace verificados na conta autorizada. Nenhum token do WPF foi transferido.
2. Autenticar a conta Cloudflare para criar o D1 e publicar o Worker. O pacote foi validado por tipos e dry-run; o serviço em nuvem ainda não está ativo.
3. Executar a homologação com contas Google reais e chaves reais dos provedores. Não foram feitas chamadas de IA cobradas durante o desenvolvimento.
4. Verificar no Windows as interações nativas de bandeja, sono/retomada e sons, e testar Push em dispositivos reais com o desktop fechado.

O painel público permite login Google por convite e oferece demonstração local separada. Cada usuário autoriza sua própria conexão Workspace. A revisão 2.1 também passou por 38 verificações reais da API em contas artificiais do Neon de desenvolvimento, incluindo PKCE, repetição de código, conversa e isolamento. Consulte [ativação](ACTIVATION.md) e [cenários](VALIDATION.md).

Nenhum plano pago foi ativado. O Neon e a Vercel foram confirmados nos planos gratuitos. As notificações são de melhor esforço e o beta é não comercial.
