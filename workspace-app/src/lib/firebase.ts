import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app =
  getApps()[0] ??
  initializeApp({
    apiKey: 'AIzaSyBlXYkyP0bcHEsbU8bhYWnr9kvFluiP0f0',
    authDomain: 'msma-workspace.firebaseapp.com',
    projectId: 'msma-workspace',
    appId: '1:33439738161:web:a3f3ab244bd17f4cc9e810',
  });

export const auth = getAuth(app);
export const db = getFirestore(app);

export const ADMIN_EMAILS = ['jjrcabinas@gmail.com'];

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes((email || '').toLowerCase());
}
