// Every backend path lives here (prefix /api/v1 comes from VITE_API_URL).
export const ENDPOINTS = {
  login: '/auth/login',
  me: '/auth/me',
  products: '/products',
  product: (id) => `/products/${id}`,
  categories: '/categories',
  summary: '/reports/summary',
  lookup: (code) => `/barcodes/lookup/${encodeURIComponent(code)}`,
}
