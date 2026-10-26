import { openUrl } from '@tauri-apps/plugin-opener'
import { Check, ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../lib/api'

const URL_CREDENCIAIS = 'https://console.cloud.google.com/apis/credentials'
const URL_PERMISSAO = 'https://console.cloud.google.com/auth/overview'

/** Client ID configurado (undefined enquanto carrega, null se não há). */
export function useClienteGoogle() {
  const [clienteId, setClienteId] = useState<string | null | undefined>(undefined)
  const recarregar = () =>
    api
      .iaAntigravityCliente()
      .then(setClienteId)
      .catch(() => setClienteId(null))
  useEffect(() => {
    void recarregar()
  }, [])
  return { clienteId, recarregar }
}

/** "1071…-abc.apps.googleusercontent.com" → "1071…ep.apps…", para mostrar sem poluir. */
export function clienteIdCurto(id: string) {
  const base = id.replace('.apps.googleusercontent.com', '')
  return base.length > 18 ? `${base.slice(0, 8)}…${base.slice(-6)}` : base
}

/**
 * Passo a passo para o usuário criar o próprio cliente OAuth do Google e
 * colar o Client ID e o Client Secret. O app não traz credenciais embutidas.
 */
export function ConfigurarClienteGoogle({ aoSalvar, cancelar }: { aoSalvar: () => void; cancelar?: () => void }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [estado, setEstado] = useState<{ tipo: 'ocioso' | 'salvando' } | { tipo: 'erro'; msg: string }>({ tipo: 'ocioso' })

  const salvar = async () => {
    setEstado({ tipo: 'salvando' })
    try {
      await api.iaAntigravitySalvarCliente(clientId, clientSecret)
      aoSalvar()
    } catch (e) {
      setEstado({ tipo: 'erro', msg: mensagemDeErro(e) })
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-zinc-950/60 p-4">
      <div className="flex items-start gap-3">
        <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="text-sm text-zinc-300">
          <p className="font-medium text-white">Primeiro: suas credenciais do Google</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            O AI Notch não vem com credenciais do Google. Você cria um cliente OAuth seu, de graça, uma vez só. Ele fica guardado no cofre do sistema.
          </p>
        </div>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-xs text-zinc-400 marker:text-zinc-500 [&_b]:font-medium [&_b]:text-zinc-200">
        <li>
          Abra o <b>Google Cloud Console</b> com sua conta Google e crie um projeto (por exemplo, "AI Notch").{' '}
          <Link url={URL_CREDENCIAIS}>Abrir o Console</Link>
        </li>
        <li>
          Configure a <b>tela de permissão OAuth</b>: tipo <b>Externo</b>, preencha nome do app e seu e-mail, e em <b>Público-alvo → Usuários de teste</b> adicione o seu
          e-mail. <Link url={URL_PERMISSAO}>Abrir</Link>
        </li>
        <li>
          Em <b>Credenciais → Criar credenciais → ID do cliente OAuth</b>, escolha o tipo <b>App para computador</b> e clique em Criar.
        </li>
        <li>
          Na janela que abrir, copie o <b>ID do cliente</b> (termina com <code className="text-zinc-300">.apps.googleusercontent.com</code>) e a <b>Chave secreta do cliente</b>{' '}
          (começa com <code className="text-zinc-300">GOCSPX-</code>) e cole abaixo.
        </li>
      </ol>

      <p className="rounded-md bg-violet-500/10 px-3 py-2 text-xs text-violet-200">Já usa o Status Monitor? Pode colar aqui as mesmas credenciais configuradas nele.</p>

      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Client ID (ID do cliente)</span>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="entrada font-mono text-xs"
            placeholder="123456789-abc.apps.googleusercontent.com"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Client Secret (chave secreta do cliente)</span>
          <input
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="entrada font-mono text-xs"
            placeholder="GOCSPX-..."
            type="password"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
      </div>

      {estado.tipo === 'erro' && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{estado.msg}</p>}

      <div className="flex justify-end gap-2">
        {cancelar && (
          <button type="button" onClick={cancelar} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={estado.tipo === 'salvando' || !clientId.trim() || !clientSecret.trim()}
          className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          {estado.tipo === 'salvando' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Salvar credenciais
        </button>
      </div>
    </div>
  )
}

function Link({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => void openUrl(url)} className="inline-flex items-center gap-0.5 text-violet-300 hover:underline">
      {children}
      <ExternalLink size={11} />
    </button>
  )
}
