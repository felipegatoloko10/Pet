> Atualização 2.5: consulte [operação offline e Supabase](OFFLINE-SUPABASE.md). O conteúdo abaixo documenta a entrega anterior com Google.

# Ativação do beta

## Google

O ambiente publicado já usa o projeto exclusivo **Pingo** (`pingo-512421`), em teste, com os dois convidados autorizados. As credenciais foram configuradas apenas no backend. Os passos abaixo documentam a configuração para outros ambientes.

1. Crie um projeto Google Cloud exclusivo e habilite Tasks API, Calendar API e Gmail API.
2. Configure a tela de consentimento em teste, com os usuários convidados autorizados. A autorização Workspace é separada do login e poderá expirar periodicamente no modo teste.
3. Crie um cliente OAuth **Web**. Cadastre os redirects `https://SEU_DOMINIO/api/auth/callback/google` e `https://SEU_DOMINIO/api/v1/google/callback`. Use os mesmos caminhos em localhost para desenvolvimento, em um cliente separado.
4. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL` e um `BETTER_AUTH_SECRET` aleatório no backend.

Neste ambiente, a URL pública é `https://pingo-gilt.vercel.app`. Cadastre `https://pingo-gilt.vercel.app/api/auth/callback/google` e `https://pingo-gilt.vercel.app/api/v1/google/callback`. O alias automático de equipe exige autenticação Vercel e não deve ser usado pelo aplicativo.
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

O ambiente atual está publicado: Worker `pingo-scheduler`, D1 `pingo-jobs`, endpoint `https://pingo-scheduler.pingo-feh-38dc10.workers.dev`. O cron por minuto foi observado processando um lembrete real de teste em 23/10/2026. O backend já possui as duas variáveis privadas necessárias. Os comandos abaixo documentam a configuração e manutenção; não criam uma segunda infraestrutura neste ambiente.

Autentique `npx wrangler login` deliberadamente. Não use conta temporária para dados do produto.

```sh
npx wrangler d1 create pingo-jobs
# substitua database_id em workers/scheduler/wrangler.jsonc pelo ID retornado
npx wrangler d1 migrations apply pingo-jobs --remote --config workers/scheduler/wrangler.jsonc
npx wrangler secret put SCHEDULER_SECRET --config workers/scheduler/wrangler.jsonc
npm run deploy -w @pingo/scheduler
```

Defina `BACKEND_URL` no Worker, `SCHEDULER_URL` no backend e o mesmo `SCHEDULER_SECRET` forte (32 caracteres ou mais) em ambos. Preserve o segredo já configurado na Vercel se houver cópia privada; caso contrário, substitua apenas esse segredo em ambos os serviços. Nunca coloque seu valor na linha de comando, no Git ou em logs. Reimplante o backend depois de alterar suas variáveis.

O protocolo privado do agendador é a versão 2. Publique este backend e este Worker juntos. A migração `0002_index_versions.sql` adiciona proteção contra índices antigos e um registro mínimo da última execução. `/health` é público e não consulta o banco; `/status` exige o segredo e retorna apenas contagens e a última execução. O cron roda por minuto e usa apenas D1 em minutos vazios. O backend republica o índice canônico antes de confirmar um trabalho; uma execução antiga não pode apagar nem adiar um índice substituído.

Depois de ativar, publique os índices das contas já existentes usando o backend e suas contas autenticadas (o botão de sincronização faz isso), ou uma ferramenta administrativa restrita às contas do beta. Verifique o avanço de `lastRun.last_run_at` e processe um lembrete de teste antes de considerar a infraestrutura ativa. Autorização do Google e permissão de notificações continuam necessárias.

Para as contas existentes deste ambiente, `npx tsx scripts/bootstrap-scheduler.ts CAMINHO_PRIVADO` usa a conexão privada de produção e publica somente os índices de usuários convidados que já possuem um espaço. O arquivo informado contém apenas `SCHEDULER_URL` e `SCHEDULER_SECRET`. A ferramenta não grava no Neon e não chama Google ou IA. Novas conexões Google e alterações no app publicam seus índices automaticamente.

O backend atualiza as ocorrências recorrentes das próximas 48 horas durante a rotina; os lembretes revalidam o horário e ignoram compromissos alterados ou excluídos. Push usa um registro privado de tentativas por assinatura, evitando repetir entregas já confirmadas. Não reproduz avisos com mais de 30 minutos quando o serviço é ativado. Conteúdo de tarefas e e-mails não fica no D1.

Validação local, sem conta Cloudflare ou chamadas Google/IA: `npm run test:scheduler`. O teste usa Workers/D1 locais e backend simulado, incluindo revisão antiga, substituição durante execução, repetição após falha e minuto vazio. Os arquivos de teste ficam em `.verification/`, nunca em recursos remotos. Isso não comprova a ativação do cron em produção.

## Push e IA

Gere um par VAPID com `web-push` e configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` válido. O usuário ativa notificações em Ajustes. No iOS, a disponibilidade depende da instalação na tela inicial e suporte do sistema.

Cada usuário escolhe OpenAI, Gemini ou Claude e informa o ID de um modelo disponível em sua conta e a própria chave. Não há chave compartilhada da aplicação. Os créditos do provedor são cobrados pelo próprio provedor.

## Liberação

Execute os cenários de [validação](VALIDATION.md), incluindo uma conta Google real, antes de convidar outras pessoas. O código compilado e os testes simulados não substituem essa homologação.
