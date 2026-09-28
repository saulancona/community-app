import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getMessaging, Messaging, isSupported } from 'firebase/messaging';
import { getFunctions, Functions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { Platform } from 'react-native';

// Firebase configuration
// For web builds (Vercel), we provide fallback values since env vars don't work reliably with Expo web
// For native apps, we use env vars from .env file
// NOTE: Firebase API keys are not secrets — they are client-side identifiers.
// Real protection comes from Firestore security rules and App Check.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "northstar-community.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "northstar-community",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "northstar-community.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "YOUR_FIREBASE_APP_ID",
};

// Initialize Firebase
let app: FirebaseApp;
let db: Firestore;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);

  // Web: use IN-MEMORY Firestore cache (no IndexedDB). IndexedDB persistence on
  // Safari was both hanging the SDK (multi-tab Web Locks) AND serving days-old
  // stale data from a wedged cache that never re-synced. Memory cache ignores
  // IndexedDB entirely, so every load fetches fresh data and nothing can wedge.
  // Offline message display is still provided by the app's own AsyncStorage
  // cache (services/offline.ts); critical reads (profile/community) use REST.
  // Native: Default persistence is automatically enabled.
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      db = initializeFirestore(app, {
        localCache: memoryLocalCache(),
      });
      console.log('[Firestore] ✅ Initialized (web, in-memory cache)');
    } else {
      // Native platform: Use default initialization (persistence auto-enabled)
      db = getFirestore(app);
      console.log('[Firestore] ✅ Initialized (native - persistence enabled by default)');
    }
  } catch (error: any) {
    // Fallback to default (online-only) if persistence initialization fails
    console.warn('[Firestore] ⚠️ Persistence failed, using online-only mode:', error?.message);
    db = getFirestore(app);
  }
} else {
  app = getApp();
  db = getFirestore(app);
}

export const auth: Auth = getAuth(app);

// Request storage access for iframe contexts so auth sessions persist
// across parent page navigations (e.g., navigating between pages of an embedding site)
export const storageAccessReady: Promise<void> = (async () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const inIframe = window.self !== window.top;
    if (!inIframe) return;

    if (document.hasStorageAccess && !(await document.hasStorageAccess())) {
      await document.requestStorageAccess();
      console.log('[Auth] Storage access granted for iframe');
    }
  } catch {
    // Storage Access API not available or denied — auth will use partitioned storage
    console.log('[Auth] Storage access not available, using default persistence');
  }
})();

export { db };
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app);

// Firebase Cloud Messaging (only available in browser with service worker support)
let messaging: Messaging | null = null;

export const getMessagingInstance = async (): Promise<Messaging | null> => {
  if (messaging) return messaging;

  // Check if FCM is supported in this environment
  const supported = await isSupported();
  if (!supported) {
    console.log('FCM not supported in this environment');
    return null;
  }

  try {
    messaging = getMessaging(app);
    return messaging;
  } catch (error) {
    console.error('Error initializing FCM:', error);
    return null;
  }
};

// Cloud Functions callable helpers
export const callFunction = async <T = any>(
  functionName: string,
  data: Record<string, any>
): Promise<T> => {
  const fn = httpsCallable<Record<string, any>, T>(functions, functionName);
  const result: HttpsCallableResult<T> = await fn(data);
  return result.data;
};

// Initialize App Check when the module loads (only in browser)
if (typeof window !== 'undefined') {
  // Use requestIdleCallback for non-blocking initialization
  // Falls back to setTimeout if not available (Safari)
  const initAppCheck = () => {
    // Only initialize if reCAPTCHA site key is configured
    if (!process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY) {
      console.warn('[App Check] Skipped: EXPO_PUBLIC_RECAPTCHA_SITE_KEY not configured');
      return;
    }

    try {
      // Synchronous import to avoid race conditions
      const { initializeFirebaseAppCheck } = require('./appCheck');
      initializeFirebaseAppCheck();
    } catch (error) {
      // App Check is optional for development, don't crash if it fails
      console.warn('[App Check] Initialization failed (non-critical):', error);
    }
  };

  // Use requestIdleCallback for better performance, with fallback
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(initAppCheck, { timeout: 2000 });
  } else {
    setTimeout(initAppCheck, 500);
  }
}

export default app;
