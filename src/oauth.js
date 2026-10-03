// Sign in with Google and Sign in with Apple (OpenID Connect, authorization code flow).
// The ID token comes straight from the provider's token endpoint over TLS, authenticated
// with our client secret, so per OIDC Core 3.1.3.7 we check its claims rather than its signature.

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (obj) => b64url(enc.encode(JSON.stringify(obj)));
const token = () => b64url(crypto.getRandomValues(new Uint8Array(24)));

export function decodeJwt(jwt) {
  const part = String(jwt).split('.')[1];
  if (!part) throw new Error('Malformed ID token.');
  const bin = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

async function pkceChallenge(verifier) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}

// Apple's client secret is a short-lived ES256 JWT signed with the .p8 key from the developer portal.
async function appleClientSecret({ teamId, keyId, clientId, privateKey }) {
  const pem = privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64urlJson({ alg: 'ES256', kid: keyId })}.${b64urlJson({ iss: teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: clientId })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

export function oauthProviders(env) {
  const providers = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      name: 'Google',
      issuers: ['https://accounts.google.com', 'accounts.google.com'],
      clientId: env.GOOGLE_CLIENT_ID,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      pkce: true,
      authParams: { scope: 'openid email', prompt: 'select_account' },
      clientSecret: async () => env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY) {
    providers.apple = {
      name: 'Apple',
      issuers: ['https://appleid.apple.com'],
      clientId: env.APPLE_CLIENT_ID,
      authorizeUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      pkce: false,
      // Apple requires form_post whenever email or name scopes are requested.
      authParams: { scope: 'email', response_mode: 'form_post' },
      clientSecret: () => appleClientSecret({
        teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, clientId: env.APPLE_CLIENT_ID, privateKey: env.APPLE_PRIVATE_KEY,
      }),
    };
  }
  return providers;
}

// Builds the provider redirect. `flow` goes into a cookie and must come back unchanged.
export async function startFlow(provider, redirectUri) {
  const flow = { state: token(), nonce: token(), verifier: provider.pkce ? token() + token() : undefined };
  const url = new URL(provider.authorizeUrl);
  const params = { client_id: provider.clientId, redirect_uri: redirectUri, response_type: 'code', state: flow.state, nonce: flow.nonce, ...provider.authParams };
  if (flow.verifier) Object.assign(params, { code_challenge: await pkceChallenge(flow.verifier), code_challenge_method: 'S256' });
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.toString(), flow };
}

// Exchanges the code and returns the verified identity: { subject, email, emailVerified }.
export async function finishFlow(provider, { code, redirectUri, flow }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri,
    client_id: provider.clientId, client_secret: await provider.clientSecret(),
  });
  if (flow.verifier) body.set('code_verifier', flow.verifier);
  const res = await fetch(provider.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id_token) throw new Error(`${provider.name} token exchange failed: ${json.error || res.status}`);

  const claims = decodeJwt(json.id_token);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!provider.issuers.includes(claims.iss)) throw new Error('ID token has the wrong issuer.');
  if (!aud.includes(provider.clientId)) throw new Error('ID token has the wrong audience.');
  if (!(claims.exp * 1000 > Date.now())) throw new Error('ID token has expired.');
  if (claims.nonce !== flow.nonce) throw new Error('ID token nonce does not match.');
  if (!claims.sub) throw new Error('ID token has no subject.');
  return {
    subject: String(claims.sub),
    email: claims.email ? String(claims.email).trim().toLowerCase() : null,
    // Google sends a boolean, Apple sometimes the string "true".
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    revocationToken: provider.name === 'Apple' ? json.refresh_token || json.access_token : undefined,
  };
}
