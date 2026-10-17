import { useEffect, useState } from 'react'
import { getDashboard } from '../../api/dashboard.api'
import { errorMessage } from '../../api/axiosInstance'

const LABELS = {
  products: 'Active products',
  locations: 'Locations',
  out_of_stock: 'Out of stock',
  low_stock: 'Low stock',
  warranty_expiring_30_days: 'Warranties ending in 30 days',
  movements_today: 'Stock movements today',
  movements_last_7_days: 'Stock movements, last 7 days',
  stock_value: 'Stock value (₹)',
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard().then(setStats).catch((err) => setError(errorMessage(err)))
  }, [])

  if (error) return <div className="page"><h1>Dashboard</h1><p className="alert" role="alert">{error}</p></div>
  if (!stats) return <div className="page"><h1>Dashboard</h1><p className="muted">Loading…</p></div>

  const numbers = Object.entries(LABELS).filter(([k]) => typeof stats[k] === 'number')
  const byStatus = Object.entries(stats.units_by_status || {})

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <div className="stats">
        {numbers.map(([k, label]) => (
          <div className="stat" key={k}><div className="stat-n">{stats[k].toLocaleString('en-IN')}</div><div className="stat-l">{label}</div></div>
        ))}
      </div>
      {byStatus.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Serial-tracked units by status</h2>
          <div className="stats">
            {byStatus.map(([s, n]) => (
              <div className="stat" key={s}><div className="stat-n">{n}</div><div className="stat-l">{s.replace(/_/g, ' ')}</div></div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
