import { ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { Bateria } from '../lib/api'

export const MOLA = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const
export const MOLA_SUAVE = { type: 'spring', stiffness: 260, damping: 30 } as const

/**
 * O WebKitGTK compõe mal `filter: blur()` animado em janela transparente
 * (caixas retangulares, rastros e quadros perdidos), então no Linux as
 * transições ficam só com deslize + fade.
 */
const SEM_DESFOQUE = navigator.userAgent.includes('Linux')
export const desfoque = (px: number) => (SEM_DESFOQUE ? {} : { filter: `blur(${px}px)` })

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** "Seg 26 Out 2026", no formato curto do topo do notch. */
export function dataCurta(d: Date) {
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

export function horaCurta(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function corBateria(b: Bateria) {
  if (b.conectada) return '#4ade80'
  if (b.percentual <= 10) return '#f87171'
  if (b.percentual <= 20) return '#fbbf24'
  return '#e4e4e7'
}

/** Anel de bateria com o raio no meio quando está carregando. */
export function AnelBateria({ bateria, tamanho = 20 }: { bateria: Bateria; tamanho?: number }) {
  const r = tamanho / 2 - 2
  const c = 2 * Math.PI * r
  const cor = corBateria(bateria)
  return (
    <div className="relative grid place-items-center" style={{ width: tamanho, height: tamanho }} title={bateria.cheia && bateria.conectada ? 'Na tomada' : `Bateria: ${bateria.percentual}%`}>
      <svg width={tamanho} height={tamanho} className="absolute inset-0 -rotate-90">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} stroke="rgb(255 255 255 / 0.12)" strokeWidth="2.2" fill="none" />
        <motion.circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          stroke={cor}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - bateria.percentual / 100) }}
          transition={MOLA_SUAVE}
        />
      </svg>
      {bateria.conectada ? (
        <Zap size={tamanho * 0.5} fill={cor} stroke={cor} />
      ) : (
        <span className="text-[7px] font-bold tabular-nums" style={{ color: cor }}>
          {bateria.percentual}
        </span>
      )}
    </div>
  )
}

/** Título de página em duas cores, como "Lista de" + "Tarefas". */
export function Titulo({ partes }: { partes: [string, string?, string?] }) {
  const [branco, colorido, cor] = partes
  return (
    <span className="text-[15px] font-bold tracking-tight whitespace-nowrap">
      <span className="text-white">{branco}</span>
      {colorido && <span style={{ color: cor }}>{colorido}</span>}
    </span>
  )
}

export function SetaNav({ lado, onClick }: { lado: 'esq' | 'dir'; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      aria-label={lado === 'esq' ? 'Página anterior' : 'Próxima página'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      whileHover={{ scale: 1.12, backgroundColor: 'rgb(113 113 122)' }}
      whileTap={{ scale: 0.88 }}
      className={`absolute top-1/2 z-10 grid size-[22px] -translate-y-1/2 place-items-center rounded-full bg-zinc-600/80 text-white ${
        lado === 'esq' ? 'left-3' : 'right-3'
      }`}
    >
      {lado === 'esq' ? <ChevronLeft size={15} strokeWidth={3} /> : <ChevronRight size={15} strokeWidth={3} />}
    </motion.button>
  )
}

export function Pontos({ total, atual, ir }: { total: number; atual: number; ir: (i: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-[5px]">
      {Array.from({ length: total }, (_, i) => (
        <button key={i} type="button" aria-label={`Página ${i + 1}`} onClick={() => ir(i)} className="grid h-2 place-items-center">
          <motion.span
            className="block h-[5px] rounded-full"
            animate={{ width: i === atual ? 16 : 5, backgroundColor: i === atual ? '#fafafa' : '#52525b' }}
            transition={MOLA}
          />
        </button>
      ))}
    </div>
  )
}

type Tom = 'neutro' | 'cor'

/** Botão em pílula dos cards (Beber, Adicionar, Pausa curta...). */
export function Pilula({
  children,
  icone,
  onClick,
  tom = 'neutro',
  cor,
  disabled,
  titulo,
}: {
  children?: ReactNode
  icone?: ReactNode
  onClick?: () => void
  tom?: Tom
  cor?: string
  disabled?: boolean
  titulo?: string
}) {
  return (
    <motion.button
      type="button"
      title={titulo}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.04, filter: 'brightness(1.15)' }}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      transition={MOLA}
      className={`flex h-[30px] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap disabled:opacity-35 ${
        tom === 'cor' ? 'text-white' : 'bg-zinc-800 text-zinc-100'
      }`}
      style={tom === 'cor' ? { background: cor } : undefined}
    >
      {icone}
      {children}
    </motion.button>
  )
}

export function Interruptor({ ligado, onChange, cor = '#3b82f6', titulo }: { ligado: boolean; onChange: (v: boolean) => void; cor?: string; titulo?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      title={titulo}
      onClick={() => onChange(!ligado)}
      className="relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors"
      style={{ background: ligado ? cor : '#3f3f46' }}
    >
      <motion.span className="absolute top-[2px] size-4 rounded-full bg-white shadow" animate={{ left: ligado ? 18 : 2 }} transition={MOLA} />
    </button>
  )
}
