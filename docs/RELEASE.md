# Pingo 2.6.0-beta.1 — rotinas e ajustes mais simples

- Sininho marca os avisos presentes como visualizados ao abrir.
- Perfil com opção Sair em Android, web e Windows.
- Ajustes em caixas expansíveis, sem configurações Google, com opções avançadas recolhidas.
- Cadastro com e-mail, senha e confirmação. Requisitos visíveis: 8 caracteres, maiúscula, minúscula, número e símbolo. Contas antigas preservadas.
- Orientação contextual para ativar notificações; lembrar novamente após sete dias, com opção de não insistir.
- Tarefas repetidas diariamente, em dias da semana, dias do mês ou a cada X dias. Data final ou quantidade opcionais; pausa, retomada e edição desta/próximas ocorrências.
- Ocorrências independentes e pendências atrasadas preservadas. Dias inexistentes usam o último dia do mês.
- Menu de etapas com cores, botões grandes e suporte a teclado.

Instale por cima da versão anterior, sem desinstalar, para preservar os dados locais. APK assinado com a chave existente. A versão anterior permanece recuperável.

## Homologação no aparelho

Esta versão permanece em rascunho até testar: permissão de notificações; criar uma tarefa repetida; fechar e reabrir offline; concluir uma ocorrência pela notificação sem concluir a seguinte; sincronizar com outro dispositivo; sair e entrar novamente.

Lembretes Android conhecidos cobrem os próximos sete dias e são renovados ao abrir, sincronizar ou receber atualização em segundo plano. Restrições de bateria e encerramento forçado continuam sujeitos ao Android. Rotinas não têm integração Google.

---

Pingo 2.5.0-beta.2 — um caderninho kawaii para sua rotina.

- Visual renovado em Android, web e painel Windows: menta, rosa, lilás, amarelo e azul, contornos escuros e cartões como adesivos.
- Fonte Fredoka incorporada, sem downloads de fontes durante o uso e disponível offline.
- Quadro com atalhos para as colunas no celular, áreas maiores para toque, arraste suave e preferência de movimento reduzido respeitada.
- Novos quadros começam com A fazer em rosa, Fazendo em amarelo, Aguardando em lilás e Feito em menta. As cores e os nomes já personalizados são preservados.
- Agenda, conversas, cantinho do pet, entrada e formulários seguem o novo visual. No mês, o celular mostra a quantidade de compromissos em cada dia; tocar abre os detalhes.
- Navegação inferior em telas pequenas, campos legíveis e botão de salvar acessível durante a rolagem dos formulários.

Mantidos os recursos da versão 2.5:

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
