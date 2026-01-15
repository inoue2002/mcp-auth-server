import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET!;

// Import authorization codes from callback route
import { authorizationCodes } from '../callback/route';

function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }
  if (method === 'S256') {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }
  return false;
}

function generateAccessToken(email: string): string {
  return jwt.sign({ sub: email, email, type: 'access' }, JWT_SECRET, { expiresIn: '1h' });
}

function generateRefreshToken(email: string): string {
  return jwt.sign({ sub: email, email, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

export async function POST(request: NextRequest) {
  let body: Record<string, string>;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await request.json();
  } else {
    const text = await request.text();
    body = Object.fromEntries(new URLSearchParams(text));
  }

  const { grant_type, code, redirect_uri, client_id, code_verifier, refresh_token } = body;

  if (grant_type === 'authorization_code') {
    if (!code || !redirect_uri || !client_id || !code_verifier) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const codeData = authorizationCodes.get(code);
    if (!codeData) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
        { status: 400 }
      );
    }
    authorizationCodes.delete(code);

    if (Date.now() > codeData.expiresAt) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Authorization code expired' },
        { status: 400 }
      );
    }

    if (codeData.redirectUri !== redirect_uri) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'redirect_uri mismatch' },
        { status: 400 }
      );
    }

    if (codeData.clientId !== client_id) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'client_id mismatch' },
        { status: 400 }
      );
    }

    if (!verifyCodeChallenge(code_verifier, codeData.codeChallenge, codeData.codeChallengeMethod)) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'PKCE verification failed' },
        { status: 400 }
      );
    }

    const access_token = generateAccessToken(codeData.email);
    const new_refresh_token = generateRefreshToken(codeData.email);

    return NextResponse.json({
      access_token,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: new_refresh_token,
    });
  }

  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing refresh_token' },
        { status: 400 }
      );
    }

    try {
      const decoded = jwt.verify(refresh_token, JWT_SECRET) as { sub: string; email: string; type: string };
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const access_token = generateAccessToken(decoded.email);
      const new_refresh_token = generateRefreshToken(decoded.email);

      return NextResponse.json({
        access_token,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: new_refresh_token,
      });
    } catch {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Invalid refresh token' },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
}
