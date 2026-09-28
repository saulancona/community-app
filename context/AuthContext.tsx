import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, storageAccessReady } from '../services/firebase';
import {
  getUserProfile,
  createUserProfile,
  updateOnlineStatus,
  signOut as authSignOut,
} from '../services/auth';
import { initializeCommunity } from '../services/admin';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { initializeFCM, setupForegroundNotifications } from '../services/notifications';
import { initErrorReporting, setErrorReportingUser } from '../services/errorReporting';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isMember: boolean;
  isAdmin: boolean;
  // True when the profile fetch FAILED (transient) rather than the profile
  // being genuinely absent. Guards must show a loading/retry state in this
  // case — never treat it as "no access" / route to setup/removed.
  profileError: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setupProfile: (displayName: string, isFirstAdmin?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Direct REST API membership check - bypasses Firestore SDK entirely.
 * getUserProfile already uses REST API successfully on Vercel; this uses
 * the exact same pattern to read the community document and check memberIds.
 * Uses fbUser.getIdToken() directly (guaranteed valid inside onAuthStateChanged).
 */
const checkMembership = async (
  fbUser: FirebaseUser,
  profileRole?: string
): Promise<{ isMember: boolean; isAdmin: boolean }> => {
  try {
    const token = await fbUser.getIdToken();
    const url = `https://firestore.googleapis.com/v1/projects/${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'northstar-community'}/databases/(default)/documents/community/northstar`;

    // Bound the request so a stalled fetch can't hang onAuthStateChanged (and
    // thus the whole app's loading state) forever. On timeout it falls through
    // to the catch, which uses the profile-role fallback.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.warn('[checkMembership] REST API returned:', response.status, response.statusText);
      // Fallback: if we have a profile, the user went through signup, so assume member
      return { isMember: !!profileRole, isAdmin: profileRole === 'admin' };
    }

    const data = await response.json();
    const memberIds = (data.fields?.memberIds?.arrayValue?.values || [])
      .map((v: any) => v.stringValue)
      .filter(Boolean);
    const adminId = data.fields?.adminId?.stringValue || '';
    const adminIds = (data.fields?.adminIds?.arrayValue?.values || [])
      .map((v: any) => v.stringValue)
      .filter(Boolean);

    const memberResult = memberIds.includes(fbUser.uid);
    const adminResult = adminIds.includes(fbUser.uid) || adminId === fbUser.uid;

    if (__DEV__) {
      console.log('[checkMembership] isMember:', memberResult, 'isAdmin:', adminResult);
    }

    return { isMember: memberResult, isAdmin: adminResult };
  } catch (error) {
    console.error('[checkMembership] Error:', error);
    // Fallback: if we have a profile, the user went through signup, so assume member
    return { isMember: !!profileRole, isAdmin: profileRole === 'admin' };
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const retryCountRef = useRef(0);

  const refreshUser = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const profile = await getUserProfile(firebaseUser.uid);
      if (profile) {
        const { isMember: memberStatus, isAdmin: adminStatus } =
          await checkMembership(firebaseUser, profile.role);
        // Set all state together to avoid flash of "Access Removed" screen
        setUser(profile);
        setIsMember(memberStatus);
        setIsAdmin(adminStatus);
        setProfileError(false);
      } else {
        // Genuine absence — user needs setup.
        setUser(null);
        setIsMember(false);
        setIsAdmin(false);
        setProfileError(false);
      }
    } catch (err) {
      // Transient failure — keep any existing user/access and flag the error
      // so guards show a loading/retry state instead of denying access.
      console.warn('[Auth] refreshUser failed (transient):', err);
      setProfileError(true);
    }
  }, [firebaseUser]);

  // Auto-heal a transient profile-load failure. getUserProfile already retries
  // internally; this keeps re-attempting with exponential backoff (capped at
  // 30s) for as long as the error persists, so it self-heals whenever
  // connectivity returns instead of leaving the user stuck on "loading".
  useEffect(() => {
    if (!profileError || !firebaseUser) {
      retryCountRef.current = 0;
      return;
    }
    const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 30000); // 2s,4s,8s,16s,30s,30s…
    const timer = setTimeout(() => {
      retryCountRef.current += 1;
      refreshUser();
    }, delay);
    return () => clearTimeout(timer);
  }, [profileError, firebaseUser, refreshUser]);

  const setupProfile = useCallback(async (displayName: string, isFirstAdmin: boolean = false) => {
    if (!firebaseUser) {
      throw new Error('No authenticated user');
    }

    // Determine auth type and contact info based on what's available
    const authType: 'phone' | 'email' = firebaseUser.email ? 'email' : 'phone';
    const contactInfo = authType === 'email'
      ? firebaseUser.email || ''
      : firebaseUser.phoneNumber || '';

    const profile = await createUserProfile(
      firebaseUser.uid,
      contactInfo,
      displayName,
      isFirstAdmin,
      authType
    );

    if (isFirstAdmin) {
      await initializeCommunity(firebaseUser.uid);
      // Set all state together so routing guard sees user+isMember in one render
      setUser(profile);
      setIsAdmin(true);
      setIsMember(true);
    } else {
      // Add new member via Cloud Function (runs with admin privileges,
      // bypasses Firestore rules that block non-admin system message writes)
      const addUserToCommunity = httpsCallable(functions, 'addUserToCommunity');
      await addUserToCommunity({
        userId: firebaseUser.uid,
        displayName,
        contactInfo,
        contactType: authType,
      });
      // Set all state together so routing guard sees user+isMember in one render
      // (avoids flash of "Access Removed" screen)
      setUser(profile);
      setIsMember(true);
      setIsAdmin(false);
    }
  }, [firebaseUser]);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setFirebaseUser(null);
    setIsMember(false);
    setIsAdmin(false);
  }, []);

  // Session timeout: Auto sign-out after 30 minutes of inactivity (web only)
  const lastActivityRef = useRef<number>(Date.now());
  const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

  useEffect(() => {
    // Only enable session timeout on web platform
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    // Only monitor activity if user is authenticated
    if (!firebaseUser) {
      return;
    }

    // Update last activity timestamp on user interaction
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // Listen to various user activity events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    events.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Check for inactivity every minute
    const inactivityCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;

      if (timeSinceLastActivity >= SESSION_TIMEOUT_MS) {
        console.log('[Session] Auto sign-out due to 30min inactivity');
        signOut();
      }
    }, 60 * 1000); // Check every minute

    // Cleanup
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
      clearInterval(inactivityCheckInterval);
    };
  }, [firebaseUser]);

  useEffect(() => {
    let fcmCleanup: (() => void) | null = null;
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    // Wait for storage access in iframe contexts before listening for auth state.
    // This ensures Firebase can read persisted sessions from IndexedDB/localStorage.
    // BOUNDED: on Safari, document.requestStorageAccess() (inside storageAccessReady)
    // can hang and never settle, which would block onAuthStateChanged from ever
    // registering and leave the app spinning on "Loading…" forever — Safari-only.
    // Cap the wait so auth init always proceeds.
    const init = async () => {
      await Promise.race([
        storageAccessReady,
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);

      if (!isMounted) return;

      unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (!isMounted) return;

        // CRITICAL: When a user is detected, set isLoading=true BEFORE any async work.
        // This prevents the routing guard from acting on stale state (e.g. user=null)
        // while getUserProfile and checkMembership are still running.
        // Without this, a second onAuthStateChanged call (after an initial null call
        // that already set isLoading=false) would trigger premature routing to setup.
        if (fbUser) {
          setIsLoading(true);
        }

        setFirebaseUser(fbUser);

        if (fbUser) {
          try {
            // Skip ensureFirestoreReady() - getUserProfile has its own timeout
            const profile = await getUserProfile(fbUser.uid);

            if (!isMounted) return;

            if (profile) {
              // Check membership directly via REST API (same pattern as getUserProfile)
              // Uses fbUser.getIdToken() - guaranteed valid inside onAuthStateChanged
              const { isMember: memberStatus, isAdmin: verifiedAdmin } =
                await checkMembership(fbUser, profile.role);

              if (!isMounted) return;

              // Set all state together to avoid flash of "Access Removed" screen
              // (routing guard checks user + isMember in same render)
              setUser(profile);
              setIsMember(memberStatus);
              setIsAdmin(verifiedAdmin);
              setProfileError(false);

              // Non-blocking operations
              updateOnlineStatus(fbUser.uid, true).catch((err) => {
                console.warn('Error updating online status:', err);
              });

              // Initialize error reporting with user context
              initErrorReporting(fbUser.uid);
              setErrorReportingUser(fbUser.uid);

              // Initialize FCM for push notifications (non-blocking)
              initializeFCM(fbUser.uid).catch((err) => {
                console.log('FCM initialization failed (non-critical):', err);
              });

              // Setup foreground message handler
              fcmCleanup = setupForegroundNotifications();
            } else {
              // getUserProfile returned null = the profile GENUINELY doesn't
              // exist (404/empty). User needs to go through setup.
              setUser(null);
              setProfileError(false);
            }
          } catch (err) {
            // getUserProfile THREW = transient load failure (network/5xx/etc.)
            // after retries. Do NOT wipe an existing session or treat it as
            // "no profile" — flag it so guards show loading/retry and the
            // auto-heal effect re-attempts. This is what stopped paying members
            // from being bounced to setup/removed right after a deploy.
            console.warn('[Auth] Profile load failed (transient), will retry:', err);
            if (!isMounted) return;
            setProfileError(true);
          }
        } else {
          setUser(null);
          setIsMember(false);
          setIsAdmin(false);
          setProfileError(false);
          setErrorReportingUser(null);
        }

        if (isMounted) {
          setIsLoading(false);
        }
      });
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
      if (fcmCleanup) fcmCleanup();
    };
  }, []);

  // Heartbeat: update lastSeen every 2 minutes so other users can detect who's online.
  // Also handles app backgrounding (native) and tab visibility (web).
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!firebaseUser || !user) {
      // No user logged in — clear any running heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const uid = firebaseUser.uid;

    // Start heartbeat interval (every 2 minutes)
    heartbeatRef.current = setInterval(() => {
      updateOnlineStatus(uid, true).catch(() => {});
    }, 2 * 60 * 1000);

    // Handle app state changes (native: background/foreground, web: visibility)
    if (Platform.OS === 'web') {
      const handleVisibility = () => {
        if (document.visibilityState === 'hidden') {
          updateOnlineStatus(uid, false).catch(() => {});
        } else {
          updateOnlineStatus(uid, true).catch(() => {});
        }
      };
      const handleBeforeUnload = () => {
        // Use sendBeacon for reliability on tab close (fire-and-forget)
        // Falls back to sync updateOnlineStatus
        updateOnlineStatus(uid, false).catch(() => {});
      };
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    } else {
      // Native: listen for app state changes
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          updateOnlineStatus(uid, true).catch(() => {});
        } else if (nextState === 'background' || nextState === 'inactive') {
          updateOnlineStatus(uid, false).catch(() => {});
        }
      });

      return () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        subscription.remove();
      };
    }
  }, [firebaseUser, user]);

  const value: AuthContextType = useMemo(
    () => ({
      user,
      firebaseUser,
      isLoading,
      isAuthenticated: !!firebaseUser,
      isMember,
      isAdmin,
      profileError,
      signOut,
      refreshUser,
      setupProfile,
    }),
    [user, firebaseUser, isLoading, isMember, isAdmin, profileError, signOut, refreshUser, setupProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
