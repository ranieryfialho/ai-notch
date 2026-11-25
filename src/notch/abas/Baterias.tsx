import { BatteryCharging, Laptop, SlidersHorizontal, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { api, type Bateria } from '../../lib/api'
import { corPeriferico, IconeTipo, ROTULO_CONEXAO, ROTULO_ESTADO, type Periferico } from '../../lib/perifericos'
import { corBateria, MOLA_SUAVE } from '../ui'

/** Carga do computador e de cada periférico sem fio, um cartão por aparelho. */
export function Baterias({ bateria, perifericos }: { bateria: Bateria | null; perifericos: Periferico[] }) {
  if (!bateria && perifericos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <BatteryCharging size={22} className="text-zinc-600" />
        <p className="text-[13px] text-zinc-300">Nenhum aparelho com bateria por aqui</p>
        <p className="max-w-[340px] text-[11px] text-zinc-500">Mouse, teclado, headset e controle sem fio aparecem sozinhos quando o sistema informa a carga deles.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-stretch gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {bateria && (
        <Cartao
          icone={<Laptop size={14} />}
          nome="Este computador"
          percentual={bateria.percentual}
          cor={corBateria(bateria)}
          carregando={bateria.conectada}
          detalhe={bateria.cheia && bateria.conectada ? 'carregado' : bateria.conectada ? 'carregando' : 'na bateria'}
        />
      )}
      {perifericos.map((p) => (
        <Cartao
          key={p.id}
          icone={<IconeTipo tipo={p.tipo} tamanho={14} />}
          nome={p.nome}
          percentual={p.percentual}
          cor={corPeriferico(p)}
          carregando={p.estado === 'carregando'}
          detalhe={[ROTULO_ESTADO[p.estado], ROTULO_CONEXAO[p.conexao]].filter(Boolean).join(' · ') || ' '}
        />
      ))}
      <button
        type="button"
        title="Ajustes das baterias"
        onClick={() => void api.abrirConfiguracoes('baterias')}
        className="grid w-9 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <SlidersHorizontal size={14} />
      </button>
    </div>
  )
}

function Cartao({
  icone,
  nome,
  percentual,
  cor,
  carregando,
  detalhe,
}: {
  icone: ReactNode
  nome: string
  percentual: number
  cor: string
  carregando: boolean
  detalhe: string
}) {
  return (
    <div className="flex w-[128px] shrink-0 flex-col justify-between rounded-2xl bg-zinc-900 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-zinc-400">
        {icone}
        <span className="truncate text-[11px] font-semibold text-zinc-200" title={nome}>
          {nome}
        </span>
      </div>
      <p className="flex items-center gap-1 leading-none">
        <span className="text-[26px] font-bold tabular-nums" style={{ color: cor }}>
          {percentual}
        </span>
        <span className="text-xs text-zinc-500">%</span>
        {carregando && <Zap size={13} className="ml-auto text-green-400" fill="currentColor" />}
      </p>
      <div>
        <div className="h-[4px] overflow-hidden rounded-full bg-zinc-800">
          <motion.div className="h-full rounded-full" style={{ background: cor }} initial={false} animate={{ width: `${percentual}%` }} transition={MOLA_SUAVE} />
        </div>
        <p className="mt-1 truncate text-[10px] text-zinc-500">{detalhe}</p>
      </div>
    </div>
  )
}
