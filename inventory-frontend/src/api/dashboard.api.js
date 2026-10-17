import api, { unwrap } from './axiosInstance'
import { ENDPOINTS } from './endpoints'

export const getDashboard = async () => unwrap(await api.get(ENDPOINTS.summary))
