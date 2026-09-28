import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  Unsubscribe,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// Typing status expires after 5 seconds
const TYPING_TIMEOUT = 5000;

interface TypingUser {
  id: string;
  displayName: string;
  timestamp: number;
}

// Set user as typing
export const setTypingStatus = async (
  userId: string,
  displayName: string
): Promise<void> => {
  try {
    const typingRef = doc(db, 'typing', userId);
    await setDoc(typingRef, {
      id: userId,
      displayName,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error setting typing status:', error);
  }
};

// Clear typing status
export const clearTypingStatus = async (userId: string): Promise<void> => {
  try {
    const typingRef = doc(db, 'typing', userId);
    await deleteDoc(typingRef);
  } catch (error) {
    console.error('Error clearing typing status:', error);
  }
};

// Subscribe to typing users
export const subscribeToTypingUsers = (
  currentUserId: string,
  callback: (typingUsers: TypingUser[]) => void
): Unsubscribe => {
  const typingCollection = collection(db, 'typing');

  return onSnapshot(typingCollection, (snapshot) => {
    const now = Date.now();
    const typingUsers: TypingUser[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as TypingUser;
      // Filter out current user and expired entries
      if (data.id !== currentUserId && now - data.timestamp < TYPING_TIMEOUT) {
        typingUsers.push(data);
      }
    });

    callback(typingUsers);
  }, (error) => {
    console.error('Error subscribing to typing status:', error);
    callback([]);
  });
};

// Debounced typing handler to avoid too many updates
let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let typingClearTimer: ReturnType<typeof setTimeout> | null = null;

export const handleTyping = (
  userId: string,
  displayName: string
): void => {
  // Clear any pending clear timer
  if (typingClearTimer) {
    clearTimeout(typingClearTimer);
    typingClearTimer = null;
  }

  // Debounce the typing indicator update
  if (!typingDebounceTimer) {
    setTypingStatus(userId, displayName);
    typingDebounceTimer = setTimeout(() => {
      typingDebounceTimer = null;
    }, 2000); // Update every 2 seconds while typing
  }

  // Set a timer to clear typing status after user stops typing
  typingClearTimer = setTimeout(() => {
    clearTypingStatus(userId);
    typingClearTimer = null;
  }, 3000); // Clear after 3 seconds of no typing
};

// Clear all typing status for cleanup (e.g., on logout)
export const cleanupTyping = (userId: string): void => {
  if (typingDebounceTimer) {
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = null;
  }
  if (typingClearTimer) {
    clearTimeout(typingClearTimer);
    typingClearTimer = null;
  }
  clearTypingStatus(userId);
};
