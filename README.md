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

A integração Google usa o botão **Entrar com Google**, sem importação de arquivos pelo usuário. O mantenedor configura o cliente OAuth Desktop uma única vez ao gerar a distribuição. O repositório não contém um cliente registrado: compilar sem essa configuração gera uma versão local com o login informado como pendente. Veja a [configuração para o mantenedor](GOOGLE-LOGIN.md).

As funções locais funcionam sem conectar o Google. O computador precisa estar ligado e o aplicativo aberto para emitir os avisos.

## Executar

Requer Windows e SDK .NET 8 para compilar. Não há dependências NuGet externas.

```powershell
./scripts/Publish-Pingo.ps1
& '.\Pingo\Pingo.exe'
```

Também é possível executar **Compilar Pingo.cmd** e depois **Abrir Pingo.cmd**. A versão compilada depende do .NET 8 Desktop Runtime.

Para gerar o pacote com login habilitado, configure o cliente do aplicativo e use `./scripts/Publish-Pingo.ps1 -RequireGoogleLogin`. O workflow manual **Gerar Pingo com login Google** também pode gerar o pacote a partir do secret de Actions `PINGO_GOOGLE_OAUTH_JSON`.

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
./scripts/Test-GooglePackaging.ps1
& '.\Pingo\Pingo.exe' --verify-ui '.\.verification'
```

Os testes cobrem horários e deduplicação de lembretes, persistência, integração Google simulada, paginação, renovação da autorização e callback OAuth. A verificação WPF gera imagens das telas e testa proteção DPAPI e operações locais. Os testes não acessam uma conta Google real.

O fluxo de login também é testado sem importação manual, incluindo reconexão após desconectar, compatibilidade com autorizações antigas e isolamento entre clientes OAuth diferentes.

O teste de empacotamento usa uma identidade fictícia em artefatos de verificação separados e confere que alternar para uma compilação sem Google remove o recurso anterior, inclusive em compilações incrementais.

## Estrutura

| Diretório | Conteúdo |
| --- | --- |
| `Pingo.App` | Aplicativo WPF, pet, painel e integração com Windows |
| `Pingo.Core` | Rotina, persistência, comandos e cliente Google |
| `Pingo.Tests` | Testes executáveis, sem frameworks externos |

Credenciais, tokens, dados pessoais, binários e imagens de verificação não são versionados. O Pingo é um aplicativo independente; ele não modifica o pet do Codex.
