import { useCallback, useEffect, useRef, useState } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

export type IconeAviso =
  | 'musica'
  | 'bateria'
  | 'bateria-baixa'
  | 'carregando'
  | 'caps'
  | 'internet'
  | 'sem-internet'
  | 'agua'
  | 'foco'
  | 'pausa'
  | 'ia'

export type Aviso = {
  id: number
  icone: IconeAviso
  titulo: string
  texto?: string
  /** Cor de destaque (ícone/acento). */
  cor?: string
  capa?: string | null
  duracaoMs?: number
}

export type NovoAviso = Omit<Aviso, 'id'>

/**
 * Fila de avisos estilo "ilha": um por vez, cada um some sozinho. Avisos que
 * chegam enquanto outro está na tela esperam a vez em vez de sobrescrever.
 */
export function useAvisos() {
  const [atual, setAtual] = useState<Aviso | null>(null)
  const fila = useRef<Aviso[]>([])
  const proximoId = useRef(1)

  const avisar = useCallback((aviso: NovoAviso) => {
    const completo = { ...aviso, id: proximoId.current++ }
    setAtual((agora) => {
      if (agora) {
        fila.current.push(completo)
        return agora
      }
      return completo
    })
  }, [])

  useEffect(() => {
    if (!atual) return
    const t = setTimeout(() => setAtual(fila.current.shift() ?? null), atual.duracaoMs ?? 3500)
    return () => clearTimeout(t)
  }, [atual])

  const dispensar = useCallback(() => setAtual(fila.current.shift() ?? null), [])

  return { aviso: atual, avisar, dispensar }
}

let permissao: Promise<boolean> | null = null

/** Notificação nativa do sistema, para avisos importantes (água, foco). */
export async function notificarSistema(titulo: string, corpo?: string) {
  permissao ??= isPermissionGranted().then((ok) => ok || requestPermission().then((r) => r === 'granted'))
  if (await permissao) sendNotification({ title: titulo, body: corpo })
}
