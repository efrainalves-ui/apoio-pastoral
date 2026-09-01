// Datas dos cenários E2E, sempre calculadas a partir de "agora".
//
// Nenhuma data é escrita à mão: uma data fixa vence e derruba a suíte sem que
// nada no código tenha mudado.
//
// Tudo aqui usa os componentes locais da data. Os campos `date` e
// `datetime-local` do navegador trabalham em horário local, e o aplicativo
// interpreta essas strings como horário local, por exemplo `new Date(`${dia}T19:00`)`.
// Formatar via `toISOString()` converteria para UTC e mudaria o dia perto da
// meia-noite, fazendo o resultado depender do fuso da máquina.

const MONDAY = 1

/** Data de hoje, sem hora, no fuso local. */
export function today(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** `AAAA-MM-DD` local, para campos `<input type="date">`. */
export function isoDate(date: Date): string {
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mes}-${dia}`
}

/** `AAAA-MM-DDTHH:mm` local, para campos `<input type="datetime-local">`. */
export function isoDateTime(date: Date, hour: number, minute = 0): string {
  const hora = String(hour).padStart(2, '0')
  const minuto = String(minute).padStart(2, '0')
  return `${isoDate(date)}T${hora}:${minuto}`
}

/**
 * Data para um compromisso criado pelo formulário da Agenda.
 *
 * Duas regras do aplicativo precisam valer ao mesmo tempo:
 *
 * - a Agenda abre na visão de semana, de domingo a sábado, ancorada em hoje;
 *   por isso a data precisa cair na semana corrente para o compromisso
 *   aparecer na tela. Só "hoje" garante isso todos os dias: em um sábado,
 *   "amanhã" já seria domingo da semana seguinte;
 * - segunda-feira é folga e o formulário exige marcar a exceção. Como os
 *   cenários não marcam essa exceção, a segunda-feira vira terça — que
 *   continua na mesma semana.
 *
 * O horário passado não atrapalha: a Agenda filtra por período, não por
 * futuro, então um compromisso de hoje mais cedo continua visível.
 */
export function agendaDate(): Date {
  const date = today()
  if (date.getDay() === MONDAY) return addDays(date, 1)
  return date
}

/** Data futura previsível, para prazos que só precisam não estar vencidos. */
export function futureDate(days: number): Date {
  return addDays(today(), days)
}
