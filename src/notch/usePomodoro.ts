import { useEffect, useRef, useState } from 'react'
import type { Config } from '../lib/config'

export type ModoFoco = 'foco' | 'curta' | 'longa'

export const ROTULO_MODO: Record<ModoFoco, string> = {
  foco: 'Foco',
  curta: 'Pausa curta',
  longa: 'Pausa longa',
}

type Estado = {
  modo: ModoFoco
  rodando: boolean
  /** Epoch do fim quando rodando; restante congelado quando pausado. */
  fimEm: number
  restanteMs: number
  ciclos: number
}

export function usePomodoro(cfg: Config['foco'], aoTerminar: (concluido: ModoFoco, proximo: ModoFoco) => void) {
  const duracao = (m: ModoFoco) => (m === 'foco' ? cfg.focoMin : m === 'curta' ? cfg.pausaCurtaMin : cfg.pausaLongaMin) * 60_000

  const [estado, setEstado] = useState<Estado>(() => ({
    modo: 'foco',
    rodando: false,
    fimEm: 0,
    restanteMs: duracao('foco'),
    ciclos: 0,
  }))
  const [, setTique] = useState(0)
  const terminar = useRef(aoTerminar)
  terminar.current = aoTerminar

  // Mudou a duração nas configurações com o timer parado: reflete na hora.
  useEffect(() => {
    setEstado((e) => (e.rodando ? e : { ...e, restanteMs: duracao(e.modo) }))
  }, [cfg.focoMin, cfg.pausaCurtaMin, cfg.pausaLongaMin])

  useEffect(() => {
    if (!estado.rodando) return
    const t = setInterval(() => {
      if (Date.now() < estado.fimEm) {
        setTique((n) => n + 1)
        return
      }
      const ciclos = estado.modo === 'foco' ? estado.ciclos + 1 : estado.ciclos
      const proximo: ModoFoco =
        estado.modo !== 'foco' ? 'foco' : ciclos % cfg.ciclosAtePausaLonga === 0 ? 'longa' : 'curta'
      terminar.current(estado.modo, proximo)
      setEstado({ modo: proximo, rodando: false, fimEm: 0, restanteMs: duracao(proximo), ciclos })
    }, 250)
    return () => clearInterval(t)
  }, [estado])

  const restanteMs = estado.rodando ? Math.max(0, estado.fimEm - Date.now()) : estado.restanteMs

  return {
    ...estado,
    restanteMs,
    totalMs: duracao(estado.modo),
    iniciar: () => setEstado((e) => (e.rodando ? e : { ...e, rodando: true, fimEm: Date.now() + e.restanteMs })),
    pausar: () => setEstado((e) => (e.rodando ? { ...e, rodando: false, restanteMs: Math.max(0, e.fimEm - Date.now()) } : e)),
    reiniciar: () => setEstado((e) => ({ ...e, rodando: false, restanteMs: duracao(e.modo) })),
    escolher: (modo: ModoFoco) => setEstado((e) => ({ ...e, modo, rodando: false, restanteMs: duracao(modo) })),
  }
}

export type Pomodoro = ReturnType<typeof usePomodoro>
