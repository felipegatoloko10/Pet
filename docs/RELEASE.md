Pingo 2.4.1-beta.1 — correções de tarefas e notificações Android.

- Notificações com título e botões A fazer, Fazendo, Aguardar e Concluir no conteúdo recolhido. Tocar no corpo abre Meu dia. Aguardar aparece quando essa coluna existe.
- Conclusão pelo aviso tolera revisões de metadados e formatos de fuso equivalentes, sem aceitar avisos de horários antigos. Falhas de outra tarefa não bloqueiam uma ação independente.
- Corrigido “Cannot read properties of undefined (reading 'some')” após sincronização Android. Respostas do backend também protegem clientes 2.4 já instalados.
- Dia inteiro usa Último dia e converte corretamente o fim exclusivo exigido pelo Google.
- Salvamento local imediato, com envio em segundo plano, proteção contra respostas atrasadas e mensagens de erro legíveis.
- Removido Organizar datas; tarefas antigas sem data continuam acessíveis. Formulários bloqueiam a rolagem do fundo.

Instale sobre a versão anterior, sem desinstalar. O APK conserva a assinatura e migra o SQLite para v3 preservando cache e fila. Confira os arquivos SHA256SUMS. Versões 2.3 e 2.4 continuam recuperáveis.

Validação: 114 testes de domínio/cliente, 21 de navegador, 12 Android unitários e instrumentação Android 16. Também passaram 38 verificações reais API/Neon e o CI completo de Android e Windows. FCM real, Comecei e Concluir pelo conteúdo recolhido confirmaram a fila nativa na API de produção. Tarefa às 18h e compromisso de dia inteiro sincronizaram com Google. A homologação desta correção no telefone físico ainda deve ser confirmada; a confirmação anterior se referia à versão 2.4.0.

O Android controla agrupamento e apresentação final da notificação, conforme versão, fabricante e privacidade da tela bloqueada. Notificações continuam de melhor esforço. Beta gratuito por convite; nenhum serviço pago ativado.
