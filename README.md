# Concord

Aplicativo de comunicação para Windows (e web) com chat de texto em tempo real, mensagens diretas, salas de voz e transmissão de tela.

- **Web:** https://concord-3af70.web.app
- **Instalador Windows:** [Releases](https://github.com/Ericklucenaa/Concord/releases/latest)

## Funcionalidades

- Servidores com canais de texto e voz, convites por link/código ou direto para um @apelido
- Cargos (dono, admin, moderador, membro), expulsar, banir, silenciar na voz, transferir propriedade e registro de moderação
- Canais de avisos (somente leitura) e canais privados por cargo
- Mensagens com markdown (`**negrito**`, `*itálico*`, `~~riscado~~`, `||spoiler||`, `` `código` ``, blocos de código, citações), edição, respostas, reações, mensagens fixadas, menções (`@apelido`, `@everyone`) e prévia de links
- Arquivos de até 8 MB (imagens, vídeos, documentos), arrastar e soltar e colar
- Indicadores de não lidas e menções, notificações nativas, "digitando…" e busca no canal ou no servidor inteiro
- Mensagens diretas 1-a-1 e em grupo (até 10 pessoas), amigos e bloqueio
- Status (online, ausente, não perturbe, invisível) e status personalizado com emoji e expiração
- Voz em WebRTC com supressão de ruído, gate, aperte-para-falar (global no app de desktop), volume por pessoa (até 200%) e indicador de qualidade da conexão
- Transmissão de tela 720p/1080p a 30/60 FPS, com áudio do sistema opcional no Windows
- App de desktop com bandeja do sistema, iniciar com o Windows, links `concord://` e atualização automática verificada por SHA-256
- Atalhos: `Ctrl+K` (ir para…), `Ctrl+F` (buscar), `↑` (editar última mensagem), `Alt+↑/↓` (trocar de canal), `Ctrl+Shift+M` (microfone)
- **v1.2:** categorias de canais com arrastar e soltar, silenciar canal/servidor e nível de notificação por servidor, divisor "Novas mensagens" e marcar como não lida, caixa de menções com selo na barra de tarefas, cartão de perfil (bio, cor, "Jogando agora"), menus de botão direito
- **v1.2:** enquetes, mensagens de voz, GIFs (Tenor), eventos com confirmação de presença, sorteio de times, salas de voz temporárias
- **v1.2:** chamadas de voz/vídeo em DM, câmera, supressão de ruído com IA (RNNoise), reconexão automática (ICE restart), diagnóstico de chamada, teste de microfone, estatísticas e qualidade escolhida por quem assiste a transmissão
- **v1.2:** atalhos globais configuráveis, overlay nos jogos, janela que lembra tamanho/posição/monitor, envio de mensagens offline com reenvio
- **v1.2:** convites com validade e limite de usos, privacidade de DM (só amigos), verificação de e-mail, exportar dados e excluir conta (LGPD), CSP, relatórios de erro

## Arquitetura

```text
desktop/
  src/main/        Processo principal do Electron (janela, bandeja, atalho global, updater, prévia de links)
  src/preload/     Ponte segura (contextBridge) entre o Electron e a interface
  src/renderer/
    context/       Estado da aplicação (auth, servidores, DMs, presença, não lidas, voz, tela)
    services/cloud Acesso ao Firestore, separado por domínio
    components/    Interface (chat compartilhado em components/chat)
  tests/           Testes das regras de segurança e da camada de dados (emuladores do Firebase)
firestore.rules    Regras de segurança — a única barreira entre clientes e os dados
scripts/           Migração de dados e publicação de versões (credenciais de administrador)
```

Todos os dados ficam no **Firebase** (Auth + Firestore). Não existe servidor próprio: a sinalização WebRTC também passa pelo Firestore. As permissões são garantidas pelas regras em `firestore.rules`, e o cliente apenas espelha essas regras para decidir o que mostrar.

## Desenvolvimento

Requisitos: Node.js 20+ e, para os testes, Java 21+.

```bash
npm install          # instala as dependências de desktop/
npm start            # Vite + Electron
npm run dev:web      # só a versão web em http://localhost:5173
```

### Qualidade

```bash
cd desktop
npm run lint             # ESLint
npm run build            # build de produção
npm run test:unit        # testes unitários (sem emuladores)
npm run test:emulators   # regras de segurança + camada de dados nos emuladores do Firebase
```

O CI (GitHub Actions) roda lint, build e testes em todo push e PR. Em `main`, também publica a versão web no Firebase Hosting.

### TURN (opcional)

Para que voz e tela funcionem em redes restritivas (CGNAT, 4G, redes corporativas), configure um servidor TURN. Sem ele, quem está atrás desses NATs aparece com "Sem conexão"/"Conexão ruim" na chamada. Não precisa gerar outra versão do app:

```bash
# conta grátis em metered.ca (Open Relay) → copie URLs, usuário e senha do painel
node scripts/set-turn.mjs "turn:HOST:80,turn:HOST:443?transport=tcp,turns:HOST:443" USUARIO SENHA
```

Também dá para embutir no build com as variáveis de `desktop/.env.example`.

### Outras opções de build

- `VITE_TENOR_KEY` ativa o botão de GIFs; `VITE_APPCHECK_SITE_KEY` ativa o App Check na versão web (deixe em modo "monitorar" no console, porque o app de desktop não roda reCAPTCHA).
- **Staging:** crie um segundo projeto Firebase, copie `desktop/.env.staging.example` para `desktop/.env.staging` e rode `npx vite build --mode staging`.

### Operação

```bash
node scripts/backup-firestore.mjs        # cópia de todas as coleções em backups/ (rode toda semana)
node scripts/error-reports.mjs --days 7  # erros enviados pelos clientes, agrupados
```

Dados efêmeros (sinalização de voz/tela, "digitando…", soundboard) são apagados pelos próprios clientes e carregam o campo `expireAt`. Se o projeto passar para o plano Blaze, ative uma política TTL nesse campo (Console → Firestore → TTL) para limpar o que sobrar de clientes que fecharam no meio.

## Publicando

```bash
firebase deploy --only firestore          # regras e índices
cd desktop && npm run dist:win            # gera dist-electron/Concord-Setup-<versão>.exe
cd .. && node scripts/publish-release.mjs "Notas da versão"
firebase deploy --only hosting
```

`publish-release.mjs` cria o release no GitHub e grava o manifesto de atualização (com o SHA-256 do instalador) no Firestore usando as credenciais do `gcloud`. Os clientes só leem esse manifesto; as regras impedem qualquer escrita por clientes.
