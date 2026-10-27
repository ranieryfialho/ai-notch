import { ArrowLeftRight, Bell, FolderOpen, Hand, Music2, PanelTop, Sparkles, SquareMousePointer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Mascote } from '../notch/Mascote'

/** Guia de uso do notch, na seção "Como usar" das configurações. */
export function ComoUsar() {
  return (
    <div className="space-y-6">
      <MapaDoNotch />

      <Topico icone={<SquareMousePointer size={16} />} titulo="Abrir e fechar">
        <Item>
          <b>Passe o mouse</b> no notch (meio ou esquerda) para abrir o painel. Ao tirar o mouse, ele fecha sozinho. Clicar também abre.
        </Item>
        <Item>Se você estiver digitando uma tarefa, o notch não fecha no meio da digitação.</Item>
      </Topico>

      <Topico icone={<Sparkles size={16} />} titulo="Canto direito: espiada das IAs" destaque>
        <Item>
          <b>Pare o mouse na ponta direita</b> do notch recolhido (na de baixo, se ele estiver numa lateral). Abre só uma faixa fina com todas as suas contas: barra de cada janela (5h, 7d), % usada e
          quanto falta para resetar. O resto do notch não expande.
        </Item>
        <Item>
          <b>Clique na faixa</b> para abrir o painel completo direto em Minhas IAs.
        </Item>
        <Item>A espiada só existe com alguma conta conectada em Minhas IAs; sem conta, essa ponta abre o painel normalmente.</Item>
        <EspiadaExemplo />
      </Topico>

      <Topico icone={<PanelTop size={16} />} titulo="O que aparece no notch recolhido">
        <Tabela
          linhas={[
            ['Nada tocando', 'Igual à música pausada: energia à esquerda, hora à direita e o Faísca no centro (se ligado em Geral). Com ele desligado, o uso da IA aparece no centro por 4 s a cada 20 s.'],
            ['Música tocando', 'Capa à esquerda, equalizador à direita. O centro reveza a cada 4 s entre hora, linha do tempo da música e uso da IA.'],
            ['Música pausada', 'Energia à esquerda e o Faísca passeando pelo centro (anda até um canto, pisca, salta, faz pirueta, com 60 s de pausa entre cada passo), alternando com o uso da IA.'],
            ['Pomodoro rodando', 'A contagem regressiva aparece à direita, na cor do modo (foco, pausa curta, pausa longa).'],
          ]}
        />
        <div className="flex flex-wrap gap-4 pt-1 text-xs text-zinc-400">
          <Legenda cor="#4ade80">IA até 60%</Legenda>
          <Legenda cor="#fbbf24">60% a 85%</Legenda>
          <Legenda cor="#f87171">acima de 85%</Legenda>
          <span>Raio verde no anel = carregando ou na tomada</span>
        </div>
      </Topico>

      <Topico icone={<ArrowLeftRight size={16} />} titulo="Navegar no painel aberto">
        <Item>
          Use as <b>setas</b> nas laterais, clique nos <b>pontinhos</b> embaixo, ou role para os lados (trackpad, ou <b>Shift + roda</b> do mouse).
        </Item>
        <Item>Páginas: Música, Pomodoro, Lembrete de Água, Prateleira, Lista de Tarefas e Minhas IAs. A engrenagem no canto abre estas configurações.</Item>
        <Item>
          Não usa alguma? Desligue em <b>Geral → Páginas do notch</b> e ela some do carrossel.
        </Item>
      </Topico>

      <Topico icone={<Music2 size={16} />} titulo="Música">
        <Item>Funciona com o que estiver tocando no sistema (Spotify, YouTube no navegador, etc.). Quando há mais de um player, o notch segue o que está tocando.</Item>
        <Item>
          O botão de <b>aspas</b> troca a capa pela <b>letra sincronizada</b>, linha a linha (fonte: LRCLIB).
        </Item>
      </Topico>

      <Topico icone={<FolderOpen size={16} />} titulo="Prateleira de arquivos">
        <Item>
          <b>Arraste arquivos até o notch</b>: ele abre sozinho na Prateleira. Depois, <b>arraste para fora</b> para qualquer pasta ou app.
        </Item>
        <Item>Clique duplo abre o arquivo. Os botões no canto de cada item mostram na pasta ou tiram da prateleira. Nada é copiado nem movido.</Item>
      </Topico>

      <Topico icone={<Bell size={16} />} titulo="Avisos">
        <Item>
          Aparecem por alguns segundos e somem: troca de música, bateria, Caps Lock, internet, limite das IAs, fim do pomodoro e hora de beber água. Clique para
          dispensar. Escolha quais aparecem em <b>Avisos</b>.
        </Item>
      </Topico>

      <Topico icone={<Hand size={16} />} titulo="Bandeja do sistema">
        <Item>O ícone do AI Notch perto do relógio tem atalhos para Configurações, Minhas IAs, mostrar/ocultar o notch e sair.</Item>
      </Topico>
    </div>
  )
}

/** Lembrete curto da espiada, para a seção Minhas IAs. */
export function DicaEspiada() {
  return (
    <div className="mb-6 flex gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-violet-300" />
      <div className="space-y-1 text-sm text-zinc-300">
        <p>
          <b className="text-white">Sem abrir o notch:</b> o uso da conta mais perto do limite aparece no centro do notch recolhido, revezando com a hora.
        </p>
        <p>
          <b className="text-white">Detalhe de todas as contas:</b> pare o mouse na <b>ponta direita</b> do notch (de baixo, nas laterais) para abrir a espiada. Clique nela para ver tudo.
        </p>
      </div>
    </div>
  )
}

/** Desenho do notch recolhido com as três áreas e o que cada uma faz. */
function MapaDoNotch() {
  return (
    <div className="rounded-xl border border-white/5 bg-zinc-900 p-5">
      <p className="mb-4 text-xs font-medium tracking-wide text-zinc-500 uppercase">As áreas do notch</p>
      <div className="mx-auto w-full max-w-[460px]">
        <div className="relative flex h-12 items-center rounded-b-[20px] bg-black px-5 text-white">
          <div className="grid w-10 place-items-center">
            <div className="grid size-6 place-items-center rounded-full border-2 border-green-400 text-[9px] text-green-400">⚡</div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <Mascote tamanho={22} />
          </div>
          <div className="relative grid w-[86px] place-items-center self-stretch">
            <div className="absolute inset-y-1 inset-x-0 rounded-r-[16px] rounded-l-md border border-dashed border-violet-400 bg-violet-500/15" />
            <span className="relative text-sm font-bold tabular-nums">19:45</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_2fr_1.3fr] gap-3 text-center text-[11px] leading-snug">
          <Zona titulo="Esquerda">Energia ou capa da música</Zona>
          <Zona titulo="Centro">Hora, música, uso da IA e o Faísca, revezando</Zona>
          <Zona titulo="Canto direito" destaque>
            Pare o mouse aqui: espiada das IAs
          </Zona>
        </div>
      </div>
    </div>
  )
}

function EspiadaExemplo() {
  const linhas: [string, string, number, string][] = [
    ['Pessoal', 'Claude', 0.34, '1h24'],
    ['Agência', 'Antigravity', 0.71, '3h10'],
  ]
  return (
    <div className="mt-2 rounded-b-[18px] bg-black px-5 py-3">
      {linhas.map(([conta, ia, pct, reset]) => {
        const cor = pct >= 0.85 ? '#f87171' : pct >= 0.6 ? '#fbbf24' : '#4ade80'
        return (
          <div key={conta} className="flex h-6 items-center gap-2 text-[11px]">
            <Sparkles size={11} className="text-violet-300" />
            <span className="w-14 font-semibold text-white">{conta}</span>
            <span className="w-16 text-zinc-500">{ia}</span>
            <span className="text-zinc-500">5h</span>
            <div className="h-1 flex-1 rounded-full bg-zinc-800">
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: cor }} />
            </div>
            <span className="w-8 text-right font-bold" style={{ color: cor }}>
              {Math.round(pct * 100)}%
            </span>
            <span className="w-9 text-zinc-500">{reset}</span>
          </div>
        )
      })}
    </div>
  )
}

function Zona({ titulo, children, destaque }: { titulo: string; children: ReactNode; destaque?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${destaque ? 'bg-violet-500/10 text-violet-200' : 'bg-white/[0.03] text-zinc-400'}`}>
      <p className={`mb-0.5 font-semibold ${destaque ? 'text-violet-200' : 'text-zinc-200'}`}>{titulo}</p>
      {children}
    </div>
  )
}

function Topico({ icone, titulo, children, destaque }: { icone: ReactNode; titulo: string; children: ReactNode; destaque?: boolean }) {
  return (
    <section className={`rounded-xl border p-4 ${destaque ? 'border-violet-500/30 bg-violet-500/[0.04]' : 'border-white/5 bg-zinc-900'}`}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <span className={destaque ? 'text-violet-300' : 'text-zinc-400'}>{icone}</span>
        {titulo}
      </h2>
      <div className="space-y-1.5 text-sm text-zinc-400 [&_b]:font-medium [&_b]:text-zinc-100">{children}</div>
    </section>
  )
}

function Item({ children }: { children: ReactNode }) {
  return <p>{children}</p>
}

function Tabela({ linhas }: { linhas: [string, string][] }) {
  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/5">
      {linhas.map(([quando, oque]) => (
        <div key={quando} className="grid grid-cols-[130px_1fr] gap-3 px-3 py-2">
          <span className="font-medium text-zinc-200">{quando}</span>
          <span>{oque}</span>
        </div>
      ))}
    </div>
  )
}

function Legenda({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: cor }} />
      {children}
    </span>
  )
}
