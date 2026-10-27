import { FastForward, Music2, Pause, Play, Rewind, TextQuote } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { Midia } from '../../lib/api'
import { mmss } from '../../lib/formato'
import { linhaAtual } from '../../lib/lrc'
import { Mascote } from '../Mascote'
import { desfoque, MOLA, MOLA_SUAVE } from '../ui'
import { useLetra, type EstadoLetra } from '../useMidia'

type Props = {
  midia: Midia | null
  posicaoMs: number
  letrasLigadas: boolean
  comando: (acao: 'tocar-pausar' | 'proxima' | 'anterior') => void
}

export function Musica({ midia, posicaoMs, letrasLigadas, comando }: Props) {
  const [verLetra, setVerLetra] = useState(false)
  const letra = useLetra(midia, letrasLigadas && verLetra)

  if (!midia) {
    return (
      <div className="flex h-full items-center justify-center gap-4">
        <Mascote humor="dormindo" tamanho={44} />
        <div>
          <p className="text-[15px] font-semibold text-white">Nada tocando</p>
          <p className="text-xs text-zinc-500">Dê play no Spotify, YouTube ou outro player.</p>
        </div>
      </div>
    )
  }

  const progresso = midia.duracaoMs > 0 ? Math.min(1, posicaoMs / midia.duracaoMs) : 0
  const subtitulo = [midia.artista, midia.album].filter(Boolean).join(' - ')

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="relative h-[56px]">
        <AnimatePresence mode="wait" initial={false}>
          {verLetra ? (
            <motion.div
              key="letra"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              <LinhaDaLetra letra={letrasLigadas ? letra : null} posicaoMs={posicaoMs} />
            </motion.div>
          ) : (
            <motion.div
              key={`${midia.titulo}-${midia.artista}`}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={MOLA_SUAVE}
              className="flex h-full items-center gap-3"
            >
              {midia.capa ? (
                <motion.img
                  src={midia.capa}
                  alt=""
                  className="size-[56px] shrink-0 rounded-lg object-cover shadow-lg shadow-black/60"
                  animate={{ scale: midia.tocando ? 1 : 0.9, filter: midia.tocando ? 'saturate(1)' : 'saturate(0.5)' }}
                  transition={MOLA}
                />
              ) : (
                <div className="grid size-[56px] shrink-0 place-items-center rounded-lg bg-zinc-800 text-zinc-500">
                  <Music2 size={24} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[17px] leading-tight font-bold text-white" title={midia.titulo}>
                  {midia.titulo}
                </p>
                <p className="truncate text-[13px] text-zinc-400" title={subtitulo}>
                  {subtitulo || 'Artista desconhecido'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 text-[13px] font-medium tabular-nums text-white">
        <span className="w-10">{mmss(posicaoMs)}</span>
        <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-zinc-700">
          <div className="h-full rounded-full bg-zinc-200 transition-[width] duration-500 ease-linear" style={{ width: `${progresso * 100}%` }} />
        </div>
        <span className="w-12 text-right">{midia.duracaoMs > 0 ? `-${mmss(midia.duracaoMs - posicaoMs)}` : '--:--'}</span>
      </div>

      <div className="relative flex h-[30px] items-center justify-center gap-6 text-white">
        <motion.button
          type="button"
          title={verLetra ? 'Mostrar faixa' : 'Mostrar letra'}
          onClick={() => setVerLetra((v) => !v)}
          whileTap={{ scale: 0.85 }}
          className={`absolute left-6 grid size-7 place-items-center rounded-full transition-colors ${verLetra ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/10'}`}
        >
          <TextQuote size={15} />
        </motion.button>
        <BotaoMidia rotulo="Anterior" onClick={() => comando('anterior')}>
          <Rewind size={20} fill="currentColor" />
        </BotaoMidia>
        <BotaoMidia rotulo={midia.tocando ? 'Pausar' : 'Tocar'} onClick={() => comando('tocar-pausar')}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={midia.tocando ? 'pausa' : 'play'}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {midia.tocando ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </motion.span>
          </AnimatePresence>
        </BotaoMidia>
        <BotaoMidia rotulo="Próxima" onClick={() => comando('proxima')}>
          <FastForward size={20} fill="currentColor" />
        </BotaoMidia>
      </div>
    </div>
  )
}

function BotaoMidia({ children, rotulo, onClick }: { children: React.ReactNode; rotulo: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      onClick={onClick}
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.8 }}
      transition={MOLA}
      className="grid size-8 place-items-center"
    >
      {children}
    </motion.button>
  )
}

function LinhaDaLetra({ letra, posicaoMs }: { letra: EstadoLetra | null; posicaoMs: number }) {
  const centro = (texto: string) => <div className="grid h-full place-items-center text-sm text-zinc-500">{texto}</div>
  if (!letra) return centro('Letras desligadas nas configurações')
  if (letra.tipo === 'carregando') return centro('Buscando letra…')
  if (letra.tipo === 'indisponivel') return centro('Letra não disponível')
  if (letra.tipo === 'simples') return centro('Só há letra sem sincronia para esta faixa')

  const i = linhaAtual(letra.linhas, posicaoMs + 300)
  const atual = letra.linhas[i]?.texto || '♪'
  const proxima = letra.linhas[i + 1]?.texto ?? ''
  return (
    <div className="flex h-full flex-col justify-center overflow-hidden text-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 16, ...desfoque(4) }}
          animate={{ opacity: 1, y: 0, ...desfoque(0) }}
          exit={{ opacity: 0, y: -16, ...desfoque(4) }}
          transition={MOLA_SUAVE}
          className="truncate text-[16px] font-bold text-white"
        >
          {atual}
        </motion.p>
      </AnimatePresence>
      <p className="truncate text-xs text-zinc-500">{proxima}</p>
    </div>
  )
}
