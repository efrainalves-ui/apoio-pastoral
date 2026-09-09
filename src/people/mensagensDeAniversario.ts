import { birthdayTone } from './dates'
import { normalizePhone } from './validation'

/**
 * Três felicitações por faixa de idade, para escolher na hora.
 *
 * Uma mensagem só obriga a reescrever à mão quando não serve — e é o que
 * acontece: o que se diz a uma criança de oito anos não é o que se diz a quem
 * faz setenta. Três dão de onde escolher sem virar um formulário.
 *
 * O primeiro nome basta: felicitação com nome completo soa como cobrança de
 * banco, não como o pastor falando.
 */
export function mensagensDeAniversario(nome: string, idade: number): string[] {
  const primeiro = nome.trim().split(/\s+/u)[0] || nome.trim()
  const porFaixa: Record<ReturnType<typeof birthdayTone>, string[]> = {
    child: [
      `Feliz aniversário, ${primeiro}! Que Deus abençoe sua vida, seus sonhos e cada nova descoberta.`,
      `Parabéns, ${primeiro}! Jesus tem muito carinho por você. Que seu dia seja cheio de alegria!`,
      `Feliz aniversário, ${primeiro}! Estamos felizes por ter você conosco. Deus te abençoe muito!`,
    ],
    teen: [
      `Feliz aniversário, ${primeiro}! Que Deus conduza suas escolhas e fortaleça seus sonhos neste novo ano.`,
      `Parabéns, ${primeiro}! Que esta nova idade venha com coragem para as decisões e paz para o coração.`,
      `Feliz aniversário, ${primeiro}! Conte com a nossa oração e com a nossa torcida neste ano que começa.`,
    ],
    young: [
      `Feliz aniversário, ${primeiro}! Que este novo ciclo seja cheio da presença de Deus, propósito e boas oportunidades.`,
      `Parabéns, ${primeiro}! Que Deus dirija seus caminhos, seus estudos e seus planos neste novo ano de vida.`,
      `Feliz aniversário, ${primeiro}! Que o Senhor renove suas forças e abra portas onde você mais precisa.`,
    ],
    adult: [
      `Feliz aniversário, ${primeiro}! Que Deus renove suas forças e abençoe sua vida e sua família neste novo ciclo.`,
      `Parabéns, ${primeiro}! Que o Senhor guarde sua casa, seu trabalho e sua saúde ao longo deste ano.`,
      `Feliz aniversário, ${primeiro}! Gratidão a Deus pela sua vida e pelo bem que você faz à nossa igreja.`,
    ],
    elder: [
      `Feliz aniversário, ${primeiro}! Que Deus continue concedendo saúde, paz e alegria, e que sua história siga inspirando vidas.`,
      `Parabéns, ${primeiro}! Sua caminhada com Deus é exemplo para nós. Que o Senhor lhe dê muitos anos de paz.`,
      `Feliz aniversário, ${primeiro}! Obrigado por tudo o que o senhor e a sua história ensinam à nossa igreja.`,
    ],
  }
  return porFaixa[birthdayTone(idade)]
}

/**
 * O endereço que abre a conversa no WhatsApp com a mensagem pronta.
 *
 * Devolve `null` sem número: abrir o WhatsApp sem destinatário deixaria o
 * pastor numa tela de escolher contato, sem a mensagem que ele acabou de
 * escolher.
 *
 * O 55 entra quando falta, porque o cadastro guarda o número como se digita no
 * Brasil — dez ou onze dígitos com DDD — e o WhatsApp exige o país.
 */
export function linkDeWhatsapp(numero: string, mensagem: string): string | null {
  const digitos = normalizePhone(numero)
  if (digitos.length < 10) return null
  const comPais = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${comPais}?text=${encodeURIComponent(mensagem)}`
}
