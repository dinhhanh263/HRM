/** Per-instance TTL cache keyed by string. Bounded staleness replaces Redis for
 * role-permission lookups (role edits are rare; default TTL 60s). */
interface Entry<V> { value: V; expiresAt: number; }

export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) { this.store.delete(key); return undefined; }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void { this.store.delete(key); }
}
