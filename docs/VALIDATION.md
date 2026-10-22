# Verificação do Pingo 2

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
