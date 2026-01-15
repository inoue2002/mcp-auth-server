/**
 * Authorization code and session store
 *
 * NOTE: This in-memory store works for development but won't persist
 * across serverless function invocations. For production, use Vercel KV
 * or another persistent store.
 */

interface AuthorizationCodeData {
  email: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

interface PendingAuthData {
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
}

// In-memory stores (for development)
const authorizationCodes = new Map<string, AuthorizationCodeData>();
const pendingAuths = new Map<string, PendingAuthData>();

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export function storePendingAuth(state: string, data: Omit<PendingAuthData, 'state'>): void {
  pendingAuths.set(state, { state, ...data });
}

export function getPendingAuth(state: string): PendingAuthData | undefined {
  const data = pendingAuths.get(state);
  if (data) {
    pendingAuths.delete(state);
  }
  return data;
}

export function storeAuthorizationCode(
  code: string,
  data: Omit<AuthorizationCodeData, 'expiresAt'>
): void {
  authorizationCodes.set(code, {
    ...data,
    expiresAt: Date.now() + CODE_EXPIRY_MS,
  });
}

export function consumeAuthorizationCode(code: string): AuthorizationCodeData | undefined {
  const data = authorizationCodes.get(code);
  if (!data) {
    return undefined;
  }

  authorizationCodes.delete(code);

  if (Date.now() > data.expiresAt) {
    return undefined;
  }

  return data;
}

// Cleanup expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authorizationCodes.entries()) {
    if (now > data.expiresAt) {
      authorizationCodes.delete(code);
    }
  }
}, 60 * 1000);
