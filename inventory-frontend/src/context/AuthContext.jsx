import { createContext, useContext, useState, useCallback } from 'react'
import { login as loginApi } from '../api/auth.api'
import { TOKEN_KEY } from '../api/axiosInstance'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('inventory_user')) } catch { return null }
  })

  const login = useCallback(async (email, password) => {
    const data = await loginApi(email, password)
    const t = data.token || data.accessToken
    if (!t) throw new Error('Login worked but the server sent no token.')
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem('inventory_user', JSON.stringify(data.user || null))
    setToken(t)
    setUser(data.user || null)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('inventory_user')
    setToken(null)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>
}
