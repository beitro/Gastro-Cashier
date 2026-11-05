import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// In-memory token cache — NEVER stored in localStorage or sessionStorage for security
let inMemoryAccessToken: string | null = null;

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

export const getStoredAccessToken = (): string | null => inMemoryAccessToken;

export const setStoredAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

/**
 * Sign in with Google Popup requesting Google Sheets and Drive.file scopes.
 */
export async function signInWithGoogle(): Promise<{ user: User; accessToken: string }> {
  const provider = new GoogleAuthProvider();
  GOOGLE_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline',
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error('Gagal mendapatkan token akses Google Sheets. Pastikan izin telah diberikan.');
  }

  inMemoryAccessToken = accessToken;
  return { user: result.user, accessToken };
}

/**
 * Sign out user and wipe in-memory token.
 */
export async function signOutGoogle(): Promise<void> {
  inMemoryAccessToken = null;
  await signOut(auth);
}

/**
 * Listen to auth state changes.
 */
export function onAuthChanged(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      inMemoryAccessToken = null;
    }
    callback(user);
  });
}
