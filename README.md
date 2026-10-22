# Pingo 2.0

Um pequeno companheiro para organizar tarefas, agenda e rotina. Beta não comercial por convite, com espaços individuais e até 10 convidados.

## Aplicativos

- `apps/web`: Next.js 16, Better Auth e API `/api/v1`.
- `apps/desktop`: Tauri 2, Windows, avatar transparente e painel compartilhado.
- `packages/core`: contratos, revisões, Kanban, reconciliação e rotina.
- `packages/ui`: React, painel responsivo, pet SVG animado e cache offline.
- `workers/scheduler`: cron Cloudflare + índice D1, sem consultar Neon em minutos vazios.
- `drizzle`: migrações PostgreSQL. Projeto Neon exclusivo do Pingo.
- `legacy/wpf`: protótipo original preservado; referência Git `legacy/wpf-v1`.

## Rodar

Node 24 e npm. Instale com `npm ci`. Copie `.env.example` para `apps/web/.env.local` e configure as variáveis necessárias. Nunca adicione credenciais ao Git.

```sh
npm run db:migrate
npm run invite -- pessoa@gmail.com
npm run dev
```

O painel oferece uma demonstração local identificada, sem autenticação ou acesso ao Google. Dados reais exigem convite, OAuth e nova autorização Workspace. Veja o [estado da entrega](docs/STATUS.md), a [ativação](docs/ACTIVATION.md) e a [validação](docs/VALIDATION.md).

```sh
npm run check
npm test
npm run build
npm run check -w @pingo/scheduler
```

## Windows

Para compilar localmente: Rust estável, ferramentas C++ do Visual Studio e WebView2. Defina `VITE_API_URL` em `apps/desktop/.env.local` e execute `npm run desktop -- build`. O workflow `Pingo 2 — validar e empacotar` gera um instalador NSIS nos artefatos. Tags `v2.*` publicam uma pré-release com o instalador. O instalador do beta não possui assinatura comercial.

## Princípios

As credenciais de IA são individuais e criptografadas com AES-256-GCM e AAD por usuário/provedor. A sessão desktop fica no Gerenciador de Credenciais do Windows; o cache usa SQLite. A web usa IndexedDB separado por conta. O backend deriva a conta da sessão; não aceita um `userId` do cliente para acessar dados.

O servidor é a referência compartilhada. Alterações offline mantêm identificadores persistentes de operação. Conflitos exigem revisão. Criações com resultado incerto no Google são reconciliadas antes de qualquer repetição. Google Tasks não guarda colunas intermediárias nem horário de prazo; esses dados pertencem ao Pingo.

Gmail é consultado por cabeçalhos; o corpo só é lido ou enviado à IA quando solicitado. O produto não envia e-mails. Exclusões, convites e sugestões da IA pedem confirmação.

As animações são locais. Som e voz começam desligados. Notificações em nuvem são de melhor esforço e dependem das cotas e permissões do dispositivo.

Não há aplicativo móvel nativo, quadros compartilhados, Drive, Docs ou cobrança nesta versão. As integrações reais precisam de homologação Google antes de abrir o beta a convidados.
