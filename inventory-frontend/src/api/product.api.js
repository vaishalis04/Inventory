import api, { unwrap } from './axiosInstance'
import { ENDPOINTS } from './endpoints'

// Backend answers { data: { products: [...], pagination: { total, page, ... } } }
export async function listProducts(params = {}) {
  const payload = unwrap(await api.get(ENDPOINTS.products, { params }))
  return { items: payload.products ?? [], total: payload.pagination?.total ?? 0 }
}
export const createProduct = async (body) => unwrap(await api.post(ENDPOINTS.products, body))
export const updateProduct = async (id, body) => unwrap(await api.put(ENDPOINTS.product(id), body))
export const deleteProduct = async (id) => unwrap(await api.delete(ENDPOINTS.product(id)))
