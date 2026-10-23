# Pingo Android 2.4 beta

Aplicativo `app.pingo.mobile`, Android 7 (API 24) ou superior. A interface React fica incorporada ao APK com Capacitor 8; o app utiliza as mesmas contas, dados e API do site e do Windows.

## Instalar e entrar

1. Baixe o APK Android e o arquivo `SHA256SUMS-Android.txt` na pré-release do repositório Pet. Confira o checksum antes de instalar.
2. Autorize a instalação pelo navegador/gerenciador de arquivos quando o Android solicitar. Instale sem remover a versão anterior para preservar os dados locais.
3. Toque em **Entrar com Google**. Conclua no navegador e aceite voltar ao Pingo. Não é necessário copiar tokens. O beta mantém os dois convites existentes.
4. Uma conexão Workspace já autorizada aparece no celular. Caso necessário, conecte-a em Ajustes com a mesma conta usada no app.
5. Em Ajustes, ative notificações e conceda a permissão do Android. O sistema pode limitar entregas quando o app é encerrado à força ou restringido por economia de bateria.

O avatar vive na aba Pingo, dentro do aplicativo. As abas Meu dia, Agenda, Conversas e Ajustes reutilizam os recursos compartilhados. Carinho, alimentação, brincadeira e cochilo são locais, sem chamadas de IA. Os cuidados são sincronizados por conta e não bloqueiam tarefas.

## Sessão e dados offline

Login pelo navegador do sistema com PKCE, state, tentativa persistida criptografada e código temporário de uso único. O retorno `app.pingo.mobile://auth/callback` nunca contém tokens de sessão. O Android Keystore protege a chave usada para criptografar sessão, tentativa de login e identificador da instalação.

SQLite nativo separa o cache por conta. O snapshot otimista e sua fila são gravados juntos em uma transação. Retomar, recuperar a conexão e usar o app acionam sincronização. Agenda fora do cache e conversa com IA precisam de internet. Sair cancela lembretes, remove a sessão e solicita a desvinculação do dispositivo; a fila pendente recebe uma confirmação antes de descarte.

## Notificações

Firebase Messaging recebe mensagens de dados. Um coordenador Android único trata alarmes locais e FCM com identificação comum, validação de conta, prazo de validade e registro persistente de entrega. Lembretes conhecidos dos próximos sete dias são programados localmente e restaurados após reinício ou mudança de horário. Alarmes são inexatos por padrão; Ajustes permite abrir a autorização de maior precisão quando disponível.

Vercel usa OIDC e Workload Identity Federation no Google: somente o projeto Pingo em produção na equipe configurada pode assumir a conta de serviço. A permissão é exclusivamente `cloudmessaging.messages.create`. Não há chave privada Google no backend. `FIREBASE_FEDERATION_CONFIG` contém projeto, conta de serviço e audience do provedor WIF. Firebase não hospeda autenticação nem dados do Pingo, e Analytics permanece desligado.

Título e antecedência aparecem no lembrete, sem descrições, e-mails ou conversas. Há opção de ocultar detalhes na tela bloqueada. A entrega é de melhor esforço. Uma edição em outro dispositivo só atualiza o alarme local quando chega ao celular.

Na 2.4, tarefas com horário oferecem **Comecei**, **Concluir**, **Lembrar em 10/15 min** e **Alterar status**. São ações locais sem IA e sem conclusão automática. Ações offline ficam na mesma fila SQLite da interface, enviadas pelo trabalho nativo. Ajustes permite desligar o acompanhamento. A migração preserva cache e operações anteriores. Consulte [o comportamento detalhado](REVISION-2.4.md).

Antes de publicar a pré-release 2.4, é necessário instalar seu APK assinado sobre a 2.3 e homologar esses botões em aparelho físico, incluindo ação sem internet e confirmação em Tasks e Agenda. Emulador não substitui esse teste.

## Compilar

Node 24, JDK 21 e Android SDK 36:

```sh
npm ci
npm run mobile:build
cd apps/mobile/android
./gradlew :app:assembleDebug :app:testDebugUnitTest
```

Para FCM, forneça o `google-services.json` do registro Android do projeto Pingo em `apps/mobile/android/app/`. O arquivo fica fora do Git. Sem ele, a demonstração e demais funções locais compilam; notificações FCM não funcionam.

O script `scripts/android-signing.ts` cria/preserva o keystore e configura os segredos GitHub por stdin. A cópia local fica em `.verification/android-private`, com acesso restrito no Windows. Preserve esse backup: a mesma chave é necessária para atualizações sem reinstalação. Nunca publique o keystore nem suas senhas. O workflow compila e assina o APK somente em main/tags autorizadas, publica checksum e agrega os instaladores Android/Windows nas tags `v2.*`.

## Homologação e distribuição

Testes simulados cobrem cuidados, passagem de tempo, sono, preservação de campos antigos, PKCE, callbacks e envio FCM. Testes de interface cobrem navegação móvel, edição, calendário, conversa e persistência. Testes Android nativos cobrem Keystore, SQLite, retorno por protocolo, deduplicação e isolamento das notificações. O teste FCM de produção é opt-in e usa uma conta temporária exclusiva, removida depois.

A conta gratuita Pingo, para até 20 aparelhos, foi criada em 23/10/2026. O pacote `app.pingo.mobile` está Registrado no Android Developer Console e seu certificado está Verificado pelo Google. Impressão SHA-256 do certificado do beta: `E1:14:38:B5:51:09:A1:18:48:E5:79:7A:36:83:1D:F2:C5:7E:37:0E:DB:21:EC:D4:86:BD:40:E0:1A:9D:23:62`.

O titular confirmou em 23/10/2026 a instalação no celular e a sincronização de uma tarefa criada no app para o Google Tasks. O APK está disponível na pré-release 2.3.0-beta.1. Notificações no telefone físico, sincronização inversa, reinício offline e restrições de bateria ainda precisam de confirmação.

A autorização de cada dispositivo depende dos titulares. No Android Developer Console, abra Dispositivos, adicione o aparelho e siga o vínculo/código no próprio celular. A assinatura do APK não substitui essa autorização. O primeiro aparelho já foi autorizado; aparelhos adicionais precisam do próprio vínculo. Não há publicação na Play Store nesta entrega. iPhone, avatar flutuante e widgets ficam para outra etapa.
