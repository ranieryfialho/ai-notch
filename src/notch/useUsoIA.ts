import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, mensagemDeErro, type ContaIA, type JanelaUso } from '../lib/api'

export type UsoConta = {
  conta: ContaIA
  janelas?: JanelaUso[]
  erro?: string
  checadoEm?: number
  carregando: boolean
}

export const EVENTO_CONTAS_IA = 'contas-ia-alteradas'

/**
 * Pior caso entre todas as contas e janelas. Janela de limite não soma
 * (100% + 100% não é 200%): o que importa é a mais perto de estourar.
 */
export function piorUso(usos: UsoConta[]) {
  let pior: { pct: number; conta: ContaIA; janela: JanelaUso } | null = null
  for (const u of usos) {
    for (const j of u.janelas ?? []) {
      if (j.utilizacao === null) continue
      if (!pior || j.utilizacao > pior.pct) pior = { pct: j.utilizacao, conta: u.conta, janela: j }
    }
  }
  return pior
}

export function useUsoIA(intervaloMin: number, aoPassarDoLimite: (conta: ContaIA, janela: JanelaUso) => void, limite: number) {
  const [usos, setUsos] = useState<UsoConta[]>([])
  const avisados = useRef(new Set<string>())
  const alerta = useRef(aoPassarDoLimite)
  alerta.current = aoPassarDoLimite

  const atualizarConta = useCallback(
    async (conta: ContaIA) => {
      setUsos((us) => us.map((u) => (u.conta.id === conta.id ? { ...u, carregando: true } : u)))
      try {
        const janelas = await api.iaUso(conta.id)
        for (const j of janelas) {
          // Um alerta por janela de reset, não a cada consulta.
          const chave = `${conta.id}:${j.rotulo}:${j.resetaEm}`
          if (j.utilizacao !== null && j.utilizacao * 100 >= limite && !avisados.current.has(chave)) {
            avisados.current.add(chave)
            alerta.current(conta, j)
          }
        }
        setUsos((us) =>
          us.map((u) => (u.conta.id === conta.id ? { conta, janelas, checadoEm: Date.now(), carregando: false } : u)),
        )
      } catch (e) {
        setUsos((us) => us.map((u) => (u.conta.id === conta.id ? { ...u, erro: mensagemDeErro(e), carregando: false } : u)))
      }
    },
    [limite],
  )

  const recarregar = useCallback(async () => {
    const contas = await api.iaContas().catch(() => [] as ContaIA[])
    setUsos((anteriores) =>
      contas.map((conta) => {
        const antes = anteriores.find((u) => u.conta.id === conta.id)
        return antes ? { ...antes, conta } : { conta, carregando: true }
      }),
    )
    await Promise.all(contas.map(atualizarConta))
  }, [atualizarConta])

  useEffect(() => {
    void recarregar()
    // Cada consulta do Claude é uma chamada real à API: intervalo mínimo de 1 min.
    const t = setInterval(recarregar, Math.max(1, intervaloMin) * 60_000)
    const parar = listen(EVENTO_CONTAS_IA, () => void recarregar())
    return () => {
      clearInterval(t)
      void parar.then((f) => f())
    }
  }, [recarregar, intervaloMin])

  return { usos, recarregar }
}
