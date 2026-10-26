# Pingo 2.5.0-beta.1 — validação

Os instaladores são gerados pelo [workflow de validação](https://github.com/felipegatoloko10/Pet/actions/workflows/pingo-2.yml), a partir da revisão indicada na release.

## Verificado automaticamente

- TypeScript, builds web/desktop/mobile e verificação do Worker.
- 127 testes de unidade; regressões de navegador e cenário de cadastro direto sem importar o espaço local.
- Agendador validado no runtime local Workers/D1.
- 16 testes Android aprovados, incluindo migração SQLite, ações locais e proteção contra respostas de outra conta.
- APK de produção com a mesma assinatura Android da versão anterior. Certificado SHA-256: `e11438b55109a11848e5797a36831df2c57e370edb21ecd486bd40e01a9d2362`.

## Backend e operação

Foram aprovadas 39 verificações do roteiro `scripts/verify-offline-backend.ts` contra o novo PostgreSQL do Supabase usando contas temporárias: cadastro sem convite, e-mail/senha, recuperação protegida, isolamento, repetição de operações, compressão, sessão nativa por PKCE e bloqueio dos papéis públicos. As contas de teste foram removidas; não foram criadas senhas em nome dos usuários.

A leitura autenticada do backend de produção foi validada com uma conta temporária e a API pública de saúde confirmou a versão 2.5.0-beta.1. O projeto Supabase é exclusivo do Pingo e não usa Supabase Auth ou SMTP. Nenhum serviço pago foi ativado.

Foi preservada uma cópia privada do cache disponível no navegador antes da troca de conta. Sua importação foi validada sem alterar o original. O cadastro próprio começa vazio; não há oferta automática de importação. A cópia dos dados anteriores fica disponível em Ajustes, com prévia e confirmação explícita.

## Homologação pendente

A atualização 2.5 ainda precisa ser instalada e testada em aparelho físico com uma conta própria: entrar, criar offline, reiniciar, reconectar, sincronizar entre dispositivos e usar os botões das notificações. A aprovação anterior da 2.4.1 não cobre essa mudança. A release permanece em rascunho até essa homologação.

O histórico integral do Neon antigo não foi exportado porque a origem está bloqueada por cota. A referência `legacy/pre-supabase-2026-10-26`, a release 2.4.1 e os dados originais foram preservados. O início com uma conta vazia não apaga esses arquivos de recuperação.
