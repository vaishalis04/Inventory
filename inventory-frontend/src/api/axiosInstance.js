import axios from 'axios'

export const TOKEN_KEY = 'inventory_token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5800/api/v1',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem(TOKEN_KEY)
      location.assign('/login')
    }
    return Promise.reject(err)
  }
)

// Turns any axios error into a message a person can act on.
export function errorMessage(err) {
  if (err.response) {
    const d = err.response.data
    return d?.message || d?.error || `Request failed (${err.response.status})`
  }
  if (err.request) return 'Cannot reach the server. Check that the backend is running and VITE_API_URL is correct.'
  return err.message
}

// Backends wrap data differently ({data: ...}, {items: [...]}, plain array...).
export const unwrap = (res) => res.data?.data ?? res.data
export function toList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.items ?? payload?.rows ?? payload?.products ?? payload?.data ?? []
}

export default api
