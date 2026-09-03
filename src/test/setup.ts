import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import 'fake-indexeddb/auto'

/**
 * `findBy` e `waitFor` têm orçamento próprio, e ele é o mais apertado dos dois.
 *
 * O padrão da biblioteca é um segundo — separado do tempo limite do Vitest. Doze
 * arquivos de tela dependem dele, e uma tela que monta cofre cifrado e banco
 * local passa perto disso quando a máquina está ocupada. A falha aparece como
 * "Unable to find an accessible element", que parece defeito de interface e não
 * é: é o relógio acabando antes da montagem.
 */
configure({ asyncUtilTimeout: 5_000 })

if (!globalThis.structuredClone) {
  Object.defineProperty(globalThis, 'structuredClone', {
    value: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
  })
}
