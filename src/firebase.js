import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyD7s2c3AabwEroTv70wgYWn8EqmkXMGsz4',
  authDomain: 'ebaluazioa-lh6.firebaseapp.com',
  projectId: 'ebaluazioa-lh6',
  storageBucket: 'ebaluazioa-lh6.firebasestorage.app',
  messagingSenderId: '259625121655',
  appId: '1:259625121655:web:3878badad68de791a41372',
  measurementId: 'G-DYNCNH273C',
};

/**
 * Private teacher allowlist email.
 * Replace "TU_CORREO@gmail.com" with your real Google email (or define VITE_ALLOWED_EMAIL in .env).
 */
export const ALLOWED_TEACHER_EMAIL =
  (import.meta.env.VITE_ALLOWED_EMAIL && import.meta.env.VITE_ALLOWED_EMAIL.trim()) ||
  'parrabermeo@gmail.com';

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope(GMAIL_SEND_SCOPE);
googleProvider.setCustomParameters({ prompt: 'select_account' });

function initDbWithPersistence() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return getFirestore(app);
  }
}

export const db = initDbWithPersistence();
