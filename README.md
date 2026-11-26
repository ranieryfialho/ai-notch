# AI Notch

Um notch vivo na borda da tela (topo, base ou laterais), para **Windows, macOS e Linux**, todo em português do Brasil. Inspirado no Nusa (Windows), reescrito do zero em Tauri 2 + React.

**[⬇️ Baixar o instalador](https://github.com/ranieryfialho/ai-notch/releases/latest)** (Windows, macOS e Linux)

Passe o mouse no notch para abrir. Ele tem:

- **Música**: o que está tocando em qualquer player, capa, controles e letra sincronizada (LRCLIB)
- **Foco**: pomodoro com pausas curtas e longas
- **Água**: meta diária, copo/garrafa e lembretes em horário configurável
- **Tarefas**: lista rápida, com as concluídas do dia
- **Prateleira**: arraste arquivos para o notch e depois arraste de volta para qualquer lugar
- **Minhas IAs**: uso do Claude Code e do Google Antigravity (janelas de 5h/7 dias, % e quando resetam), no mesmo modelo do módulo `ai-usage` do Status Monitor
- **Avisos** que aparecem por alguns segundos: troca de música, bateria, Caps Lock, internet, limite das IAs, fim do pomodoro e hora de beber água
- O **Faísca**, um mascote que passeia pelo notch quando não há música tocando e muda de humor (feliz com a meta de água, dormindo de madrugada, preocupado com a IA no limite)
- **Ditado por voz** (o Open Whisper, agora dentro do notch): segure o atalho (Ctrl + Super; Ctrl + Option no Mac), fale e solte, e o texto é colado onde está o cursor, em qualquer app. Whisper offline no computador (o modelo é baixado no primeiro uso) ou na nuvem (OpenRouter, OpenAI, Groq), limpeza opcional com IA, histórico no notch. Se o Open Whisper já estiver configurado, as escolhas dele são trazidas. No Linux o atalho precisa do grupo `input` e a colagem do `ydotool`; no Mac, das permissões de Microfone e Acessibilidade
- **Bateria dos periféricos sem fio** na barra, no estilo do BatteryHub, com página própria no notch, nomes, limite de aviso por aparelho e aviso de bateria baixa:
  - **Linux**: pelo UPower (mouse e teclado Logitech, DualSense/Xbox, Bluetooth em geral). Texto ao lado do ícone (`🎧 72%  🖱 71%`) no GNOME, XFCE e MATE; no KDE Plasma, um ícone por aparelho com a %
  - **macOS**: acessórios Bluetooth (Magic Mouse/Keyboard/Trackpad, AirPods), com o texto ao lado do ícone na barra de menus
  - **Windows**: aparelhos Bluetooth e controles Xbox, um ícone por aparelho na área de notificação com a % desenhada. Receptores USB próprios (Logitech, headsets 2,4 GHz) ainda não

## AppImage no Linux

O AppImage usa o WebKitGTK 4.1, o GTK 3 e a biblioteca de ícone da bandeja (AppIndicator) do sistema quando eles existem, e as cópias que vêm dentro dele quando falta algum. Se o notch aparecer com rastros ou falhas, compare os dois modos (feche o app antes):

```bash
AINOTCH_DIAGNOSTICO=1 ./AI.Notch.AppImage      # mostra qual modo seria usado
AINOTCH_LIBS=embutidas ./AI.Notch.AppImage     # força as bibliotecas do AppImage
AINOTCH_LIBS=sistema ./AI.Notch.AppImage       # força as do sistema
```

## Na barra do GNOME (Linux)

Com a extensão **AI Notch na barra**, o notch vira uma pílula no painel superior, no lugar do relógio, com música, bateria, pomodoro, uso das IAs e avisos. Passe o mouse na pílula para o notch completo descer logo abaixo dela; clique para abrir o calendário do GNOME, como antes. Sem o app aberto, o relógio normal volta.

```bash
./extras/gnome-shell-extension/instalar.sh
```

No Wayland, saia e entre de novo na sessão e ative com `gnome-extensions enable ai-notch@ranieryfialho.github.io` (ou pelo app Extensões).
