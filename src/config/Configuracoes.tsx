import { getVersion } from '@tauri-apps/api/app'
import { emit, listen } from '@tauri-apps/api/event'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Bell, BookOpen, Check, Droplet, Info, Loader2, LogIn, Monitor, Plus, Sparkles, Timer, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { api, mensagemDeErro, type ContaIA, type JanelaUso, type ProvedorIA } from '../lib/api'
import { PAGINAS_NOTCH, useConfig, type Config, type PaginaNotch, type Posicao } from '../lib/config'
import { corUso, duracaoCurta } from '../lib/formato'
import { Mascote } from '../notch/Mascote'
import { EVENTO_CONTAS_IA } from '../notch/useUsoIA'
import { clienteIdCurto, ConfigurarClienteGoogle, useClienteGoogle } from './ClienteGoogle'
import { ComoUsar, DicaEspiada } from './ComoUsar'

type Secao = 'geral' | 'como-usar' | 'ias' | 'foco' | 'agua' | 'avisos' | 'sobre'

const SECOES: { id: Secao; rotulo: string; icone: ReactNode }[] = [
  { id: 'geral', rotulo: 'Geral', icone: <Monitor size={16} /> },
  { id: 'como-usar', rotulo: 'Como usar', icone: <BookOpen size={16} /> },
  { id: 'ias', rotulo: 'Minhas IAs', icone: <Sparkles size={16} /> },
  { id: 'foco', rotulo: 'Foco', icone: <Timer size={16} /> },
  { id: 'agua', rotulo: 'Água', icone: <Droplet size={16} /> },
  { id: 'avisos', rotulo: 'Avisos', icone: <Bell size={16} /> },
  { id: 'sobre', rotulo: 'Sobre', icone: <Info size={16} /> },
]

function secaoDoHash(): Secao {
  const h = window.location.hash.slice(1)
  return SECOES.some((s) => s.id === h) ? (h as Secao) : 'geral'
}

export function Configuracoes() {
  const [secao, setSecao] = useState<Secao>(secaoDoHash)
  const [config, atualizar] = useConfig()

  useEffect(() => {
    const parar = listen<string>('ir-para-secao', ({ payload }) => {
      if (SECOES.some((s) => s.id === payload)) setSecao(payload as Secao)
    })
    return () => void parar.then((f) => f())
  }, [])

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-white/5 bg-zinc-900/50 p-3">
        <div className="mb-4 flex items-center gap-2 px-2 pt-1">
          <Mascote tamanho={26} />
          <span className="font-semibold text-white">AI Notch</span>
        </div>
        {SECOES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSecao(s.id)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
              secao === s.id ? 'bg-violet-500/15 text-violet-200' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            {s.icone}
            {s.rotulo}
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {secao === 'geral' && <Geral config={config} atualizar={atualizar} verGuia={() => setSecao('como-usar')} />}
        {secao === 'ias' && <MinhasIAs config={config} atualizar={atualizar} />}
        {secao === 'foco' && <FocoCfg config={config} atualizar={atualizar} />}
        {secao === 'agua' && <AguaCfg config={config} atualizar={atualizar} />}
        {secao === 'avisos' && <AvisosCfg config={config} atualizar={atualizar} />}
        {secao === 'como-usar' && (
          <Pagina titulo="Como usar" descricao="Os gestos do notch e o que aparece em cada situação.">
            <ComoUsar />
          </Pagina>
        )}
        {secao === 'sobre' && <Sobre />}
      </main>
    </div>
  )
}

type PropsSecao = { config: Config; atualizar: (mudar: (c: Config) => Config) => void }

// ---------------------------------------------------------------------------

function Geral({ config, atualizar, verGuia }: PropsSecao & { verGuia: () => void }) {
  const [iniciarComSistema, setIniciar] = useState<boolean | null>(null)

  useEffect(() => {
    isEnabled().then(setIniciar).catch(() => setIniciar(false))
  }, [])

  const alternarInicio = async (v: boolean) => {
    setIniciar(v)
    try {
      await (v ? enable() : disable())
    } catch {
      setIniciar(!v)
    }
  }

  return (
    <Pagina titulo="Geral" descricao="Como o notch aparece na sua tela.">
      <Cartao>
        <Interruptor rotulo="Iniciar com o sistema" descricao="Abre o AI Notch quando você liga o computador." valor={!!iniciarComSistema} onChange={alternarInicio} />
        <Linha rotulo="Posição" descricao="Em que borda da tela o notch fica. Nas laterais ele fica em pé.">
          <SeletorPosicao valor={config.posicao} onChange={(v) => atualizar((c) => ({ ...c, posicao: v }))} />
        </Linha>
        <Interruptor
          rotulo="Notch mínimo"
          descricao="Quando não há nada acontecendo, vira só uma linha fina na borda da tela."
          valor={config.notchMinimo}
          onChange={(v) => atualizar((c) => ({ ...c, notchMinimo: v }))}
        />
        <Interruptor
          rotulo="Mostrar mascote"
          descricao="Sem música tocando, o Faísca passeia pelo meio do notch e muda de humor com o que está acontecendo."
          valor={config.mascote}
          onChange={(v) => atualizar((c) => ({ ...c, mascote: v }))}
        />
        <Interruptor
          rotulo="Letras das músicas"
          descricao="Busca a letra sincronizada no LRCLIB enquanto a aba Música está aberta."
          valor={config.letras}
          onChange={(v) => atualizar((c) => ({ ...c, letras: v }))}
        />
      </Cartao>
      <PaginasDoNotch config={config} atualizar={atualizar} />

      <p className="mt-4 text-xs text-zinc-500">
        Dica: passe o mouse no notch para abrir; na ponta direita (ou de baixo, nas laterais), abre só a espiada das IAs.{' '}
        <button type="button" onClick={verGuia} className="text-violet-300 hover:underline">
          Ver o guia completo
        </button>
      </p>
    </Pagina>
  )
}

/** Liga/desliga cada página do carrossel do notch aberto. */
function PaginasDoNotch({ config, atualizar }: PropsSecao) {
  const ligadas = PAGINAS_NOTCH.filter((p) => config.paginas[p.id]).length
  const alternar = (id: PaginaNotch, v: boolean) => {
    // Pelo menos uma página fica ligada, senão o notch abriria vazio.
    if (!v && ligadas <= 1) return
    atualizar((c) => ({ ...c, paginas: { ...c.paginas, [id]: v } }))
  }
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-white">Páginas do notch</h2>
      <p className="mt-0.5 mb-3 text-xs text-zinc-500">Escolha o que aparece ao abrir o notch. Página desmarcada some das setas e dos pontinhos.</p>
      <Cartao>
        {PAGINAS_NOTCH.map((p) => (
          <Interruptor key={p.id} rotulo={p.rotulo} descricao={p.descricao} valor={config.paginas[p.id]} onChange={(v) => alternar(p.id, v)} />
        ))}
      </Cartao>
      {ligadas <= 1 && <p className="mt-2 text-xs text-amber-300/80">Pelo menos uma página precisa ficar ligada.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function MinhasIAs({ config, atualizar }: PropsSecao) {
  const [provedores, setProvedores] = useState<ProvedorIA[]>([])
  const [contas, setContas] = useState<ContaIA[]>([])
  const [adicionando, setAdicionando] = useState(false)
  // Muda quando as credenciais do Google mudam: refaz a consulta de cada conta.
  const [versao, setVersao] = useState(0)

  const recarregar = () => api.iaContas().then(setContas).catch(() => setContas([]))
  const avisarNotch = () => void emit(EVENTO_CONTAS_IA)

  useEffect(() => {
    api.iaProvedores().then(setProvedores)
    void recarregar()
  }, [])

  const remover = async (conta: ContaIA) => {
    if (!confirm(`Remover a conta "${conta.rotulo}"? O token sai do cofre do sistema.`)) return
    await api.iaRemoverConta(conta.id)
    await recarregar()
    avisarNotch()
  }

  return (
    <Pagina titulo="Minhas IAs" descricao="Acompanhe as janelas de limite das suas assinaturas, igual ao card de Uso de IA do Status Monitor.">
      <DicaEspiada />
      <div className="space-y-2">
        {contas.length === 0 && !adicionando && (
          <Cartao>
            <p className="py-4 text-center text-sm text-zinc-400">Nenhuma conta conectada ainda.</p>
          </Cartao>
        )}
        {contas.map((c) => (
          <LinhaConta key={`${c.id}-${versao}`} conta={c} provedor={provedores.find((p) => p.id === c.provedor)} remover={() => void remover(c)} />
        ))}
      </div>

      {adicionando ? (
        <NovaConta
          provedores={provedores}
          cancelar={() => setAdicionando(false)}
          salvo={async () => {
            setAdicionando(false)
            await recarregar()
            avisarNotch()
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          className="mt-4 flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400"
        >
          <Plus size={16} /> Conectar conta
        </button>
      )}

      <CartaoClienteGoogle
        temContaAntigravity={contas.some((c) => c.provedor === 'antigravity')}
        mudou={() => {
          setVersao((v) => v + 1)
          avisarNotch()
        }}
      />

      <Cartao className="mt-8">
        <Campo rotulo="Atualizar a cada" descricao="Cada consulta do Claude é uma chamada real (1 token) à API.">
          <Numero valor={config.ia.intervaloMin} min={1} max={120} sufixo="min" onChange={(v) => atualizar((c) => ({ ...c, ia: { ...c.ia, intervaloMin: v } }))} />
        </Campo>
        <Campo rotulo="Avisar quando passar de" descricao="Mostra um aviso no notch uma vez por janela.">
          <Numero valor={config.ia.alertaPct} min={10} max={100} sufixo="%" onChange={(v) => atualizar((c) => ({ ...c, ia: { ...c.ia, alertaPct: v } }))} />
        </Campo>
      </Cartao>
      <p className="mt-3 text-xs text-zinc-500">
        Os tokens ficam no cofre de senhas do sistema (Gerenciador de Credenciais, Keychain ou GNOME Keyring), nunca em texto puro na configuração.
      </p>
    </Pagina>
  )
}

/** Status das credenciais do Google (Antigravity), com trocar e remover. */
function CartaoClienteGoogle({ temContaAntigravity, mudou }: { temContaAntigravity: boolean; mudou: () => void }) {
  const { clienteId, recarregar } = useClienteGoogle()
  const [editando, setEditando] = useState(false)

  if (clienteId === undefined) return null
  // Sem conta do Antigravity e sem credenciais: nada a mostrar aqui.
  if (!clienteId && !temContaAntigravity && !editando) return null

  const remover = async () => {
    if (!confirm('Remover as credenciais do Google? As contas do Antigravity param de atualizar até você configurar de novo.')) return
    await api.iaAntigravityRemoverCliente()
    await recarregar()
    mudou()
  }

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Credenciais do Google (Antigravity)</p>
      {editando ? (
        <ConfigurarClienteGoogle
          cancelar={() => setEditando(false)}
          aoSalvar={async () => {
            setEditando(false)
            await recarregar()
            mudou()
          }}
        />
      ) : (
        <Cartao className={clienteId ? '' : 'border-amber-500/30'}>
          <div className="flex items-center gap-3 py-3">
            <div className="flex-1 text-sm">
              {clienteId ? (
                <p className="flex items-center gap-1.5 text-zinc-200">
                  <Check size={14} className="text-green-400" /> Configuradas <span className="text-xs text-zinc-500">({clienteIdCurto(clienteId)})</span>
                </p>
              ) : (
                <>
                  <p className="text-amber-200">Faltam as credenciais do Google</p>
                  <p className="text-xs text-zinc-500">Sem elas, as contas do Antigravity não atualizam.</p>
                </>
              )}
            </div>
            <button type="button" onClick={() => setEditando(true)} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10">
              {clienteId ? 'Trocar' : 'Configurar'}
            </button>
            {clienteId && (
              <button type="button" onClick={() => void remover()} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-red-400">
                Remover
              </button>
            )}
          </div>
        </Cartao>
      )}
    </div>
  )
}

function LinhaConta({ conta, provedor, remover }: { conta: ContaIA; provedor?: ProvedorIA; remover: () => void }) {
  const [uso, setUso] = useState<JanelaUso[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api.iaUso(conta.id).then(setUso).catch((e) => setErro(mensagemDeErro(e)))
  }, [conta.id])

  return (
    <Cartao>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white">{conta.rotulo}</p>
          <p className="text-xs text-zinc-500">
            {provedor?.rotulo ?? conta.provedor}
            {conta.planoUsdMensal ? ` · US$ ${conta.planoUsdMensal}/mês` : ''}
          </p>
        </div>
        <div className="flex gap-4">
          {erro ? (
            <p className="max-w-64 text-xs text-red-300">{erro}</p>
          ) : !uso ? (
            <Loader2 size={16} className="animate-spin text-zinc-500" />
          ) : (
            uso.map((j) => (
              <div key={j.rotulo} className="text-right">
                <p className="text-sm font-semibold tabular-nums" style={{ color: corUso(j.utilizacao ?? 0) }}>
                  {j.utilizacao === null ? '—' : `${Math.round(j.utilizacao * 100)}%`}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {j.rotulo.replace('Janela de ', '')}
                  {j.resetaEm ? ` · ${duracaoCurta(j.resetaEm - Date.now())}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
        <button type="button" onClick={remover} title="Remover conta" className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-red-400">
          <Trash2 size={16} />
        </button>
      </div>
    </Cartao>
  )
}

function NovaConta({ provedores, cancelar, salvo }: { provedores: ProvedorIA[]; cancelar: () => void; salvo: () => void }) {
  const [provedorId, setProvedorId] = useState(provedores[0]?.id ?? 'claude')
  const [rotulo, setRotulo] = useState('Pessoal')
  const [plano, setPlano] = useState('')
  const [token, setToken] = useState('')
  const [estado, setEstado] = useState<{ tipo: 'ocioso' | 'ocupado' | 'login' } | { tipo: 'erro'; msg: string }>({ tipo: 'ocioso' })
  const [manual, setManual] = useState(false)
  const { clienteId, recarregar: recarregarCliente } = useClienteGoogle()

  const provedor = provedores.find((p) => p.id === provedorId)
  const planoNum = plano.trim() ? Number(plano.replace(',', '.')) : null

  const salvar = async () => {
    setEstado({ tipo: 'ocupado' })
    try {
      // Testa antes de salvar, para não guardar um token que não funciona.
      await api.iaTestarToken(provedorId, token)
      await api.iaSalvarConta(provedorId, rotulo, token, planoNum)
      salvo()
    } catch (e) {
      setEstado({ tipo: 'erro', msg: mensagemDeErro(e) })
    }
  }

  const entrarComGoogle = async () => {
    setEstado({ tipo: 'login' })
    try {
      await api.iaLoginAntigravity(rotulo, planoNum)
      salvo()
    } catch (e) {
      setEstado({ tipo: 'erro', msg: mensagemDeErro(e) })
    }
  }

  if (!provedor) return null
  // Antigravity sem credenciais do Google: primeiro o passo a passo delas.
  const precisaCliente = provedor.loginNavegador && clienteId === null
  const mostrarCampoToken = !precisaCliente && (!provedor.loginNavegador || manual)

  return (
    <Cartao className="mt-4 border-violet-500/30">
      <div className="space-y-4">
        <div className="flex gap-2">
          {provedores.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setProvedorId(p.id)
                setManual(false)
                setEstado({ tipo: 'ocioso' })
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                p.id === provedorId ? 'border-violet-400 bg-violet-500/10 text-white' : 'border-white/10 text-zinc-400 hover:border-white/20'
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Nome da conta</span>
            <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} className="entrada" placeholder="Pessoal, Agência…" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Plano (US$/mês, opcional)</span>
            <input value={plano} onChange={(e) => setPlano(e.target.value)} className="entrada" placeholder="100" inputMode="decimal" />
          </label>
        </div>

        {precisaCliente && <ConfigurarClienteGoogle aoSalvar={() => void recarregarCliente()} />}

        {!precisaCliente && <p className="text-xs text-zinc-400">{provedor.ajuda}</p>}

        {provedor.loginNavegador && clienteId && (
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Check size={12} className="text-green-400" /> Credenciais do Google configuradas ({clienteIdCurto(clienteId)})
          </p>
        )}

        {provedor.loginNavegador && !precisaCliente && !manual && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void entrarComGoogle()}
              disabled={estado.tipo === 'login'}
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-60"
            >
              {estado.tipo === 'login' ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {estado.tipo === 'login' ? 'Aguardando login no navegador…' : 'Entrar com Google'}
            </button>
            <button type="button" onClick={() => setManual(true)} className="text-xs text-zinc-500 underline-offset-2 hover:underline">
              Colar refresh token manualmente
            </button>
          </div>
        )}

        {mostrarCampoToken && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">{provedor.rotuloToken}</span>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="entrada font-mono"
                placeholder={provedor.exemploToken}
                type="password"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {!provedor.loginNavegador && (
              <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-500">
                {provedor.passos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            )}
          </>
        )}

        {estado.tipo === 'erro' && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{estado.msg}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancelar} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">
            Cancelar
          </button>
          {mostrarCampoToken && (
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={estado.tipo === 'ocupado' || !token.trim()}
              className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50"
            >
              {estado.tipo === 'ocupado' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Testar e salvar
            </button>
          )}
        </div>
      </div>
    </Cartao>
  )
}

// ---------------------------------------------------------------------------

function FocoCfg({ config, atualizar }: PropsSecao) {
  const f = config.foco
  const mudar = (parcial: Partial<Config['foco']>) => atualizar((c) => ({ ...c, foco: { ...c.foco, ...parcial } }))
  return (
    <Pagina titulo="Foco" descricao="Timer pomodoro: blocos de foco com pausas entre eles.">
      <Cartao>
        <Campo rotulo="Foco">
          <Numero valor={f.focoMin} min={1} max={180} sufixo="min" onChange={(v) => mudar({ focoMin: v })} />
        </Campo>
        <Campo rotulo="Pausa curta">
          <Numero valor={f.pausaCurtaMin} min={1} max={60} sufixo="min" onChange={(v) => mudar({ pausaCurtaMin: v })} />
        </Campo>
        <Campo rotulo="Pausa longa">
          <Numero valor={f.pausaLongaMin} min={1} max={90} sufixo="min" onChange={(v) => mudar({ pausaLongaMin: v })} />
        </Campo>
        <Campo rotulo="Pausa longa a cada">
          <Numero valor={f.ciclosAtePausaLonga} min={2} max={12} sufixo="focos" onChange={(v) => mudar({ ciclosAtePausaLonga: v })} />
        </Campo>
      </Cartao>
    </Pagina>
  )
}

function AguaCfg({ config, atualizar }: PropsSecao) {
  const a = config.agua
  const mudar = (parcial: Partial<Config['agua']>) => atualizar((c) => ({ ...c, agua: { ...c.agua, ...parcial } }))
  return (
    <Pagina titulo="Água" descricao="Meta diária e lembretes para se hidratar.">
      <Cartao>
        <Interruptor rotulo="Lembretes de água" valor={a.ativo} onChange={(v) => mudar({ ativo: v })} />
        <Campo rotulo="Meta diária">
          <Seletor valor={a.metaMl} opcoes={[1500, 2000, 2500, 3000, 3500].map((ml) => [ml, `${(ml / 1000).toLocaleString('pt-BR')} L`])} onChange={(v) => mudar({ metaMl: v })} />
        </Campo>
        <Campo rotulo="Tamanho do copo/garrafa">
          <Seletor valor={a.copoMl} opcoes={[200, 250, 300, 350, 500, 750, 1000].map((ml) => [ml, `${ml} ml`])} onChange={(v) => mudar({ copoMl: v })} />
        </Campo>
        <Campo rotulo="Lembrar a cada">
          <Numero valor={a.intervaloMin} min={10} max={240} sufixo="min" onChange={(v) => mudar({ intervaloMin: v })} />
        </Campo>
        <Campo rotulo="Horário dos lembretes">
          <div className="flex items-center gap-2 text-sm">
            <Numero valor={a.inicioHora} min={0} max={23} sufixo="h" onChange={(v) => mudar({ inicioHora: v })} />
            <span className="text-zinc-500">até</span>
            <Numero valor={a.fimHora} min={1} max={24} sufixo="h" onChange={(v) => mudar({ fimHora: v })} />
          </div>
        </Campo>
      </Cartao>
    </Pagina>
  )
}

function AvisosCfg({ config, atualizar }: PropsSecao) {
  const mudar = (chave: keyof Config['avisos'], v: boolean) => atualizar((c) => ({ ...c, avisos: { ...c.avisos, [chave]: v } }))
  const itens: [keyof Config['avisos'], string, string][] = [
    ['musica', 'Troca de música', 'Mostra capa, título e artista quando a faixa muda.'],
    ['bateria', 'Bateria', 'Carregador conectado/desconectado, bateria baixa e carga completa.'],
    ['capsLock', 'Caps Lock', 'Avisa quando liga ou desliga (Windows).'],
    ['internet', 'Internet', 'Quando a conexão cai ou volta.'],
    ['ia', 'Limite das IAs', 'Quando uma conta passa do limite configurado em Minhas IAs.'],
    ['notificacaoDoSistema', 'Notificação do sistema', 'Também manda notificação nativa para água e foco.'],
  ]
  return (
    <Pagina titulo="Avisos" descricao="O que pode aparecer no notch por alguns segundos.">
      <Cartao>
        {itens.map(([chave, rotulo, descricao]) => (
          <Interruptor key={chave} rotulo={rotulo} descricao={descricao} valor={config.avisos[chave]} onChange={(v) => mudar(chave, v)} />
        ))}
      </Cartao>
    </Pagina>
  )
}

function Sobre() {
  // Vem do tauri.conf.json: não precisa lembrar de atualizar aqui a cada versão.
  const [versao, setVersao] = useState('')
  useEffect(() => {
    getVersion().then(setVersao).catch(() => {})
  }, [])

  return (
    <Pagina titulo="Sobre">
      <Cartao>
        <div className="flex items-center gap-4">
          <Mascote tamanho={56} humor="feliz" />
          <div>
            <p className="text-lg font-semibold text-white">AI Notch</p>
            <p className="text-sm text-zinc-400">{versao && `Versão ${versao} · `}Windows, macOS e Linux</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-zinc-400">Música com letra sincronizada, foco, água, tarefas, prateleira de arquivos e o uso das suas IAs, num notch na borda da tela.</p>
        <p className="mt-3 text-xs text-zinc-500">
          Letras fornecidas pelo{' '}
          <button type="button" className="text-violet-300 hover:underline" onClick={() => void openUrl('https://lrclib.net')}>
            LRCLIB
          </button>
          .
        </p>
      </Cartao>
    </Pagina>
  )
}

// ---- Componentes de formulário --------------------------------------------

function Pagina({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-white">{titulo}</h1>
      {descricao && <p className="mt-1 mb-6 text-sm text-zinc-400">{descricao}</p>}
      {!descricao && <div className="mb-6" />}
      {children}
    </div>
  )
}

function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-white/5 rounded-xl border border-white/5 bg-zinc-900 px-4 py-1 ${className}`}>{children}</div>
}

function Linha({ rotulo, descricao, children }: { rotulo: string; descricao?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex-1">
        <p className="text-sm text-zinc-100">{rotulo}</p>
        {descricao && <p className="text-xs text-zinc-500">{descricao}</p>}
      </div>
      {children}
    </div>
  )
}

const Campo = Linha

function Interruptor({ rotulo, descricao, valor, onChange }: { rotulo: string; descricao?: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <Linha rotulo={rotulo} descricao={descricao}>
      <button
        type="button"
        role="switch"
        aria-checked={valor}
        onClick={() => onChange(!valor)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${valor ? 'bg-violet-500' : 'bg-zinc-700'}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${valor ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </Linha>
  )
}

const POSICOES: { id: Posicao; rotulo: string }[] = [
  { id: 'topo', rotulo: 'Topo' },
  { id: 'base', rotulo: 'Base' },
  { id: 'esquerda', rotulo: 'Esquerda' },
  { id: 'direita', rotulo: 'Direita' },
]

function SeletorPosicao({ valor, onChange }: { valor: Posicao; onChange: (v: Posicao) => void }) {
  return (
    <div role="radiogroup" className="flex shrink-0 rounded-lg border border-white/10 bg-zinc-950 p-0.5">
      {POSICOES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={valor === p.id}
          onClick={() => onChange(p.id)}
          className={`rounded-md px-2.5 py-1 text-xs transition ${valor === p.id ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  )
}

function Numero({ valor, min, max, sufixo, onChange }: { valor: number; min: number; max: number; sufixo: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input
        type="number"
        value={valor}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v))))
        }}
        className="entrada w-20 text-right"
      />
      <span className="text-xs text-zinc-500">{sufixo}</span>
    </label>
  )
}

function Seletor({ valor, opcoes, onChange }: { valor: number; opcoes: [number, string][]; onChange: (v: number) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(Number(e.target.value))} className="entrada w-32">
      {opcoes.map(([v, r]) => (
        <option key={v} value={v}>
          {r}
        </option>
      ))}
    </select>
  )
}
