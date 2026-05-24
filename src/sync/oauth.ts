import { v4 as uuid } from 'uuid'

interface OAuthResult {
  idToken: string
  /** Seconds since epoch. */
  exp: number
  email: string | null
  sub: string
}

/**
 * Implicit-flow Google sign-in tailored for Chrome extensions.
 * Returns a fresh id_token plus the user's sub/email.
 *
 * The Google Cloud OAuth client must be type "Web application" with
 * `https://<extension-id>.chromiumapp.org/` as an authorized redirect URI.
 */
export async function signInWithGoogle(
  googleClientId: string,
  interactive: boolean,
): Promise<OAuthResult> {
  if (!browser.identity?.launchWebAuthFlow) {
    throw new Error('chrome.identity.launchWebAuthFlow is unavailable')
  }
  if (!googleClientId)
    throw new Error('googleClientId is required')

  const redirectUri = browser.identity.getRedirectURL()
  const nonce = uuid()
  const state = uuid()

  const params = new URLSearchParams({
    client_id: googleClientId,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    nonce,
    state,
    prompt: interactive ? 'select_account' : 'none',
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  const redirectedTo = await browser.identity.launchWebAuthFlow({
    url: authUrl,
    interactive,
  })
  if (!redirectedTo)
    throw new Error('OAuth flow returned no redirect URL')

  const fragment = new URL(redirectedTo).hash.replace(/^#/, '')
  const result = new URLSearchParams(fragment)
  const error = result.get('error')
  if (error) {
    throw new Error(`OAuth error: ${error}`)
  }
  const returnedState = result.get('state')
  if (returnedState !== state)
    throw new Error('OAuth state mismatch')

  const idToken = result.get('id_token')
  if (!idToken)
    throw new Error('OAuth response missing id_token')

  const claims = decodeJwtClaims(idToken)
  if (claims.nonce !== nonce)
    throw new Error('OAuth nonce mismatch')
  if (typeof claims.sub !== 'string')
    throw new Error('id_token missing sub')
  if (typeof claims.exp !== 'number')
    throw new Error('id_token missing exp')

  return {
    idToken,
    exp: claims.exp,
    email: typeof claims.email === 'string' ? claims.email : null,
    sub: claims.sub,
  }
}

interface JwtClaims {
  sub?: string
  email?: string
  exp?: number
  nonce?: string
  [k: string]: unknown
}

function decodeJwtClaims(token: string): JwtClaims {
  const parts = token.split('.')
  if (parts.length !== 3)
    throw new Error('malformed id_token')
  const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(json) as JwtClaims
}
