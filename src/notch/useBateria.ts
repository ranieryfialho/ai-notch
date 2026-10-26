import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { api, type Bateria } from '../lib/api'

/** Desktop sem bateria: mostramos "na tomada" (anel cheio com raio), como no Nusa. */
export const NA_TOMADA: Bateria = { percentual: 100, conectada: true, cheia: true }

/** Estado da bateria (null em desktop sem bateria) + callback a cada mudança. */
export function useBateria(aoMudar: (atual: Bateria, anterior: Bateria) => void) {
  const [bateria, setBateria] = useState<Bateria | null>(null)
  const anterior = useRef<Bateria | null>(null)
  const callback = useRef(aoMudar)
  callback.current = aoMudar

  useEffect(() => {
    api
      .bateriaAtual()
      .then((b) => {
        anterior.current = b
        setBateria(b)
      })
      .catch(() => {})
    const parar = listen<Bateria>('bateria', ({ payload: b }) => {
      const antes = anterior.current
      anterior.current = b
      setBateria(b)
      if (antes) callback.current(b, antes)
    })
    return () => void parar.then((f) => f())
  }, [])

  return bateria
}
