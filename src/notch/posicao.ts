import type { CSSProperties } from 'react'
import type { Posicao } from '../lib/config'

/** Nas laterais o notch recolhido fica em pé. */
export const ehVertical = (p: Posicao) => p === 'esquerda' || p === 'direita'

/** Onde o notch se encosta dentro da janela (a janela já está colada na borda). */
export const ALINHAMENTO: Record<Posicao, string> = {
  topo: 'items-start justify-center',
  base: 'items-end justify-center',
  esquerda: 'items-center justify-start',
  direita: 'items-center justify-end',
}

/** Deslocamento de quem surge "de dentro da borda" ao abrir. */
export function daBorda(p: Posicao, px: number) {
  if (p === 'topo') return { x: 0, y: -px }
  if (p === 'base') return { x: 0, y: px }
  return { x: p === 'esquerda' ? -px : px, y: 0 }
}

/** Arredonda só os cantos longe da borda; os quatro sempre vão, para a mola trocar de lado. */
export function cantos(p: Posicao, raio: number) {
  return {
    borderTopLeftRadius: p === 'base' || p === 'direita' ? raio : 0,
    borderTopRightRadius: p === 'base' || p === 'esquerda' ? raio : 0,
    borderBottomLeftRadius: p === 'topo' || p === 'direita' ? raio : 0,
    borderBottomRightRadius: p === 'topo' || p === 'esquerda' ? raio : 0,
  }
}

/**
 * As duas orelhas: cantos côncavos onde o notch encontra a borda da tela.
 * O círculo transparente fica no canto da orelha mais longe da borda e do notch.
 */
export function orelhas(p: Posicao, tamanho: number): [CSSProperties, CSSProperties] {
  const fundo = (centro: string) => `radial-gradient(circle at ${centro}, transparent ${tamanho - 0.5}px, #000 ${tamanho}px)`
  const base: CSSProperties = { width: tamanho, height: tamanho }
  switch (p) {
    case 'topo':
      return [
        { ...base, top: 0, left: -tamanho, background: fundo('0% 100%') },
        { ...base, top: 0, right: -tamanho, background: fundo('100% 100%') },
      ]
    case 'base':
      return [
        { ...base, bottom: 0, left: -tamanho, background: fundo('0% 0%') },
        { ...base, bottom: 0, right: -tamanho, background: fundo('100% 0%') },
      ]
    case 'esquerda':
      return [
        { ...base, left: 0, top: -tamanho, background: fundo('100% 0%') },
        { ...base, left: 0, bottom: -tamanho, background: fundo('100% 100%') },
      ]
    case 'direita':
      return [
        { ...base, right: 0, top: -tamanho, background: fundo('0% 0%') },
        { ...base, right: 0, bottom: -tamanho, background: fundo('0% 100%') },
      ]
  }
}
