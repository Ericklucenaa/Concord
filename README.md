# Concord — Aplicativo Desktop de Comunicação por Canais (MVP)

Um aplicativo moderno, leve e completo para Windows (10/11) com chat de texto em tempo real, canais privados com controle hierárquico de permissões, salas de voz via **WebRTC Mesh** e transmissão de telas/janelas em alta fidelidade (**WebRTC Screen Sharing nativo**).

---

## 🚀 Tecnologias Utilizadas

* **Desktop Frontend**: Electron 34 + React 18 + Vite + Vanilla CSS moderno (Dark & Light themes, tipografia *Plus Jakarta Sans*).
* **Backend API & Real-time**: Node.js + Express + Socket.IO + Rate Limiting.
* **Banco de Dados**: SQLite com WAL Mode e Foreign Keys ativadas para alta performance e zero configuração externa.
* **Segurança**: Criptografia de senhas com `bcryptjs` (salt 12) e autenticação segura via `JWT` validada no servidor.
* **Comunicação em Tempo Real**:
  * **Voz**: WebRTC Audio Mesh com STUN/TURN e detecção de fala em tempo real via Web Audio API (`AnalyserNode`).
  * **Transmissão de Tela**: WebRTC Video Mesh com captura nativa do Windows via `desktopCapturer` (suporte a telas inteiras e janelas individuais, com preview em miniatura, 720p/1080p e 30/60 FPS).
* **Empacotamento**: `electron-builder` com destino Windows NSIS (`.exe`) e atalhos na Área de Trabalho e Menu Iniciar.

---

## 📁 Estrutura do Projeto

```text
/Concord
  ├── /backend
  │     ├── /database         # Arquivo SQLite persistido (concord.sqlite)
  │     ├── /src
  │     │     ├── /controllers  # Auth, Servidores, Canais, Mensagens, Convites, Membros
  │     │     ├── /db           # Conexão SQLite, schema e inicialização
  │     │     ├── /middleware   # Auth JWT, verificação de roles e permissões
  │     │     ├── /routes       # Rotas REST
  │     │     ├── /socket       # WebSocket Socket.IO (chat, presença, sinalização WebRTC)
  │     │     ├── app.js        # Express app
  │     │     └── server.js     # Inicialização do servidor HTTP e WebSocket
  │     ├── /tests            # Testes automatizados com Node Test Runner
  │     ├── .env.example
  │     └── package.json
  ├── /desktop
  │     ├── /src
  │     │     ├── /main         # Electron Main Process (desktopCapturer, IPC, janelas)
  │     │     ├── /preload      # Preload script seguro com contextBridge
  │     │     └── /renderer     # Frontend React + Vite
  │     │           ├── /components  # Chat, Voz, Stream Player, Sidebars, Modais
  │     │           ├── /context     # Auth, Socket, Server, Voice, ScreenShare
  │     │           ├── /pages       # AuthPage (Login e Cadastro)
  │     │           ├── /services    # API client
  │     │           └── /styles      # Design System CSS
  │     ├── electron-builder.yml
  │     └── package.json
  ├── /shared
  │     └── constants.js      # Constantes de Roles, Eventos de Socket e ICE Servers
  ├── package.json            # Scripts orquestradores
  └── README.md
```

---

## ⚡ Como Executar em Desenvolvimento

### 1. Pré-requisitos
* Node.js v18 ou superior instalado.
* npm instalado.

### 2. Instalação das Dependências
Na raiz do projeto:
```bash
npm run install:all
```

### 3. Iniciar o Backend
```bash
npm run start:backend
# ou em modo desenvolvimento com auto-reload:
npm run dev:backend
```
O backend rodará em `http://localhost:4000`.

### 4. Iniciar a Interface Desktop
Em outro terminal:
```bash
npm run dev:desktop
```
A janela do aplicativo Concord abrirá automaticamente.

### 5. Executar Tudo Simultaneamente
```bash
npm run dev
```

---

## 🧪 Como Rodar os Testes Automatizados

Para executar os testes do backend cobrindo autenticação, criação de canais, validação de permissões, envio de convites e integridade do banco:

```bash
npm test
```

---

## 📦 Como Gerar o Instalador Windows (.exe)

Para compilar a versão de produção e gerar o instalador executável para Windows:

```bash
npm run package:win
```

O instalador será gerado na pasta `desktop/dist-electron/` contendo o arquivo `Concord Setup 1.0.0.exe`.

---

## ✨ Funcionalidades Principais Implementadas

1. **Autenticação e Perfil**:
   * Cadastro com usuário único, e-mail único e senha segura com hash `bcrypt`.
   * Login com validação no backend, token JWT e opção "Lembrar login".
   * Troca de status em tempo real (🟢 Online, 🟡 Ausente, 🔴 Não Incomodar, ⚫ Offline).
   * Personalização de avatar e alteração de senha.

2. **Canais e Servidores Privados**:
   * Criação de servidores personalizados com canais de texto (`#`) e voz (`🔊`).
   * Controle hierárquico de cargos: `Proprietário` > `Administrador` > `Moderador` > `Membro`.

3. **Sistema de Convites**:
   * Convite direto por `@nome_do_usuario` com notificação e pop-up em tempo real.
   * Geração de código de convite de 8 caracteres para compartilhamento rápido.

4. **Chat de Texto em Tempo Real**:
   * Envio e recebimento instantâneo via WebSocket.
   * Histórico de mensagens persistido no banco SQLite.
   * Indicador visual de digitação ("Usuário está digitando...").
   * Exclusão de mensagens pelo autor ou equipe de moderação.

5. **Chat de Voz WebRTC Real**:
   * Conexão peer-to-peer de áudio com servidores STUN/TURN.
   * Detecção de fala com efeito visual dinâmico (anel verde pulsante).
   * Atalhos e botões para mutar/desmutar e desativar áudio (deafen).
   * Silenciamento forçado por administradores (`muted_by_admin`).
   * Teste de microfone com medidor de volume/decibéis em tempo real nas Configurações.

6. **Transmissão de Tela WebRTC (Prioridade Máxima)**:
   * Captura nativa de telas inteiras e janelas de programas no Windows via Electron.
   * Janela modal com miniaturas ao vivo de todas as telas e janelas abertas.
   * Transmissão em tempo real para todos os membros na sala de voz.
   * Opções de qualidade adaptativa (720p, 1080p) e taxa de quadros (30 FPS e 60 FPS).
   * Player de vídeo com modo Tela Cheia e identificador "AO VIVO".
