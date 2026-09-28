import { initializeAppCheck, ReCaptchaV3Provider, getToken, AppCheck } from 'firebase/app-check';
import app from './firebase';

let appCheck: AppCheck | null = null;

/**
 * Initialize Firebase App Check
 * This helps protect your backend resources from abuse
 *
 * To enable App Check:
 * 1. Go to Firebase Console > App Check
 * 2. Register your app with reCAPTCHA v3
 * 3. Get your reCAPTCHA site key
 * 4. Add EXPO_PUBLIC_RECAPTCHA_SITE_KEY to your .env file
 * 5. Enable App Check enforcement in Firebase Console for Firestore, Storage, and Functions
 */
export const initializeFirebaseAppCheck = (): AppCheck | null => {
  // Only initialize in browser environment
  if (typeof window === 'undefined') {
    return null;
  }

  // Check if already initialized
  if (appCheck) {
    return appCheck;
  }

  const siteKey = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!siteKey) {
    console.warn(
      'Firebase App Check not initialized: EXPO_PUBLIC_RECAPTCHA_SITE_KEY not set.\n' +
      'App Check provides protection against abuse by verifying that requests come from your app.'
    );
    return null;
  }

  try {
    // Enable debug token in development
    if (__DEV__ && typeof window !== 'undefined') {
      // Self-check for debug environment
      (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });

    console.log('[App Check] ✅ Initialized successfully - API protection active');
    return appCheck;
  } catch (error: any) {
    // Log error but don't throw - App Check failures shouldn't break the app
    console.error('[App Check] ❌ Initialization failed:', error?.message || error);

    // In development, provide helpful debugging info
    if (__DEV__) {
      console.warn(
        '[App Check] Debug mode enabled. If this persists:\n' +
        '1. Verify EXPO_PUBLIC_RECAPTCHA_SITE_KEY in .env\n' +
        '2. Check Firebase Console > App Check\n' +
        '3. Register your domain in reCAPTCHA console'
      );
    }

    return null;
  }
};

/**
 * Get a fresh App Check token
 * Use this when making requests to your backend that require verification
 */
export const getAppCheckToken = async (): Promise<string | null> => {
  if (!appCheck) {
    return null;
  }

  try {
    const tokenResult = await getToken(appCheck, /* forceRefresh */ false);
    return tokenResult.token;
  } catch (error) {
    console.error('Failed to get App Check token:', error);
    return null;
  }
};

/**
 * Force refresh the App Check token
 * Use this if you suspect the token is stale
 */
export const refreshAppCheckToken = async (): Promise<string | null> => {
  if (!appCheck) {
    return null;
  }

  try {
    const tokenResult = await getToken(appCheck, /* forceRefresh */ true);
    return tokenResult.token;
  } catch (error) {
    console.error('Failed to refresh App Check token:', error);
    return null;
  }
};

export default appCheck;
