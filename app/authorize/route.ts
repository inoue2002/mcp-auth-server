import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;

// In-memory store for pending authorizations (use KV in production)
const pendingAuths = new Map<string, {
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
}>();

export { pendingAuths };

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const client_id = searchParams.get('client_id');
  const redirect_uri = searchParams.get('redirect_uri');
  const response_type = searchParams.get('response_type');
  const code_challenge = searchParams.get('code_challenge');
  const code_challenge_method = searchParams.get('code_challenge_method') || 'S256';
  const state = searchParams.get('state');

  // Validate required parameters
  if (!client_id || !redirect_uri || !response_type || !state) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  if (response_type !== 'code') {
    return NextResponse.json({ error: 'Unsupported response_type' }, { status: 400 });
  }

  if (!code_challenge) {
    return NextResponse.json({ error: 'code_challenge is required' }, { status: 400 });
  }

  // Generate internal state for Entra ID
  const internalState = crypto.randomBytes(16).toString('base64url');

  // Store pending authorization data
  pendingAuths.set(internalState, {
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    redirectUri: redirect_uri,
    clientId: client_id,
  });

  // Build callback URL
  const callbackUrl = new URL('/callback', request.url).toString();

  // Combine states (internalState:originalState)
  const combinedState = `${internalState}:${state}`;

  // Build Entra ID authorize URL
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: callbackUrl,
    response_mode: 'query',
    scope: 'openid email profile',
    state: combinedState,
  });

  const entraUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;

  return NextResponse.redirect(entraUrl);
}
