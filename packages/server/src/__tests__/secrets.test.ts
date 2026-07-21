import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { openDb } from '../db/index.js';
import { SecretsService } from '../services/secrets.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let service: SecretsService;
let key: Buffer;

beforeEach(() => {
  db = openDb(':memory:');
  key = randomBytes(32);
  service = new SecretsService(db, key);
});

afterEach(() => {
  db.close();
});

describe('SecretsService', () => {
  it('stores and retrieves a secret', () => {
    service.set('cal-1', 'My Calendar URL', 'https://example.com/secret.ics');
    expect(service.get('cal-1')).toBe('https://example.com/secret.ics');
  });

  it('returns null for unknown id', () => {
    expect(service.get('nonexistent')).toBeNull();
  });

  it('ciphertext in DB does not contain the plaintext', () => {
    service.set('cal-1', 'My Calendar URL', 'super-secret-value');
    const row = db
      .prepare('SELECT ciphertext FROM secrets WHERE id = ?')
      .get('cal-1') as { ciphertext: string };
    expect(row.ciphertext).not.toContain('super-secret-value');
  });

  it('overwrites an existing secret', () => {
    service.set('cal-1', 'Label', 'old-value');
    service.set('cal-1', 'Label', 'new-value');
    expect(service.get('cal-1')).toBe('new-value');
  });

  it('deletes a secret', () => {
    service.set('cal-1', 'Label', 'some-value');
    service.delete('cal-1');
    expect(service.get('cal-1')).toBeNull();
  });

  it('has() returns true only when secret exists', () => {
    expect(service.has('cal-1')).toBe(false);
    service.set('cal-1', 'Label', 'value');
    expect(service.has('cal-1')).toBe(true);
  });

  it('each encryption produces a unique ciphertext (random IV)', () => {
    service.set('a', 'L', 'same-plaintext');
    const row1 = db.prepare('SELECT iv, ciphertext FROM secrets WHERE id = ?').get('a') as {
      iv: string;
      ciphertext: string;
    };
    service.set('b', 'L', 'same-plaintext');
    const row2 = db.prepare('SELECT iv, ciphertext FROM secrets WHERE id = ?').get('b') as {
      iv: string;
      ciphertext: string;
    };
    expect(row1.iv).not.toBe(row2.iv);
    expect(row1.ciphertext).not.toBe(row2.ciphertext);
  });

  it('decryption fails with a wrong key returns null (does not throw)', () => {
    service.set('cal-1', 'Label', 'sensitive-data');
    const wrongKeyService = new SecretsService(db, randomBytes(32));
    expect(wrongKeyService.get('cal-1')).toBeNull();
  });
});
