import { DatabaseSync } from 'node:sqlite';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SafeError } from './errors.js';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export class Store {
  readonly db: DatabaseSync;
  constructor(
    path: string,
    private readonly key: Buffer,
  ) {
    if (key.length !== 32) throw new Error('256-bit key required');
    if (path !== ':memory:')
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS connections (owner TEXT, instance TEXT, secret TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(owner,instance));
      CREATE TABLE IF NOT EXISTS active (owner TEXT PRIMARY KEY, instance TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, owner TEXT NOT NULL, instance TEXT NOT NULL, revision TEXT NOT NULL, tool TEXT NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL, expires INTEGER NOT NULL, approved INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, owner TEXT NOT NULL, instance TEXT NOT NULL, tool TEXT NOT NULL, outcome TEXT NOT NULL);
    `);
  }
  seal(owner: string, instance: string, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(canonical([owner, instance])));
    return Buffer.concat([
      iv,
      cipher.update(secret, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  }
  open(owner: string, instance: string, sealed: string): string {
    const data = Buffer.from(sealed, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      data.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(canonical([owner, instance])));
    decipher.setAuthTag(data.subarray(-16));
    try {
      return Buffer.concat([
        decipher.update(data.subarray(12, -16)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SafeError('CREDENTIALS_UNAVAILABLE', 401);
    }
  }
  connect(
    owner: string,
    instance: string,
    secret: string,
    activate = true,
  ): void {
    this.db
      .prepare('INSERT OR REPLACE INTO connections VALUES (?,?,?,?)')
      .run(
        owner,
        instance,
        this.seal(owner, instance, secret),
        randomBytes(16).toString('hex'),
      );
    if (activate) this.setActive(owner, instance);
  }
  connection(
    owner: string,
    instance?: string,
    allowExpired = false,
  ): {
    instance: string;
    token: string;
    revision: string;
    refreshToken?: string;
    expiresAt?: number;
    customUrl?: string;
  } {
    const selected =
      instance ??
      (this.db.prepare('SELECT instance FROM active WHERE owner=?').get(owner)
        ?.instance as string | undefined);
    const row = this.db
      .prepare(
        'SELECT secret,revision FROM connections WHERE owner=? AND instance=?',
      )
      .get(owner, selected ?? '');
    if (!row) throw new SafeError('CONNECTION_REQUIRED', 404);
    const secret = JSON.parse(
      this.open(owner, selected!, row.secret as string),
    ) as {
      token: string;
      expiresAt?: number;
      refreshToken?: string;
      customUrl?: string;
    };
    if (!allowExpired && secret.expiresAt && secret.expiresAt <= Date.now())
      throw new SafeError('GITEA_TOKEN_EXPIRED_RECONNECT', 401);
    return { instance: selected!, ...secret, revision: row.revision as string };
  }
  list(owner: string): string[] {
    return this.db
      .prepare(
        'SELECT instance FROM connections WHERE owner=? ORDER BY instance',
      )
      .all(owner)
      .map((r) => r.instance as string);
  }
  setActive(owner: string, instance: string): void {
    if (
      !this.db
        .prepare('SELECT 1 FROM connections WHERE owner=? AND instance=?')
        .get(owner, instance)
    )
      throw new SafeError('CONNECTION_REQUIRED', 404);
    this.db
      .prepare('INSERT OR REPLACE INTO active VALUES (?,?)')
      .run(owner, instance);
  }
  disconnect(owner: string, instance: string): void {
    this.db
      .prepare('DELETE FROM connections WHERE owner=? AND instance=?')
      .run(owner, instance);
    this.db
      .prepare('DELETE FROM active WHERE owner=? AND instance=?')
      .run(owner, instance);
    this.db
      .prepare('DELETE FROM approvals WHERE owner=? AND instance=?')
      .run(owner, instance);
  }
  stage(
    owner: string,
    instance: string,
    revision: string,
    tool: string,
    payload: unknown,
  ): string {
    this.db.prepare('DELETE FROM approvals WHERE expires<?').run(Date.now());
    const count = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM approvals WHERE owner=? AND consumed=0',
      )
      .get(owner)!.n as number;
    if (count >= 20) throw new SafeError('TOO_MANY_PENDING_APPROVALS', 429);
    const id = randomBytes(24).toString('hex');
    const json = canonical(payload);
    this.db
      .prepare(
        'INSERT INTO approvals(id,owner,instance,revision,tool,payload,digest,expires) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        owner,
        instance,
        revision,
        tool,
        json,
        createHash('sha256').update(json).digest('hex'),
        Date.now() + 600000,
      );
    return id;
  }
  approval(owner: string, id: string) {
    const row = this.db
      .prepare(
        'SELECT * FROM approvals WHERE id=? AND owner=? AND expires>? AND consumed=0',
      )
      .get(id, owner, Date.now());
    if (!row) throw new SafeError('APPROVAL_NOT_FOUND', 404);
    return row;
  }
  approve(owner: string, id: string): void {
    this.approval(owner, id);
    this.db
      .prepare('UPDATE approvals SET approved=1 WHERE id=? AND owner=?')
      .run(id, owner);
  }
  consume(
    owner: string,
    id: string,
    instance: string,
    revision: string,
    tool: string,
    payload: unknown,
  ): void {
    const digest = createHash('sha256')
      .update(canonical(payload))
      .digest('hex');
    const result = this.db
      .prepare(
        'UPDATE approvals SET consumed=1 WHERE id=? AND owner=? AND instance=? AND revision=? AND tool=? AND digest=? AND approved=1 AND consumed=0 AND expires>?',
      )
      .run(id, owner, instance, revision, tool, digest, Date.now());
    if (result.changes !== 1)
      throw new SafeError('HUMAN_APPROVAL_REQUIRED', 403);
  }
  audit(owner: string, instance: string, tool: string, outcome: string): void {
    this.db
      .prepare(
        'INSERT INTO audit(at,owner,instance,tool,outcome) VALUES (?,?,?,?,?)',
      )
      .run(Date.now(), owner, instance, tool, outcome);
  }
  close(): void {
    this.db.close();
  }
}
