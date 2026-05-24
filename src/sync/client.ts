import type { StoredBlob, SyncBucket, SyncIndex } from './types';

export class WorkerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly bearer: string,
  ) {
    if (!baseUrl) throw new Error('worker URL is required');
  }

  async getSalt(): Promise<{ salt: string; createdAt: number }> {
    return this.json<{ salt: string; createdAt: number }>('GET', '/auth/salt');
  }

  async getMe(): Promise<{ sub: string; email: string | null }> {
    return this.json('GET', '/auth/me');
  }

  async getIndex(): Promise<SyncIndex> {
    return this.json<SyncIndex>('GET', '/sync');
  }

  async getBucket(
    bucket: SyncBucket,
  ): Promise<({ exists: true } & StoredBlob) | { exists: false }> {
    return this.json('GET', `/sync/${bucket}`);
  }

  async putBucket(
    bucket: SyncBucket,
    payload: StoredBlob & { expectedVersion?: number },
  ): Promise<
    | { accepted: true; current: StoredBlob }
    | { accepted: false; reason: string; current: StoredBlob }
  > {
    return this.json('PUT', `/sync/${bucket}`, payload);
  }

  private async json<T>(
    method: 'GET' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = this.baseUrl.replace(/\/$/, '') + path;
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.bearer}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 409) {
      const text = await res.text().catch(() => '');
      throw new Error(`worker ${method} ${path} failed (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  }
}
