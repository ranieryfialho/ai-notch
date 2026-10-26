export function mmss(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** "2h 13min", "45min", "menos de 1min" — para contagem até o reset. */
export function duracaoCurta(ms: number) {
  if (ms <= 0) return 'agora'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'menos de 1min'
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
  return `${m}min`
}

/** Versão enxuta para o notch recolhido: "2h13", "45min", "3d". */
export function duracaoCompacta(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min >= 1440) return `${Math.floor(min / 1440)}d`
  if (min >= 60) return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
  return `${min}min`
}

export function litros(ml: number) {
  return `${(ml / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} L`
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`
  const unidades = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unidades[i]}`
}

export function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Cor da barra de uso: verde até 60%, âmbar até 85%, vermelho acima. */
export function corUso(pct: number) {
  if (pct >= 0.85) return '#f87171'
  if (pct >= 0.6) return '#fbbf24'
  return '#4ade80'
}
