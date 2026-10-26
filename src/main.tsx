import { getCurrentWindow } from '@tauri-apps/api/window'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Configuracoes } from './config/Configuracoes'
import './index.css'
import { Notch } from './notch/Notch'

// Um só bundle para as duas janelas; o rótulo da janela decide o que renderizar.
const ehNotch = getCurrentWindow().label === 'notch'
document.body.classList.add(ehNotch ? 'janela-notch' : 'janela-config')

createRoot(document.getElementById('raiz')!).render(<StrictMode>{ehNotch ? <Notch /> : <Configuracoes />}</StrictMode>)
