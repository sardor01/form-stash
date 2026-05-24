interface JwksKey {
  kid: string
  alg: string
  n: string
  e: string
  kty: string
  use: string
}

interface JwksResponse {
  keys: JwksKey[]
}

interface JwtHeader {
  alg: string
  kid: string
  typ?: string
}

export interface GoogleIdTokenClaims {
  iss: string
  sub: string
  aud: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  exp: number
  iat: number
  nonce?: string
}

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const ALLOWED_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
])

interface KeyCacheEntry {
  key: CryptoKey
  fetchedAt: number
}

const keyCache = new Map<string, KeyCacheEntry>()
const KEY_CACHE_TTL_MS = 60 * 60 * 1000

export async function verifyGoogleIdToken(
  idToken: string,
  expectedAud: string,
): Promise<GoogleIdTokenClaims> {
  const parts = idToken.split('.')
  if (parts.length !== 3)
    throw new Error('malformed id_token')

  const header = parseJwtPart<JwtHeader>(parts[0])
  if (header.alg !== 'RS256')
    throw new Error(`unexpected alg: ${header.alg}`)
  if (!header.kid)
    throw new Error('missing kid')

  const claims = parseJwtPart<GoogleIdTokenClaims>(parts[1])

  if (!ALLOWED_ISSUERS.has(claims.iss)) {
    throw new Error(`invalid issuer: ${claims.iss}`)
  }
  if (claims.aud !== expectedAud) {
    throw new Error('audience mismatch')
  }
  const now = Math.floor(Date.now() / 1000)
  if (claims.exp <= now)
    throw new Error('id_token expired')
  if (claims.iat > now + 60)
    throw new Error('id_token iat in future')

  const key = await getKey(header.kid)
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const sig = base64UrlToBytes(parts[2])
  const ok = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    sig,
    data,
  )
  if (!ok)
    throw new Error('signature verification failed')

  return claims
}

async function getKey(kid: string): Promise<CryptoKey> {
  const cached = keyCache.get(kid)
  if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) {
    return cached.key
  }
  const res = await fetch(GOOGLE_JWKS_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  })
  if (!res.ok)
    throw new Error(`JWKS fetch failed: ${res.status}`)
  const jwks = (await res.json()) as JwksResponse
  const jwk = jwks.keys.find(k => k.kid === kid)
  if (!jwk)
    throw new Error(`unknown kid: ${kid}`)
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk as unknown as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  keyCache.set(kid, { key, fetchedAt: Date.now() })
  return key
}

function parseJwtPart<T>(part: string): T {
  const bytes = base64UrlToBytes(part)
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
