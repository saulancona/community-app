import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, User } from '../types';

// Storage keys
const STORAGE_KEYS = {
  MESSAGES: 'cached_messages',
  USER: 'cached_user',
  LAST_SYNC: 'last_sync_timestamp',
  MEMBER_COUNT: 'cached_member_count',
};

// Maximum number of messages to cache
const MAX_CACHED_MESSAGES = 100;

// Cache messages locally
export const cacheMessages = async (messages: Message[]): Promise<void> => {
  try {
    // Only cache the most recent messages
    const messagesToCache = messages.slice(0, MAX_CACHED_MESSAGES);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messagesToCache));
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());
  } catch (error) {
    console.error('Error caching messages:', error);
  }
};

// Get cached messages
export const getCachedMessages = async (): Promise<Message[]> => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (cached) {
      return JSON.parse(cached);
    }
    return [];
  } catch (error) {
    console.error('Error getting cached messages:', error);
    return [];
  }
};

// Cache user data
export const cacheUser = async (user: User): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (error) {
    console.error('Error caching user:', error);
  }
};

// Get cached user
export const getCachedUser = async (): Promise<User | null> => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error('Error getting cached user:', error);
    return null;
  }
};

// Cache member count
export const cacheMemberCount = async (count: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBER_COUNT, count.toString());
  } catch (error) {
    console.error('Error caching member count:', error);
  }
};

// Get cached member count
export const getCachedMemberCount = async (): Promise<number> => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.MEMBER_COUNT);
    if (cached) {
      return parseInt(cached, 10);
    }
    return 1;
  } catch (error) {
    console.error('Error getting cached member count:', error);
    return 1;
  }
};

// Get last sync timestamp
export const getLastSyncTime = async (): Promise<number | null> => {
  try {
    const timestamp = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    if (timestamp) {
      return parseInt(timestamp, 10);
    }
    return null;
  } catch (error) {
    console.error('Error getting last sync time:', error);
    return null;
  }
};

// Clear all cached data (for logout)
export const clearCache = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.MESSAGES,
      STORAGE_KEYS.USER,
      STORAGE_KEYS.LAST_SYNC,
      STORAGE_KEYS.MEMBER_COUNT,
    ]);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

// Check if we're online (for web)
export const isOnline = (): boolean => {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true; // Assume online if we can't determine
};

// Listen for online/offline events (for web)
export const addNetworkListener = (
  onOnline: () => void,
  onOffline: () => void
): (() => void) => {
  // Web only. React Native defines a `window` global but WITHOUT
  // addEventListener, so guarding on `typeof window` alone threw
  // "undefined is not a function" on native iOS and crashed the app on launch.
  // Verify the method actually exists before using it.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }
  return () => {};
};

// Legacy offline send-queue key. The queue-and-auto-replay mechanism was
// removed because it stranded messages and replayed them in a burst into the
// wrong room on reconnect. clearPendingMessages remains so the app can purge
// any stale queue left in storage by older versions.
const PENDING_MESSAGES_KEY = 'pending_messages';

export const clearPendingMessages = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PENDING_MESSAGES_KEY);
  } catch (error) {
    console.error('Error clearing pending messages:', error);
  }
};
