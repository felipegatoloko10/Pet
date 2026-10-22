# Ativação do beta

## Google

1. Crie um projeto Google Cloud exclusivo e habilite Tasks API, Calendar API e Gmail API.
2. Configure a tela de consentimento em teste, com os usuários convidados autorizados. A autorização Workspace é separada do login e poderá expirar periodicamente no modo teste.
3. Crie um cliente OAuth **Web**. Cadastre os redirects `https://SEU_DOMINIO/api/auth/callback/google` e `https://SEU_DOMINIO/api/v1/google/callback`. Use os mesmos caminhos em localhost para desenvolvimento, em um cliente separado.
4. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL` e um `BETTER_AUTH_SECRET` aleatório no backend.
5. Gere `CREDENTIAL_ENCRYPTION_KEY` com 32 bytes aleatórios em base64. Guarde um backup privado: perder essa chave torna as credenciais salvas ilegíveis.
6. Autorize os convites com `npm run invite -- email`. A ferramenta limita a lista a 10 endereços e não envia e-mails.

O login pede somente identidade. “Conectar Google Workspace” pede Tasks, eventos, lista de calendários e Gmail readonly. Permissões negadas devem aparecer como indisponibilidade da integração, sem bloquear as demais áreas. O beta permanece em teste até a homologação; a distribuição pública depende das exigências de verificação do Google.

Referências: [Tasks](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks), [sincronização Calendar](https://developers.google.com/workspace/calendar/api/guides/sync), [OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

## Banco e Vercel

Projeto Neon dedicado: `Pingo` (`billowing-surf-70575883`). Branch de desenvolvimento separada da produção. Nenhuma tabela do Punk Companion foi reutilizada. Use URL pooled na aplicação e direta em migrações. Teste a migração em desenvolvimento antes da produção.

Vercel: projeto `pingo`, espaço `feh-team`, plano Hobby; raiz do projeto `apps/web`, arquivos externos da monorepo habilitados. O beta é pessoal e não comercial. Não habilite serviços pagos para contornar limites.

Para deploy local pela CLI, execute na raiz da monorepo vinculada ao projeto, preservando `rootDirectory=apps/web`. `.vercelignore` exclui ambientes privados, caches e artefatos locais.

Configure segredos por ambiente. Não reutilize a branch de desenvolvimento em produção. Não publique `.env.local` nem exportações de dados. Monitore o consumo para respeitar a cota gratuita. A conta não permite alterar o intervalo de suspensão pela API; o endpoint de produção foi observado em estado `idle` após inatividade.

## Cloudflare

Autentique `npx wrangler login` deliberadamente. Não use conta temporária para dados do produto.

```sh
npx wrangler d1 create pingo-jobs
# substitua database_id em workers/scheduler/wrangler.jsonc pelo ID retornado
npx wrangler d1 migrations apply pingo-jobs --remote --config workers/scheduler/wrangler.jsonc
npx wrangler secret put SCHEDULER_SECRET --config workers/scheduler/wrangler.jsonc
npm run deploy -w @pingo/scheduler
```

Defina `BACKEND_URL` no Worker, `SCHEDULER_URL` no backend e o mesmo `SCHEDULER_SECRET` forte em ambos. O cron roda por minuto, mas só consulta o índice D1. Trabalhos possuem lease e repetição; conteúdo de tarefas e e-mails não fica no D1.

## Push e IA

Gere um par VAPID com `web-push` e configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` válido. O usuário ativa notificações em Ajustes. No iOS, a disponibilidade depende da instalação na tela inicial e suporte do sistema.

Cada usuário escolhe OpenAI, Gemini ou Claude e informa o ID de um modelo disponível em sua conta e a própria chave. Não há chave compartilhada da aplicação. Os créditos do provedor são cobrados pelo próprio provedor.

## Liberação

Execute os cenários de [validação](VALIDATION.md), incluindo uma conta Google real, antes de convidar outras pessoas. O código compilado e os testes simulados não substituem essa homologação.
