// The secret that signs login tokens. It MUST come from the environment (Render → Environment → JWT_SECRET).
// The old fallback ('owode_secret') was public in the code, so anyone could have made a valid login token.
export const jwtSecret = (): string => {
  const s = process.env.JWT_SECRET || ''
  if (s.length >= 32) return s
  if (isLive()) throw new Error('JWT_SECRET is missing or too short (needs 32+ characters)')
  return s || 'dev-only-secret-not-for-production' // local development only
}

// Render sets RENDER=true on its servers.
export const isLive = () => process.env.RENDER === 'true' || process.env.NODE_ENV === 'production'

// Called once at start-up: on the live server, refuse to start with a weak secret.
export const checkJwtSecretAtStartup = () => {
  if (isLive() && (process.env.JWT_SECRET || '').length < 32) {
    console.error('FATAL: JWT_SECRET is missing or shorter than 32 characters. Set it in Render → Environment.')
    process.exit(1)
  }
}
