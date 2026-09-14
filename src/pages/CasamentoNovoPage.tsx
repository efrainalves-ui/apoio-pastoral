import { ArrowLeft } from 'lucide-react'
import { type FormEvent, useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { noivoVazio, pedidoComPoucaAntecedencia, possiveisDuplicados } from '../casamentos/core'
import { CasamentoService } from '../casamentos/service'
import type { CasamentoEntity } from '../casamentos/types'
import { AvisoDeDuplicados, CampoDoNoivo } from '../components/casamentos/CamposDoCasamento'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { localDateKey } from '../shared/dates'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const casamentosService = new CasamentoService(); const districts = new DistrictService(); const peopleService = new PeopleService()

/** Dados do primeiro contato, os mesmos na aba Casamentos e na Visitação. */
export interface DadosIniciaisDoCasamento {
  noiva: CasamentoEntity['noiva']; noivo: CasamentoEntity['noivo']; contato: string; dataPretendida: string
  igrejaPretendidaId: string | null; localPretendido: string; pastorResponsavel: string
}
export const dadosIniciaisVazios = (): DadosIniciaisDoCasamento => ({ noiva: noivoVazio(), noivo: noivoVazio(), contato: '', dataPretendida: '', igrejaPretendidaId: null, localPretendido: '', pastorResponsavel: '' })

export function CamposIniciaisDoCasamento({ valor, onChange, people, churches }: {
  valor: DadosIniciaisDoCasamento
  onChange: (valor: DadosIniciaisDoCasamento) => void
  people: readonly PersonEntity[]
  churches: readonly ChurchEntity[]
}) {
  return <>
    <div className="noivos-do-casamento">
      <CampoDoNoivo papel="noiva" valor={valor.noiva} onChange={(noiva) => onChange({ ...valor, noiva })} people={people} churches={churches} />
      <CampoDoNoivo papel="noivo" valor={valor.noivo} onChange={(noivo) => onChange({ ...valor, noivo })} people={people} churches={churches} />
    </div>
    <div className="form-grid">
      <Field label="Contato" name="casamento-contato" value={valor.contato} maxLength={160} onChange={(event) => onChange({ ...valor, contato: event.target.value })} />
      <Field label="Data pretendida" name="casamento-data-pretendida" type="date" value={valor.dataPretendida} onChange={(event) => onChange({ ...valor, dataPretendida: event.target.value })} />
      <label className="field"><span className="field__label">Igreja pretendida</span><select className="field__input" value={valor.igrejaPretendidaId ?? ''} onChange={(event) => onChange({ ...valor, igrejaPretendidaId: event.target.value || null })}><option value="">Ainda não definida</option>{churches.filter(({ status }) => status !== 'archived').map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
      <Field label="Local pretendido" name="casamento-local-pretendido" value={valor.localPretendido} maxLength={160} onChange={(event) => onChange({ ...valor, localPretendido: event.target.value })} />
      <Field label="Pastor responsável" name="casamento-pastor-responsavel" value={valor.pastorResponsavel} maxLength={120} onChange={(event) => onChange({ ...valor, pastorResponsavel: event.target.value })} />
    </div>
  </>
}

export function CasamentoNovoPage() {
  const { account, masterKey } = useAuthVault(); const navigate = useNavigate()
  const [people, setPeople] = useState<PersonEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [casamentos, setCasamentos] = useState<CasamentoEntity[]>([])
  const [dados, setDados] = useState(dadosIniciaisVazios); const [primeiroContato, setPrimeiroContato] = useState(localDateKey())
  const [duplicados, setDuplicados] = useState<CasamentoEntity[]>([]); const [erro, setErro] = useState(''); const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districts.getDistrict(account.id, masterKey)
    const [pessoas, igrejas, existentes] = await Promise.all([peopleService.listPeople(account.id, masterKey), district ? districts.listChurches(account.id, masterKey, district.id) : [], casamentosService.listar(account.id, masterKey)])
    setPeople(pessoas); setChurches(igrejas); setCasamentos(existentes)
  }, [account, masterKey])
  useReloadOnSync(load)

  async function criar(mesmoAssim: boolean) {
    if (!account || !masterKey) return
    setErro('')
    if (!mesmoAssim) {
      const encontrados = possiveisDuplicados(dados, casamentos)
      if (encontrados.length) { setDuplicados(encontrados); return }
    }
    setBusy(true)
    try {
      const criado = await casamentosService.criar(account.id, masterKey, 'casamentos', { ...dados, primeiroContato, dataSolicitacao: primeiroContato })
      await navigate(`/app/casamentos/${criado.id}`)
    } catch (motivo) { setErro(motivo instanceof Error ? motivo.message : 'Não foi possível criar o acompanhamento.') } finally { setBusy(false) }
  }

  function enviar(event: FormEvent) { event.preventDefault(); void criar(false) }
  const avisoDeAntecedencia = pedidoComPoucaAntecedencia({ dataSolicitacao: primeiroContato, primeiroContato, dataPretendida: dados.dataPretendida, cerimonia: { data: '', inicio: '', fim: '', igrejaId: null, local: '' } })

  return <div className="page-stack page-narrow">
    <Link className="text-link back-link" to="/app/visitacao?aba=casamentos"><ArrowLeft />Voltar aos casamentos</Link>
    <header className="page-hero"><div><p className="eyebrow">Visitação</p><h1>Novo casamento</h1></div></header>
    {erro && <div className="alert alert--error" role="alert">{erro}</div>}
    <form onSubmit={enviar}>
      <Card title="Dados do casal">
        <CamposIniciaisDoCasamento valor={dados} onChange={(proximo) => { setDados(proximo); setDuplicados([]) }} people={people} churches={churches} />
        <div className="form-grid"><Field label="Data do primeiro contato" name="casamento-primeiro-contato" type="date" value={primeiroContato} onChange={(event) => setPrimeiroContato(event.target.value)} /></div>
        {avisoDeAntecedencia && <div className="alert aviso-atencao" role="status">Pedido com menos de três meses de antecedência.</div>}
      </Card>
      <AvisoDeDuplicados duplicados={duplicados} onAbrir={(id) => void navigate(`/app/casamentos/${id}`)} onCriarMesmoAssim={() => void criar(true)} />
      <div className="form-actions"><Link className="button button--secondary" to="/app/visitacao?aba=casamentos">Cancelar</Link><Button type="submit" disabled={busy}>{busy ? 'Criando…' : 'Criar acompanhamento'}</Button></div>
    </form>
  </div>
}
