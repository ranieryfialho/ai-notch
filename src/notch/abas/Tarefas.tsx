import { Check, ListChecks, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { usePersistido } from '../../lib/config'
import { hojeISO } from '../../lib/formato'
import { MOLA, Pilula } from '../ui'

type Tarefa = { id: string; texto: string; feita: boolean; feitaEm?: string }

const VERDE = '#4ade80'

export function Tarefas() {
  const [tarefas, setTarefas] = usePersistido<Tarefa[]>('tarefas', [])
  const [adicionando, setAdicionando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  const pendentes = tarefas.filter((t) => !t.feita)
  const feitasHoje = tarefas.filter((t) => t.feita && t.feitaEm === hojeISO())
  // Concluídas de outros dias saem da lista sozinhas.
  const visiveis = [...pendentes, ...feitasHoje]

  const adicionar = () => {
    const t = texto.trim()
    if (t) setTarefas((ts) => [{ id: crypto.randomUUID(), texto: t, feita: false }, ...ts])
    setTexto('')
    setAdicionando(false)
  }
  const alternar = (id: string) =>
    setTarefas((ts) => ts.map((t) => (t.id === id ? { ...t, feita: !t.feita, feitaEm: t.feita ? undefined : hojeISO() } : t)))
  const remover = (id: string) => setTarefas((ts) => ts.filter((t) => t.id !== id))

  return (
    <div className="flex h-full gap-3">
      <div className="flex w-[176px] shrink-0 flex-col justify-center gap-0.5">
        <p className="text-[34px] leading-none font-bold tabular-nums text-white">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={feitasHoje.length} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={MOLA} className="inline-block" style={{ color: feitasHoje.length > 0 && pendentes.length === 0 ? VERDE : undefined }}>
              {feitasHoje.length}
            </motion.span>
          </AnimatePresence>
          /{visiveis.length}
        </p>
        <p className="mb-2 text-xs text-zinc-400">Concluídas hoje</p>
        <div className="flex gap-1.5">
          <Pilula icone={<PlusCircle size={14} />} onClick={() => setAdicionando(true)}>
            Adicionar
          </Pilula>
          <Pilula icone={<Pencil size={13} />} onClick={() => setEditando((e) => !e)} disabled={visiveis.length === 0} tom={editando ? 'cor' : 'neutro'} cor="#7c3aed">
            {editando ? 'Pronto' : 'Editar'}
          </Pilula>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-zinc-900/90 p-2">
        <AnimatePresence initial={false}>
          {adicionando && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={MOLA}
              onSubmit={(e) => {
                e.preventDefault()
                adicionar()
              }}
              className="shrink-0 overflow-hidden"
            >
              <input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onBlur={() => !texto.trim() && setAdicionando(false)}
                onKeyDown={(e) => e.key === 'Escape' && (setTexto(''), setAdicionando(false))}
                placeholder="Nova tarefa e Enter…"
                className="mb-1.5 w-full rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </motion.form>
          )}
        </AnimatePresence>

        {visiveis.length === 0 && !adicionando ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-zinc-500">
            <div className="grid size-9 place-items-center rounded-lg bg-zinc-700/60">
              <ListChecks size={20} className="text-zinc-400" />
            </div>
            <p className="text-xs">Nenhuma tarefa.</p>
          </div>
        ) : (
          <ul className="flex-1 space-y-0.5 overflow-y-auto">
            <AnimatePresence initial={false}>
              {visiveis.map((t) => (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={MOLA}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5"
                >
                  <motion.button
                    type="button"
                    onClick={() => alternar(t.id)}
                    whileTap={{ scale: 0.75 }}
                    className="grid size-4 shrink-0 place-items-center rounded-full border"
                    animate={{ backgroundColor: t.feita ? VERDE : 'rgb(0 0 0 / 0)', borderColor: t.feita ? VERDE : '#71717a' }}
                  >
                    {t.feita && <Check size={10} strokeWidth={4} className="text-zinc-950" />}
                  </motion.button>
                  <span className={`flex-1 truncate text-xs transition-colors ${t.feita ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{t.texto}</span>
                  <AnimatePresence>
                    {editando && (
                      <motion.button
                        type="button"
                        title="Excluir"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        onClick={() => remover(t.id)}
                        className="text-zinc-400 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}
