import { useEffect, useRef } from 'react'
import { api } from '../lib/api'

// Tempo para a mola do notch assentar antes de encolher a janela.
const DURACAO_ANIMACAO = 420

/**
 * A janela nativa precisa acompanhar o desenho do notch: se ficar maior que
 * ele, a área transparente rouba cliques do que está atrás. Para a animação
 * CSS não ser cortada, ao crescer a janela aumenta antes; ao encolher, só
 * depois que a animação termina.
 */
export function useJanelaNotch(largura: number, altura: number) {
  const atual = useRef({ largura: 0, altura: 0 })

  useEffect(() => {
    const anterior = atual.current
    if (largura > anterior.largura || altura > anterior.altura) {
      const l = Math.max(largura, anterior.largura)
      const a = Math.max(altura, anterior.altura)
      atual.current = { largura: l, altura: a }
      void api.definirTamanhoNotch(l, a)
    }
    const t = setTimeout(() => {
      atual.current = { largura, altura }
      void api.definirTamanhoNotch(largura, altura)
    }, DURACAO_ANIMACAO)
    return () => clearTimeout(t)
  }, [largura, altura])
}
