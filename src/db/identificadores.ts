import { utf8 } from '../crypto/encoding'

/**
 * Identificadores fixos que ainda são UUID.
 *
 * O serviço converte `record_id` para `uuid` ao receber uma operação. Um
 * identificador fabricado como `work-config-<conta>` não passa nessa conversão,
 * e a conversão que falha derruba o lote inteiro — um registro malformado
 * bastava para nada mais sair do aparelho, nem o que não tinha defeito nenhum.
 *
 * Alguns registros precisam de identificador previsível: a configuração do
 * obreiro é uma só, e dois aparelhos que a salvem ao mesmo tempo têm de
 * escrever no mesmo lugar. Derivar o UUID do nome e da conta dá as duas coisas
 * — previsível e válido.
 */
export async function idFixo(nome: string, accountId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(`apoio-pastoral:${nome}:${accountId}`)))
  const bytes = digest.slice(0, 16)
  // Versão 4 e variante RFC 4122: o formato importa tanto quanto o conteúdo.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** O serviço só aceita identificador neste formato. */
export function ehUuid(valor: string): boolean {
  return FORMATO_UUID.test(valor)
}
