import { dataNoFuso, diaDaSemana, doisDigitos, horaNoFuso, somarDias } from './tempo'

export interface OpcaoDeAdiamento { id: 'mais_tarde' | 'amanha' | 'proxima_semana'; rotulo: string; data: string; hora: string }

/**
 * As opções de adiar, a partir de agora no fuso do aparelho.
 *
 * "Mais tarde hoje" é daqui a três horas, arredondado para a hora cheia, e só
 * aparece enquanto isso ainda cai no mesmo dia. "Amanhã" e "Próxima semana"
 * (segunda-feira seguinte) começam às 09:00.
 */
export function opcoesDeAdiamento(agora: Date, fuso: string): OpcaoDeAdiamento[] {
  const hoje = dataNoFuso(agora, fuso)
  const [hora] = horaNoFuso(agora, fuso).split(':').map(Number)
  const opcoes: OpcaoDeAdiamento[] = []
  const maisTarde = (hora ?? 0) + 3
  if (maisTarde <= 23) opcoes.push({ id: 'mais_tarde', rotulo: `Mais tarde hoje, às ${doisDigitos(maisTarde)}:00`, data: hoje, hora: `${doisDigitos(maisTarde)}:00` })
  opcoes.push({ id: 'amanha', rotulo: 'Amanhã, às 09:00', data: somarDias(hoje, 1), hora: '09:00' })
  const diasAteSegunda = ((8 - diaDaSemana(hoje)) % 7) || 7
  opcoes.push({ id: 'proxima_semana', rotulo: 'Próxima semana, segunda às 09:00', data: somarDias(hoje, diasAteSegunda), hora: '09:00' })
  return opcoes
}
