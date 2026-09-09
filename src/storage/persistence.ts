export interface StorageStatus {
  supported: boolean
  persisted: boolean
  usage: number | null
  quota: number | null
}

async function readPersisted(): Promise<boolean> {
  try { return await navigator.storage.persisted() } catch { return false }
}

async function readEstimate(): Promise<StorageEstimate> {
  try { return await navigator.storage.estimate() } catch { return {} }
}

export async function storageStatus(): Promise<StorageStatus> {
  if (!navigator.storage) return { supported: false, persisted: false, usage: null, quota: null }
  const [persisted, estimate] = await Promise.all([readPersisted(), readEstimate()])
  return {
    supported: typeof navigator.storage.persist === 'function',
    persisted,
    usage: typeof estimate.usage === 'number' ? estimate.usage : null,
    quota: typeof estimate.quota === 'number' ? estimate.quota : null,
  }
}

export async function requestPersistentStorage(): Promise<StorageStatus> {
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false)
  return storageStatus()
}

export function formatStorage(bytes: number | null): string {
  if (bytes === null) return 'Não informado pelo navegador'
  return new Intl.NumberFormat('pt-BR', { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)
}
