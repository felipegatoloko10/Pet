# Estado da entrega

## Revisão 2.4

Quadro diário, calendário vinculado por tarefa, feriados, lista fixa, colunas com 24 cores e exclusão segura, botão de e-mail para criar tarefa por metadados e marca vetorial do Pingo. No Android, acompanhamento com ações nativas, fila SQLite v2 e trabalho em segundo plano. Campos novos são preservados para clientes anteriores. Detalhes em [REVISION-2.4.md](REVISION-2.4.md).

Validação: 106 testes de domínio/backend, 18 de navegador e 15 Workers/D1 locais passaram. Instrumentação Android 16 validou Comecei/Concluir sem WebView e persistência offline, além da regressão de Keystore, SQLite e interface. O agendador compatível foi publicado na Cloudflare em 23/10/2026 antes da ativação do backend 2.4.

O APK 2.4 mantém a chave de assinatura existente. Em 23/10/2026, após receber o APK para homologação, o titular confirmou: “Testei o apk esta okay funcionando”. CI da revisão 6f9a44b passou nas etapas web/backend, Android e Windows. A release 2.3 continua recuperável.

O check-in FCM real e a ação Comecei foram confirmados de ponta a ponta no emulador, sem WebView, com envio da fila nativa ao backend de produção. A conta artificial foi removida. Na conta Google autorizada, a tarefa de homologação criou seu evento e recebeu de volta uma edição de horário feita diretamente no Google Agenda, sem duplicação. A produção está em 2.4.0-beta.1. O teste Windows nativo conferiu transparência, passagem do cursor, cor RGB preservada ao minimizar/restaurar, instância única, redimensionamento e saída das duas janelas. Também passaram 38 verificações reais de API/Neon em duas contas artificiais na branch de desenvolvimento.

## Android 2.3

Aplicativo Android nativo com Capacitor 8, interface compartilhada, login PKCE pelo navegador, SQLite por conta, sessão protegida no Keystore, FCM com coordenador único de notificações e cuidados sincronizados do pet. Firebase está configurado no projeto Pingo sem Analytics ou faturamento; Vercel usa Workload Identity Federation e uma permissão exclusiva de envio, sem chave privada Google.

Validação local: 84 testes unitários/simulados, 15 testes de interface web/desktop/móvel, 15 verificações Workers/D1, testes nativos Android de persistência, proteção de sessão, protocolo e interface em emulador Android 16. APK de produção assinado com chave própria preservada em armazenamento privado e segredos do CI. Detalhes em [ANDROID.md](ANDROID.md).

Envio FCM real confirmado em 23/10/2026: backend de produção → identidade Vercel/Google → Firebase → notificação do Android 16 sem Activity aberta. Teste opt-in com conta temporária e evento artificial, sem Google Workspace ou IA; cadastro, sessão e trabalhos dessa conta foram removidos ao terminar. Health do backend confirma versão 2.3.0-beta.1 e notificações Android habilitadas.

Conta gratuita de distribuição limitada criada no Android Developer Console com autorização do titular. Pacote `app.pingo.mobile` Registrado e certificado Verificado pelo Google. Primeiro aparelho autorizado pelo titular via código gerado no celular (1 de 20 dispositivos).

Em 23/10/2026, o titular confirmou a instalação e o teste em seu celular: uma tarefa criada no aplicativo apareceu no Google Tasks. Esse teste inicial em aparelho físico libera a pré-release 2.3.0-beta.1, com APK, instalador Windows e checksum. A versão 2.2 permanece recuperável. Notificações no telefone físico, fluxo inverso de sincronização, reinício offline e comportamento específico de bateria ainda precisam de confirmação; o teste de tarefa não comprova esses cenários.

## Agendador em nuvem — ativo

O protocolo 2 está publicado com índice D1 por revisão, proteção contra confirmações antigas, lease e repetição, status autenticado, expansão de recorrências em segundo plano e deduplicação de push por assinatura. O horário da rotina é ancorado na última execução para que sincronizações do app aberto não o adiem. A base tem 71 testes unitários/simulados, além de 15 verificações no runtime Workers/D1 local com backend simulado.

Ativado em 23/10/2026: Worker `pingo-scheduler` em `https://pingo-scheduler.pingo-feh-38dc10.workers.dev`, D1 exclusivo `pingo-jobs`, cron por minuto e backend `pingo-gilt.vercel.app` com `SCHEDULER_URL` configurado. Uma conta convidada existente foi indexada; novas conexões e alterações publicam seus índices automaticamente. Nenhum plano pago foi ativado.

Homologação de infraestrutura em produção: em **2026-10-23 15:06:20 UTC**, o cron processou um lembrete de conta temporária, chamou o backend e criou o aviso, com uma conclusão e zero repetições. A conta de teste e seus trabalhos foram removidos. O teste não usou Google ou IA; não criou compromissos nas contas reais. A confirmação de exibição do Web Push em cada dispositivo ainda depende de sua permissão e ambiente.

A rotina da conta Google conectada foi observada em **2026-10-23 15:14:22 UTC**, com conexão sem erro e sem alterações pendentes. Após uma nova sincronização do app, a próxima rotina continuou ancorada 15 minutos após essa execução. A autorização de notificações de cada dispositivo é feita pelo usuário em Ajustes.

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
2. Cloudflare e D1 já estão ativos, conforme a evidência de produção acima. Autorizar notificações em cada dispositivo e homologar a exibição real.
3. Executar a homologação com contas Google reais e chaves reais dos provedores. Não foram feitas chamadas de IA cobradas durante o desenvolvimento.
4. Verificar no Windows as interações nativas de bandeja, sono/retomada e sons, e testar Push em dispositivos reais com o desktop fechado.

O painel público permite login Google por convite e oferece demonstração local separada. Cada usuário autoriza sua própria conexão Workspace. A revisão 2.1 também passou por 38 verificações reais da API em contas artificiais do Neon de desenvolvimento, incluindo PKCE, repetição de código, conversa e isolamento. Consulte [ativação](ACTIVATION.md) e [cenários](VALIDATION.md).

Nenhum plano pago foi ativado. O Neon e a Vercel foram confirmados nos planos gratuitos. As notificações são de melhor esforço e o beta é não comercial.
