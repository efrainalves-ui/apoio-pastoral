import { describe, expect, it } from 'vitest'
import { linkDeWhatsapp, mensagensDeAniversario } from './mensagensDeAniversario'

describe('as três felicitações', () => {
  it('mudam com a idade', () => {
    const crianca = mensagensDeAniversario('Ana Fictícia', 8)
    const idoso = mensagensDeAniversario('Ana Fictícia', 72)

    expect(crianca).toHaveLength(3)
    expect(idoso).toHaveLength(3)
    expect(crianca[0]).not.toBe(idoso[0])
  })

  it('tratam pelo primeiro nome', () => {
    // Felicitação com nome completo soa como cobrança de banco.
    for (const texto of mensagensDeAniversario('João Carlos da Silva Fictício', 40)) {
      expect(texto).toContain('João')
      expect(texto).not.toContain('João Carlos da Silva')
    }
  })

  it('são três diferentes, e não a mesma repetida', () => {
    expect(new Set(mensagensDeAniversario('Ana Fictícia', 40)).size).toBe(3)
  })
})

describe('o link do WhatsApp', () => {
  it('põe o código do país quando falta', () => {
    const link = linkDeWhatsapp('(91) 98888-7777', 'Feliz aniversário!')

    expect(link).toContain('wa.me/5591988887777')
    expect(link).toContain(encodeURIComponent('Feliz aniversário!'))
  })

  it('não repete o país em número que já o tem', () => {
    expect(linkDeWhatsapp('5591988887777', 'oi')).toContain('wa.me/5591988887777')
  })

  it('sem número, não abre nada', () => {
    // Abrir o WhatsApp sem destinatário deixaria o pastor escolhendo contato,
    // sem a mensagem que acabou de escolher.
    expect(linkDeWhatsapp('', 'oi')).toBeNull()
    expect(linkDeWhatsapp('123', 'oi')).toBeNull()
  })
})
