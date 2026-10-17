import api, { unwrap } from './axiosInstance'
import { ENDPOINTS } from './endpoints'

export const resolveScan = async (code) => unwrap(await api.get(ENDPOINTS.lookup(code)))
