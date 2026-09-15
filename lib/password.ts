// Password hashing with scrypt (node:crypto): no extra dependency, memory-hard, timing-safe comparison.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const passwordPolicy = { minLength: 10, maxLength: 200 };

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [scheme, N, r, p, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const hash = await scrypt(password, Buffer.from(salt, 'base64'), 64, { N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  const expectedBuffer = Buffer.from(expected, 'base64');
  return hash.length === expectedBuffer.length && timingSafeEqual(hash, expectedBuffer);
}
