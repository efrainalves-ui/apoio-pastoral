import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AccountRecord } from '../db/types'
import { technicalEvent } from '../logging/safeLogger'
import { useAutoLock } from './autoLock'
import { resendConfirmationEmail, requestPasswordReset, signOutRemoteAccount } from './supabase'
import {
  changeVaultPassword,
  completePasswordReset,
  findLocalAccount,
  listLocalAccounts,
  recoverAccount,
  registerAccount,
  unlockAccount,
} from './vaultSession'

interface AuthVaultContextValue {
  account: AccountRecord | null
  /** Contas já abertas neste aparelho, para a tela de troca. */
  accounts: AccountRecord[]
  masterKey: CryptoKey | null
  /** Assina os metadados da sincronização. Vive só enquanto o cofre está aberto. */
  syncKey: CryptoKey | null
  initialized: boolean
  recoveryCode: string | null
  /** Verdadeiro enquanto o serviço espera a confirmação do e-mail da conta nova. */
  awaitingConfirmation: boolean
  register: (email: string, password: string) => Promise<void>
  resendConfirmation: (email: string) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  unlock: (email: string, password: string) => Promise<void>
  recover: (email: string, recoveryCode: string, newPassword: string) => Promise<void>
  /** Conclui a redefinição aberta pelo link do e-mail: define a senha e reabre o cofre. */
  completeReset: (email: string, recoveryCode: string, newPassword: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  lock: () => void
  /** Fecha o cofre e volta ao acesso, sem apagar nada da conta atual. */
  switchAccount: () => Promise<void>
  signOut: () => Promise<void>
  clearRecoveryCode: () => void
}

const AuthVaultContext = createContext<AuthVaultContextValue | null>(null)

export function AuthVaultProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountRecord | null>(null)
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [syncKey, setSyncKey] = useState<CryptoKey | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const refreshAccounts = useCallback(async () => { setAccounts(await listLocalAccounts()) }, [])

  useEffect(() => {
    void (async () => {
      const found = await findLocalAccount()
      setAccount(found ?? null)
      await refreshAccounts()
      setInitialized(true)
    })()
  }, [refreshAccounts])

  const register = useCallback(async (email: string, password: string) => {
    const result = await registerAccount(email, password)
    setAccount(result.account)
    setRecoveryCode(result.recoveryCode)
    setAwaitingConfirmation(!result.ready)
    // Sem confirmação de e-mail, a conta ainda não tem sessão no serviço:
    // abrir o cofre agora deixaria o pastor usando um aparelho que não
    // sincroniza e não guardou envelope nenhum. Ele guarda a chave e entra
    // depois de confirmar.
    if (result.ready) {
      setMasterKey(result.keys.master)
      setSyncKey(result.keys.sync)
    }
    await refreshAccounts()
  }, [refreshAccounts])

  const resendConfirmation = useCallback(async (email: string) => {
    await resendConfirmationEmail(email)
  }, [])

  /**
   * Redefinição de senha pelo caminho oficial do serviço, por e-mail. A chave
   * de recuperação nunca é enviada por e-mail: ela fica com o pastor.
   */
  const sendPasswordReset = useCallback(async (email: string) => {
    await requestPasswordReset(email, `${window.location.origin}/acesso`)
  }, [])

  const unlock = useCallback(async (email: string, password: string) => {
    const result = await unlockAccount(email, password)
    setAccount(result.account)
    setMasterKey(result.keys.master)
    setSyncKey(result.keys.sync)
    await refreshAccounts()
    technicalEvent('auth.succeeded')
  }, [refreshAccounts])

  const recover = useCallback(async (email: string, code: string, newPassword: string) => {
    const result = await recoverAccount(email, code, newPassword)
    setAccount(result.account)
    setMasterKey(result.keys.master)
    setSyncKey(result.keys.sync)
  }, [])

  const completeReset = useCallback(async (email: string, code: string, newPassword: string) => {
    const result = await completePasswordReset(email, code, newPassword)
    setAccount(result.account)
    setMasterKey(result.keys.master)
    setSyncKey(result.keys.sync)
    await refreshAccounts()
  }, [refreshAccounts])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!account) throw new Error('Nenhuma conta ativa.')
    const chaves = await changeVaultPassword(account, currentPassword, newPassword)
    setMasterKey(chaves.master)
    setSyncKey(chaves.sync)
  }, [account])

  /**
   * Bloquear é diferente de sair: fecha o cofre neste aparelho e mantém a
   * sessão do serviço, para reabrir só com a senha. Sair encerra a sessão.
   */
  const lock = useCallback(() => {
    setMasterKey(null)
    setSyncKey(null)
    technicalEvent('vault.locked')
  }, [])

  /**
   * Troca de conta fecha o cofre e encerra a sessão remota, mas não apaga nada:
   * os dados da conta anterior continuam neste aparelho, protegidos, e voltam a
   * abrir com a senha dela.
   */
  const switchAccount = useCallback(async () => {
    setMasterKey(null)
    setSyncKey(null)
    setAccount(null)
    await refreshAccounts()
    await signOutRemoteAccount()
    technicalEvent('vault.locked')
  }, [refreshAccounts])

  const signOut = useCallback(async () => {
    setMasterKey(null)
    setSyncKey(null)
    await signOutRemoteAccount()
    technicalEvent('vault.locked')
  }, [])

  useAutoLock(Boolean(masterKey), lock)

  const value = useMemo<AuthVaultContextValue>(() => ({
    account,
    accounts,
    masterKey,
    syncKey,
    initialized,
    recoveryCode,
    awaitingConfirmation,
    register,
    resendConfirmation,
    sendPasswordReset,
    unlock,
    recover,
    completeReset,
    changePassword,
    lock,
    switchAccount,
    signOut,
    clearRecoveryCode: () => setRecoveryCode(null),
  }), [account, accounts, masterKey, syncKey, initialized, recoveryCode, awaitingConfirmation, register, resendConfirmation, sendPasswordReset, unlock, recover, completeReset, changePassword, lock, switchAccount, signOut])

  return <AuthVaultContext.Provider value={value}>{children}</AuthVaultContext.Provider>
}

export function useAuthVault(): AuthVaultContextValue {
  const context = useContext(AuthVaultContext)
  if (!context) throw new Error('useAuthVault deve ser usado dentro de AuthVaultProvider.')
  return context
}
