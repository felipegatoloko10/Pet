# Pingo 2.4

Um pequeno companheiro para organizar tarefas, agenda e rotina. Beta não comercial por convite, com espaços individuais e até 10 convidados.

[Abrir o Pingo](https://pingo-gilt.vercel.app)

O [Android beta](docs/ANDROID.md) reúne tarefas, agenda, conversas e um espaço para cuidar do Pingo. APK assinado, login Google com retorno automático, SQLite offline e notificações FCM com lembretes locais.

A [revisão 2.4](docs/REVISION-2.4.md) reúne o quadro diário e a Agenda: tarefas de hoje e atrasadas, compromissos e feriados, eventos vinculados às tarefas, 24 cores de coluna e conversão de e-mail por metadados. No Android, as notificações oferecem Comecei, Concluir, adiamento e alteração de status, com fila offline nativa. A distribuição pública da 2.4 depende da homologação dessas ações em aparelho físico; a 2.3 permanece recuperável.

O [avatar 2.2](docs/AVATAR.md) é recortado, tem 24 estados animados, conversa pela barra abaixo do personagem e permite ajustar e guardar seu tamanho. As animações são locais e não consomem IA.

Veja as [mudanças da revisão 2.1](docs/REVISION-2.1.md): Kanban inicial, etiquetas/checklists, conversas separadas, calendário mensal/anual e login desktop sem códigos manuais. Fechar o painel ou o avatar encerra o programa; minimizar mantém a companhia.

## Aplicativos

- `apps/web`: Next.js 16, Better Auth e API `/api/v1`.
- `apps/desktop`: Tauri 2, Windows, avatar transparente e painel compartilhado.
- `apps/mobile`: Capacitor 8, Android 7+, interface incorporada e integração nativa.
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
npm run test:scheduler
```

## Windows

Para compilar localmente: Rust estável, ferramentas C++ do Visual Studio e WebView2. Defina `VITE_API_URL` em `apps/desktop/.env.local` e execute `npm run desktop -- build`. O workflow `Pingo 2 — validar e empacotar` gera um instalador NSIS nos artefatos. Tags `v2.*` preparam uma pré-release em rascunho; a publicação exige homologação em aparelho físico. O instalador do beta não possui assinatura comercial.

## Princípios

As credenciais de IA são individuais e criptografadas com AES-256-GCM e AAD por usuário/provedor. A sessão desktop fica no Gerenciador de Credenciais do Windows; o cache usa SQLite. A web usa IndexedDB separado por conta. O backend deriva a conta da sessão; não aceita um `userId` do cliente para acessar dados.

O servidor é a referência compartilhada. Alterações offline mantêm identificadores persistentes de operação. Conflitos exigem revisão. Criações com resultado incerto no Google são reconciliadas antes de qualquer repetição. Google Tasks não guarda colunas intermediárias nem horário de prazo; esses dados pertencem ao Pingo.

Gmail alimenta somente a caixa estática de e-mails de hoje, com metadados de lidos e não lidos. O corpo não é buscado nem encaminhado à IA. As conversas têm sessões separadas e consideram a rotina semanal. Pedidos claros ou concordância com um horário agendam diretamente; exclusões, convites e mudanças na rotina pedem confirmação.

As animações são locais. Som e voz começam desligados. Notificações em nuvem são de melhor esforço e dependem das cotas e permissões do dispositivo.

Quadros compartilhados, Drive, Docs, iPhone e cobrança ficam fora desta versão. A homologação em aparelho Android físico e as verificações pessoais de distribuição limitada dependem dos titulares.
