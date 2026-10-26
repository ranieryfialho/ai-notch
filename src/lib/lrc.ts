export type LinhaLetra = { tempoMs: number; texto: string }

/** Lê o formato LRC: "[01:23.45] texto". Uma linha pode ter vários tempos. */
export function lerLrc(lrc: string): LinhaLetra[] {
  const linhas: LinhaLetra[] = []
  for (const bruta of lrc.split(/\r?\n/)) {
    const tempos = [...bruta.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (tempos.length === 0) continue
    const texto = bruta.replace(/\[[^\]]*\]/g, '').trim()
    for (const [, min, seg] of tempos) {
      linhas.push({ tempoMs: (Number(min) * 60 + Number(seg)) * 1000, texto })
    }
  }
  return linhas.sort((a, b) => a.tempoMs - b.tempoMs)
}

/** Índice da linha ativa na posição dada (-1 antes da primeira). */
export function linhaAtual(linhas: LinhaLetra[], posicaoMs: number) {
  let ini = 0
  let fim = linhas.length - 1
  let achada = -1
  while (ini <= fim) {
    const meio = (ini + fim) >> 1
    if (linhas[meio].tempoMs <= posicaoMs) {
      achada = meio
      ini = meio + 1
    } else {
      fim = meio - 1
    }
  }
  return achada
}
