# Estado da entrega

## Implementado

- Monorepo com Next.js 16, React/TypeScript compartilhado e desktop Tauri 2.
- Meu dia, Kanban por lista, colunas personalizadas, movimentação por arrastar ou seletor, CRUD de tarefas e agenda diária/semanal.
- Convites limitados, Better Auth, autorização de dispositivo, identidade e conexão Workspace separadas.
- Neon exclusivo, migrações Drizzle, operações idempotentes, revisões e isolamento de conta derivado da sessão.
- Google Tasks nos dois sentidos, fila persistente, reconciliação de criação incerta e tela de comparação de conflitos. Um marcador nas notas permite reconciliar criações do Tasks, que não oferece campos privados.
- Calendar incremental, reset 410 sem trocar IDs locais, ocorrências em cache de 30 dias anteriores a 90 dias futuros e canais de mudanças com renovação.
- Gmail por cabeçalhos; transformação em tarefa com link da mensagem; corpo somente mediante solicitação.
- SQLite no desktop e IndexedDB na web, gravação atômica de cache/fila e shell web offline.
- Avatar SVG com estados locais, carinho, personalização, silêncio, sono, voz/ronco opcionais, foco e pausa de animação oculta ou movimento reduzido.
- OpenAI/Gemini/Claude por chave individual criptografada, histórico de conversa, ferramentas com escopo de conta e aprovação de sugestões, exclusões e convites. Máximo de duas gerações proativas por dia.
- Lembretes locais e índice de trabalhos Cloudflare/D1. Web Push com assinatura isolada por conta e limpeza ao sair.
- Importação WPF com prévia, escolha de destinos e IDs estáveis; versão original preservada em `legacy/wpf-v1`.

## Evidências

- 36 testes unitários/simulados: domínio, Google, offline, criptografia e ferramentas de IA.
- 4 testes de navegador: painel, celular, acesso sem sessão e recarga offline com sincronização única.
- Verificação real da API com duas contas artificiais na branch de desenvolvimento Neon: sessões, isolamento, idempotência, conflitos, aprovação e propriedade das assinaturas push. As contas são removidas ao terminar.
- 50 verificações WPF legadas preservadas e passando.
- Compilação web, frontend desktop e instalador Windows pelo GitHub Actions. O fluxo de publicação é bloqueado se a verificação do código/navegador falhar.

## Ativação e homologação pendentes

O beta técnico não está liberado para uso real até completar estes passos:

1. Registrar o OAuth Web Google, habilitar as APIs, cadastrar os dois redirects e os usuários de teste e configurar as credenciais no backend. Nenhuma autorização antiga foi transferida.
2. Autenticar a conta Cloudflare para criar o D1 e publicar o Worker. O pacote foi validado por tipos e dry-run; o serviço em nuvem ainda não está ativo.
3. Executar a homologação com contas Google reais e chaves reais dos provedores. Não foram feitas chamadas de IA cobradas durante o desenvolvimento.
4. Verificar no Windows as interações nativas de bandeja, sono/retomada e sons, e testar Push em dispositivos reais com o desktop fechado.

O painel público oferece demonstração local identificada enquanto o OAuth não está configurado. Convites autorizados no banco não substituem a autorização do Google. Consulte [ativação](ACTIVATION.md) e [cenários](VALIDATION.md).

Nenhum plano pago foi ativado. O Neon e a Vercel foram confirmados nos planos gratuitos. As notificações são de melhor esforço e o beta é não comercial.
