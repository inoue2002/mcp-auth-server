/**
 * Entra ID (Azure AD) OAuth integration
 */

const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;

export function getEntraAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid email profile',
    state,
  });

  return `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
}

export interface EntraTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<EntraTokenResponse> {
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'openid email profile',
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return response.json() as Promise<EntraTokenResponse>;
}

export interface EntraUserInfo {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
}

export async function getUserInfo(accessToken: string): Promise<EntraUserInfo> {
  const response = await fetch('https://graph.microsoft.com/oidc/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json() as Promise<EntraUserInfo>;
}

export function parseIdToken(idToken: string): EntraUserInfo {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ID token');
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  return {
    sub: payload.sub,
    email: payload.email || payload.preferred_username,
    preferred_username: payload.preferred_username,
    name: payload.name,
  };
}
