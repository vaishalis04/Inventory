import { useState } from 'react'
import { resolveScan } from '../../api/scan.api'
import { errorMessage } from '../../api/axiosInstance'

export default function ScanLookup() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    // A scanned QR may hold a full URL; keep only the last path part.
    const token = code.trim().split('/').filter(Boolean).pop()
    if (!token) return
    setBusy(true); setError(''); setResult(null)
    try { setResult(await resolveScan(token)) }
    catch (err) { setError(err.response?.status === 404 ? 'No product or unit matches that barcode.' : errorMessage(err)) }
    finally { setBusy(false) }
  }

  return (
    <div className="page">
      <h1>Scan lookup</h1>
      <p className="muted">Type or paste a product or unit barcode. Camera scanning comes in the next stage.</p>
      <form className="inline-form" onSubmit={submit}>
        <input placeholder="Barcode, e.g. P000123" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn primary" disabled={busy}>{busy ? 'Looking up…' : 'Look up'}</button>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
      {result && <pre className="result">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}
