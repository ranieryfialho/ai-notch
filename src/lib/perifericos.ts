import { listen } from '@tauri-apps/api/event'
import { BatteryMedium, Gamepad2, Headphones, Keyboard, Mouse, PenTool } from 'lucide-react'
import { createElement, useEffect, useState } from 'react'
import { api, type Ambiente, type Dispositivo } from './api'
import { LIMITE_PADRAO, type Config } from './config'

/** Periféricos com bateria, ao vivo (o Rust emite `perifericos` a cada mudança). */
export function usePerifericos() {
  const [lista, setLista] = useState<Dispositivo[]>([])
  useEffect(() => {
    api.perifericosAtuais().then(setLista).catch(() => {})
    const parar = listen<Dispositivo[]>('perifericos', ({ payload }) => setLista(payload))
    return () => void parar.then((f) => f())
  }, [])
  return lista
}

/** Dispositivo com as preferências do usuário já aplicadas. */
export type Periferico = Dispositivo & { nomeOriginal: string; naBarra: boolean; limite: number }

export function comPreferencias(lista: Dispositivo[], prefs: Config['perifericos']): Periferico[] {
  return lista.map((d) => ({
    ...d,
    nome: prefs.nomes[d.id]?.trim() || d.nome,
    nomeOriginal: d.nome,
    naBarra: !prefs.ocultos.includes(d.id),
    limite: prefs.limites[d.id] ?? LIMITE_PADRAO,
  }))
}

/** Verde carregando, vermelho no limite ou abaixo, claro no resto (como no BatteryHub). */
export function corPeriferico(p: Periferico) {
  if (p.estado === 'carregando' || p.estado === 'cheia') return '#4ade80'
  if (p.percentual <= p.limite) return '#f87171'
  return '#e4e4e7'
}

export const ROTULO_TIPO: Record<Dispositivo['tipo'], string> = {
  headset: 'Headset',
  fones: 'Fones',
  mouse: 'Mouse',
  teclado: 'Teclado',
  controle: 'Controle',
  caneta: 'Caneta',
  outro: 'Dispositivo',
}

export const ROTULO_CONEXAO: Record<Dispositivo['conexao'], string | null> = {
  bluetooth: 'Bluetooth',
  receptor: 'Receptor USB',
  desconhecida: null,
}

export const ROTULO_ESTADO: Record<Dispositivo['estado'], string | null> = {
  carregando: 'carregando',
  cheia: 'carregado',
  descarregando: null,
  desconhecido: null,
}

const ICONES = { headset: Headphones, fones: Headphones, mouse: Mouse, teclado: Keyboard, controle: Gamepad2, caneta: PenTool, outro: BatteryMedium }

export function IconeTipo({ tipo, tamanho = 16 }: { tipo: Dispositivo['tipo']; tamanho?: number }) {
  return createElement(ICONES[tipo], { size: tamanho })
}

/** Sistema e painel atuais (null até o Rust responder). */
export function useAmbiente() {
  const [ambiente, setAmbiente] = useState<Ambiente | null>(null)
  useEffect(() => {
    api.ambiente().then(setAmbiente).catch(() => {})
  }, [])
  return ambiente
}

/** De onde vem a carga dos periféricos em cada sistema (texto das configurações). */
export const FONTE_PERIFERICOS: Record<Ambiente['so'], string> = {
  linux: 'No Linux a carga vem do sistema (UPower): Logitech, DualSense, Xbox e Bluetooth em geral, na hora em que muda.',
  macos: 'No Mac a carga vem dos acessórios Bluetooth: Magic Mouse, Keyboard e Trackpad, AirPods e outros que informam bateria. Atualiza a cada minuto.',
  windows:
    'No Windows a carga vem dos aparelhos Bluetooth (a mesma das Configurações do Windows) e dos controles Xbox. Atualiza a cada minuto. Receptores USB próprios (Logitech, headsets 2,4 GHz) ainda não são lidos.',
}

/** Como "Bandeja" aparece em cada painel. */
export function descricaoBandeja(a: Ambiente) {
  if (a.so === 'macos') return 'Ao lado do ícone do AI Notch na barra de menus.'
  if (a.so === 'windows') return 'Um ícone por aparelho na área de notificação, com a % desenhada. O Windows esconde ícones novos atrás do ^: arraste-os para a barra.'
  if (!a.rotuloNaBandeja) return 'Um ícone por aparelho na bandeja, com a % desenhada (o Plasma não mostra texto ao lado do ícone).'
  if (a.gnome) return 'Bandeja: ao lado do ícone do AI Notch. Pílula: dentro da pílula do painel (extensão do GNOME).'
  return 'Ao lado do ícone do AI Notch na bandeja.'
}
