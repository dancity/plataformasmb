import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

/**
 * A configuração web do Firebase é pública por natureza — vai no bundle e
 * qualquer pessoa lê no navegador. Ela identifica o projeto, não autoriza
 * nada: quem autoriza são as regras do Firestore e os custom claims.
 *
 * As variáveis de ambiente existem para apontar um build de homologação
 * para outro projeto sem tocar no código.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyB49-LK9rDf7b6gN1WdP6g18Ybobwjjw7w',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'plataformas-marista.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'plataformas-marista',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'plataformas-marista.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID ?? '1010228542979',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:1010228542979:web:fc2dffc4e2a39983a1d836',
};

/** Mesma região do Firestore: evita ida e volta ao hemisfério norte. */
export const REGIAO = 'southamerica-east1';

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, REGIAO);

/**
 * Emuladores: ligados por variável, nunca por detecção de hostname.
 * Detectar "localhost" faz um build de produção rodado na máquina do dev
 * apontar para o emulador sem avisar — e o contrário é pior.
 */
if (import.meta.env.VITE_USAR_EMULADORES === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  // eslint-disable-next-line no-console
  console.info('[firebase] usando emuladores locais');
}
