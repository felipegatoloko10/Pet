# Pet · Pingo

Um pet para a área de trabalho do Windows que ajuda a organizar o dia: tarefas, agenda, resumo pela manhã e lembretes de compromissos.

## Funcionalidades

- Pet animado, arrastável, com balões e comandos em português.
- Painel com tarefas, agenda e histórico de avisos.
- Tarefas e compromissos locais, com persistência no computador.
- Resumo diário às 08:00 e lembretes 30 minutos antes, configuráveis.
- Voz opcional e inicialização com o Windows, ambas ativadas nos ajustes.
- Integração com cabeçalhos do Gmail, agenda principal do Google Agenda e tarefas do Google Tasks.
- Login Google por OAuth com PKCE; autorização local protegida por Windows DPAPI.

A integração Google precisa de uma credencial OAuth Desktop de um projeto próprio e da autorização da conta. As funções locais funcionam sem conectar o Google. O computador precisa estar ligado e o aplicativo aberto para emitir os avisos.

## Executar

Requer Windows e SDK .NET 8 para compilar. Não há dependências NuGet externas.

```powershell
dotnet publish Pingo.App/Pingo.App.csproj -c Release -o Pingo --self-contained false
& '.\Pingo\Pingo.exe'
```

Também é possível executar **Compilar Pingo.cmd** e depois **Abrir Pingo.cmd**. A versão compilada depende do .NET 8 Desktop Runtime.

Veja o [guia completo](LEIA-ME.md) para configurar a conta Google e os avisos.

## Comandos do pet

```text
meu dia
tarefa pagar a conta de luz
agendar dentista amanhã às 15h
agendar reunião 23/10/2026 às 09:30
```

Os comandos de agenda abrem um formulário para revisar antes de salvar. Esta versão reconhece comandos específicos; não possui um modelo de conversa geral conectado.

## Verificação

```powershell
dotnet run --project Pingo.Tests/Pingo.Tests.csproj -c Release
& '.\Pingo\Pingo.exe' --verify-ui '.\.verification'
```

Os testes cobrem horários e deduplicação de lembretes, persistência, integração Google simulada, paginação, renovação da autorização e callback OAuth. A verificação WPF gera imagens das telas e testa proteção DPAPI e operações locais. Os testes não acessam uma conta Google real.

## Estrutura

| Diretório | Conteúdo |
| --- | --- |
| `Pingo.App` | Aplicativo WPF, pet, painel e integração com Windows |
| `Pingo.Core` | Rotina, persistência, comandos e cliente Google |
| `Pingo.Tests` | Testes executáveis, sem frameworks externos |

Credenciais, tokens, dados pessoais, binários e imagens de verificação não são versionados. O Pingo é um aplicativo independente; ele não modifica o pet do Codex.
