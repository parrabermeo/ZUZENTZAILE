import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  type UserCredential,
} from 'firebase/auth';
import { GMAIL_SEND_SCOPE, auth } from '../firebase.js';

const GMAIL_TOKEN_STORAGE_KEY = 'lh6_gmail_oauth_access_token_v1';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

let inMemoryGmailAccessToken: string | null = null;

export function saveGmailAccessToken(token: string | null | undefined): void {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!clean) return;
  inMemoryGmailAccessToken = clean;
  try {
    sessionStorage.setItem(GMAIL_TOKEN_STORAGE_KEY, clean);
  } catch {
    // Ignore restricted storage environments
  }
}

export function extractAndStoreGmailTokenFromResult(
  result: UserCredential | null | undefined
): string | null {
  if (!result) return null;
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken?.trim() || null;
  if (token) {
    saveGmailAccessToken(token);
  }
  return token;
}

export function clearGmailAccessToken(): void {
  inMemoryGmailAccessToken = null;
  try {
    sessionStorage.removeItem(GMAIL_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore restricted storage environments
  }
}

function readCachedGmailAccessToken(): string | null {
  if (inMemoryGmailAccessToken) return inMemoryGmailAccessToken;
  try {
    const stored = sessionStorage.getItem(GMAIL_TOKEN_STORAGE_KEY);
    if (stored && stored.trim()) {
      inMemoryGmailAccessToken = stored.trim();
      return inMemoryGmailAccessToken;
    }
  } catch {
    // Ignore restricted storage environments
  }
  return null;
}

/**
 * Returns a valid Google OAuth accessToken with `gmail.send` scope.
 * If missing or expired (`forceRefresh: true`, e.g. after HTTP 401), triggers
 * `reauthenticateWithPopup(auth.currentUser, provider)` without signing the teacher
 * out of Firebase / Cloud Firestore.
 */
export async function getValidGmailAccessToken(options?: {
  forceRefresh?: boolean;
}): Promise<string> {
  if (!options?.forceRefresh) {
    const cached = readCachedGmailAccessToken();
    if (cached) return cached;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('NO_AUTH_USER');
  }

  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_SEND_SCOPE);
  provider.setCustomParameters({
    ...(currentUser.email ? { login_hint: currentUser.email } : {}),
    prompt: 'consent',
  });

  const result = await reauthenticateWithPopup(currentUser, provider);
  const freshToken = extractAndStoreGmailTokenFromResult(result);
  if (!freshToken) {
    throw new Error('No se recibió un accessToken OAuth válido tras la autenticación con Google.');
  }
  return freshToken;
}

/**
 * Encodes an arbitrary UTF-8 string (including accents, ñ, ç, emojis) to standard Base64.
 */
function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Encodes an arbitrary UTF-8 string to URL-safe Base64 (RFC 4648 §5) required by Gmail API:
 * replaces `+` with `-`, `/` with `_`, and strips trailing `=`.
 */
function utf8ToBase64Url(input: string): string {
  return utf8ToBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Builds a valid RFC 2822 UTF-8 MIME message with RFC 2047 Base64-encoded Subject
 * (`=?UTF-8?B?...?=`) to preserve accents, ñ, ç, and Basque/Spanish characters cleanly.
 */
function buildRfc2822RawMessage(params: { to: string; subject: string; body: string }): string {
  const cleanTo = params.to.replace(/[\r\n]+/g, '').trim();
  const cleanSubject = params.subject.replace(/[\r\n]+/g, ' ').trim();
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(cleanSubject)}?=`;
  const normalizedBody = params.body.replace(/\r?\n/g, '\r\n');

  const lines = [
    `To: ${cleanTo}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(normalizedBody),
  ];

  return lines.join('\r\n');
}

export interface SendEvaluationEmailParams {
  to: string;
  subject: string;
  body: string;
}

export interface SendEvaluationEmailResult {
  messageId: string;
  sentAt: string;
}

async function postGmailSendRequest(accessToken: string, rawBase64Url: string): Promise<Response> {
  return fetch(GMAIL_SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: rawBase64Url }),
  });
}

/**
 * Sends an evaluation report silently in the background via Gmail REST API
 * using the signed-in teacher's Google OAuth session.
 * Automatically re-authenticates via popup on HTTP 401 and retries once.
 */
export async function sendEvaluationEmail(
  params: SendEvaluationEmailParams
): Promise<SendEvaluationEmailResult> {
  const cleanTo = params.to.trim();
  if (!cleanTo) {
    throw new Error('MISSING_RECIPIENT_EMAIL');
  }

  const rawMime = buildRfc2822RawMessage({
    to: cleanTo,
    subject: params.subject,
    body: params.body,
  });
  const rawBase64Url = utf8ToBase64Url(rawMime);

  let token = await getValidGmailAccessToken();
  let response = await postGmailSendRequest(token, rawBase64Url);

  // If token expired (401) or lacked gmail.send scope (403 insufficient scope), refresh via popup & retry once
  if (response.status === 401 || response.status === 403) {
    const clonedText = await response
      .clone()
      .text()
      .catch(() => '');
    const isScopeIssue =
      response.status === 401 ||
      clonedText.toLowerCase().includes('insufficient') ||
      clonedText.toLowerCase().includes('scope') ||
      clonedText.toLowerCase().includes('unauthorized');

    if (isScopeIssue) {
      console.warn(
        `[Gmail] Token rechazado (HTTP ${response.status}), renovando permiso gmail.send via reauthenticateWithPopup...`
      );
      clearGmailAccessToken();
      token = await getValidGmailAccessToken({ forceRefresh: true });
      response = await postGmailSendRequest(token, rawBase64Url);
    }
  }

  if (!response.ok) {
    let apiErrorMsg = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      if (errJson?.error?.message) {
        apiErrorMsg = `${errJson.error.message} (HTTP ${response.status})`;
      }
    } catch {
      // Fallback to HTTP status
    }
    throw new Error(apiErrorMsg);
  }

  const data = (await response.json()) as { id?: string };
  return {
    messageId: data.id || `gmail-${Date.now()}`,
    sentAt: new Date().toISOString(),
  };
}
