# Pingo no desktop

O personagem é SVG articulado, com transparência real. Não há imagem de fundo, moldura ou janela colorida envolvendo o avatar. Os balões e a barra têm suas próprias superfícies; o espaço em volta fica transparente e permite passar o mouse para os programas atrás.

## Usar

- Passe o mouse sobre o personagem ou a barra para mostrar os controles.
- Arraste pelo ícone de pontinhos para mover.
- Use **+** e **−**, ou arraste o pequeno controle no canto inferior direito, para mudar o tamanho. Ele é salvo neste computador. Aumento por botão mantém o canto inferior direito ancorado e respeita o monitor, inclusive com escala de DPI.
- O botão de brilhos alterna brincadeiras. Clique no personagem para dar carinho.
- Escreva na barra inferior. Enter envia; Shift+Enter cria outra linha. Enquanto responde, o Pingo pensa; sua resposta aparece no balão, que pode ser fechado.
- A seta abre o painel. Depois de conversar pelo avatar, ela abre essa mesma sessão. Propostas de exclusão ou convites continuam exigindo revisão e confirmação no painel.
- Fechar o avatar ou o painel encerra o aplicativo completo. Minimizar mantém o avatar ativo.

## Animações

Repouso, piscar, observar, andar, pensar, falar, focar, comemorar, carinho, bocejar, dormir, acordar, espreguiçar, acenar, dançar, se limpar, curiosidade, pular, espiar, ouvir, rolar, sentar, surpresa e girar. Todas são locais e não consomem IA. O avatar respeita movimento reduzido e suspende animações quando oculto. Ronco e voz seguem as preferências da conta e permanecem desligados por padrão.

## Conta e mensagens

O login Google e a chave de IA são os mesmos do painel. Sem chave, o backend mantém seu resumo básico e informa como ativar a conversa com IA. A barra não coleta credenciais nem acessa e-mails.

O avatar guarda a identificação de sua conversa e de mensagens com resultado incerto em chaves SQLite próprias, isoladas por conta. A descoberta do cache offline fica vinculada a um hash da sessão protegida, sem salvar o token no navegador; uma nova sessão precisa validar sua conta online antes de usar esse cache. Não sobrescreve o cache nem a fila offline do painel. Reenviar uma mensagem após falha reutiliza seu identificador. Se houver um pedido anterior sem confirmação, a barra permite recuperar seu texto antes de continuar. Sair ou trocar de conta limpa a conversa exibida na janela.

As alterações entram na mesma fila de sincronização Google existente, inclusive com o painel minimizado. A resposta da IA não significa confirmação do Google; os estados e avisos da integração continuam sendo a referência.

## Verificação

Testes de navegador conferem transparência RGBA no PNG, ausência de balão vazio, envio pela barra, gestos, movimento reduzido e enquadramento em 280×360, 360×500 e 650×860. Testes com API simulada cobrem repetição segura, troca de conta e propostas sem execução automática. O teste Windows verifica instância única, redimensionamento persistente e encerramento; se houver desktop interativo, também compara o fundo no compositor e verifica a passagem/captura do mouse.

Para prévia de desenvolvimento sem conta e sem chamadas Google/IA: `npm run dev -w @pingo/desktop`, depois abra `http://127.0.0.1:1420/?pet=1`. Esse modo só é usado fora do runtime Tauri. A prévia não simula uma autorização Google.
