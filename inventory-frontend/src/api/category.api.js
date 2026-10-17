import api, { unwrap } from './axiosInstance'
import { ENDPOINTS } from './endpoints'

export async function listCategories() {
  const payload = unwrap(await api.get(ENDPOINTS.categories, { params: { limit: 200 } }))
  return payload.categories ?? []
}
