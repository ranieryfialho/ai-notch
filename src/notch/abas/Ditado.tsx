import { listen } from '@tauri-apps/api/event'
import { Check, Copy, Mic, SlidersHorizontal, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type EntradaDitado } from '../../lib/api'
import type { ConfigDitado } from '../../lib/config'
import { rotuloAtalho } from '../../lib/ditado'
import { horaCurta } from '../ui'

/** Os últimos ditados, para copiar de novo, e a dica do atalho. */
export function Ditado({ cfg }: { cfg: ConfigDitado }) {
  const [entradas, setEntradas] = useState<EntradaDitado[]>([])
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    const carregar = () => void api.ditadoHistorico().then(setEntradas).catch(() => {})
    carregar()
    const parar = listen('ditado-historico', carregar)
    return () => void parar.then((f) => f())
  }, [])

  const copiar = (e: EntradaDitado) => {
    void api.ditadoCopiar(e.texto).then(() => {
      setCopiado(e.id)
      setTimeout(() => setCopiado((c) => (c === e.id ? null : c)), 1500)
    })
  }

  const dica = cfg.ativo ? (
    <>
      Segure <b className="text-zinc-200">{rotuloAtalho(cfg.atalho)}</b> e fale
    </>
  ) : (
    'Ditado desligado nas configurações'
  )

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <Mic size={12} className="text-rose-300" />
        <span className="truncate">{dica}</span>
        <button
          type="button"
          title="Ajustes do ditado"
          onClick={() => void api.abrirConfiguracoes('ditado')}
          className="ml-auto rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <SlidersHorizontal size={12} />
        </button>
      </div>

      {entradas.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center text-[12px] text-zinc-500">Seus textos ditados aparecem aqui.</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1 [scrollbar-width:none]">
          {entradas.slice(0, 12).map((e) => (
            <div key={e.id} className="group flex items-start gap-2 rounded-xl bg-zinc-900 px-3 py-1.5">
              <span className="mt-[1px] shrink-0 text-[10px] tabular-nums text-zinc-500">{horaCurta(new Date(e.criadoEm))}</span>
              {e.erro ? (
                <p className="line-clamp-2 flex-1 text-[11px] text-red-300">
                  <TriangleAlert size={11} className="mr-1 inline" />
                  {e.erro}
                </p>
              ) : (
                <p className="line-clamp-2 flex-1 text-[11px] leading-snug text-zinc-200">{e.texto}</p>
              )}
              <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                {!e.erro && (
                  <button type="button" title="Copiar" onClick={() => copiar(e)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                    {copiado === e.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                )}
                <button
                  type="button"
                  title="Apagar"
                  onClick={() => void api.ditadoApagar(e.id)}
                  className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
