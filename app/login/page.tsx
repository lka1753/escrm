'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    window.location.assign('/')
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">Easy Shift CRM</div>
        <div className="login-subtitle">Lead Distribution System</div>
        <h1>Sign in</h1>
        <p className="login-help">Use your CRM account to continue.</p>

        {error ? <div className="login-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />

          <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in to CRM'}</button>
        </form>
      </div>
    </main>
  )
}
