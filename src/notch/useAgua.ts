import { useEffect, useRef } from 'react'
import { usePersistido, type Config } from '../lib/config'
import { hojeISO } from '../lib/formato'

type EstadoAgua = {
  dia: string
  bebidoMl: number
  goles: number[]
  /** Epoch do último lembrete ou gole; o próximo lembrete conta daqui. */
  referencia: number
  adiadoAte: number
}

const VAZIO = (): EstadoAgua => ({ dia: hojeISO(), bebidoMl: 0, goles: [], referencia: Date.now(), adiadoAte: 0 })

export function useAgua(cfg: Config['agua'], lembrar: () => void) {
  const [salvo, setSalvo, carregado] = usePersistido<EstadoAgua>('agua', VAZIO())
  // Virou o dia: zera a contagem.
  const estado = salvo.dia === hojeISO() ? salvo : { ...VAZIO(), referencia: salvo.referencia }
  const lembrarRef = useRef(lembrar)
  lembrarRef.current = lembrar

  useEffect(() => {
    if (!carregado || !cfg.ativo) return
    const verificar = () => {
      const agora = new Date()
      const hora = agora.getHours()
      if (hora < cfg.inicioHora || hora >= cfg.fimHora) return
      if (estado.bebidoMl >= cfg.metaMl) return
      const t = agora.getTime()
      if (t < estado.adiadoAte) return
      if (t - estado.referencia < cfg.intervaloMin * 60_000) return
      setSalvo({ ...estado, referencia: t })
      lembrarRef.current()
    }
    verificar()
    const t = setInterval(verificar, 30_000)
    return () => clearInterval(t)
  }, [carregado, cfg, estado.bebidoMl, estado.referencia, estado.adiadoAte, estado.dia])

  const proximoLembrete = Math.max(estado.referencia + cfg.intervaloMin * 60_000, estado.adiadoAte)

  return {
    ...estado,
    metaMl: cfg.metaMl,
    copoMl: cfg.copoMl,
    proximoLembrete,
    beber: (ml = cfg.copoMl) =>
      setSalvo({ ...estado, bebidoMl: estado.bebidoMl + ml, goles: [...estado.goles, ml], referencia: Date.now() }),
    desfazer: () => {
      const ultimo = estado.goles.at(-1)
      if (ultimo === undefined) return
      setSalvo({ ...estado, bebidoMl: Math.max(0, estado.bebidoMl - ultimo), goles: estado.goles.slice(0, -1) })
    },
    zerar: () => setSalvo(VAZIO()),
    adiar: (min: number) => setSalvo({ ...estado, adiadoAte: Date.now() + min * 60_000 }),
  }
}

export type Agua = ReturnType<typeof useAgua>
