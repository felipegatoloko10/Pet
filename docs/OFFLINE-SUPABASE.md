# Pingo 2.5 — operação local e Supabase

## Uso

1. Escolha **Usar neste aparelho** para criar tarefas, editar a agenda e cuidar do pet sem conta.
2. Para sincronizar, use **Não tem conta? Criar conta** e informe nome, e-mail e senha. O cadastro é direto e começa vazio. No Windows/Android, o navegador retorna ao app por PKCE, state e código temporário de uso único. Não há login Google, convite ou token para copiar.
3. Nenhum dado antigo é importado automaticamente. Para recuperar uma cópia depois, use a importação em Ajustes e confira a prévia antes de confirmar. A origem fica preservada.
4. Ajustes permite exportar a cópia JSON e importar uma cópia com prévia. Identificadores são preservados; uma segunda importação não duplica nem sobrescreve itens existentes.

Para começar do zero, basta criar sua conta. O quadro e a agenda estarão vazios. Nenhuma tarefa, conversa ou compromisso da conta Google será trazido automaticamente, e a cópia antiga continuará disponível para recuperação.

O e-mail identifica a conta; não há envio nem verificação de propriedade do endereço nesta versão. Para recuperar acesso, o administrador deve confirmar a identidade do solicitante e gerar um link privado com `--recover`, válido por sete dias e de uso único. As demais sessões são encerradas depois da recuperação. A recuperação não é liberada apenas por conhecer o e-mail. Links privados antigos de primeiro acesso continuam compatíveis, mas não são necessários para o cadastro comum.

## Configuração do servidor

Use um projeto Supabase exclusivo e gratuito. A autenticação continua no Better Auth, agora com senha e cadastro direto. Supabase Auth/SMTP não é utilizado. Isso evita a restrição do remetente de testes e a necessidade de outro provedor de e-mail.

- `DATABASE_URL`: pooler de transação para o backend.
- `DATABASE_URL_UNPOOLED`: conexão direta ou pooler de sessão para migrações.
- `DATABASE_SSL_CA`: certificado PEM oficial do Supabase. A aplicação verifica a autoridade e o hostname; não desabilite a validação TLS.
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`: valores privados do backend.
- Agendador e Web Push: configuração privada existente, sem Firebase.

Execute `db:migrate`. O cadastro público usa o endpoint padrão do Better Auth, com senha protegida, validação e limite de tentativas. As tabelas públicas têm RLS e nenhum privilégio para `anon` ou `authenticated`. Somente o backend autorizado acessa essas tabelas. O segredo do banco nunca entra no bundle dos aplicativos.

Os snapshots PostgreSQL usam um envelope gzip versionado para reduzir tráfego do banco. O leitor aceita o formato anterior. Leituras comuns consultam a revisão antes de trazer o snapshot completo; uma cópia local nova não é confundida com uma revisão já recebida do servidor. Escritas e reconhecimento de operações são transacionais.

## Notificações e internet

Android usa alarmes nativos para a janela conhecida dos próximos sete dias, incluindo resumos básicos locais. O resumo consulta as conclusões mais recentes do SQLite no momento da entrega. Alterações vindas de outro dispositivo atualizam os alarmes ao abrir/retomar ou pela sincronização periódica, de melhor esforço, a partir de 15 minutos quando houver conexão. O Android pode adiar essa execução.

Notificações mantêm os botões de status, o desbloqueio para alterar dados, o silêncio e a privacidade da tela bloqueada. A fila de ações é a mesma da interface. Contas locais não aguardam um servidor para concluir. Uma sessão expirada não descarta nem bloqueia permanentemente a fila.

Web recebe os avisos em superfícies abertas e, mediante permissão, por Web Push. O avatar Windows usa sua cópia local e preserva as cores e preferências mesmo sem sessão de nuvem. A IA online é opcional; animações, cuidados, tarefas e agenda não precisam dela.

## Dados da versão Google

A mudança não exclui itens ou revoga permissões na conta Google. As integrações ficam indisponíveis na API nova. As cópias já carregadas nos aparelhos são preservadas para importação. Credenciais Google não são copiadas para o Supabase.

Em 26/10/2026, a leitura do Neon de origem estava bloqueada pela cota de transferência. Portanto, não foi possível afirmar uma exportação integral do histórico do servidor. O banco de origem e a versão 2.4.1 foram preservados. Não remova caches antigos antes de conferir a importação. A recuperação posterior do histórico deve mesclar dados por identificador, mantendo as edições feitas na versão nova.

## Validação administrativa

`scripts/verify-offline-backend.ts` exige projeto Pingo, servidor local e `PINGO_VERIFY_SYNTHETIC=yes`. Usa contas temporárias em domínio inválido, sem e-mails ou serviços Google, e limpa somente seus próprios registros. Valida senha, convites, recuperação, isolamento, repetição de operações, compressão, PKCE e bloqueio dos papéis públicos.

As credenciais, senhas e links de convite ficam em arquivos privados ignorados pelo Git e protegidos no sistema. Nenhum serviço pago é ativado pelo processo de build ou pela migração.
