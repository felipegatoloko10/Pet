# Pingo Android 2.5 beta

Aplicativo `app.pingo.mobile`, Android 7 ou superior. Instale o APK sobre a versão anterior, sem desinstalar. A chave de assinatura é a mesma e a migração SQLite v4 preserva cache e fila.

## Entrar e usar

**Usar neste aparelho** oferece tarefas, agenda e cuidados sem conta. Para compartilhar seus dados entre Android, web e Windows, abra seu convite privado de primeiro acesso, escolha uma senha e use **Entrar para sincronizar** no aplicativo. O navegador retorna automaticamente ao Pingo, sem copiar tokens. O e-mail é o identificador da conta; não há autorização Google.

O Android Keystore protege a sessão e a tentativa de login. A fila SQLite é separada por conta e persiste as alterações junto da cópia otimista. Uma resposta atrasada de outra conta ou de uma sincronização anterior não pode substituir mudanças locais mais recentes.

## Avisos

Ative as notificações em Ajustes e aceite a permissão do Android. Alarmes locais cobrem os próximos sete dias conhecidos. Tarefas com horário oferecem botões de status, começo, fim e adiamento. O resumo diário básico funciona sem IA. O app não usa Firebase/FCM.

A sincronização periódica do Android procura mudanças com conexão disponível a partir de 15 minutos, conforme permissões e limitações do sistema. Ela atualiza dados e alarmes sem a interface aberta. Alterações feitas em outro aparelho ainda precisam chegar ao celular para atualizar seus avisos. Sem internet, os alarmes já conhecidos continuam funcionando.

Sair cancela avisos e remove a sessão; a cópia local e a fila ficam preservadas. A permissão para maior precisão é opcional. Silêncio, privacidade e bloqueio de tela continuam sendo respeitados. Encerramento forçado e economia de bateria podem atrasar trabalho e notificações.

## Compilar

Node 24, JDK 21 e Android SDK. Use `npm run mobile:build`, depois Gradle `:app:assembleRelease`. A assinatura vem das variáveis privadas de CI. Não publique o keystore, as senhas ou arquivos de convite. O pipeline não precisa mais de `google-services.json`.

Consulte [o guia de migração](OFFLINE-SUPABASE.md) antes de remover dados da versão anterior. A distribuição Android limitada existente permanece válida porque o identificador do aplicativo e o certificado foram preservados. A versão 2.4.1 permanece recuperável.
