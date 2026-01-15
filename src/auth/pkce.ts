/**
 * PKCE (Proof Key for Code Exchange) verification
 */

import crypto from 'crypto';

export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string = 'S256'
): boolean {
  if (codeChallengeMethod === 'plain') {
    return codeVerifier === codeChallenge;
  }

  if (codeChallengeMethod === 'S256') {
    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return hash === codeChallenge;
  }

  throw new Error(`Unsupported code_challenge_method: ${codeChallengeMethod}`);
}
