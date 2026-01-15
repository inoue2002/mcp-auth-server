/**
 * JWT generation and verification
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface TokenPayload {
  sub: string;
  email: string;
}

export interface AccessTokenPayload extends TokenPayload {
  type: 'access';
}

export interface RefreshTokenPayload extends TokenPayload {
  type: 'refresh';
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function generateAuthorizationCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}
