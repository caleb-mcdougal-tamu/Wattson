// Google sign-in for a static (serverless) SPA using Google Identity Services.
//
// GIS hands the browser a short-lived (~1 hour) Drive access token; there is
// no refresh token without a backend. When the token expires, every pending
// Drive call waits on getAccessToken() while the UI shows a "Continue" prompt
// (a click is needed so the browser allows Google's popup), then resumes.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Full Drive access is needed so interval data files already in Drive (including
// ones shared with the user) can be browsed and opened.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const STORAGE_KEY = "wattson.googleAuth";
const EXPIRY_MARGIN_MS = 60 * 1000;

export class AuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

let gisPromise = null;
let tokenClient = null;
let pending = null; // { resolve, reject } for the in-flight token request
let waiters = []; // callers of getAccessToken() waiting for re-auth
let needsReauth = false;
let session = readStored(); // { access_token, expires_at, email }
const listeners = new Set();

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function writeStored() {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Stable object for useSyncExternalStore; replaced only when state changes.
let snapshot = { needsReauth: false, email: session?.email || null };

function notify() {
  snapshot = { needsReauth, email: session?.email || null };
  listeners.forEach((l) => l());
}

export function isConfigured() {
  return !!CLIENT_ID;
}

export function hasValidToken() {
  return !!session?.access_token && Date.now() < (session.expires_at || 0);
}

export function getAuthSnapshot() {
  return snapshot;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rememberEmail(email) {
  if (!session || !email) return;
  session = { ...session, email };
  writeStored();
  notify();
}

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new AuthError("gis_load_failed", "Could not load Google sign-in."));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Load Google's script and create the token client ahead of time, so the
// sign-in click can open the popup synchronously (popup blockers require it).
export async function initAuth() {
  if (!isConfigured()) throw new AuthError("not_configured");
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: handleTokenResponse,
      error_callback: (err) => {
        const p = pending;
        pending = null;
        p?.reject(new AuthError(err?.type || "popup_closed", "Google sign-in was cancelled."));
      },
    });
  }
}

function handleTokenResponse(resp) {
  const p = pending;
  pending = null;
  if (resp.error) {
    p?.reject(new AuthError(resp.error, resp.error_description));
    return;
  }
  if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
    p?.reject(
      new AuthError(
        "scope_denied",
        "Wattson needs access to Google Drive to open data files and save plots. Please allow Drive access."
      )
    );
    return;
  }
  session = {
    access_token: resp.access_token,
    expires_at: Date.now() + Number(resp.expires_in || 3600) * 1000 - EXPIRY_MARGIN_MS,
    email: session?.email || null,
  };
  writeStored();
  needsReauth = false;
  const w = waiters;
  waiters = [];
  w.forEach((x) => x.resolve(session.access_token));
  p?.resolve(session.access_token);
  notify();
}

function requestToken(overrides) {
  if (!tokenClient) return Promise.reject(new AuthError("not_ready", "Sign-in is still loading."));
  if (pending) pending.reject(new AuthError("superseded"));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken(overrides);
  });
}

// Must be called from a click handler.
export function signIn() {
  return requestToken({ prompt: session?.email ? "" : "select_account", login_hint: session?.email || undefined });
}

// Must be called from a click handler (the "Continue" prompt after expiry).
export function reauthorize() {
  return requestToken({ prompt: "", login_hint: session?.email || undefined });
}

export function signOut() {
  session = null;
  writeStored();
  needsReauth = false;
  const w = waiters;
  waiters = [];
  w.forEach((x) => x.reject(new AuthError("signed_out")));
  notify();
}

// Called by the Drive client when Google rejects the token (401).
export function invalidateToken() {
  if (session) session = { ...session, expires_at: 0 };
  writeStored();
}

// Resolves with a valid token, waiting for the user to re-authorize if the
// current one has expired.
export function getAccessToken() {
  if (hasValidToken()) return Promise.resolve(session.access_token);
  if (!session) return Promise.reject(new AuthError("signed_out"));
  return new Promise((resolve, reject) => {
    waiters.push({ resolve, reject });
    if (!needsReauth) {
      needsReauth = true;
      notify();
    }
  });
}
