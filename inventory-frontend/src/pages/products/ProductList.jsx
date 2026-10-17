import { useEffect, useState, useCallback } from 'react'
import { listProducts, createProduct, updateProduct, deleteProduct } from '../../api/product.api'
import { listCategories } from '../../api/category.api'
import { errorMessage } from '../../api/axiosInstance'

const UNITS = ['Nos', 'Mtr', 'Box', 'Roll', 'Pair', 'Set', 'Kg', 'Pkt']
const NEW_PRODUCT = { name: '', unit: 'Nos', tracking_type: 'quantity', gst_rate: 18, reorder_level: 0 }

export default function ProductList() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)

  const load = useCallback(async (q) => {
    setLoading(true); setError('')
    try { setItems((await listProducts(q ? { q } : {})).items) }
    catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? It disappears from the list.`)) return
    try { await deleteProduct(p.id); load(search) } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Products</h1>
        <button className="btn primary" onClick={() => setEditing({ ...NEW_PRODUCT })}>Add product</button>
      </div>
      <input className="search" placeholder="Search name, SKU, barcode, brand" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p className="alert" role="alert">{error}</p>}
      {loading ? <p className="muted">Loading…</p> : items.length === 0 ? (
        <div className="empty"><p>{search ? 'No products match that search.' : 'No products yet.'}</p>
          {!search && <button className="btn" onClick={() => setEditing({ ...NEW_PRODUCT })}>Add your first product</button>}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Barcode</th><th>SKU</th><th>Category</th><th>Tracking</th><th>In stock</th><th /></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}{p.brand ? <span className="muted"> · {p.brand}</span> : null}</td>
                  <td className="sku">{p.barcode}</td>
                  <td>{p.sku || '—'}</td>
                  <td>{p.category?.name || '—'}</td>
                  <td>{p.tracking_type === 'serial' ? 'Each piece' : 'Counted'}</td>
                  <td><span className={'pill ' + (p.is_low ? 'off' : 'on')}>{Number(p.total_stock ?? 0)} {p.unit}</span></td>
                  <td className="right">
                    <button className="btn ghost" onClick={() => setEditing(p)}>Edit</button>{' '}
                    <button className="btn ghost" onClick={() => remove(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ProductDialog product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(search) }} />}
    </div>
  )
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

function ProductDialog({ product, onClose, onSaved }) {
  const id = product.id
  const [cats, setCats] = useState([])
  const [form, setForm] = useState({
    name: product.name ?? '', barcode: product.barcode ?? '', sku: product.sku ?? '',
    brand: product.brand ?? '', model_no: product.model_no ?? '', category_id: product.category_id ?? '',
    unit: product.unit ?? 'Nos', tracking_type: product.tracking_type ?? 'quantity',
    selling_price: product.selling_price ?? '', mrp: product.mrp ?? '',
    gst_rate: product.gst_rate ?? 18, reorder_level: product.reorder_level ?? 0,
    warranty_months: product.warranty_months ?? '', description: product.description ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => { listCategories().then(setCats).catch(() => {}) }, [])

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true)
    const body = {
      name: form.name.trim(), sku: form.sku, brand: form.brand, model_no: form.model_no, description: form.description,
      category_id: form.category_id === '' ? null : Number(form.category_id),
      unit: form.unit, tracking_type: form.tracking_type,
      selling_price: num(form.selling_price), mrp: num(form.mrp),
      gst_rate: num(form.gst_rate) ?? 18, reorder_level: num(form.reorder_level) ?? 0,
      warranty_months: num(form.warranty_months),
    }
    if (form.barcode.trim()) body.barcode = form.barcode.trim() // blank = server generates one
    try { id ? await updateProduct(id, body) : await createProduct(body); onSaved() }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{id ? 'Edit product' : 'Add product'}</h2>
        <label>Name<input value={form.name} onChange={set('name')} required autoFocus /></label>
        <div className="row">
          <label>Barcode<input value={form.barcode} onChange={set('barcode')} placeholder={id ? '' : 'Leave blank to auto-generate'} /></label>
          <label>SKU<input value={form.sku} onChange={set('sku')} /></label>
        </div>
        <div className="row">
          <label>Brand<input value={form.brand} onChange={set('brand')} /></label>
          <label>Model no.<input value={form.model_no} onChange={set('model_no')} /></label>
        </div>
        <div className="row">
          <label>Category
            <select value={form.category_id} onChange={set('category_id')}>
              <option value="">None</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Unit
            <select value={form.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </label>
        </div>
        <label>How is it tracked?
          <select value={form.tracking_type} onChange={set('tracking_type')} disabled={!!id}>
            <option value="quantity">Counted (cables, connectors, sockets)</option>
            <option value="serial">Each piece has its own barcode (cameras, NVRs)</option>
          </select>
        </label>
        <div className="row">
          <label>Selling price (₹)<input type="number" min="0" step="any" value={form.selling_price} onChange={set('selling_price')} /></label>
          <label>MRP (₹)<input type="number" min="0" step="any" value={form.mrp} onChange={set('mrp')} /></label>
        </div>
        <div className="row">
          <label>GST %<input type="number" min="0" max="100" step="any" value={form.gst_rate} onChange={set('gst_rate')} /></label>
          <label>Reorder level<input type="number" min="0" step="any" value={form.reorder_level} onChange={set('reorder_level')} /></label>
        </div>
        <label>Warranty (months)<input type="number" min="0" max="240" value={form.warranty_months} onChange={set('warranty_months')} /></label>
        <label>Description<textarea rows="2" value={form.description} onChange={set('description')} /></label>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        </div>
      </form>
    </div>
  )
}
