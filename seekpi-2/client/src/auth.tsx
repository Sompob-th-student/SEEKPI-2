import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler } from './api'

export type Permission = { url: string; is_view: number; is_add: number; is_edit: number; is_delete: number }
export type User = { id: number; user_name: string; first_name?: string; last_name?: string; employee_id?: number | null; role_id: number }

type Ctx = {
  user: User | null
  permissions: Permission[]
  login: (username: string, password: string, language: string) => Promise<void>
  logout: () => void
  perm: (key: string) => Permission
}
const AuthCtx = createContext<Ctx>(null as unknown as Ctx)
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d } catch { return d } }
const NONE: Permission = { url: '', is_view: 0, is_add: 0, is_edit: 0, is_delete: 0 }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => read('userInfo', null))
  const [permissions, setPermissions] = useState<Permission[]>(() => read('userPermissions', []))

  const logout = useCallback(() => {
    for (const k of ['authToken', 'userInfo', 'userPermissions']) localStorage.removeItem(k)
    setUser(null); setPermissions([])
  }, [])
  useEffect(() => setUnauthorizedHandler(logout), [logout])

  // Idle timeout: 30 minutes, same as the original app.
  useEffect(() => {
    if (!user) return
    let timer = window.setTimeout(logout, 30 * 60 * 1000)
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(logout, 30 * 60 * 1000) }
    const evs = ['mousemove', 'keydown', 'click', 'scroll']
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => { window.clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, reset)) }
  }, [user, logout])

  const login = useCallback(async (username: string, password: string, language: string) => {
    const r = await api<{ token: string; user: User; permission: Permission[] }>('/login', { method: 'POST', body: { username, password, language } })
    localStorage.setItem('authToken', JSON.stringify(r.token))
    localStorage.setItem('userInfo', JSON.stringify(r.user))
    localStorage.setItem('userPermissions', JSON.stringify(r.permission))
    setUser(r.user); setPermissions(r.permission)
  }, [])

  const perm = useCallback((key: string) => permissions.find((p) => p.url === key) ?? NONE, [permissions])
  return <AuthCtx.Provider value={{ user, permissions, login, logout, perm }}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)
