import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { api, type EstadoDitado } from './api'

/** Serviços de transcrição e seus modelos (os mesmos do Open Whisper; os locais em formato ggml). */
export const PROVEDORES = [
  {
    id: 'local',
    rotulo: 'No computador (offline)',
    descricao: 'Whisper rodando na sua máquina. Nada sai do computador e não há custo.',
    chaveUrl: null,
    modelos: [
      { id: 'small', rotulo: 'Whisper Small', descricao: 'Equilíbrio entre velocidade e precisão (~260 MB).' },
      { id: 'base', rotulo: 'Whisper Base', descricao: 'Rápido e leve (~150 MB), mas erra mais em português.' },
      { id: 'large-v3-turbo', rotulo: 'Whisper Large v3 Turbo', descricao: 'O mais preciso offline (~550 MB). Precisa de um computador mais forte.' },
    ],
  },
  {
    id: 'openrouter',
    rotulo: 'OpenRouter',
    descricao: 'Modelos multimodais (Gemini) que ouvem o áudio e escrevem o texto.',
    chaveUrl: 'https://openrouter.ai/keys',
    modelos: [
      { id: 'google/gemini-2.5-flash', rotulo: 'Gemini 2.5 Flash', descricao: 'Muito preciso, inclusive com nomes e mistura de idiomas. Cerca de 3 s.' },
      { id: 'google/gemini-2.5-flash-lite', rotulo: 'Gemini 2.5 Flash Lite', descricao: 'Mais rápido e barato, um pouco menos preciso.' },
      { id: 'google/gemini-2.5-pro', rotulo: 'Gemini 2.5 Pro', descricao: 'O mais caprichado, mais lento.' },
    ],
  },
  {
    id: 'openai',
    rotulo: 'OpenAI',
    descricao: 'API de transcrição da OpenAI.',
    chaveUrl: 'https://platform.openai.com/api-keys',
    modelos: [
      { id: 'gpt-4o-mini-transcribe', rotulo: 'GPT-4o mini Transcribe', descricao: 'Rápido e barato.' },
      { id: 'gpt-4o-transcribe', rotulo: 'GPT-4o Transcribe', descricao: 'Mais preciso.' },
      { id: 'whisper-1', rotulo: 'Whisper', descricao: 'Modelo clássico.' },
    ],
  },
  {
    id: 'groq',
    rotulo: 'Groq',
    descricao: 'Whisper na nuvem, extremamente rápido.',
    chaveUrl: 'https://console.groq.com/keys',
    modelos: [
      { id: 'whisper-large-v3-turbo', rotulo: 'Whisper Large v3 Turbo', descricao: 'Quase instantâneo.' },
      { id: 'whisper-large-v3', rotulo: 'Whisper Large v3', descricao: 'Um pouco mais preciso.' },
    ],
  },
] as const

export type ProvedorDitado = (typeof PROVEDORES)[number]['id']

export const provedorInfo = (id: string) => PROVEDORES.find((p) => p.id === id) ?? PROVEDORES[0]

export const IDIOMAS: [string, string][] = [
  ['auto', 'Detectar automaticamente'],
  ['pt', 'Português'],
  ['en', 'Inglês'],
  ['es', 'Espanhol'],
  ['fr', 'Francês'],
  ['de', 'Alemão'],
  ['it', 'Italiano'],
  ['ru', 'Russo'],
  ['ja', 'Japonês'],
  ['zh', 'Chinês'],
]

// ---- Teclas (códigos do libuiohook, como no Open Whisper) -------------------

const MAC = navigator.userAgent.includes('Mac')
const WIN = navigator.userAgent.includes('Windows')
const META = MAC ? 'Cmd' : WIN ? 'Win' : 'Super'

const NOMES: Record<number, string> = {
  1: 'Esc',
  14: 'Backspace',
  15: 'Tab',
  28: 'Enter',
  57: 'Espaço',
  58: 'Caps Lock',
  29: MAC ? 'Control' : 'Ctrl',
  3613: MAC ? 'Control direito' : 'Ctrl direito',
  56: MAC ? 'Option' : 'Alt',
  3640: MAC ? 'Option direito' : 'Alt direito',
  42: 'Shift',
  54: 'Shift direito',
  3675: META,
  3676: `${META} direito`,
  3655: 'Home',
  3663: 'End',
  3657: 'Page Up',
  3665: 'Page Down',
  3666: 'Insert',
  3667: 'Delete',
  57416: '↑',
  57424: '↓',
  57419: '←',
  57421: '→',
}
const LETRAS: Record<number, string> = {
  30: 'A', 48: 'B', 46: 'C', 32: 'D', 18: 'E', 33: 'F', 34: 'G', 35: 'H', 23: 'I', 36: 'J', 37: 'K', 38: 'L', 50: 'M',
  49: 'N', 24: 'O', 25: 'P', 16: 'Q', 19: 'R', 31: 'S', 20: 'T', 22: 'U', 47: 'V', 17: 'W', 45: 'X', 21: 'Y', 44: 'Z',
}
const DIGITOS = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const TECLAS_F = [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 87, 88]

export function rotuloTecla(codigo: number) {
  if (NOMES[codigo]) return NOMES[codigo]
  if (LETRAS[codigo]) return LETRAS[codigo]
  const d = DIGITOS.indexOf(codigo)
  if (d >= 0) return String(d)
  const f = TECLAS_F.indexOf(codigo)
  if (f >= 0) return `F${f + 1}`
  return `Tecla ${codigo}`
}

export const rotuloAtalho = (teclas: number[]) => (teclas.length ? teclas.map(rotuloTecla).join(' + ') : 'Nenhum')

/** Teclas que podem travar a gravação (tocadas com o atalho pressionado). */
export const TECLAS_TRAVAR: [number, string][] = [57, 15, 28, 58].map((c) => [c, rotuloTecla(c)])

// ---- Estado ao vivo ---------------------------------------------------------

/** Quantas barrinhas de volume a onda do notch mostra. */
const BARRAS = 26

/** Fase do ditado e o volume recente do microfone (para a onda do notch). */
export function useDitado() {
  const [estado, setEstado] = useState<EstadoDitado>({ tipo: 'oculto' })
  const [niveis, setNiveis] = useState<number[]>(() => Array(BARRAS).fill(0))
  const gravando = useRef(false)

  useEffect(() => {
    api.ditadoEstado().then(setEstado).catch(() => {})
    const pararEstado = listen<EstadoDitado>('ditado-estado', ({ payload }) => {
      if (payload.tipo === 'gravando' && !gravando.current) setNiveis(Array(BARRAS).fill(0))
      gravando.current = payload.tipo === 'gravando'
      setEstado(payload)
    })
    const pararNivel = listen<number>('ditado-nivel', ({ payload }) => setNiveis((n) => [...n.slice(1), payload]))
    return () => {
      void pararEstado.then((f) => f())
      void pararNivel.then((f) => f())
    }
  }, [])

  // Mensagens somem sozinhas (erro fica mais tempo).
  useEffect(() => {
    if (estado.tipo !== 'mensagem') return
    const t = setTimeout(() => setEstado({ tipo: 'oculto' }), estado.erro ? 4500 : 2200)
    return () => clearTimeout(t)
  }, [estado])

  return { estado, niveis }
}

/** Dois bipes curtos: subindo ao começar, descendo ao parar (como no Open Whisper). */
export function tocarBipe(tipo: 'comecar' | 'parar') {
  try {
    const ctx = new AudioContext()
    const notas = tipo === 'comecar' ? [660, 880] : [880, 660]
    notas.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.09
      const osc = ctx.createOscillator()
      const ganho = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      ganho.gain.setValueAtTime(0, t)
      ganho.gain.linearRampToValueAtTime(0.08, t + 0.01)
      ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
      osc.connect(ganho).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.13)
    })
    setTimeout(() => void ctx.close(), 600)
  } catch {
    // Sem áudio na webview: segue sem bipe.
  }
}
