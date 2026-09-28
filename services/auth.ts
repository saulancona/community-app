import {
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  User as FirebaseUser,
  ConfirmationResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  linkWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { ensureFirestoreReady } from './firestore-init';
import { User } from '../types';
import { APP_CONFIG } from '../constants/config';

let confirmationResult: ConfirmationResult | null = null;

export const sendVerificationCode = async (
  phoneNumber: string,
  recaptchaVerifier: any
): Promise<string> => {
  try {
    confirmationResult = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      recaptchaVerifier
    );
    return confirmationResult.verificationId;
  } catch (error: any) {
    console.error('Error sending verification code:', error);
    throw new Error(error.message || 'Failed to send verification code');
  }
};

export const verifyCode = async (code: string): Promise<FirebaseUser> => {
  try {
    if (!confirmationResult) {
      throw new Error('No verification in progress');
    }
    const result = await confirmationResult.confirm(code);
    return result.user;
  } catch (error: any) {
    console.error('Error verifying code:', error);
    throw new Error(error.message || 'Invalid verification code');
  }
};

export const verifyCodeWithId = async (
  verificationId: string,
  code: string
): Promise<FirebaseUser> => {
  try {
    const credential = PhoneAuthProvider.credential(verificationId, code);
    const result = await signInWithCredential(auth, credential);
    return result.user;
  } catch (error: any) {
    console.error('Error verifying code:', error);
    throw new Error(error.message || 'Invalid verification code');
  }
};

/**
 * Fetch a user's own profile via the Firestore REST API.
 *
 * Resolution contract (callers depend on this distinction):
 * - Returns a `User` when the profile is found.
 * - Returns `null` ONLY when the profile genuinely does not exist (HTTP 404 or
 *   an empty document). This is the "new user needs setup" signal.
 * - THROWS on transient failures (network error, timeout, 5xx, 429, or auth
 *   token not yet propagated) AFTER exhausting retries. Callers must treat a
 *   throw as "couldn't load — try again", NOT as "no profile". Conflating the
 *   two is what caused paying members to be redirected to setup/removed/rooms
 *   right after a deploy (cold reload → transient fetch failure → null).
 */
export const getUserProfile = async (userId: string): Promise<User | null> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('[getUserProfile] No authenticated user');
    return null;
  }

  const projectId = 'northstar-community';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`;

  const MAX_ATTEMPTS = 4;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Force-refresh the token on retries in case the failure was a token
      // that hadn't propagated yet (common right after auth on a cold load).
      const token = await currentUser.getIdToken(attempt > 1);

      // Bound the request — a raw fetch has no timeout and hangs forever on a
      // stalled connection, which would leave onAuthStateChanged (and the whole
      // app's loading state) stuck. On timeout this aborts and counts as a
      // failed attempt, so the retry/throw path runs instead of hanging.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      // Genuine "no profile" — the document does not exist. Not transient.
      if (response.status === 404) {
        console.warn('[getUserProfile] Profile does not exist (404)');
        return null;
      }

      // Transient: server/throttle/auth errors — retry.
      if (!response.ok) {
        lastError = new Error(`REST API ${response.status} ${response.statusText}`);
        console.warn(`[getUserProfile] Attempt ${attempt}/${MAX_ATTEMPTS} got ${response.status}; will retry`);
      } else {
        const data = await response.json();
        if (data.fields) {
          const profile: User = {
            id: userId,
            phoneNumber: data.fields.phoneNumber?.stringValue || '',
            email: data.fields.email?.stringValue || '',
            displayName: data.fields.displayName?.stringValue || '',
            role: data.fields.role?.stringValue as 'admin' | 'member' || 'member',
            hasEliteAccess: data.fields.hasEliteAccess?.booleanValue || false,
            isOnline: data.fields.isOnline?.booleanValue || false,
            joinedAt: Timestamp.fromDate(data.fields.joinedAt?.timestampValue ? new Date(data.fields.joinedAt.timestampValue) : new Date()),
            lastSeen: Timestamp.fromDate(data.fields.lastSeen?.timestampValue ? new Date(data.fields.lastSeen.timestampValue) : new Date()),
            subscriptionTier: (data.fields.subscriptionTier?.stringValue as 'none' | 'standard' | 'all-access') || 'none',
            subscriptionStatus: (data.fields.subscriptionStatus?.stringValue as 'active' | 'inactive' | 'cancelled' | 'past_due') || 'inactive',
          };
          console.log('[getUserProfile] SUCCESS:', { id: profile.id, role: profile.role, subscriptionTier: profile.subscriptionTier, subscriptionStatus: profile.subscriptionStatus });
          return profile;
        }
        // 200 OK but empty document — genuine absence.
        console.warn('[getUserProfile] Response has no fields — treating as no profile');
        return null;
      }
    } catch (error) {
      lastError = error;
      console.warn(`[getUserProfile] Attempt ${attempt}/${MAX_ATTEMPTS} threw:`, error);
    }

    // Backoff before the next attempt (300ms, 600ms, 1200ms).
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt - 1)));
    }
  }

  // Exhausted retries on transient failures — signal a LOAD FAILURE (not
  // absence) so callers show a retry/loading state instead of denying access.
  console.error('[getUserProfile] All attempts failed:', lastError);
  throw new Error('Failed to load user profile after retries');
};

export const createUserProfile = async (
  userId: string,
  contactInfo: string, // Can be phone number or email
  displayName: string,
  isAdmin: boolean = false,
  authType: 'phone' | 'email' = 'phone'
): Promise<User> => {
  const userData: Omit<User, 'id'> = {
    displayName,
    role: isAdmin ? 'admin' : 'member',
    joinedAt: serverTimestamp() as any,
    lastSeen: serverTimestamp() as any,
    isOnline: true,
    // Set default subscription fields for new members
    // New members start with 'none' tier until they pay
    // Admins automatically get 'all-access'
    subscriptionTier: isAdmin ? 'all-access' : 'none',
    subscriptionStatus: isAdmin ? 'active' : 'inactive',
  };

  // Set either phone or email based on auth type
  if (authType === 'email') {
    (userData as any).email = contactInfo;
  } else {
    (userData as any).phoneNumber = contactInfo;
  }

  await setDoc(doc(db, 'users', userId), userData);

  return { id: userId, ...userData } as User;
};

export const updateUserProfile = async (
  userId: string,
  updates: Partial<User>
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...updates,
      lastSeen: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export const updateOnlineStatus = async (
  userId: string,
  isOnline: boolean
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      isOnline,
      lastSeen: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating online status:', error);
  }
};

export const signOut = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (user) {
      await updateOnlineStatus(user.uid, false);
    }
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const getCurrentUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

// Email Authentication Functions

export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<FirebaseUser> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    // Send verification email
    await sendEmailVerification(result.user);
    return result.user;
  } catch (error: any) {
    console.error('Error signing up with email:', error);
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('An account with this email already exists. Please sign in instead.');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak. Please use at least 6 characters.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }
    throw new Error(error.message || 'Failed to create account');
  }
};

export const signInWithEmail = async (
  email: string,
  password: string
): Promise<FirebaseUser> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error: any) {
    console.error('Error signing in with email:', error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      throw new Error('Invalid email or password.');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please try again later.');
    }
    throw new Error(error.message || 'Failed to sign in');
  }
};

export const resendVerificationEmail = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (user) {
      await sendEmailVerification(user);
    } else {
      throw new Error('No user is signed in');
    }
  } catch (error: any) {
    console.error('Error sending verification email:', error);
    throw new Error(error.message || 'Failed to send verification email');
  }
};

export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Error sending password reset:', error);
    if (error.code === 'auth/user-not-found') {
      throw new Error('No account found with this email address.');
    }
    throw new Error(error.message || 'Failed to send password reset email');
  }
};

// Link Email to Existing Account (for users who signed up with phone)
export const linkEmailToAccount = async (
  email: string,
  password: string
): Promise<void> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is signed in');
    }

    // Create email credential
    const credential = EmailAuthProvider.credential(email, password);

    // Link the credential to the current user
    await linkWithCredential(currentUser, credential);

    // Update user profile in Firestore to include email
    await updateDoc(doc(db, 'users', currentUser.uid), {
      email: email,
    });

    console.log('[Auth] Successfully linked email to account');
  } catch (error: any) {
    console.error('Error linking email to account:', error);
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('This email is already associated with another account.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak. Please use at least 6 characters.');
    } else if (error.code === 'auth/provider-already-linked') {
      throw new Error('An email is already linked to this account.');
    }
    throw new Error(error.message || 'Failed to link email to account');
  }
};

// Link Phone to Existing Account (for users who signed up with email)
export const linkPhoneToAccount = async (
  verificationId: string,
  code: string
): Promise<void> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is signed in');
    }

    // Create phone credential
    const credential = PhoneAuthProvider.credential(verificationId, code);

    // Link the credential to the current user
    await linkWithCredential(currentUser, credential);

    // Get the phone number from the linked credential
    // After linking, the user object will have the phoneNumber
    const updatedUser = auth.currentUser;
    if (updatedUser?.phoneNumber) {
      // Update user profile in Firestore to include phone number
      await updateDoc(doc(db, 'users', currentUser.uid), {
        phoneNumber: updatedUser.phoneNumber,
      });
    }

    console.log('[Auth] Successfully linked phone to account');
  } catch (error: any) {
    console.error('Error linking phone to account:', error);
    if (error.code === 'auth/credential-already-in-use') {
      throw new Error('This phone number is already associated with another account.');
    } else if (error.code === 'auth/invalid-verification-code') {
      throw new Error('Invalid verification code. Please try again.');
    } else if (error.code === 'auth/provider-already-linked') {
      throw new Error('A phone number is already linked to this account.');
    }
    throw new Error(error.message || 'Failed to link phone to account');
  }
};
