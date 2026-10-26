import { AlarmClock, Coffee, Pause, Play, RotateCcw, Target } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { mmss } from '../../lib/formato'
import { MOLA, MOLA_SUAVE, Pilula } from '../ui'
import type { ModoFoco, Pomodoro } from '../usePomodoro'

export const COR_MODO: Record<ModoFoco, [string, string]> = {
  foco: ['#fb7185', '#e11d48'],
  curta: ['#4ade80', '#16a34a'],
  longa: ['#60a5fa', '#2563eb'],
}

const LEGENDA: Record<ModoFoco, string> = {
  foco: 'Tempo de foco',
  curta: 'Pausa curta',
  longa: 'Pausa longa',
}

export function Foco({ p }: { p: Pomodoro }) {
  const [claro, escuro] = COR_MODO[p.modo]
  const progresso = 1 - p.restanteMs / p.totalMs
  const r = 36
  const c = 2 * Math.PI * r

  return (
    <div className="flex h-full items-center gap-6 pl-2">
      <div className="relative grid size-[82px] shrink-0 place-items-center">
        <svg viewBox="0 0 82 82" className="absolute inset-0 -rotate-90">
          <circle cx="41" cy="41" r={r} stroke="rgb(255 255 255 / 0.08)" strokeWidth="4" fill="none" />
          <motion.circle
            cx="41"
            cy="41"
            r={r}
            stroke={claro}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            animate={{ strokeDashoffset: c * (1 - progresso), stroke: claro }}
            transition={MOLA_SUAVE}
          />
        </svg>
        <motion.div
          className="grid size-[62px] place-items-center rounded-full text-white"
          animate={{
            background: `radial-gradient(circle at 35% 30%, ${claro}, ${escuro})`,
            boxShadow: p.rodando ? `0 0 22px ${claro}88` : `0 0 0px ${claro}00`,
            scale: p.rodando ? [1, 1.05, 1] : 1,
          }}
          transition={p.rodando ? { scale: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }, default: MOLA_SUAVE } : MOLA_SUAVE}
        >
          <AlarmClock size={30} strokeWidth={2.2} />
        </motion.div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <p className="text-[38px] leading-none font-bold tabular-nums text-white">{mmss(p.restanteMs)}</p>
          <motion.button
            type="button"
            title="Reiniciar"
            onClick={p.reiniciar}
            whileHover={{ rotate: -90 }}
            whileTap={{ scale: 0.85, rotate: -360 }}
            transition={MOLA}
            className="grid size-7 place-items-center rounded-full bg-zinc-800 text-zinc-300"
          >
            <RotateCcw size={14} />
          </motion.button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={p.modo}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mb-1 text-xs text-zinc-400"
          >
            {LEGENDA[p.modo]} · {p.ciclos} ciclo{p.ciclos === 1 ? '' : 's'}
          </motion.p>
        </AnimatePresence>
        <div className="flex items-center gap-2">
          <Pilula icone={<Coffee size={14} />} onClick={() => p.escolher(p.modo === 'curta' ? 'longa' : 'curta')} titulo="Alternar entre pausa curta e longa">
            {p.modo === 'curta' ? 'Pausa longa' : 'Pausa curta'}
          </Pilula>
          <motion.button
            type="button"
            title={p.rodando ? 'Pausar' : 'Iniciar'}
            onClick={p.rodando ? p.pausar : p.iniciar}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.9 }}
            animate={{ backgroundColor: escuro }}
            transition={MOLA}
            className="grid h-[30px] w-[54px] place-items-center rounded-full text-white"
          >
            {p.rodando ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </motion.button>
          <Pilula icone={<Target size={14} />} onClick={() => p.escolher('foco')}>
            Foco
          </Pilula>
        </div>
      </div>
    </div>
  )
}
