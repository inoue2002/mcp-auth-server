import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;
const ALLOWED_MEMBERS = process.env.ALLOWED_MEMBERS?.split(',').map(m => m.trim().toLowerCase()) || [];

// Import pending auths from authorize route
import { pendingAuths } from '../authorize/route';

// In-memory store for authorization codes (use KV in production)
const authorizationCodes = new Map<string, {
  email: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}>();

export { authorizationCodes };

function isMember(email: string): boolean {
  if (ALLOWED_MEMBERS.length === 0) {
    // If no members configured, allow all (for testing)
    console.warn('ALLOWED_MEMBERS not configured, allowing all users');
    return true;
  }
  return ALLOWED_MEMBERS.includes(email.toLowerCase());
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  if (error) {
    return NextResponse.json({ error, error_description }, { status: 400 });
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  // Parse combined state
  const colonIndex = state.indexOf(':');
  if (colonIndex === -1) {
    return NextResponse.json({ error: 'Invalid state format' }, { status: 400 });
  }

  const internalState = state.substring(0, colonIndex);
  const originalState = state.substring(colonIndex + 1);

  // Get pending auth data
  const pendingAuth = pendingAuths.get(internalState);
  if (!pendingAuth) {
    return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 });
  }
  pendingAuths.delete(internalState);

  try {
    // Exchange code with Entra ID
    const callbackUrl = new URL('/callback', request.url).toString();

    const tokenParams = new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
      scope: 'openid email profile',
    });

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json({ error: 'Token exchange failed', details: errorText }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();

    // Parse ID token
    if (!tokenData.id_token) {
      return NextResponse.json({ error: 'No id_token received' }, { status: 500 });
    }

    const idTokenParts = tokenData.id_token.split('.');
    const payload = JSON.parse(Buffer.from(idTokenParts[1], 'base64url').toString());
    const email = payload.email || payload.preferred_username;

    if (!email) {
      return NextResponse.json({ error: 'Could not determine user email' }, { status: 400 });
    }

    // Check if user is allowed
    if (!isMember(email)) {
      console.log('Access denied for:', email);
      return NextResponse.json(
        { error: 'access_denied', error_description: 'You are not a member of this lab' },
        { status: 403 }
      );
    }
    console.log('User authenticated:', email);

    // Generate authorization code
    const authCode = crypto.randomBytes(32).toString('base64url');

    // Store authorization code
    authorizationCodes.set(authCode, {
      email,
      codeChallenge: pendingAuth.codeChallenge,
      codeChallengeMethod: pendingAuth.codeChallengeMethod,
      redirectUri: pendingAuth.redirectUri,
      clientId: pendingAuth.clientId,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // Redirect back to client
    const redirectUrl = new URL(pendingAuth.redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    redirectUrl.searchParams.set('state', originalState);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('Callback error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
