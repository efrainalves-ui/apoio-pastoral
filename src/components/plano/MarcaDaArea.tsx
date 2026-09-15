import type { PlanningArea } from '../../evangelism/types'
import { AREA_DO_INDICADOR } from '../../integrated-report/areasEstrategicas'
import { areaDoPlanejamento, nomeCurtoDaArea } from '../../plano-estrategico/areas'
import { SimboloDaArea } from './SimboloDaArea'

/** A área estratégica de uma página ou de um indicador: símbolo e nome, nunca só a cor. */
export function MarcaDaArea({ area, compacta = false }: { area: PlanningArea; compacta?: boolean }) {
  const plano = areaDoPlanejamento(area)
  return (
    <span className={`marca-da-area area--${plano.slug}${compacta ? ' marca-da-area--compacta' : ''}`}>
      <SimboloDaArea simbolo={plano.simbolo} />
      <span>{compacta ? nomeCurtoDaArea(plano) : plano.nome}</span>
    </span>
  )
}

/** Nas páginas compartilhadas, cada indicador leva a própria área; sem área declarada, fica neutro. */
export function MarcaDoIndicador({ id }: { id: string }) {
  const area = AREA_DO_INDICADOR[id]
  return area ? <MarcaDaArea area={area} compacta /> : null
}
