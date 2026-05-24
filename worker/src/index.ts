import type { GoogleIdTokenClaims } from './google-jwt'
import { verifyGoogleIdToken } from './google-jwt'

interface Env {
  SYNC_KV: KVNamespace
  GOOGLE_CLIENT_ID: string
}

const BUCKETS = ['projects', 'forms', 'presets'] as const
type Bucket = (typeof BUCKETS)[number]

interface StoredBlob {
  ciphertext: string
  iv: string
  version: number
  updatedAt: number
}

interface StoredSalt {
  salt: string
  createdAt: number
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    try {
      return await handle(req, env)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return jsonResponse({ error: message }, 500)
    }
  },
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname

  if (path === '/health')
    return jsonResponse({ ok: true })

  if (!env.GOOGLE_CLIENT_ID) {
    return jsonResponse(
      { error: 'GOOGLE_CLIENT_ID not configured on worker' },
      500,
    )
  }

  const auth = await authenticate(req, env)
  if (!auth)
    return jsonResponse({ error: 'unauthorized' }, 401)

  if (path === '/auth/me') {
    return jsonResponse({
      sub: auth.sub,
      email: auth.email ?? null,
      name: auth.name ?? null,
    })
  }

  if (path === '/auth/salt') {
    return handleSalt(auth.sub, env)
  }

  if (path === '/sync') {
    return handleSyncIndex(auth.sub, env)
  }

  const m = path.match(/^\/sync\/([a-z]+)$/)
  if (m) {
    const bucket = m[1] as Bucket
    if (!isBucket(bucket)) {
      return jsonResponse({ error: 'unknown bucket' }, 404)
    }
    if (req.method === 'GET')
      return handleGetBucket(auth.sub, bucket, env)
    if (req.method === 'PUT')
      return handlePutBucket(auth.sub, bucket, req, env)
    return jsonResponse({ error: 'method not allowed' }, 405)
  }

  return jsonResponse({ error: 'not found' }, 404)
}

async function authenticate(
  req: Request,
  env: Env,
): Promise<GoogleIdTokenClaims | null> {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(\S+)$/i)
  if (!match)
    return null
  try {
    return await verifyGoogleIdToken(match[1], env.GOOGLE_CLIENT_ID)
  }
  catch (err) {
    console.warn('[auth] verification failed', err)
    return null
  }
}

async function handleSalt(sub: string, env: Env): Promise<Response> {
  const key = saltKey(sub)
  const existing = await env.SYNC_KV.get<StoredSalt>(key, 'json')
  if (existing?.salt)
    return jsonResponse(existing)
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = bytesToBase64(saltBytes)
  const fresh: StoredSalt = { salt, createdAt: Date.now() }
  await env.SYNC_KV.put(key, JSON.stringify(fresh))
  return jsonResponse(fresh)
}

async function handleSyncIndex(sub: string, env: Env): Promise<Response> {
  const entries: Record<string, { version: number, updatedAt: number } | null>
    = {}
  for (const bucket of BUCKETS) {
    const blob = await env.SYNC_KV.get<StoredBlob>(bucketKey(sub, bucket), 'json')
    entries[bucket] = blob
      ? { version: blob.version, updatedAt: blob.updatedAt }
      : null
  }
  return jsonResponse({ buckets: entries })
}

async function handleGetBucket(
  sub: string,
  bucket: Bucket,
  env: Env,
): Promise<Response> {
  const blob = await env.SYNC_KV.get<StoredBlob>(bucketKey(sub, bucket), 'json')
  if (!blob)
    return jsonResponse({ exists: false })
  return jsonResponse({ exists: true, ...blob })
}

async function handlePutBucket(
  sub: string,
  bucket: Bucket,
  req: Request,
  env: Env,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Partial<StoredBlob> & {
    expectedVersion?: number
  } | null
  if (
    !body
    || typeof body.ciphertext !== 'string'
    || typeof body.iv !== 'string'
    || typeof body.version !== 'number'
    || typeof body.updatedAt !== 'number'
  ) {
    return jsonResponse({ error: 'invalid payload' }, 400)
  }

  const key = bucketKey(sub, bucket)
  const current = await env.SYNC_KV.get<StoredBlob>(key, 'json')
  if (current && body.expectedVersion != null) {
    if (current.version !== body.expectedVersion) {
      return jsonResponse(
        {
          accepted: false,
          reason: 'version mismatch',
          current,
        },
        409,
      )
    }
  }

  const next: StoredBlob = {
    ciphertext: body.ciphertext,
    iv: body.iv,
    version: body.version,
    updatedAt: body.updatedAt,
  }
  await env.SYNC_KV.put(key, JSON.stringify(next))
  return jsonResponse({ accepted: true, current: next })
}

function isBucket(s: string): s is Bucket {
  return (BUCKETS as readonly string[]).includes(s)
}

function bucketKey(sub: string, bucket: Bucket): string {
  return `user:${sub}:bucket:${bucket}`
}

function saltKey(sub: string): string {
  return `user:${sub}:salt`
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
