import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { ArrowBigUp, BatteryCharging, BatteryFull, BatteryLow, Droplet, Music2, Settings, Sparkles, Timer, Wifi, WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { usePersistido, useConfig, type PaginaNotch } from '../lib/config'
import { corUso, duracaoCompacta, mmss } from '../lib/formato'
import { Agua } from './abas/Agua'
import { COR_MODO, Foco } from './abas/Foco'
import { IAs } from './abas/IAs'
import { Musica } from './abas/Musica'
import { Prateleira } from './abas/Prateleira'
import { Tarefas } from './abas/Tarefas'
import { notificarSistema, useAvisos, type Aviso, type IconeAviso } from './avisos'
import { Mascote, MascoteFiruleiro, type Humor } from './Mascote'
import { AnelBateria, dataCurta, horaCurta, MOLA, Pontos, SetaNav, Titulo } from './ui'
import { useAgua } from './useAgua'
import { NA_TOMADA, useBateria } from './useBateria'
import { useJanelaNotch } from './useJanelaNotch'
import { posicaoAgora, useMidia, useTique } from './useMidia'
import { ROTULO_MODO, usePomodoro } from './usePomodoro'
import { piorUso, useUsoIA, type UsoConta } from './useUsoIA'

type Pagina = PaginaNotch

const PAGINAS: { id: Pagina; titulo: [string, string?, string?] }[] = [
  { id: 'musica', titulo: [''] },
  { id: 'foco', titulo: ['Pomodoro'] },
  { id: 'agua', titulo: ['Lembrete de ', 'Água', '#3b9cf6'] },
  { id: 'prateleira', titulo: ['Prateleira'] },
  { id: 'tarefas', titulo: ['Lista de ', 'Tarefas', '#4ade80'] },
  { id: 'ias', titulo: ['Minhas ', 'IAs', '#a78bfa'] },
]

const TAMANHO = {
  recolhido: { l: 210, a: 30 },
  minimo: { l: 150, a: 8 },
  aviso: { l: 360, a: 58 },
  aberto: { l: 540, a: 172 },
}

/** Faixa da espiada das IAs: altura cresce com o número de contas (até 4). */
const espiadaTamanho = (contas: number) => ({ l: 470, a: 14 + Math.min(4, Math.max(1, contas)) * 24 })

/** Largura (px) do canto direito do notch recolhido que abre a espiada das IAs. */
const ZONA_ESPIADA = 56

/** Curva côncava nos cantos de cima, como o notch se fundindo na borda da tela. */
const ORELHA = 10

const variantesPagina = {
  entrar: (dir: number) => ({ x: dir * 70, opacity: 0, filter: 'blur(6px)', scale: 0.96 }),
  centro: { x: 0, opacity: 1, filter: 'blur(0px)', scale: 1 },
  sair: (dir: number) => ({ x: dir * -70, opacity: 0, filter: 'blur(6px)', scale: 0.96 }),
}

export function Notch() {
  const [config, atualizarConfig] = useConfig()
  const [aberto, setAberto] = useState(false)
  const [espiada, setEspiada] = useState(false)
  const zonaHover = useRef<'geral' | 'ia' | null>(null)
  // Guarda a página pelo id: ligar/desligar abas nas configurações muda as posições.
  const [[paginaId, direcao], setPagina] = useState<[Pagina, number]>(['musica', 0])
  const [arrastando, setArrastando] = useState(false)
  const { aviso, avisar, dispensar } = useAvisos()
  const timerHover = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ultimaRolagem = useRef(0)
  useTique(10_000)

  // Só as páginas ligadas em Configurações → Geral entram no carrossel.
  const ligadas = PAGINAS.filter((p) => config.paginas[p.id])
  const visiveis = ligadas.length > 0 ? ligadas : PAGINAS
  // A página atual foi desligada: cai na primeira visível.
  const indice = Math.max(0, visiveis.findIndex((p) => p.id === paginaId))
  const pagina = visiveis[indice]
  const irPara = (novo: number) => {
    const n = (novo + visiveis.length) % visiveis.length
    if (n !== indice) setPagina([visiveis[n].id, novo > indice ? 1 : -1])
  }
  const visivel = (id: Pagina) => visiveis.some((p) => p.id === id)
  // O efeito de arrastar arquivos é registrado uma vez; lê a config por aqui.
  const prateleiraLigada = useRef(true)
  prateleiraLigada.current = visivel('prateleira')

  // ---- Dados ---------------------------------------------------------------
  const { leitura, comando } = useMidia()
  const midia = leitura?.midia ?? null
  useTique(500, !!midia?.tocando)
  const posicao = posicaoAgora(leitura)

  const pomodoro = usePomodoro(config.foco, (concluido, proximo) => {
    const titulo = concluido === 'foco' ? 'Hora da pausa!' : 'De volta ao foco!'
    const min = proximo === 'foco' ? config.foco.focoMin : proximo === 'curta' ? config.foco.pausaCurtaMin : config.foco.pausaLongaMin
    const texto = `${ROTULO_MODO[proximo]} · ${min} min`
    avisar({ icone: concluido === 'foco' ? 'pausa' : 'foco', titulo, texto, cor: COR_MODO[proximo][0], duracaoMs: 6000 })
    if (config.avisos.notificacaoDoSistema) void notificarSistema(titulo, texto)
  })

  const agua = useAgua(config.agua, () => {
    avisar({ icone: 'agua', titulo: 'Hora de beber água', texto: 'Sua garrafa deve estar vazia 💧', cor: '#3b9cf6', duracaoMs: 6000 })
    if (config.avisos.notificacaoDoSistema) void notificarSistema('Hora de beber água 💧', 'Bora se hidratar!')
  })

  const { usos, recarregar } = useUsoIA(
    config.ia.intervaloMin,
    (conta, janela) => {
      if (!config.avisos.ia) return
      avisar({
        icone: 'ia',
        titulo: `${conta.rotulo}: ${Math.round((janela.utilizacao ?? 0) * 100)}% usado`,
        texto: janela.rotulo,
        cor: corUso(janela.utilizacao ?? 0),
        duracaoMs: 5000,
      })
    },
    config.ia.alertaPct,
  )
  const pior = piorUso(usos)

  const bateria = useBateria((b, antes) => {
    if (!config.avisos.bateria) return
    if (b.conectada !== antes.conectada) {
      avisar(
        b.conectada
          ? { icone: 'carregando', titulo: 'Carregando', texto: `${b.percentual}%`, cor: '#4ade80' }
          : { icone: 'bateria', titulo: 'Carregador desconectado', texto: `${b.percentual}%` },
      )
    } else if (b.cheia && !antes.cheia) {
      avisar({ icone: 'bateria', titulo: 'Carga completa', texto: 'Já pode desconectar', cor: '#4ade80' })
    } else if (!b.conectada && b.percentual <= 10 && antes.percentual > 10) {
      avisar({ icone: 'bateria-baixa', titulo: 'Bateria crítica', texto: `${b.percentual}% · conecte agora`, cor: '#f87171', duracaoMs: 6000 })
    } else if (!b.conectada && b.percentual <= 20 && antes.percentual > 20) {
      avisar({ icone: 'bateria-baixa', titulo: 'Bateria baixa', texto: `${b.percentual}% · conecte logo`, cor: '#fbbf24', duracaoMs: 5000 })
    }
  })

  const [prateleira, setPrateleira] = usePersistido<string[]>('prateleira', [])

  // ---- Avisos do sistema ---------------------------------------------------
  const ultimaFaixa = useRef<string | null>(null)
  useEffect(() => {
    if (!midia) return
    const chave = `${midia.artista}\u0000${midia.titulo}`
    const anterior = ultimaFaixa.current
    ultimaFaixa.current = chave
    if (anterior !== null && anterior !== chave && midia.tocando && !aberto && config.avisos.musica) {
      avisar({ icone: 'musica', titulo: midia.titulo, texto: midia.artista, capa: midia.capa, duracaoMs: 3500 })
    }
  }, [midia?.titulo, midia?.artista])

  useEffect(() => {
    const parar = listen<boolean>('caps-lock', ({ payload: ligado }) => {
      if (!config.avisos.capsLock) return
      avisar({ icone: 'caps', titulo: ligado ? 'Caps Lock ativado' : 'Caps Lock desativado', cor: ligado ? '#a78bfa' : undefined, duracaoMs: 1500 })
    })
    return () => void parar.then((f) => f())
  }, [avisar, config.avisos.capsLock])

  useEffect(() => {
    const online = () => config.avisos.internet && avisar({ icone: 'internet', titulo: 'Conectado', texto: 'Internet de volta', cor: '#4ade80' })
    const offline = () => config.avisos.internet && avisar({ icone: 'sem-internet', titulo: 'Sem internet', texto: 'Verifique sua conexão', cor: '#f87171' })
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [avisar, config.avisos.internet])

  // ---- Arrastar arquivos para a prateleira ---------------------------------
  useEffect(() => {
    const parar = getCurrentWebview().onDragDropEvent(({ payload }) => {
      // Prateleira desligada: arrastar arquivos não abre o notch.
      if (!prateleiraLigada.current) return
      if (payload.type === 'enter' || payload.type === 'over') {
        setArrastando(true)
        setAberto(true)
        setPagina(([atual]) => [
          'prateleira',
          PAGINAS.findIndex((p) => p.id === 'prateleira') > PAGINAS.findIndex((p) => p.id === atual) ? 1 : -1,
        ])
      } else if (payload.type === 'drop') {
        setArrastando(false)
        setPrateleira((atual) => [...atual, ...payload.paths.filter((p) => !atual.includes(p))])
      } else {
        setArrastando(false)
      }
    })
    return () => void parar.then((f) => f())
  }, [])

  // ---- Abrir/fechar no hover -----------------------------------------------
  const agendar = (acao: () => void, ms: number) => {
    clearTimeout(timerHover.current)
    timerHover.current = setTimeout(acao, ms)
  }
  // Voltar para dentro antes do notch fechar cancela o fechamento.
  const entrar = () => clearTimeout(timerHover.current)
  // O canto direito abre só a espiada das IAs; o resto do notch abre tudo.
  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (aberto || espiada) return
    const borda = e.currentTarget.getBoundingClientRect().right
    const zona = usos.length > 0 && e.clientX > borda - ZONA_ESPIADA ? 'ia' : 'geral'
    if (zona === zonaHover.current) return
    zonaHover.current = zona
    if (zona === 'ia') agendar(() => setEspiada(true), 250)
    else agendar(() => setAberto(true), 120)
  }
  const sair = () => {
    zonaHover.current = null
    agendar(() => {
      // Digitando uma tarefa: não fecha no meio.
      const foco = document.activeElement
      if (foco instanceof HTMLInputElement && foco.value) return
      setAberto(false)
      setEspiada(false)
      setArrastando(false)
    }, 450)
  }
  const clicar = () => {
    if (aberto) return
    // Clicar na espiada abre o notch direto na página das IAs (se estiver ligada).
    if (espiada) {
      setEspiada(false)
      if (visivel('ias')) setPagina(['ias', visiveis.findIndex((p) => p.id === 'ias') > indice ? 1 : -1])
    }
    setAberto(true)
  }

  // Rolagem horizontal (trackpad ou Shift + roda) troca de página.
  const rolar = (e: React.WheelEvent) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
    if (Math.abs(delta) < 12 || Date.now() - ultimaRolagem.current < 380) return
    ultimaRolagem.current = Date.now()
    irPara(indice + Math.sign(delta))
  }

  // ---- Tamanho e conteúdo recolhido ----------------------------------------
  const humor: Humor =
    pior && pior.pct >= 0.9
      ? 'preocupado'
      : midia?.tocando
        ? 'curtindo'
        : agua.bebidoMl >= agua.metaMl
          ? 'feliz'
          : new Date().getHours() < 6
            ? 'dormindo'
            : 'normal'

  // Com a música pausada o Faísca passeia pelo centro; não pode estar também aqui.
  const ladoEsquerdo = midia?.tocando ? (
    <Capa src={midia.capa} />
  ) : config.mascote && !midia ? (
    <Mascote humor={humor} tamanho={20} />
  ) : (
    <AnelBateria bateria={bateria ?? NA_TOMADA} />
  )

  const ladoDireito = pomodoro.rodando ? (
    <span className="text-[13px] font-bold tabular-nums" style={{ color: COR_MODO[pomodoro.modo][0] }}>
      {mmss(pomodoro.restanteMs)}
    </span>
  ) : midia?.tocando ? (
    <Equalizador />
  ) : (
    <span className="text-[13px] font-bold tabular-nums text-white">{horaCurta(new Date())}</span>
  )

  // O uso da IA (conta mais perto do limite) entra no revezamento do centro.
  // O detalhe por conta fica na espiada; aqui só o essencial, para caber.
  const chipIA = pior ? <ChipIA pct={pior.pct} resetaEm={pior.janela.resetaEm} /> : null

  // Tocando: o meio reveza hora, linha do tempo e IA.
  // Pausado: o Faísca, alternando com a IA. Sem player: a IA aparece de vez em quando.
  const centro: ReactNode = midia?.tocando ? (
    <Revezador
      itens={[
        { id: 'hora', conteudo: <span className="text-[13px] font-bold tabular-nums text-white">{horaCurta(new Date())}</span> },
        ...(midia.duracaoMs > 0 ? [{ id: 'linha', conteudo: <LinhaDoTempo posicaoMs={posicao} duracaoMs={midia.duracaoMs} /> }] : []),
        ...(chipIA ? [{ id: 'ia', conteudo: chipIA }] : []),
      ]}
    />
  ) : midia ? (
    <CentroAlternado ia={chipIA} base={<MascoteFiruleiro />} />
  ) : chipIA ? (
    <CentroAlternado ia={chipIA} base={null} />
  ) : null

  const modo: 'aberto' | 'espiada' | 'aviso' | 'recolhido' = aberto ? 'aberto' : espiada ? 'espiada' : aviso ? 'aviso' : 'recolhido'
  const tamanho =
    modo === 'aberto'
      ? TAMANHO.aberto
      : modo === 'espiada'
        ? espiadaTamanho(usos.length)
        : modo === 'aviso'
          ? TAMANHO.aviso
          : config.notchMinimo
            ? TAMANHO.minimo
            : TAMANHO.recolhido
  useJanelaNotch(tamanho.l + ORELHA * 2, tamanho.a)
  const raio = modo === 'aberto' ? 32 : modo === 'aviso' || modo === 'espiada' ? 22 : tamanho.a <= 8 ? 6 : 14

  return (
    <div className="flex h-screen w-screen justify-center overflow-hidden">
      <motion.div
        className="relative"
        initial={false}
        animate={{ width: tamanho.l, height: tamanho.a }}
        transition={MOLA}
        onMouseEnter={entrar}
        onMouseMove={mover}
        onMouseLeave={sair}
        onWheel={rolar}
        onClick={clicar}
      >
        <span className="orelha orelha-esq" style={{ width: ORELHA, height: ORELHA, left: -ORELHA }} />
        <span className="orelha orelha-dir" style={{ width: ORELHA, height: ORELHA, right: -ORELHA }} />
        <motion.div
          className="absolute inset-0 overflow-hidden bg-black text-white"
          initial={false}
          animate={{ borderBottomLeftRadius: raio, borderBottomRightRadius: raio }}
          transition={MOLA}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {modo === 'recolhido' && tamanho.a > 8 && (
              <motion.div
                key="recolhido"
                initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
                transition={{ duration: 0.2 }}
                className="relative flex h-full items-center justify-between px-3.5"
              >
                <div className="grid min-w-[22px] place-items-center">{ladoEsquerdo}</div>
                {centro && <div className="absolute inset-y-0 left-1/2 grid -translate-x-1/2 place-items-center">{centro}</div>}
                <div className="grid min-w-[22px] place-items-center">{ladoDireito}</div>
              </motion.div>
            )}

            {modo === 'espiada' && (
              <motion.div
                key="espiada"
                initial={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                transition={{ ...MOLA, opacity: { duration: 0.2 } }}
                className="h-full"
              >
                <EspiadaIAs usos={usos} />
              </motion.div>
            )}

            {modo === 'aviso' && aviso && (
              <motion.div
                key={`aviso-${aviso.id}`}
                initial={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                transition={{ ...MOLA, opacity: { duration: 0.2 } }}
                className="h-full"
              >
                <ConteudoAviso aviso={aviso} onClick={dispensar} />
              </motion.div>
            )}

            {modo === 'aberto' && (
              <motion.div
                key="aberto"
                initial={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
                transition={{ duration: 0.22, delay: 0.06 }}
                className="flex h-full flex-col"
              >
                <header className="relative grid h-[30px] shrink-0 grid-cols-[1fr_auto_1fr] items-center px-6 pt-1">
                  <div className="overflow-hidden">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={pagina.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                        <Titulo partes={pagina.titulo} />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center gap-2">
                    <AnelBateria bateria={bateria ?? NA_TOMADA} tamanho={19} />
                    <span className="text-[13px] text-zinc-200">{dataCurta(new Date())}</span>
                    <span className="text-[13px] font-bold tabular-nums">{horaCurta(new Date())}</span>
                  </div>
                  <div className="flex justify-end">
                    <motion.button
                      type="button"
                      title="Configurações"
                      onClick={() => void api.abrirConfiguracoes()}
                      whileHover={{ rotate: 60, color: '#fafafa' }}
                      whileTap={{ scale: 0.85 }}
                      className="text-zinc-600"
                    >
                      <Settings size={14} />
                    </motion.button>
                  </div>
                </header>

                <main className="relative min-h-0 flex-1">
                  <SetaNav lado="esq" onClick={() => irPara(indice - 1)} />
                  <SetaNav lado="dir" onClick={() => irPara(indice + 1)} />
                  <AnimatePresence mode="popLayout" initial={false} custom={direcao}>
                    <motion.div
                      key={pagina.id}
                      custom={direcao}
                      variants={variantesPagina}
                      initial="entrar"
                      animate="centro"
                      exit="sair"
                      transition={{ ...MOLA, opacity: { duration: 0.18 }, filter: { duration: 0.18 } }}
                      className="absolute inset-0 px-11 py-2"
                    >
                      {pagina.id === 'musica' && <Musica midia={midia} posicaoMs={posicao} letrasLigadas={config.letras} comando={comando} />}
                      {pagina.id === 'foco' && <Foco p={pomodoro} />}
                      {pagina.id === 'agua' && (
                        <Agua a={agua} ativo={config.agua.ativo} alternarLembretes={(v) => atualizarConfig((c) => ({ ...c, agua: { ...c.agua, ativo: v } }))} />
                      )}
                      {pagina.id === 'prateleira' && (
                        <Prateleira
                          caminhos={prateleira}
                          arrastandoPorCima={arrastando}
                          remover={(c) => setPrateleira((ps) => ps.filter((p) => p !== c))}
                          limpar={() => setPrateleira([])}
                        />
                      )}
                      {pagina.id === 'tarefas' && <Tarefas />}
                      {pagina.id === 'ias' && <IAs usos={usos} recarregar={() => void recarregar()} />}
                    </motion.div>
                  </AnimatePresence>
                </main>

                <footer className="h-[18px] shrink-0 pb-2.5">
                  <Pontos total={visiveis.length} atual={indice} ir={irPara} />
                </footer>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}

function Capa({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" className="size-[20px] rounded-[5px] object-cover" />
  ) : (
    <div className="grid size-[20px] place-items-center rounded-[5px] bg-zinc-800 text-zinc-400">
      <Music2 size={11} />
    </div>
  )
}

type ItemRevezado = { id: string; conteudo: ReactNode }

const INTERVALO_REVEZAMENTO = 4000

/** Alterna os itens a cada poucos segundos com o mesmo deslize + desfoque das páginas. */
function Revezador({ itens }: { itens: ItemRevezado[] }) {
  const [vez, setVez] = useState(0)

  useEffect(() => {
    if (itens.length < 2) return
    const t = setInterval(() => setVez((v) => v + 1), INTERVALO_REVEZAMENTO)
    return () => clearInterval(t)
  }, [itens.length])

  const item = itens[vez % itens.length]
  return (
    <div className="relative grid h-[18px] place-items-center overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={item.id}
          initial={{ y: 12, opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -12, opacity: 0, filter: 'blur(4px)' }}
          transition={{ ...MOLA, opacity: { duration: 0.18 }, filter: { duration: 0.18 } }}
          className="grid place-items-center"
        >
          {item.conteudo}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const VEZ_DO_MASCOTE = 12_000
/** Sem player e sem mascote, o centro fica vazio esse tempo entre uma aparição da IA e outra. */
const VEZ_DO_VAZIO = 20_000
const VEZ_DA_IA = 4_000

/**
 * Centro que alterna uma base (o Faísca, ou nada) com o uso da IA. A base
 * fica sempre montada (só some com fade) para o mascote não perder o lugar
 * no roteiro.
 */
function CentroAlternado({ ia, base }: { ia: ReactNode | null; base: ReactNode | null }) {
  const [mostrarIA, setMostrarIA] = useState(false)
  const temIA = ia !== null
  const pausa = base ? VEZ_DO_MASCOTE : VEZ_DO_VAZIO

  useEffect(() => {
    if (!temIA) {
      setMostrarIA(false)
      return
    }
    const t = setTimeout(() => setMostrarIA((v) => !v), mostrarIA ? VEZ_DA_IA : pausa)
    return () => clearTimeout(t)
  }, [mostrarIA, temIA, pausa])

  const esconder = { opacity: 0, y: -10, filter: 'blur(4px)' }
  const mostrar = { opacity: 1, y: 0, filter: 'blur(0px)' }
  return (
    <div className="relative grid min-h-5 min-w-5 place-items-center">
      {base && (
        <motion.div animate={mostrarIA ? esconder : mostrar} transition={{ ...MOLA, opacity: { duration: 0.18 } }}>
          {base}
        </motion.div>
      )}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <AnimatePresence>
          {mostrarIA && (
            <motion.div initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={mostrar} exit={esconder} transition={{ ...MOLA, opacity: { duration: 0.18 } }}>
              {ia}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Uso da IA em uma linha curta: faísca colorida, % e quanto falta para resetar. */
function ChipIA({ pct, resetaEm }: { pct: number; resetaEm: number | null }) {
  const cor = corUso(pct)
  return (
    <div className="flex items-center gap-1.5 text-[12px] whitespace-nowrap">
      <Sparkles size={12} style={{ color: cor }} />
      <span className="font-bold tabular-nums" style={{ color: cor }}>
        {Math.round(pct * 100)}%
      </span>
      {resetaEm && <span className="text-[10px] text-zinc-500">{duracaoCompacta(resetaEm - Date.now())}</span>}
    </div>
  )
}

const NOME_IA: Record<string, string> = { claude: 'Claude', antigravity: 'Antigravity' }

/** "Janela de 5 horas" → "5h", para caber na faixa da espiada. */
const janelaCurta = (rotulo: string) => rotulo.replace('Janela de ', '').replace(' horas', 'h').replace(' dias', 'd')

/** Faixa fina com todas as contas, aberta pelo canto direito do notch. */
function EspiadaIAs({ usos }: { usos: UsoConta[] }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-5">
      {usos.slice(0, 4).map((u) => (
        <div key={u.conta.id} className="flex h-5 items-center gap-2 text-[11px]">
          <Sparkles size={11} className="shrink-0 text-violet-300" />
          <span className="w-[64px] shrink-0 truncate font-semibold text-white">{u.conta.rotulo}</span>
          <span className="w-[62px] shrink-0 truncate text-zinc-500">{NOME_IA[u.conta.provedor] ?? u.conta.provedor}</span>
          {u.erro ? (
            <span className="truncate text-red-300">{u.erro}</span>
          ) : !u.janelas ? (
            <span className="text-zinc-500">Consultando…</span>
          ) : (
            u.janelas.map((j) => {
              const pct = j.utilizacao ?? 0
              return (
                <div key={j.rotulo} className="flex flex-1 items-center gap-1.5">
                  <span className="text-zinc-500">{janelaCurta(j.rotulo)}</span>
                  <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: corUso(pct) }}
                      transition={MOLA}
                    />
                  </div>
                  <span className="w-8 text-right font-bold tabular-nums" style={{ color: corUso(pct) }}>
                    {j.utilizacao === null ? '—' : `${Math.round(pct * 100)}%`}
                  </span>
                  {j.resetaEm && <span className="w-9 text-zinc-500">{duracaoCompacta(j.resetaEm - Date.now())}</span>}
                </div>
              )
            })
          )}
        </div>
      ))}
    </div>
  )
}

/** Mini linha do tempo para o notch recolhido: decorrido, barra e restante. */
function LinhaDoTempo({ posicaoMs, duracaoMs }: { posicaoMs: number; duracaoMs: number }) {
  const progresso = Math.min(1, posicaoMs / duracaoMs)
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold tabular-nums text-zinc-300">
      <span>{mmss(posicaoMs)}</span>
      <div className="h-[3px] w-[52px] overflow-hidden rounded-full bg-zinc-700">
        <div className="h-full rounded-full bg-violet-300 transition-[width] duration-500 ease-linear" style={{ width: `${progresso * 100}%` }} />
      </div>
      <span>-{mmss(duracaoMs - posicaoMs)}</span>
    </div>
  )
}

function Equalizador() {
  return (
    <div className="flex h-3.5 items-end gap-[2px]" aria-label="Tocando">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="equalizador w-[3px] rounded-full bg-violet-300" style={{ animationDelay: `${i * -0.23}s` }} />
      ))}
    </div>
  )
}

const ICONES: Record<IconeAviso, ReactNode> = {
  musica: <Music2 size={18} />,
  bateria: <BatteryFull size={18} />,
  'bateria-baixa': <BatteryLow size={18} />,
  carregando: <BatteryCharging size={18} />,
  caps: <ArrowBigUp size={18} />,
  internet: <Wifi size={18} />,
  'sem-internet': <WifiOff size={18} />,
  agua: <Droplet size={18} fill="currentColor" />,
  foco: <Timer size={18} />,
  pausa: <Timer size={18} />,
  ia: <Sparkles size={18} />,
}

function ConteudoAviso({ aviso, onClick }: { aviso: Aviso; onClick: () => void }) {
  return (
    <div className="flex h-full items-center gap-3 px-5" onClick={(e) => (e.stopPropagation(), onClick())}>
      {aviso.capa ? (
        <motion.img initial={{ scale: 0.5, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={MOLA} src={aviso.capa} alt="" className="size-9 rounded-lg object-cover" />
      ) : (
        <motion.div
          initial={{ scale: 0.3 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 14 }}
          className="grid size-9 shrink-0 place-items-center rounded-full"
          style={{ color: aviso.cor ?? '#e4e4e7', background: `${aviso.cor ?? '#e4e4e7'}22` }}
        >
          {ICONES[aviso.icone]}
        </motion.div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold">{aviso.titulo}</p>
        {aviso.texto && <p className="truncate text-xs text-zinc-400">{aviso.texto}</p>}
      </div>
      {aviso.icone === 'musica' && <Equalizador />}
    </div>
  )
}
