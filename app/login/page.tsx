import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">Easy Shift CRM</div>
        <div className="login-subtitle">Lead Distribution System</div>
        <h1>Sign in</h1>
        <p className="login-help">Use your CRM account to continue.</p>

        {params.error ? <div className="login-error">{params.error}</div> : null}

        <form action={login} className="login-form">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />

          <button type="submit">Sign in to CRM</button>
        </form>
      </div>
    </main>
  )
}
