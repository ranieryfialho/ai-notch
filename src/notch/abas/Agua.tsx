import { Droplet, SlidersHorizontal, Undo2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '../../lib/api'
import { horaCurta, Interruptor, MOLA, MOLA_SUAVE, Pilula } from '../ui'
import type { Agua as EstadoAgua } from '../useAgua'

const AZUL = '#3b9cf6'

export function Agua({ a, ativo, alternarLembretes }: { a: EstadoAgua; ativo: boolean; alternarLembretes: (v: boolean) => void }) {
  const progresso = Math.min(1, a.bebidoMl / a.metaMl)
  const pct = Math.round(progresso * 100)
  const bateuMeta = a.bebidoMl >= a.metaMl
  const litros = (ml: number) => (ml / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <div className="flex h-full items-center gap-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="leading-none">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={a.bebidoMl}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={MOLA}
                className="inline-block text-[30px] font-bold tabular-nums text-white"
              >
                {litros(a.bebidoMl)}
              </motion.span>
            </AnimatePresence>
            <span className="ml-1 text-sm text-zinc-500">/ {litros(a.metaMl)} L</span>
          </p>
          <Interruptor ligado={ativo} onChange={alternarLembretes} cor={AZUL} titulo="Lembretes de água" />
        </div>
        <p className="text-[11px] text-zinc-400">
          Hoje · <span style={{ color: AZUL }}>{pct}%</span> ·{' '}
          {bateuMeta ? 'Meta batida! 🎉' : ativo ? `Próximo ${horaCurta(new Date(a.proximoLembrete))}` : 'Lembretes desligados'}
        </p>
        <div className="h-[5px] overflow-hidden rounded-full bg-zinc-800">
          <motion.div className="h-full rounded-full" style={{ background: AZUL }} animate={{ width: `${progresso * 100}%` }} transition={MOLA_SUAVE} />
        </div>
        <div className="mt-1 flex gap-2">
          <Pilula tom="cor" cor="#1d4ed8" icone={<Droplet size={14} fill="currentColor" />} onClick={() => a.beber()} titulo={`Bebi ${a.copoMl} ml`}>
            Beber
          </Pilula>
          <Pilula icone={<SlidersHorizontal size={14} />} onClick={() => void api.abrirConfiguracoes('agua')}>
            Ajustes
          </Pilula>
          {a.goles.length > 0 && <Pilula icone={<Undo2 size={14} />} onClick={a.desfazer} titulo="Desfazer último gole" />}
        </div>
      </div>

      <div className="h-[86px] w-px bg-zinc-800" />

      <Medidor progresso={progresso} />
    </div>
  )
}

/** Medidor em arco (270°) com a porcentagem no meio. */
function Medidor({ progresso }: { progresso: number }) {
  const tamanho = 92
  const r = 38
  const c = 2 * Math.PI * r
  const arco = c * 0.75
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="absolute inset-0 rotate-[135deg]">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} stroke="#1e3a5f" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${arco} ${c}`} />
        <motion.circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          stroke={AZUL}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arco} ${c}`}
          initial={false}
          animate={{ strokeDashoffset: arco * (1 - progresso) }}
          transition={MOLA_SUAVE}
        />
      </svg>
      <div className="text-center">
        <p className="text-[24px] leading-none font-bold tabular-nums text-white">{Math.round(progresso * 100)}</p>
        <p className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] text-zinc-400">
          <Droplet size={9} fill={AZUL} stroke={AZUL} />%
        </p>
      </div>
    </div>
  )
}
