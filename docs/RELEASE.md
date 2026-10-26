Pingo 2.5.0-beta.1 — tarefas e agenda próprias, com uso offline e Supabase.

- Quadro e agenda disponíveis sem conta em **Usar neste aparelho**.
- Conta do Pingo com **Não tem conta? Criar conta**: nome, e-mail e senha, sem convite ou Google. Cada cadastro começa vazio.
- Sincronização entre Android, web e Windows com fila persistente, revisões e proteção contra respostas de outra conta.
- Supabase PostgreSQL exclusivo, conexão TLS verificada, RLS e dados compactados para reduzir tráfego.
- Importação com prévia das cópias anteriores, exportação JSON e repetição sem duplicar ou substituir itens existentes.
- Android sem Firebase: alarmes locais, resumos básicos e busca de alterações em segundo plano quando houver internet.
- Mantidos os botões de status das notificações, silêncio, cuidados e avatar transparente.
- Removidos o acesso ao Google Tasks, Agenda e Gmail e os painéis de e-mail. IA OpenAI/Claude é opcional e precisa de conexão.

Instale sobre a versão anterior. A chave Android foi preservada; SQLite migra para v4 sem apagar cache ou fila. Não desinstale antes de conferir sua cópia de dados. Não há importação automática da conta antiga. Recuperação de senha é administrativa nesta versão, por link privado de uso único; links de recuperação nunca fazem parte dos arquivos públicos desta release.

O Neon antigo permaneceu bloqueado por cota durante a migração. O banco original e a versão 2.4.1 foram preservados; as cópias já carregadas nos dispositivos podem ser importadas. Não é declarada uma exportação integral do histórico remoto indisponível.

Rascunho para homologação da versão nova. A aprovação física da 2.4.1 não substitui o teste desta atualização. Notificações e execução em segundo plano dependem do Android e são de melhor esforço. Nenhum plano pago ativado.
