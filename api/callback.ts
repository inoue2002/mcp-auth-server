/**
 * GET /callback
 * Receives callback from Entra ID, validates member, redirects to Claude
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exchangeCodeForToken, parseIdToken } from '../src/auth/entra';
import { isMember } from '../src/auth/members';
import { generateAuthorizationCode } from '../src/auth/jwt';
import { getPendingAuth, storeAuthorizationCode } from '../src/auth/store';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error, error_description } = req.query;

  // Handle Entra ID errors
  if (error) {
    return res.status(400).json({
      error: error as string,
      error_description: error_description as string,
    });
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  // Parse combined state (internalState:originalState)
  const stateStr = state as string;
  const colonIndex = stateStr.indexOf(':');
  if (colonIndex === -1) {
    return res.status(400).json({ error: 'Invalid state format' });
  }

  const internalState = stateStr.substring(0, colonIndex);
  const originalState = stateStr.substring(colonIndex + 1);

  // Retrieve pending auth data
  const pendingAuth = getPendingAuth(internalState);
  if (!pendingAuth) {
    return res.status(400).json({ error: 'Invalid or expired state' });
  }

  try {
    // Get base URL for callback
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${protocol}://${host}/callback`;

    // Exchange code for tokens with Entra ID
    const tokenResponse = await exchangeCodeForToken(code as string, callbackUrl);

    // Parse ID token to get user info
    if (!tokenResponse.id_token) {
      return res.status(500).json({ error: 'No id_token received' });
    }

    const userInfo = parseIdToken(tokenResponse.id_token);
    const email = userInfo.email || userInfo.preferred_username;

    if (!email) {
      return res.status(400).json({ error: 'Could not determine user email' });
    }

    // Check if user is a lab member
    if (!isMember(email)) {
      return res.status(403).json({
        error: 'access_denied',
        error_description: 'You are not a member of this lab',
      });
    }

    // Generate authorization code for Claude
    const authCode = generateAuthorizationCode();

    // Store authorization code with associated data
    storeAuthorizationCode(authCode, {
      email,
      codeChallenge: pendingAuth.codeChallenge,
      codeChallengeMethod: pendingAuth.codeChallengeMethod,
      redirectUri: pendingAuth.redirectUri,
      clientId: pendingAuth.clientId,
    });

    // Redirect back to Claude with authorization code
    const redirectUrl = new URL(pendingAuth.redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    redirectUrl.searchParams.set('state', originalState);

    res.redirect(302, redirectUrl.toString());
  } catch (err) {
    console.error('Callback error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
