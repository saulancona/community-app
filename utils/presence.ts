import { User } from '../types';

/** Consider a user online if their lastSeen is within this window (ms). */
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Determine if a user is currently online based on their lastSeen timestamp.
 * The isOnline boolean in Firestore can become stale if the user closes
 * the app without signing out, so we use a time-based check instead.
 */
export function isUserOnline(member: User): boolean {
  if (!member.lastSeen) return false;

  const lastSeenDate =
    member.lastSeen instanceof Date
      ? member.lastSeen
      : typeof (member.lastSeen as any).toDate === 'function'
        ? (member.lastSeen as any).toDate()
        : new Date(member.lastSeen as any);

  return Date.now() - lastSeenDate.getTime() < ONLINE_THRESHOLD_MS;
}
