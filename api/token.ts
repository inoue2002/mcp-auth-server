/**
 * POST /token
 * Exchanges authorization code for access token
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { consumeAuthorizationCode } from '../src/auth/store';
import { verifyCodeChallenge } from '../src/auth/pkce';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../src/auth/jwt';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body (support both JSON and form-urlencoded)
  let body: Record<string, string>;
  if (typeof req.body === 'string') {
    body = Object.fromEntries(new URLSearchParams(req.body));
  } else {
    body = req.body;
  }

  const { grant_type, code, redirect_uri, client_id, code_verifier, refresh_token } = body;

  if (grant_type === 'authorization_code') {
    return handleAuthorizationCode(res, { code, redirect_uri, client_id, code_verifier });
  }

  if (grant_type === 'refresh_token') {
    return handleRefreshToken(res, { refresh_token });
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
}

function handleAuthorizationCode(
  res: VercelResponse,
  params: {
    code: string;
    redirect_uri: string;
    client_id: string;
    code_verifier: string;
  }
) {
  const { code, redirect_uri, client_id, code_verifier } = params;

  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Missing required parameters' });
  }

  // Consume authorization code
  const codeData = consumeAuthorizationCode(code);
  if (!codeData) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
  }

  // Verify redirect_uri matches
  if (codeData.redirectUri !== redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
  }

  // Verify client_id matches
  if (codeData.clientId !== client_id) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' });
  }

  // Verify PKCE code_verifier
  const isValidPkce = verifyCodeChallenge(
    code_verifier,
    codeData.codeChallenge,
    codeData.codeChallengeMethod
  );

  if (!isValidPkce) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
  }

  // Generate tokens
  const tokenPayload = { sub: codeData.email, email: codeData.email };
  const access_token = generateAccessToken(tokenPayload);
  const refresh_token = generateRefreshToken(tokenPayload);

  return res.status(200).json({
    access_token,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token,
  });
}

function handleRefreshToken(
  res: VercelResponse,
  params: { refresh_token: string }
) {
  const { refresh_token } = params;

  if (!refresh_token) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Missing refresh_token' });
  }

  try {
    const decoded = verifyRefreshToken(refresh_token);
    const tokenPayload = { sub: decoded.sub, email: decoded.email };
    const access_token = generateAccessToken(tokenPayload);
    const new_refresh_token = generateRefreshToken(tokenPayload);

    return res.status(200).json({
      access_token,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: new_refresh_token,
    });
  } catch (err) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
  }
}
