# Pingo — seu companheiro de rotina

Se você acabou de baixar o repositório, execute primeiro **Compilar Pingo.cmd** (requer SDK .NET 8). Depois abra **[Abrir Pingo.cmd](./Abrir%20Pingo.cmd)** com dois cliques. A versão compilada fica na pasta `Pingo`, que não é versionada.

O Pingo é um aplicativo próprio para Windows, inspirado na ideia de um pet de desktop. Ele não altera o pet do Codex e não depende do Codex para permanecer aberto.

## O que está pronto

- Pet animado, arrastável, acima das janelas, com balões de texto.
- Painel com agenda, tarefas, e-mails e histórico de avisos da sessão.
- Tarefas e compromissos locais, salvos neste computador.
- Resumo diário às **08:00**, no fuso do Windows. Se abrir depois desse horário, mostra o resumo ao iniciar. Uma vez por dia.
- Lembretes **30 minutos antes** dos compromissos, com intervalo ajustável.
- Voz opcional usando a voz instalada no Windows; balões e notificação ao lado do relógio.
- Opção **Iniciar o Pingo ao entrar no Windows**, em Ajustes. Vem desativada.
- Conexão implementada para Gmail, Google Agenda e Google Tasks; depende da configuração e autorização abaixo.

## Conectar sua conta Google

1. No Pingo, abra **Ajustes → Sua conta Google** ou a página **E-mails**.
2. Clique em **Entrar com Google**.
3. Escolha sua conta no navegador e autorize as permissões solicitadas.
4. Volte ao Pingo e confira a sincronização. Você não precisa importar arquivos nem compartilhar sua senha com o aplicativo.

Se aparecer **“O login Google ainda não foi habilitado nesta versão”**, a distribuição ainda não contém o cliente OAuth registrado do aplicativo. O mantenedor precisa preparar essa configuração uma única vez, seguindo [GOOGLE-LOGIN.md](GOOGLE-LOGIN.md), e gerar a versão com login integrado. O código publicado não inclui uma credencial Google real. Enquanto isso, as tarefas e a agenda locais continuam funcionando.

O Google pode mostrar avisos em projetos pessoais de teste e exigir novo login após sete dias. Contas corporativas podem depender da autorização do administrador. [Documentação oficial de OAuth para desktop](https://developers.google.com/identity/protocols/oauth2/native-app).

Depois da conexão:

- **Gmail:** cabeçalhos (remetente e assunto), até 50 e-mails não lidos da caixa de entrada, com a contagem total não lida da caixa de entrada. A primeira sincronização estabelece uma base e não avisa sobre mensagens antigas. As próximas consultam a conta a cada minuto; mensagens já lidas antes da consulta podem não gerar aviso. O aplicativo não lê os corpos e não envia nem exclui e-mails.
- **Google Agenda:** consulta a agenda principal nos próximos 30 dias e permite criar compromissos nela. O formulário mostra o destino antes de salvar. Horários seguem o fuso do Windows. Eventos de dia inteiro aparecem na agenda sem aviso de 30 minutos.
- **Google Tasks:** consulta listas de tarefas pendentes e permite marcá-las como concluídas. As tarefas adicionadas pelo botão **Nova tarefa local** ficam no computador. O Google informa o vencimento por dia, sem horário.
- Uma API indisponível não impede a atualização das outras. O painel informa erros e dados que precisam ser atualizados.

## Falar com o Pingo

O campo sob o pet reconhece estes comandos simples:

```
meu dia
resumo
tarefa pagar a conta de luz
agendar dentista amanhã às 15h
agendar reunião 23/10/2026 às 09:30
```

Os comandos de agenda preenchem um formulário para você revisar e salvar. Outros pedidos mostram exemplos; esta versão não tem um modelo de conversa geral conectado. Também é possível usar todos os botões do painel.

## Avisos e funcionamento

Mantenha o Pingo aberto e o computador ligado, sem suspensão. Fechar o painel mantém o pet ativo. Para sair completamente, clique com o botão direito no pet ou no ícone próximo ao relógio e escolha **Sair do Pingo**.

O aplicativo não acorda o computador. Ao retomar, verifica compromissos que ainda não começaram e estão dentro da janela de aviso. O Google Agenda também recebe um lembrete popup ao criar um evento no Google, para uso pelos próprios aplicativos Google.

Se as notificações do Windows estiverem silenciadas, os recados continuam no balão do pet e em **Avisos**. A voz é opcional e depende das vozes instaladas no Windows.

Em **Ajustes**, você pode mudar o horário do resumo, a antecedência dos lembretes, a voz, os avisos de e-mail e a inicialização com o Windows.

## Dados e autorização

As tarefas, os compromissos locais e as preferências ficam em `Pingo/data/state.json`. A autorização Google fica em `Pingo/data/google.enc`, protegida por Windows DPAPI para o usuário atual do Windows. Não copie essa autorização para outro computador ou usuário.

**Desconectar deste computador** remove a autorização local e os dados Google em memória; mantém as tarefas e compromissos locais. Para revogar também no Google, use as [conexões da sua conta Google](https://myaccount.google.com/connections).

O Pingo não inicia automaticamente até você marcar essa opção e salvar as preferências. Ao ativar, registra apenas este aplicativo no início de sessão do seu usuário Windows.

## Compilar e verificar

A máquina precisa do **.NET 8 Desktop Runtime** para executar a versão pronta e do **SDK .NET 8** para compilar. O computador em que esta versão foi criada já possui ambos. Não há pacotes externos para baixar.

```powershell
./scripts/Publish-Pingo.ps1
dotnet run --project Pingo.Tests/Pingo.Tests.csproj -c Release
& '.\Pingo\Pingo.exe' --verify-ui '.\.verification'
```

Os testes de integração usam respostas simuladas e um callback OAuth local, sem acessar sua conta. O teste visual renderiza as seis páginas e verifica tarefas, agenda local e proteção DPAPI em uma pasta de teste separada. A conexão com uma conta Google real ainda depende da autorização do usuário.
