# Verificação do Pingo 2

## Revisão 2.4 — 23/10/2026

- 106 testes unitários/simulados de domínio/backend e 18 testes de navegador passaram.
- 15 verificações do agendador no runtime Workers/D1 local passaram.
- Android: migração SQLite 1 → 2 preservando fila/cache, recibos contra reintrodução de operações e ações nativas de notificação.
- Instrumentação Android 16: cinco testes passaram; um teste FCM de produção opt-in foi omitido nessa execução local. Comecei e Concluir funcionaram sem WebView, sem sessão de rede, preservando a agenda e a fila após reabrir SQLite.
- Em execução opt-in separada, o backend 2.4 enviou um check-in FCM real ao emulador sem Activity aberta. O botão Comecei alcançou a API de produção, a fila foi confirmada e o início planejado permaneceu intacto. Conta artificial, sessão, assinatura e trabalhos foram removidos ao terminar; nenhum Google Workspace ou IA foi usado nessa prova.
- Google real na conta autorizada: tarefa de homologação criou um único evento; editar o horário no Google Agenda para 18h05 atualizou a reserva do Pingo. Concluir no Pingo concluiu a tarefa no Tasks e preservou seu evento com ✓. O alias primary foi reconciliado com o identificador real da agenda para evitar registros locais duplicados.
- CI 40015358430 passou nas etapas verify, Android e Windows. O teste nativo confirmou transparência, passagem do cursor, RGB do avatar ao minimizar/restaurar, instância única e saída das duas janelas.
- 38 verificações reais API/Neon passaram com duas contas artificiais de desenvolvimento: sessões, isolamento, idempotência, conflitos e aprovação; os dados de teste foram removidos.
- O titular confirmou o APK 2.4 testado e funcionando em aparelho físico em 23/10/2026. A confirmação foi recebida após as instruções de homologação dos botões e sincronização.

Teste físico: crie uma tarefa com início e fim próximos; confirme um único cartão/evento; use Comecei com o app fechado; adie o aviso final; desligue a rede e conclua pelo aviso. Reabra, reconecte e confira o cartão concluído, Tasks concluída e evento com ✓. Teste também reagendamento e cancelamento dos avisos antigos.

## Android 2.3 — executado em 23/10/2026

- 84 testes unitários/simulados: domínio, sincronização, cuidados, login e FCM.
- 15 testes de navegador: web, avatar Windows e interface móvel.
- 15 verificações no runtime Workers/D1 local.
- Testes nativos Robolectric de notificações, isolamento e SQLite; instrumentação Android 16 de Keystore, SQLite após reabertura, protocolo e interface real do APK.
- Envio FCM real do backend de produção, autenticado por OIDC/WIF, recebido como notificação do sistema Android sem Activity aberta. Conta temporária e evento artificial exclusivos; dados de teste removidos ao terminar.
- Build de produção assinado com chave do beta; checksum publicado junto ao APK.

Teste inicial em telefone físico confirmado pelo titular em 23/10/2026: instalação e tarefa criada no aplicativo sincronizada com Google Tasks. O primeiro aparelho está autorizado no registro de distribuição limitada. Permanecem sem confirmação física o caminho inverso, notificações, permissões/bateria específicas do fabricante e reinício offline. Nenhuma chamada paga de IA nem alteração de calendário real foi feita nos testes automatizados. Consulte [ANDROID.md](ANDROID.md).

Os testes de `tests/` usam respostas Google simuladas e regras locais. Execute `npm test`, `npm run check` e `npm run build`. O CI também valida e compila o instalador Windows.

## Homologação obrigatória com Google real

- Criar no PC, confirmar no Google, conferir na web; repetir pela web e pelo Google.
- Editar, concluir, reabrir e excluir. Pendente externo mantém coluna; conclusão externa vai para Concluído; reabertura vai para A fazer.
- Desligar rede, criar e editar, reiniciar, reconectar. Conferir fila persistente e ausência de duplicações.
- Simular timeout após criação, token revogado, permissão parcial, 429, 410 no Calendar e edição concorrente.
- Conferir instâncias recorrentes, cancelamentos, eventos de dia inteiro, fim exclusivo e fusos com horário de verão.
- Entrar com duas contas e tentar acessar IDs da outra, inclusive credenciais, notificações e sugestões.
- Usar as mesmas ferramentas com OpenAI, Gemini e Claude. Confirmar que sugestões não executam, que exclusões e convites pedem aprovação e que o corpo de e-mail não autoriza ações.
- Verificar lembrete 30 minutos antes, resumo 8h, silêncio, dormir/acordar, retomada do Windows, animação oculta e movimento reduzido.
- Ativar Web Push, fechar desktop e navegador, testar disponibilidade real. Conferir deduplicação e avisos de melhor esforço.
- Pré-visualizar importação WPF, selecionar destino, repetir o arquivo e conferir ausência de duplicação. Preservar original.

Registre os resultados reais antes de autorizar os primeiros convidados. Integrações não configuradas não contam como homologadas.
