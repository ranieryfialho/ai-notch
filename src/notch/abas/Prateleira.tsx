import { startDrag } from '@crabnebula/tauri-plugin-drag'
import { File, FileWarning, Folder, FolderSearch, Inbox, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { api, type InfoArquivo } from '../../lib/api'
import { MOLA } from '../ui'

type Props = {
  caminhos: string[]
  remover: (caminho: string) => void
  limpar: () => void
  arrastandoPorCima: boolean
}

export function Prateleira({ caminhos, remover, limpar, arrastandoPorCima }: Props) {
  const [infos, setInfos] = useState<InfoArquivo[]>([])
  const [icone, setIcone] = useState<string | null>(null)

  useEffect(() => {
    api.prateleiraInfo(caminhos).then(setInfos).catch(() => setInfos([]))
  }, [caminhos])

  useEffect(() => {
    api.iconeArrasto().then(setIcone).catch(() => {})
  }, [])

  const vazia = caminhos.length === 0

  return (
    <motion.div
      animate={{
        borderColor: arrastandoPorCima ? '#a78bfa' : '#3f3f46',
        backgroundColor: arrastandoPorCima ? 'rgb(139 92 246 / 0.12)' : 'rgb(0 0 0 / 0)',
        scale: arrastandoPorCima ? 1.02 : 1,
      }}
      transition={MOLA}
      className="relative h-full rounded-2xl border-[1.5px] border-dashed"
    >
      {vazia || arrastandoPorCima ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <motion.div animate={{ y: arrastandoPorCima ? [0, 4, 0] : 0 }} transition={{ duration: 0.8, repeat: arrastandoPorCima ? Infinity : 0 }}>
            <Inbox size={26} className={arrastandoPorCima ? 'text-violet-300' : 'text-zinc-300'} />
          </motion.div>
          <p className="mt-1 text-[13px] font-semibold text-white">{arrastandoPorCima ? 'Pode soltar!' : 'Solte arquivos aqui'}</p>
          <p className="text-[11px] text-zinc-500">Arraste para fora quando quiser · clique duplo abre</p>
        </div>
      ) : (
        <>
          <div className="flex h-full items-center gap-2 overflow-x-auto px-3">
            <AnimatePresence initial={false}>
              {infos.map((f) => (
                <motion.div
                  key={f.caminho}
                  layout
                  initial={{ opacity: 0, scale: 0.6, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={MOLA}
                  whileHover={{ y: -2 }}
                  className="group relative flex w-[76px] shrink-0 cursor-grab flex-col items-center gap-1 rounded-xl bg-zinc-900 p-2 text-center active:cursor-grabbing"
                  title={f.caminho}
                  onMouseDown={(e) => {
                    if (e.button !== 0 || !f.existe || !icone || (e.target as HTMLElement).closest('button')) return
                    void startDrag({ item: [f.caminho], icon: icone })
                  }}
                  onDoubleClick={() => f.existe && void api.abrirArquivo(f.caminho)}
                >
                  {!f.existe ? (
                    <FileWarning size={24} className="text-amber-400" />
                  ) : f.pasta ? (
                    <Folder size={24} className="text-sky-300" />
                  ) : (
                    <File size={24} className="text-zinc-300" />
                  )}
                  <p className="w-full truncate text-[10px] text-zinc-200">{f.nome}</p>
                  <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {f.existe && (
                      <button type="button" title="Mostrar na pasta" onClick={() => void api.revelarArquivo(f.caminho)} className="grid size-5 place-items-center rounded-full bg-zinc-700 text-white">
                        <FolderSearch size={11} />
                      </button>
                    )}
                    <button type="button" title="Tirar da prateleira" onClick={() => remover(f.caminho)} className="grid size-5 place-items-center rounded-full bg-zinc-700 text-white">
                      <X size={11} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <button type="button" onClick={limpar} title="Limpar prateleira" className="absolute right-2 bottom-1.5 text-zinc-600 hover:text-red-400">
            <Trash2 size={12} />
          </button>
        </>
      )}
    </motion.div>
  )
}
