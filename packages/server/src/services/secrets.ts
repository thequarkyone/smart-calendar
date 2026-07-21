import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import type Database from 'better-sqlite3';

const ALGORITHM = 'aes-256-gcm' as const;

interface SecretRow {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function encryptValue(plaintext: string, key: Buffer): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

function decryptValue(value: EncryptedValue, key: Buffer): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(value.authTag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    console.error('[secrets] decryption failed — DB entry may be corrupted or tampered');
    return null;
  }
}

export function loadOrCreateKey(keyPath: string): Buffer {
  if (!isAbsolute(keyPath)) throw new Error(`[secrets] keyPath must be absolute, got: ${keyPath}`);
  if (existsSync(keyPath)) {
    const key = readFileSync(keyPath);
    if (key.length !== 32) throw new Error(`[secrets] encryption key at ${keyPath} is ${key.length} bytes — expected 32`);
    // Verify permissions — world or group readable means any local process could decrypt secrets
    const mode = statSync(keyPath).mode & 0o777;
    if (mode !== 0o600) {
      console.warn(`[secrets] key file ${keyPath} has permissions ${mode.toString(8)} — expected 600, fixing`);
      chmodSync(keyPath, 0o600);
    }
    return key;
  }
  const key = randomBytes(32);
  mkdirSync(dirname(keyPath), { recursive: true });
  // 0o600: owner read/write only — no group or other access
  writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

export class SecretsService {
  constructor(
    private readonly db: Database.Database,
    private readonly key: Buffer,
  ) {}

  set(id: string, label: string, plaintext: string): void {
    const { ciphertext, iv, authTag } = encryptValue(plaintext, this.key);
    this.db
      .prepare(
        `INSERT INTO secrets (id, label, ciphertext, iv, auth_tag)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label      = excluded.label,
           ciphertext = excluded.ciphertext,
           iv         = excluded.iv,
           auth_tag   = excluded.auth_tag,
           updated_at = datetime('now')`,
      )
      .run(id, label, ciphertext, iv, authTag);
  }

  get(id: string): string | null {
    const row = this.db
      .prepare('SELECT ciphertext, iv, auth_tag FROM secrets WHERE id = ?')
      .get(id) as SecretRow | undefined;
    if (!row) return null;
    return decryptValue({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }, this.key);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM secrets WHERE id = ?').run(id);
  }

  has(id: string): boolean {
    return (
      (this.db
        .prepare('SELECT 1 FROM secrets WHERE id = ?')
        .get(id) as Record<string, unknown> | undefined) !== undefined
    );
  }
}
