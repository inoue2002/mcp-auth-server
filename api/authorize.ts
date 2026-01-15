/**
 * GET /authorize
 * Receives authorization request from Claude, redirects to Entra ID
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEntraAuthorizeUrl } from '../src/auth/entra';
import { storePendingAuth } from '../src/auth/store';
import crypto from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    client_id,
    redirect_uri,
    response_type,
    code_challenge,
    code_challenge_method,
    state,
  } = req.query;

  // Validate required parameters
  if (!client_id || !redirect_uri || !response_type || !state) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (response_type !== 'code') {
    return res.status(400).json({ error: 'Unsupported response_type' });
  }

  // PKCE is required
  if (!code_challenge) {
    return res.status(400).json({ error: 'code_challenge is required' });
  }

  // Generate internal state for Entra ID
  const internalState = crypto.randomBytes(16).toString('base64url');

  // Store pending authorization data
  storePendingAuth(internalState, {
    codeChallenge: code_challenge as string,
    codeChallengeMethod: (code_challenge_method as string) || 'S256',
    redirectUri: redirect_uri as string,
    clientId: client_id as string,
  });

  // Get base URL for callback
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const callbackUrl = `${protocol}://${host}/callback`;

  // Encode original state in Entra state (internalState:originalState)
  const combinedState = `${internalState}:${state}`;

  // Redirect to Entra ID
  const entraUrl = getEntraAuthorizeUrl(callbackUrl, combinedState);
  res.redirect(302, entraUrl);
}
