import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

if (!globalThis.structuredClone) {
  Object.defineProperty(globalThis, 'structuredClone', {
    value: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
  })
}
