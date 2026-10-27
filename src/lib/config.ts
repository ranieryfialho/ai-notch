import { emit, listen } from '@tauri-apps/api/event'
import { LazyStore } from '@tauri-apps/plugin-store'
import { useEffect, useState } from 'react'

/** As páginas do notch aberto, na ordem do carrossel. */
export const PAGINAS_NOTCH = [
  { id: 'musica', rotulo: 'Música', descricao: 'O que está tocando, controles e letra sincronizada.' },
  { id: 'foco', rotulo: 'Pomodoro', descricao: 'Timer de foco com pausas curtas e longas.' },
  { id: 'agua', rotulo: 'Lembrete de Água', descricao: 'Meta diária e lembretes para beber água.' },
  { id: 'prateleira', rotulo: 'Prateleira', descricao: 'Arraste arquivos para o notch e depois para fora.' },
  { id: 'tarefas', rotulo: 'Lista de Tarefas', descricao: 'Tarefas rápidas e as concluídas do dia.' },
  { id: 'ias', rotulo: 'Minhas IAs', descricao: 'Uso das suas contas de IA, conta por conta.' },
] as const

export type PaginaNotch = (typeof PAGINAS_NOTCH)[number]['id']

/** Borda da tela onde o notch fica. */
export type Posicao = 'topo' | 'base' | 'esquerda' | 'direita'

export type Config = {
  /** Quais páginas aparecem no carrossel do notch aberto. */
  paginas: Record<PaginaNotch, boolean>
  posicao: Posicao
  notchMinimo: boolean
  mascote: boolean
  letras: boolean
  avisos: {
    musica: boolean
    bateria: boolean
    capsLock: boolean
    internet: boolean
    ia: boolean
    notificacaoDoSistema: boolean
  }
  foco: { focoMin: number; pausaCurtaMin: number; pausaLongaMin: number; ciclosAtePausaLonga: number }
  agua: { ativo: boolean; metaMl: number; copoMl: number; intervaloMin: number; inicioHora: number; fimHora: number }
  ia: { intervaloMin: number; alertaPct: number }
}

export const CONFIG_PADRAO: Config = {
  paginas: { musica: true, foco: true, agua: true, prateleira: true, tarefas: true, ias: true },
  posicao: 'topo',
  notchMinimo: false,
  mascote: true,
  letras: true,
  avisos: { musica: true, bateria: true, capsLock: true, internet: true, ia: true, notificacaoDoSistema: true },
  foco: { focoMin: 25, pausaCurtaMin: 5, pausaLongaMin: 15, ciclosAtePausaLonga: 4 },
  agua: { ativo: true, metaMl: 2000, copoMl: 250, intervaloMin: 60, inicioHora: 8, fimHora: 22 },
  ia: { intervaloMin: 5, alertaPct: 80 },
}

const store = new LazyStore('config.json')
const EVENTO = 'config-alterada'

function mesclar(salva: Partial<Config> | undefined): Config {
  // Mescla por seção para que campos novos de versões futuras ganhem o padrão.
  const c = salva ?? {}
  return {
    ...CONFIG_PADRAO,
    ...c,
    paginas: { ...CONFIG_PADRAO.paginas, ...c.paginas },
    avisos: { ...CONFIG_PADRAO.avisos, ...c.avisos },
    foco: { ...CONFIG_PADRAO.foco, ...c.foco },
    agua: { ...CONFIG_PADRAO.agua, ...c.agua },
    ia: { ...CONFIG_PADRAO.ia, ...c.ia },
  }
}

export async function lerConfig(): Promise<Config> {
  return mesclar(await store.get<Partial<Config>>('config'))
}

export async function salvarConfig(config: Config) {
  await store.set('config', config)
  await store.save()
  // O notch e a janela de configurações são webviews separadas; avisamos as duas.
  await emit(EVENTO, config)
}

export function useConfig(): [Config, (mudar: (c: Config) => Config) => void] {
  const [config, setConfig] = useState(CONFIG_PADRAO)

  useEffect(() => {
    lerConfig().then(setConfig)
    const parar = listen<Config>(EVENTO, (e) => setConfig(mesclar(e.payload)))
    return () => void parar.then((f) => f())
  }, [])

  const atualizar = (mudar: (c: Config) => Config) => {
    setConfig((atual) => {
      const nova = mudar(atual)
      void salvarConfig(nova)
      return nova
    })
  }
  return [config, atualizar]
}

/** Estado persistido simples (tarefas, água, prateleira), um arquivo para o notch. */
const dados = new LazyStore('dados.json')

export function usePersistido<T>(chave: string, inicial: T): [T, (v: T | ((a: T) => T)) => void, boolean] {
  const [valor, setValor] = useState<T>(inicial)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    dados.get<T>(chave).then((v) => {
      if (v !== undefined && v !== null) setValor(v)
      setCarregado(true)
    })
  }, [chave])

  const atualizar = (v: T | ((a: T) => T)) => {
    setValor((atual) => {
      const novo = typeof v === 'function' ? (v as (a: T) => T)(atual) : v
      void dados.set(chave, novo).then(() => dados.save())
      return novo
    })
  }
  return [valor, atualizar, carregado]
}
