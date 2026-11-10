import crypto from 'node:crypto';
import { sendJson } from './http.js';

const COOKIE = 'ostaz_admin_session';
const MAX_AGE = 60 * 60 * 8;

function signature(value) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || '')
    .update(value).digest('base64url');
}

function cookieValue(req) {
  const header = req.headers.cookie || '';
  const item = header.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : '';
}

export function setAdminSession(res, username) {
  const payload = Buffer.from(JSON.stringify({ username, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString('base64url');
  const value = payload + '.' + signature(payload);
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`);
}

export function clearAdminSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function getAdmin(req) {
  const token = cookieValue(req);
  if (!token || !process.env.ADMIN_SESSION_SECRET) return null;
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.username || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: data.username };
  } catch { return null; }
}

export function requireAdmin(req, res) {
  const admin = getAdmin(req);
  if (!admin) {
    sendJson(res, 401, { error: 'يجب تسجيل الدخول أولاً' });
    return null;
  }
  return admin;
}

export function safeCompare(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}