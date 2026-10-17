import api, { unwrap } from './axiosInstance'
import { ENDPOINTS } from './endpoints'

export const login = async (email, password) => unwrap(await api.post(ENDPOINTS.login, { email, password }))
export const getMe = async () => unwrap(await api.get(ENDPOINTS.me))
