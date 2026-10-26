import { useEffect, useRef, useState } from 'react'
import { api, type Letra, type Midia } from '../lib/api'
import { lerLrc, type LinhaLetra } from '../lib/lrc'

type Leitura = { midia: Midia; recebidaEm: number }

/** Consulta o player a cada segundo; a posição é interpolada no meio tempo. */
export function useMidia() {
  const [leitura, setLeitura] = useState<Leitura | null>(null)

  useEffect(() => {
    let vivo = true
    let ocupado = false
    const consultar = async () => {
      if (ocupado) return
      ocupado = true
      try {
        const midia = await api.midiaAtual()
        if (vivo) setLeitura(midia ? { midia, recebidaEm: Date.now() } : null)
      } catch {
        if (vivo) setLeitura(null)
      } finally {
        ocupado = false
      }
    }
    void consultar()
    const t = setInterval(consultar, 1000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  const comando = async (acao: 'tocar-pausar' | 'proxima' | 'anterior') => {
    await api.midiaComando(acao).catch(() => {})
    // Atualiza já, para o botão de play/pause não esperar o próximo ciclo.
    setTimeout(async () => {
      const midia = await api.midiaAtual().catch(() => null)
      setLeitura(midia ? { midia, recebidaEm: Date.now() } : null)
    }, 250)
  }

  return { leitura, comando }
}

export function posicaoAgora(leitura: Leitura | null) {
  if (!leitura) return 0
  const { midia, recebidaEm } = leitura
  const pos = midia.posicaoMs + (midia.tocando ? Date.now() - recebidaEm : 0)
  return midia.duracaoMs > 0 ? Math.min(pos, midia.duracaoMs) : pos
}

/** Re-renderiza a cada intervalo, para barras de progresso e letras. */
export function useTique(ms: number, ativo = true) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!ativo) return
    const t = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms, ativo])
}

export type EstadoLetra =
  | { tipo: 'carregando' }
  | { tipo: 'sincronizada'; linhas: LinhaLetra[] }
  | { tipo: 'simples'; texto: string }
  | { tipo: 'indisponivel' }

export function useLetra(midia: Midia | null, ativo: boolean): EstadoLetra | null {
  const cache = useRef(new Map<string, Letra | null>())
  const [estado, setEstado] = useState<EstadoLetra | null>(null)
  const chave = midia ? `${midia.artista}\u0000${midia.titulo}` : null

  useEffect(() => {
    if (!ativo || !midia || !chave) {
      setEstado(null)
      return
    }
    const converter = (l: Letra | null): EstadoLetra => {
      if (l?.sincronizada) return { tipo: 'sincronizada', linhas: lerLrc(l.sincronizada) }
      if (l?.simples) return { tipo: 'simples', texto: l.simples }
      return { tipo: 'indisponivel' }
    }
    if (cache.current.has(chave)) {
      setEstado(converter(cache.current.get(chave)!))
      return
    }
    let vivo = true
    setEstado({ tipo: 'carregando' })
    api
      .buscarLetra(midia)
      .then((l) => {
        cache.current.set(chave, l)
        if (vivo) setEstado(converter(l))
      })
      .catch(() => vivo && setEstado({ tipo: 'indisponivel' }))
    return () => {
      vivo = false
    }
    // A duração chega junto com a faixa; buscar só quando a faixa muda.
  }, [chave, ativo])

  return estado
}
