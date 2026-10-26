# AI Notch

Um notch vivo no topo da tela, para **Windows, macOS e Linux**, todo em português do Brasil. Inspirado no Nusa (Windows), reescrito do zero em Tauri 2 + React.

**[⬇️ Baixar o instalador](https://github.com/ranieryfialho/ai-notch/releases/latest)** (Windows, macOS e Linux)

Passe o mouse no notch para abrir. Ele tem:

- **Música**: o que está tocando em qualquer player, capa, controles e letra sincronizada (LRCLIB)
- **Foco**: pomodoro com pausas curtas e longas
- **Água**: meta diária, copo/garrafa e lembretes em horário configurável
- **Tarefas**: lista rápida, com as concluídas do dia
- **Prateleira**: arraste arquivos para o notch e depois arraste de volta para qualquer lugar
- **Minhas IAs**: uso do Claude Code e do Google Antigravity (janelas de 5h/7 dias, % e quando resetam), no mesmo modelo do módulo `ai-usage` do Status Monitor
- **Avisos** que aparecem por alguns segundos: troca de música, bateria, Caps Lock, internet, limite das IAs, fim do pomodoro e hora de beber água
- O **Faísca**, um mascote que muda de humor (curtindo música, dormindo de madrugada, preocupado com a IA no limite)

## Rodando em desenvolvimento

Pré-requisitos: Node 20+, Rust stable e os [pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/) do seu sistema. No Linux, instale também o `libdbus-1-dev`.

```bash
npm install
npm run app        # abre o notch com hot reload
npm run pacote     # gera os instaladores da plataforma atual
```

## Instaladores

| Sistema | Formatos |
| --- | --- |
| Windows | `.exe` (NSIS, em pt-BR) e `.msi` |
| macOS | `.dmg` universal (Intel + Apple Silicon) |
| Linux | `.deb` (Debian/Ubuntu), `.rpm` (Fedora) e `.AppImage` |

Cada sistema só gera os próprios instaladores. Para gerar todos de uma vez, use o workflow [.github/workflows/release.yml](.github/workflows/release.yml): suba a versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`, crie a tag (`git tag v0.2.0 && git push --tags`) e o GitHub Actions publica um release com os arquivos das três plataformas.

Os instaladores não são assinados digitalmente. Na primeira execução, o Windows mostra o SmartScreen ("Mais informações → Executar assim mesmo") e o macOS pede para abrir pelo clique direito → Abrir (ou em Ajustes → Privacidade e Segurança → "Abrir mesmo assim").

## Minhas IAs

Em **Configurações → Minhas IAs**:

- **Claude Code**: rode `claude setup-token` e cole o token (`sk-ant-oat01-...`). O uso vem dos headers `anthropic-ratelimit-unified-5h/7d` de uma chamada de 1 token.
- **Google Antigravity**: na primeira vez, cole o **Client ID** e o **Client Secret** de um cliente OAuth do Google seu. O app mostra o passo a passo: Google Cloud Console → tela de permissão OAuth (Externo, com seu e-mail como usuário de teste) → Credenciais → ID do cliente OAuth do tipo **App para computador**. Quem já usa o Status Monitor pode colar as mesmas credenciais de lá. Depois é só clicar em **Entrar com Google**: o app faz o login OAuth no navegador sozinho, sem o script de pareamento do Status Monitor. A cota é por modelo, e o app mostra o modelo mais perto do limite.

O AI Notch não traz nenhuma credencial do Google embutida, nem no código nem no instalador.

Os tokens ficam no cofre do sistema (Gerenciador de Credenciais do Windows, Keychain do macOS ou Secret Service/GNOME Keyring no Linux). Para adicionar outra IA, crie `src-tauri/src/ia/<nome>.rs` seguindo `claude.rs` e registre o provider em `ia/mod.rs`.

## Diferenças por plataforma

| Recurso | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Música | qualquer app (controles de mídia do sistema) | Spotify e Música (AppleScript) | qualquer player MPRIS (Spotify, navegadores, VLC…) |
| Notch sobre a barra/menu | sim | sim, cobre o notch físico | X11 sim. No Wayland o app força XWayland (`GDK_BACKEND=x11`) |
| Aviso de Caps Lock | sim | não | não |
| Transparência | sim | sim | precisa de compositor (padrão no GNOME/KDE) |

No macOS, a primeira leitura de música pede permissão de Automação para controlar o Spotify ou o Música.

## Estrutura

```
src/
  notch/          janela do notch (abas, avisos, mascote, hooks)
  config/         janela de configurações
  lib/            API dos comandos Rust, config persistida, formatação, LRC
src-tauri/src/
  notch.rs        posição/tamanho da janela, nível acima da barra de menus no macOS
  midia/          o que está tocando (win.rs, macos.rs, linux.rs)
  letras.rs       LRCLIB
  sistema.rs      bateria e Caps Lock
  prateleira.rs   abrir, revelar e ícone de arrasto
  ia/             providers de uso de IA + cofre de tokens
```
