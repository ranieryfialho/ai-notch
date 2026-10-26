import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { api } from '../../lib/api'
import { corUso, duracaoCurta } from '../../lib/formato'
import { MOLA_SUAVE, Pilula } from '../ui'
import type { UsoConta } from '../useUsoIA'

const ROTULO_PROVEDOR: Record<string, string> = { claude: 'Claude Code', antigravity: 'Antigravity' }

export function IAs({ usos, recarregar }: { usos: UsoConta[]; recarregar: () => void }) {
  if (usos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-4">
        <div className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-violet-400 to-violet-700 text-white shadow-lg shadow-violet-900/50">
          <Sparkles size={24} />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-white">Acompanhe suas IAs</p>
          <p className="mb-2 text-[11px] text-zinc-500">Claude Code e Antigravity: limites e resets.</p>
          <Pilula tom="cor" cor="#7c3aed" onClick={() => void api.abrirConfiguracoes('ias')}>
            Conectar minhas IAs
          </Pilula>
        </div>
      </div>
    )
  }

  const carregando = usos.some((u) => u.carregando)

  return (
    <div className="relative flex h-full gap-2 overflow-x-auto">
      {usos.map((u, i) => (
        <motion.div
          key={u.conta.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...MOLA_SUAVE, delay: i * 0.05 }}
          className="flex min-w-[200px] flex-1 flex-col justify-center rounded-2xl bg-zinc-900/90 px-3 py-2"
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="truncate text-[13px] font-semibold text-white">{u.conta.rotulo}</p>
            <p className="shrink-0 text-[10px] text-zinc-500">{ROTULO_PROVEDOR[u.conta.provedor] ?? u.conta.provedor}</p>
          </div>
          {u.erro ? (
            <p className="line-clamp-3 flex items-start gap-1 text-[11px] text-red-300">
              <AlertCircle size={12} className="mt-px shrink-0" /> {u.erro}
            </p>
          ) : !u.janelas ? (
            <p className="text-[11px] text-zinc-500">Consultando…</p>
          ) : (
            <div className="space-y-1.5">
              {u.janelas.map((j) => {
                const pct = j.utilizacao ?? 0
                return (
                  <div key={j.rotulo}>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-400">
                        {j.rotulo.replace('Janela de ', '')}
                        {j.resetaEm ? ` · reseta em ${duracaoCurta(j.resetaEm - Date.now())}` : ''}
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: corUso(pct) }}>
                        {j.utilizacao === null ? '—' : `${Math.round(pct * 100)}%`}
                      </span>
                    </div>
                    <div className="mt-0.5 h-[5px] overflow-hidden rounded-full bg-zinc-800">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: corUso(pct) }}
                        transition={MOLA_SUAVE}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      ))}
      <button
        type="button"
        onClick={recarregar}
        disabled={carregando}
        title="Atualizar"
        className="absolute top-1 right-1 grid size-5 place-items-center rounded-full text-zinc-500 hover:text-white disabled:opacity-50"
      >
        <RefreshCw size={11} className={carregando ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
