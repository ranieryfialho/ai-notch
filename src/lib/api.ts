import { invoke } from '@tauri-apps/api/core'

export type Midia = {
  titulo: string
  artista: string
  album: string
  duracaoMs: number
  posicaoMs: number
  tocando: boolean
  capa: string | null
  fonte: string
}

export type Letra = { sincronizada: string | null; simples: string | null }

export type Bateria = { percentual: number; conectada: boolean; cheia: boolean }

export type JanelaUso = { rotulo: string; utilizacao: number | null; resetaEm: number | null }

export type ProvedorIA = {
  id: string
  rotulo: string
  rotuloToken: string
  exemploToken: string
  ajuda: string
  passos: string[]
  loginNavegador: boolean
}

export type ContaIA = { id: string; provedor: string; rotulo: string; planoUsdMensal: number | null }

export type InfoArquivo = { caminho: string; nome: string; existe: boolean; pasta: boolean; tamanho: number }

export const api = {
  definirTamanhoNotch: (largura: number, altura: number) => invoke<void>('definir_tamanho_notch', { largura, altura }),
  abrirConfiguracoes: (secao?: string) => invoke<void>('abrir_configuracoes', { secao: secao ?? null }),

  midiaAtual: () => invoke<Midia | null>('midia_atual'),
  midiaComando: (acao: 'tocar-pausar' | 'proxima' | 'anterior') => invoke<void>('midia_comando', { acao }),
  buscarLetra: (m: Midia) =>
    invoke<Letra | null>('buscar_letra', { artista: m.artista, titulo: m.titulo, album: m.album, duracaoSeg: m.duracaoMs / 1000 }),

  bateriaAtual: () => invoke<Bateria | null>('bateria_atual'),

  prateleiraInfo: (caminhos: string[]) => invoke<InfoArquivo[]>('prateleira_info', { caminhos }),
  abrirArquivo: (caminho: string) => invoke<void>('abrir_arquivo', { caminho }),
  revelarArquivo: (caminho: string) => invoke<void>('revelar_arquivo', { caminho }),
  iconeArrasto: () => invoke<string>('icone_arrasto'),

  iaProvedores: () => invoke<ProvedorIA[]>('ia_provedores'),
  iaContas: () => invoke<ContaIA[]>('ia_contas'),
  iaSalvarConta: (provedor: string, rotulo: string, token: string, planoUsdMensal: number | null) =>
    invoke<ContaIA>('ia_salvar_conta', { provedor, rotulo, token, planoUsdMensal }),
  iaRemoverConta: (id: string) => invoke<void>('ia_remover_conta', { id }),
  iaUso: (id: string) => invoke<JanelaUso[]>('ia_uso', { id }),
  iaTestarToken: (provedor: string, token: string) => invoke<JanelaUso[]>('ia_testar_token', { provedor, token }),
  iaLoginAntigravity: (rotulo: string, planoUsdMensal: number | null) =>
    invoke<ContaIA>('ia_login_antigravity', { rotulo, planoUsdMensal }),
}

/** Erros dos comandos chegam como string; garante uma mensagem legível. */
export function mensagemDeErro(erro: unknown): string {
  if (typeof erro === 'string') return erro
  if (erro instanceof Error) return erro.message
  return 'Erro desconhecido'
}
