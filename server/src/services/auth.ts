import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function generateDeviceToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}
export type AdminJwtPayload = { sub: number; role: 'admin' | 'employee'; empNo: string };
export function signAdminJwt(p: AdminJwtPayload, secret: string): string {
  return jwt.sign(p, secret, { expiresIn: '12h' });
}
export function verifyAdminJwt(token: string, secret: string): AdminJwtPayload {
  return jwt.verify(token, secret) as unknown as AdminJwtPayload;
}
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const dk = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${dk}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, dk] = stored.split(':');
  const test = scryptSync(pw, salt, 64);
  const orig = Buffer.from(dk, 'hex');
  return test.length === orig.length && timingSafeEqual(test, orig);
}
