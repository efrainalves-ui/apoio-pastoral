import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuthVault } from '../../auth/AuthVaultContext'
import { CORES_DE_LISTA, ICONES_DE_LISTA, type CorDeLista, type IconeDeLista, type ListaDeLembretesEntity } from '../../lembretes/types'
import { avisarAlteracaoDeLembretes, servicoDeLembretes } from '../../lembretes/useCentral'
import { ICONE_DA_LISTA, ROTULO_DA_COR, ROTULO_DO_ICONE } from './Icones'

/** Criar ou editar uma lista: nome, descrição curta, cor e ícone. */
export function FormularioDaLista({ lista, onFechar }: { lista: ListaDeLembretesEntity | null; onFechar: () => void }) {
  const { account, masterKey } = useAuthVault()
  const [nome, setNome] = useState(lista?.nome ?? '')
  const [descricao, setDescricao] = useState(lista?.descricao ?? '')
  const [cor, setCor] = useState<CorDeLista>(lista?.cor ?? 'azul')
  const [icone, setIcone] = useState<IconeDeLista>(lista?.icone ?? 'lista')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const Icone = ICONE_DA_LISTA[icone]

  useEffect(() => { campo.current?.focus() }, [])
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const salvar = async () => {
    if (!account || !masterKey) return
    setSalvando(true)
    try {
      await servicoDeLembretes.salvarLista(account.id, masterKey, { nome, descricao, cor, icone }, lista?.id)
      avisarAlteracaoDeLembretes()
      onFechar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a lista.')
      setSalvando(false)
    }
  }

  return (
    <div className="folha" role="dialog" aria-modal="true" aria-label={lista ? 'Editar lista' : 'Nova lista'}>
      <div className="folha__fundo" aria-hidden="true" onClick={onFechar} />
      <form className="folha__corpo lista-form" onSubmit={(evento) => { evento.preventDefault(); void salvar() }}>
        <div className="folha__topo">
          <span className="folha__espaco" />
          <strong>{lista ? 'Editar lista' : 'Nova lista'}</strong>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onFechar}><X aria-hidden="true" /></button>
        </div>
        <div className="lista-form__rolagem">
          <span className="lista-form__previa" style={{ background: CORES_DE_LISTA[cor] }} aria-hidden="true"><Icone /></span>
          {erro && <div className="alert alert--error" role="alert">{erro}</div>}
          <label className="field"><span className="field__label">Nome</span><input ref={campo} className="field__input" required maxLength={60} value={nome} onChange={(evento) => setNome(evento.target.value)} /></label>
          <label className="field"><span className="field__label">Descrição</span><input className="field__input" maxLength={90} value={descricao} onChange={(evento) => setDescricao(evento.target.value)} /></label>
          <fieldset className="lista-form__grade">
            <legend className="field__label">Cor</legend>
            {(Object.keys(CORES_DE_LISTA) as CorDeLista[]).map((valor) => (
              <label key={valor} className="lista-form__cor" title={ROTULO_DA_COR[valor]}>
                <input type="radio" name="cor" value={valor} checked={cor === valor} onChange={() => setCor(valor)} aria-label={ROTULO_DA_COR[valor]} />
                <span style={{ background: CORES_DE_LISTA[valor] }} aria-hidden="true" />
              </label>
            ))}
          </fieldset>
          <fieldset className="lista-form__grade">
            <legend className="field__label">Ícone</legend>
            {ICONES_DE_LISTA.map((valor) => {
              const Opcao = ICONE_DA_LISTA[valor]
              return (
                <label key={valor} className="lista-form__icone" title={ROTULO_DO_ICONE[valor]}>
                  <input type="radio" name="icone" value={valor} checked={icone === valor} onChange={() => setIcone(valor)} aria-label={ROTULO_DO_ICONE[valor]} />
                  <span aria-hidden="true"><Opcao /></span>
                </label>
              )
            })}
          </fieldset>
        </div>
        <button type="submit" className="button button--primary button--full" disabled={salvando}><span>Salvar</span></button>
      </form>
    </div>
  )
}
