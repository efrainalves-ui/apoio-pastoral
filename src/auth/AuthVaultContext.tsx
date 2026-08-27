import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AccountRecord } from '../db/types'
import { technicalEvent } from '../logging/safeLogger'
import { signOutRemoteAccount } from './supabase'
import {
  changeVaultPassword,
  findLocalAccount,
  recoverAccount,
  registerAccount,
  unlockAccount,
} from './vaultSession'

interface AuthVaultContextValue {
  account: AccountRecord | null
  masterKey: CryptoKey | null
  initialized: boolean
  recoveryCode: string | null
  register: (email: string, password: string) => Promise<void>
  unlock: (email: string, password: string) => Promise<void>
  recover: (email: string, recoveryCode: string, newPassword: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  lock: () => void
  signOut: () => Promise<void>
  clearRecoveryCode: () => void
}

const AuthVaultContext = createContext<AuthVaultContextValue | null>(null)

export function AuthVaultProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountRecord | null>(null)
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    void findLocalAccount().then((found) => {
      setAccount(found ?? null)
      setInitialized(true)
    })
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const result = await registerAccount(email, password)
    setAccount(result.account)
    setMasterKey(result.masterKey)
    setRecoveryCode(result.recoveryCode)
  }, [])

  const unlock = useCallback(async (email: string, password: string) => {
    const result = await unlockAccount(email, password)
    setAccount(result.account)
    setMasterKey(result.masterKey)
    technicalEvent('auth.succeeded')
  }, [])

  const recover = useCallback(async (email: string, code: string, newPassword: string) => {
    const result = await recoverAccount(email, code, newPassword)
    setAccount(result.account)
    setMasterKey(result.masterKey)
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!account) throw new Error('Nenhuma conta ativa.')
    const unlockedKey = await changeVaultPassword(account, currentPassword, newPassword)
    setMasterKey(unlockedKey)
  }, [account])

  const lock = useCallback(() => {
    setMasterKey(null)
    technicalEvent('vault.locked')
  }, [])

  const signOut = useCallback(async () => {
    setMasterKey(null)
    await signOutRemoteAccount()
  }, [])

  const value = useMemo<AuthVaultContextValue>(() => ({
    account,
    masterKey,
    initialized,
    recoveryCode,
    register,
    unlock,
    recover,
    changePassword,
    lock,
    signOut,
    clearRecoveryCode: () => setRecoveryCode(null),
  }), [account, masterKey, initialized, recoveryCode, register, unlock, recover, changePassword, lock, signOut])

  return <AuthVaultContext.Provider value={value}>{children}</AuthVaultContext.Provider>
}

export function useAuthVault(): AuthVaultContextValue {
  const context = useContext(AuthVaultContext)
  if (!context) throw new Error('useAuthVault deve ser usado dentro de AuthVaultProvider.')
  return context
}
