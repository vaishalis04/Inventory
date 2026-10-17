import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="login"><div className="login-card">
      <h1>Page not found</h1>
      <p className="muted">That address doesn't exist in this app.</p>
      <Link className="btn primary" to="/">Back to dashboard</Link>
    </div></div>
  )
}
