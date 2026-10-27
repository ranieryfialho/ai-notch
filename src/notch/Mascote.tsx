import { motion, type TargetAndTransition } from 'motion/react'
import { useEffect, useId, useState } from 'react'

export type Humor = 'normal' | 'curtindo' | 'dormindo' | 'preocupado' | 'feliz' | 'piscando'

type Lugar = -1 | 0 | 1
type Gesto = 'piscar' | 'saltar' | 'pirueta' | 'balanco'

type Passo = { tipo: 'andar'; ate: Lugar } | { tipo: 'gesto'; gesto: Gesto } | { tipo: 'esperar' }

/** Distância (px) do meio até cada ponta do notch. */
const ALCANCE = 30
/** Velocidade da caminhada, em px por segundo: devagar, de propósito. */
const VELOCIDADE = 22
const PASSO = 0.36
const ESPERA_MS = 60_000

/** A rotina do Faísca com a música pausada. Ao terminar, recomeça. */
const ROTEIRO: Passo[] = [
  { tipo: 'andar', ate: -1 },
  { tipo: 'gesto', gesto: 'piscar' },
  { tipo: 'esperar' },
  { tipo: 'andar', ate: 1 },
  { tipo: 'gesto', gesto: 'saltar' },
  { tipo: 'esperar' },
  { tipo: 'andar', ate: 0 },
  { tipo: 'gesto', gesto: 'pirueta' },
  { tipo: 'esperar' },
  { tipo: 'andar', ate: 1 },
  { tipo: 'gesto', gesto: 'piscar' },
  { tipo: 'esperar' },
  { tipo: 'andar', ate: -1 },
  { tipo: 'gesto', gesto: 'balanco' },
  { tipo: 'esperar' },
  { tipo: 'andar', ate: 0 },
  { tipo: 'gesto', gesto: 'saltar' },
  { tipo: 'esperar' },
]

const ANIMACAO_GESTO: Record<Exclude<Gesto, 'piscar'>, TargetAndTransition> = {
  saltar: { y: [0, 1, -6, 0, -1.5, 0], scaleY: [1, 0.75, 1.12, 0.85, 1.04, 1], scaleX: [1, 1.15, 0.92, 1.1, 1, 1], transition: { duration: 0.9, ease: 'easeOut' } },
  pirueta: { rotateY: [0, 360], y: [0, -3, 0], transition: { duration: 0.9, ease: 'easeInOut' } },
  balanco: { rotate: [0, -16, 16, -10, 10, 0], transition: { duration: 1.4, ease: 'easeInOut' } },
}

/**
 * O Faísca seguindo o roteiro: anda até um lugar, faz um gesto e fica 60 s
 * por lá antes do próximo passo. A posição se mantém entre os passos.
 * `humorBase` é a cara dele entre um gesto e outro. Com `vertical` (notch nas
 * laterais) ele anda para cima e para baixo, sem girar o rosto.
 */
export function MascoteFiruleiro({ tamanho = 20, humorBase = 'normal', vertical = false }: { tamanho?: number; humorBase?: Humor; vertical?: boolean }) {
  const [indice, setIndice] = useState(0)
  const [lugar, setLugar] = useState<Lugar>(0)
  const [andando, setAndando] = useState(false)
  const [humor, setHumor] = useState<Humor>('normal')
  const [gesto, setGesto] = useState<{ nome: Gesto; vez: number } | null>(null)

  const passo = ROTEIRO[indice % ROTEIRO.length]
  const proximo = () => setIndice((i) => i + 1)

  useEffect(() => {
    if (passo.tipo === 'esperar') {
      const t = setTimeout(proximo, ESPERA_MS)
      return () => clearTimeout(t)
    }
    if (passo.tipo === 'andar') {
      if (passo.ate === lugar) {
        proximo()
        return
      }
      setAndando(true)
      setLugar(passo.ate)
      return
    }
    // Piscar é troca de cara, não movimento: resolve com timer.
    if (passo.gesto === 'piscar') {
      setHumor('piscando')
      const t = setTimeout(() => {
        setHumor('normal')
        proximo()
      }, 900)
      return () => clearTimeout(t)
    }
    setHumor('feliz')
    setGesto({ nome: passo.gesto, vez: indice })
  }, [indice])

  const origem = lugarAnterior(indice) ?? 0
  const direcao = andando && !vertical ? Math.sign(lugar - origem) : 0
  const duracaoAndar = andando ? Math.max(0.6, (ALCANCE * Math.abs(lugar - origem)) / VELOCIDADE) : 0.3

  return (
    <div className="relative grid place-items-center" style={{ perspective: 110 }}>
      <motion.div
        className="relative grid place-items-center"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={vertical ? { x: 0, y: lugar * ALCANCE, rotateY: 0 } : { x: lugar * ALCANCE, y: 0, rotateY: direcao * 28 }}
        transition={{ x: { duration: duracaoAndar, ease: 'easeInOut' }, y: { duration: duracaoAndar, ease: 'easeInOut' }, rotateY: { duration: 0.35 } }}
        onAnimationComplete={() => {
          if (!andando) return
          setAndando(false)
          proximo()
        }}
      >
        <motion.div
          animate={andando ? { y: [0, -2, 0], rotate: [-4, 4, -4] } : { y: 0, rotate: 0 }}
          transition={andando ? { duration: PASSO, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        >
          <motion.div
            key={gesto?.vez ?? 'parado'}
            style={{ transformStyle: 'preserve-3d', transformOrigin: '50% 100%' }}
            animate={gesto ? ANIMACAO_GESTO[gesto.nome as Exclude<Gesto, 'piscar'>] : undefined}
            onAnimationComplete={() => {
              if (!gesto) return
              setGesto(null)
              setHumor('normal')
              proximo()
            }}
          >
            <Mascote humor={humor === 'normal' ? humorBase : humor} tamanho={tamanho} parado olhar={direcao} andando={andando} />
          </motion.div>
        </motion.div>
        <motion.span
          className="absolute -bottom-[2px] h-[3px] w-[14px] rounded-full bg-violet-950/80 blur-[1px]"
          animate={andando ? { scaleX: [1, 0.75, 1] } : { scaleX: 1 }}
          transition={andando ? { duration: PASSO, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        />
      </motion.div>
    </div>
  )
}

/** Lugar onde o Faísca estava antes do passo atual (para medir a distância a andar). */
function lugarAnterior(indice: number): Lugar | null {
  for (let i = indice - 1; i >= 0; i--) {
    const p = ROTEIRO[i % ROTEIRO.length]
    if (p.tipo === 'andar') return p.ate
  }
  return null
}

/**
 * O Faísca: um bichinho de luz que mora no notch. Pisca sozinho e muda de
 * cara conforme o que está acontecendo (música, madrugada, IA no limite).
 */
export function Mascote({
  humor = 'normal',
  tamanho = 22,
  parado = false,
  olhar = 0,
  andando = false,
}: {
  humor?: Humor
  tamanho?: number
  parado?: boolean
  /** -1 (esquerda) a 1 (direita): o rosto escorrega para o lado, como num giro de ¾. */
  olhar?: number
  andando?: boolean
}) {
  const olhosFechados = humor === 'dormindo'
  // Cada instância precisa do próprio gradiente: o brilho muda com o olhar.
  const idCorpo = `corpo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  // Luz fixa à frente: quando ele gira para um lado, o brilho escorrega para o
  // outro e a borda daquele lado escurece, dando volume de esfera.
  const brilhoX = 40 - olhar * 14
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 32 32"
      // `parado`: quem anima é o pai (firulas), sem somar com a flutuação.
      className={parado ? undefined : humor === 'curtindo' ? 'mascote-balanco' : 'mascote-flutua'}
      aria-label="Mascote"
    >
      <defs>
        <radialGradient id={idCorpo} cx={`${brilhoX}%`} cy="35%" fx={`${brilhoX}%`} fy="30%" r="72%">
          <stop offset="0" stopColor="#ddd6fe" />
          <stop offset="0.55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6d28d9" />
        </radialGradient>
      </defs>
      {/* Perninhas atrás do corpo: só a pontinha aparece embaixo. */}
      <g className={andando ? 'mascote-andando' : undefined}>
        <ellipse className="mascote-pe-esq" cx="11.5" cy="28.6" rx="3.2" ry="2.2" fill="#5b21b6" />
        <ellipse className="mascote-pe-dir" cx="20.5" cy="28.6" rx="3.2" ry="2.2" fill="#5b21b6" />
      </g>
      <path d="M16 3 C22 3 28 8 28 16 C28 24 23 29 16 29 C9 29 4 24 4 16 C4 8 10 3 16 3 Z" fill={`url(#${idCorpo})`} />
      <g style={{ transform: `translateX(${olhar * 3}px)`, transition: 'transform 300ms ease' }}>
      {olhosFechados ? (
        <>
          <path d="M10 16 q2 2 4 0" stroke="#1e1b4b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M18 16 q2 2 4 0" stroke="#1e1b4b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : humor === 'piscando' ? (
        <>
          <path d="M10 16 q2 -2.4 4 0" stroke="#1e1b4b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <ellipse cx="20" cy="15" rx="1.8" ry="2.4" fill="#1e1b4b" />
        </>
      ) : humor === 'feliz' || humor === 'curtindo' ? (
        <>
          <path d="M10 17 q2 -3 4 0" stroke="#1e1b4b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M18 17 q2 -3 4 0" stroke="#1e1b4b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <g className="mascote-olhos">
          <ellipse cx="12" cy={humor === 'preocupado' ? 16 : 15} rx="1.8" ry="2.4" fill="#1e1b4b" />
          <ellipse cx="20" cy={humor === 'preocupado' ? 16 : 15} rx="1.8" ry="2.4" fill="#1e1b4b" />
        </g>
      )}
      {humor === 'preocupado' && (
        <>
          <path d="M9.5 11.5 l4 1.5" stroke="#1e1b4b" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M22.5 11.5 l-4 1.5" stroke="#1e1b4b" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      <ellipse cx="9" cy="20" rx="2" ry="1.2" fill="#f0abfc" opacity="0.55" />
      <ellipse cx="23" cy="20" rx="2" ry="1.2" fill="#f0abfc" opacity="0.55" />
      </g>
      {humor === 'dormindo' && (
        <text x="24" y="9" fontSize="7" fill="#c4b5fd" fontFamily="system-ui" className="mascote-zz">
          z
        </text>
      )}
    </svg>
  )
}
