import type { FirebaseApp } from 'firebase/app';
import type { Auth, GoogleAuthProvider } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export declare const firebaseConfig: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
};

export declare const ALLOWED_TEACHER_EMAIL: string;
export declare const app: FirebaseApp;
export declare const auth: Auth;
export declare const googleProvider: GoogleAuthProvider;
export declare const db: Firestore;
