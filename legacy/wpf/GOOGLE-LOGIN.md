# Configuração do login Google — mantenedor

O usuário do Pingo entra por **Entrar com Google**, sem escolher ou importar JSON. Para habilitar o botão em uma distribuição, o mantenedor precisa registrar um cliente OAuth Desktop no Google e incluir a configuração na compilação uma única vez.

O código-fonte não inclui um cliente Google registrado nem autorização de nenhuma conta. Compilações sem configuração continuam funcionando localmente e informam que o login Google ainda não está habilitado. A rotina de empacotamento com `-RequireGoogleLogin` interrompe a geração quando a configuração estiver ausente.

## Registrar o aplicativo uma vez

1. Crie ou selecione seu projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Ative **Gmail API**, **Google Calendar API** e **Tasks API**.
3. Configure o Google Auth Platform, o público e a tela de consentimento. Se usar o modo de teste, inclua os e-mails autorizados como usuários de teste.
4. Configure os escopos `https://www.googleapis.com/auth/gmail.metadata`, `https://www.googleapis.com/auth/calendar.events` e `https://www.googleapis.com/auth/tasks`.
5. Crie um cliente OAuth do tipo **Aplicativo para computador / Desktop app**. O fluxo usa navegador do sistema, PKCE S256 e retorno por uma porta aleatória em `127.0.0.1`, conforme a [documentação oficial do Google](https://developers.google.com/identity/protocols/oauth2/native-app).

Projetos de teste podem exigir novo login após sete dias. A distribuição pública com escopos restritos do Gmail pode exigir verificação; uso pessoal pode se enquadrar nas exceções do Google. [Regras de publicação](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

## Gerar uma distribuição local

Guarde o JSON do cliente Desktop em **Pingo.App/GoogleOAuth.local.json**, que já está no `.gitignore`. Também é possível apontar para o JSON original em outra pasta:

```powershell
./scripts/Publish-Pingo.ps1 -GoogleOAuthFile 'C:\caminho\cliente-desktop.json' -RequireGoogleLogin
```

Ou, depois de colocar a configuração no caminho local padrão:

```powershell
./scripts/Publish-Pingo.ps1 -RequireGoogleLogin
```

O script aceita o formato `installed` do Google ou um objeto contendo `client_id` e `client_secret`. Ele valida o formato, rejeita clientes Web e arquivos com tokens de usuário e inclui somente os campos do cliente no recurso compilado do aplicativo. Não copia o JSON para a pasta publicada. Um arquivo temporário contendo apenas a configuração do cliente é removido ao terminar, inclusive em caso de erro.

O identificador e o segredo de um cliente Desktop identificam o aplicativo, não a conta do usuário. Aplicativos nativos são clientes públicos: não trate esses valores incorporados ao executável como um segredo confidencial de servidor. Não inclua tokens de acesso, refresh tokens, senhas ou credenciais de servidor no pacote. A autorização de cada usuário continua no armazenamento local protegido por DPAPI.

Depois de gerar o pacote, distribua a pasta `Pingo` com o .NET 8 Desktop Runtime disponível na máquina de destino. O usuário só precisa abrir o aplicativo e clicar em **Entrar com Google**.

## Gerar pelo GitHub Actions

1. Nas configurações do repositório, em **Secrets and variables → Actions**, adicione o secret **PINGO_GOOGLE_OAUTH_JSON**, contendo o JSON do cliente Desktop do aplicativo. Ele não deve conter tokens de usuário.
2. Em **Actions**, execute manualmente **Gerar Pingo com login Google**.
3. O fluxo testa o código, gera a distribuição com configuração integrada e publica o artefato **Pingo-Windows** para download. Se faltar a configuração, a execução falha com uma mensagem clara, sem produzir uma distribuição que prometa login funcional.

O JSON não é salvo no repositório. As distribuições locais, pastas de dados, configurações locais e imagens de teste também são ignoradas pelo Git.

## Compatibilidade e reconexão

Autorizações da versão anterior continuam sendo lidas do `google.enc`. Se o cliente OAuth integrado for o mesmo, os tokens existentes são preservados; um cliente diferente exige novo login. Desconectar remove os tokens do computador e mantém o cliente integrado disponível para entrar novamente. Nas instalações antigas, sem cliente integrado, apenas a identidade do aplicativo é preservada no armazenamento protegido para permitir novo login sem importar arquivos. Isso não revoga o acesso no Google, que pode ser removido nas configurações da conta.
