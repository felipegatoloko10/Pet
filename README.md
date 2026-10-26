# Pingo 2.5 — seu dia, mesmo sem internet

Companheiro pessoal para tarefas, agenda, rotina e pequenos cuidados. Beta gratuito, com espaços individuais.

[Abrir o Pingo](https://pingo-gilt.vercel.app) · [Android](docs/ANDROID.md) · [Migração para Supabase](docs/OFFLINE-SUPABASE.md)

**Usar neste aparelho** abre um quadro e uma agenda reais, sem conta e sem internet. Dados são guardados no SQLite do Android/Windows e no IndexedDB da web. Uma conta do Pingo, por e-mail e senha, permite sincronizar os dispositivos quando houver conexão. Selecione **Não tem conta? Criar conta**, preencha nome, e-mail e senha e comece com um espaço vazio, sem convite ou autorização Google.

A versão 2.5 não consulta Google Tasks, Agenda ou Gmail e não usa Firebase para notificações. Tarefas e horários pertencem ao Pingo. O avatar permanece transparente, com animações e cuidados locais. Conversa com IA é opcional e necessita de internet e uma chave OpenAI ou Claude.

## Aplicativos

- `apps/web`: Next.js 16, Better Auth e API `/api/v1`, hospedados na Vercel.
- `apps/desktop`: Tauri 2, avatar transparente e painel no Windows.
- `apps/mobile`: Capacitor 8, Android 7+, interface incorporada, SQLite e alarmes nativos.
- `packages/core` e `packages/ui`: contratos, Kanban, agenda, rotina, animações e fila offline compartilhados.
- Supabase PostgreSQL: banco exclusivo do Pingo, com Drizzle, validação TLS e tabelas fechadas aos papéis públicos.
- `workers/scheduler`: Cloudflare cron/D1 para avisos web, sem consultar o banco em minutos vazios.
- `legacy`: versões anteriores recuperáveis. Os módulos antigos de integração têm somente testes históricos e não são chamados pela API atual.

## Desenvolvimento

Node 24 e npm. Copie `.env.example` para `apps/web/.env.local`; valores privados ficam fora do Git.

```sh
npm ci
npm run db:migrate
npm run dev
```

O cadastro comum não exige aprovação do administrador. A recuperação de senha continua administrativa, por link privado de uso único gerado com `scripts/create-invite-link.ts --recover`, após confirmar quem está pedindo. Não há envio de e-mails nesta versão. Consulte a [ativação e a migração](docs/OFFLINE-SUPABASE.md).

```sh
npm run check
npm test
npm run build
npm run mobile:build
npm run test:browser
npm run check -w @pingo/scheduler
npm run test:scheduler
```

## Dados e distribuição

O salvamento local é imediato. A conta sincroniza operações com identificadores persistentes e revisões; conflitos não sobrescrevem alterações silenciosamente. Exportação e importação em Ajustes preservam a cópia original e não substituem edições mais recentes ao repetir uma importação.

Sessões nativas permanecem no armazenamento protegido do sistema. O backend deriva a conta da sessão e confere a identidade esperada pelo aparelho. Chaves de IA são criptografadas no servidor. A API não oferece acesso direto ao banco pelo navegador.

Instale as atualizações sobre a versão anterior, sem desinstalar. O APK mantém a chave de assinatura; Windows usa instalador NSIS. O workflow gera instaladores e uma pré-release em rascunho. Novas versões passam por homologação antes da publicação. A [2.4.1](https://github.com/felipegatoloko10/Pet/releases/tag/v2.4.1-beta.1) e o protótipo WPF permanecem recuperáveis.

Internet é necessária para primeiro download do site, login, sincronização e IA. Alarmes conhecidos funcionam localmente; restrições de bateria e encerramento forçado podem atrasá-los. Quadros compartilhados, iPhone e cobrança ficam fora deste beta.
