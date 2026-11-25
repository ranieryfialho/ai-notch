import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/**
 * O que a pílula da barra (extensão do GNOME) mostra no lugar do relógio.
 * As cores já vão calculadas para a extensão só desenhar.
 */
export type ResumoBarra = {
  musica: { titulo: string; artista: string; tocando: boolean; capa: string | null } | null
  bateria: { percentual: number; conectada: boolean; cor: string } | null
  /** Pomodoro rodando: a extensão conta até `fimEm` sozinha. */
  foco: { fimEm: number; cor: string } | null
  ia: { pct: number; cor: string } | null
  aviso: { id: number; titulo: string; texto: string | null; cor: string | null } | null
  /** Só quando o usuário escolheu mostrar os periféricos na pílula. */
  perifericos: { tipo: string; pct: number; cor: string; carregando: boolean }[] | null
}

/** True enquanto a extensão da barra está conectada (o notch recolhido some). */
export function useModoBarra() {
  const [ligado, setLigado] = useState(false)
  useEffect(() => {
    api.modoBarra().then(setLigado).catch(() => {})
    const parar = listen<boolean>('modo-barra', ({ payload }) => setLigado(payload))
    return () => void parar.then((f) => f())
  }, [])
  return ligado
}

/** Publica o resumo só quando ele muda de fato. */
export function usePublicarBarra(resumo: ResumoBarra) {
  const json = JSON.stringify(resumo)
  useEffect(() => {
    void api.publicarBarra(json).catch(() => {})
  }, [json])
}
