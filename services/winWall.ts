import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { WinWallEntry } from '../types';

const WINS_COLLECTION = 'growth-lab-wins';

// Compute the ISO 8601 week id for a JS Date, in the form "YYYY-Www"
// (e.g. 2026-W23). Used to bucket entries for the weekly raffle.
export const computeWeekId = (date: Date = new Date()): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week starts on Monday; offset so Thursday in current week decides the year
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

// Subscribe to the most recent wins (newest first). Defaults to 100 most recent.
export const subscribeToWins = (
  callback: (wins: WinWallEntry[]) => void,
  onError?: (error: Error) => void,
  count: number = 100
): Unsubscribe => {
  const q = query(
    collection(db, WINS_COLLECTION),
    orderBy('createdAt', 'desc'),
    fbLimit(count)
  );

  return onSnapshot(
    q,
    (snap) => {
      const wins: WinWallEntry[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as WinWallEntry)
        .filter((w) => !w.isDeleted);
      callback(wins);
    },
    (error) => {
      console.error('[winWall] subscription error', error);
      if (onError) onError(error);
    }
  );
};

interface SubmitWinInput {
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  content: string;
  winDate: Date;
  imageUrl?: string;
}

export const submitWin = async (input: SubmitWinInput): Promise<string> => {
  const trimmed = input.content.trim();
  if (!trimmed) throw new Error('Win cannot be empty');
  if (trimmed.length > 2000) throw new Error('Win must be 2000 characters or fewer');

  const weekId = computeWeekId(input.winDate);
  const docData: Record<string, any> = {
    userId: input.userId,
    userName: input.userName,
    content: trimmed,
    winDate: Timestamp.fromDate(input.winDate),
    weekId,
    createdAt: serverTimestamp(),
  };
  if (input.userAvatarUrl) docData.userAvatarUrl = input.userAvatarUrl;
  if (input.imageUrl) docData.imageUrl = input.imageUrl;

  const ref = await addDoc(collection(db, WINS_COLLECTION), docData);
  return ref.id;
};

// Edit own win (within 24h, enforced by Firestore rule).
export const updateWin = async (
  winId: string,
  updates: { content?: string; winDate?: Date; imageUrl?: string | null }
): Promise<void> => {
  const ref = doc(db, WINS_COLLECTION, winId);
  const payload: Record<string, any> = { updatedAt: serverTimestamp() };
  if (updates.content !== undefined) {
    const trimmed = updates.content.trim();
    if (!trimmed) throw new Error('Win cannot be empty');
    if (trimmed.length > 2000) throw new Error('Win must be 2000 characters or fewer');
    payload.content = trimmed;
  }
  if (updates.winDate !== undefined) {
    payload.winDate = Timestamp.fromDate(updates.winDate);
    payload.weekId = computeWeekId(updates.winDate);
  }
  if (updates.imageUrl !== undefined) {
    payload.imageUrl = updates.imageUrl ?? null;
  }
  await updateDoc(ref, payload);
};

// Soft-delete a win (sets isDeleted=true).
// Hard-delete is admin-only via Cloud Function if you need it.
export const deleteWin = async (winId: string): Promise<void> => {
  const ref = doc(db, WINS_COLLECTION, winId);
  await updateDoc(ref, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
  });
};

// Toggle a reaction emoji from the current user.
// If the user has already reacted with this emoji, removes it; otherwise adds.
export const toggleWinReaction = async (
  winId: string,
  emoji: string,
  userId: string
): Promise<void> => {
  const ref = doc(db, WINS_COLLECTION, winId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Win not found');
  const data = snap.data() as WinWallEntry;
  const reactions = data.reactions || [];
  const existing = reactions.find((r) => r.emoji === emoji);

  let newReactions = reactions;
  if (existing && existing.userIds.includes(userId)) {
    // remove
    newReactions = reactions
      .map((r) =>
        r.emoji === emoji
          ? { ...r, userIds: r.userIds.filter((u) => u !== userId) }
          : r
      )
      .filter((r) => r.userIds.length > 0);
  } else if (existing) {
    // add to existing emoji bucket
    newReactions = reactions.map((r) =>
      r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r
    );
  } else {
    // create new emoji bucket
    newReactions = [...reactions, { emoji, userIds: [userId] }];
  }

  await updateDoc(ref, { reactions: newReactions });
};

// ===== Helpers used by both UI and raffle Cloud Function =====

// Returns the participants for a given weekId (deduped by userId).
export const computeWeekParticipants = (wins: WinWallEntry[], weekId: string): string[] => {
  const ids = new Set<string>();
  for (const w of wins) {
    if (w.weekId === weekId && !w.isDeleted) ids.add(w.userId);
  }
  return Array.from(ids);
};

// Human-readable label for an ISO week, e.g. "Week of Jun 8, 2026"
export const labelForWeekId = (weekId: string): string => {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) return weekId;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // ISO week-to-date: Jan 4 of that year is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const weekMonday = new Date(week1Monday);
  weekMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return `Week of ${weekMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};
