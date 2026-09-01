import { BarChart3 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { CareService } from '../care/service'
import { MINIMO_PARA_MOSTRAR, summarizeAnswers, type PerguntaResumo } from '../care/answerSummary'
import { Card } from './ui/Card'

const care = new CareService()

/**
 * Totais das respostas das visitas. Só números: nenhum nome, nenhuma resposta
 * escrita, nenhum pedido de oração. Perguntas com poucas respostas ficam de
 * fora, porque uma porcentagem pequena pode apontar para uma pessoa.
 */
export function VisitAnswersSummary() {
  const { account, masterKey } = useAuthVault()
  const [resumo, setResumo] = useState<PerguntaResumo[]>([])

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setResumo(summarizeAnswers(await care.listVisits(account.id, masterKey)))
  }, [account, masterKey])
  useEffect(() => { void load() }, [load])

  return (
    <Card title="Respostas das visitas" eyebrow="Somente totais" action={<BarChart3 />}>
      {resumo.length === 0
        ? <div className="empty-state compact-empty"><strong>Ainda não há respostas suficientes</strong><span>Os totais aparecem a partir de {MINIMO_PARA_MOSTRAR} respostas por pergunta, para não identificar ninguém.</span></div>
        : <div className="answer-summary">{resumo.map((item) => (
          <section key={item.code}>
            <p className="question-card__label">{item.numero}. {item.categoria}</p>
            <p className="answer-summary__question">{item.pergunta}</p>
            {item.tipo === 'media'
              ? <p className="answer-summary__average"><strong>{item.media}</strong> <span>{item.unidade ?? 'minutos'} em média · {item.respostas} respostas</span></p>
              : <>
                <ul className="answer-summary__bars">{item.opcoes?.map((opcao) => (
                  <li key={opcao.rotulo}>
                    <span className="answer-summary__label">{opcao.rotulo}</span>
                    <span className="answer-summary__bar"><span style={{ width: `${opcao.percentual}%` }} /></span>
                    <span className="answer-summary__value">{opcao.percentual}%</span>
                  </li>
                ))}</ul>
                <small>{item.respostas} respostas</small>
              </>}
          </section>
        ))}</div>}
    </Card>
  )
}
