import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import * as twilio from 'twilio';
import * as crypto from 'crypto';

/**
 * Constant-time comparison of two secrets. Returns false on any type/length
 * mismatch instead of throwing, so it is safe to call with untrusted input.
 */
function secretsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

admin.initializeApp();

const db = admin.firestore();

/**
 * Verify that the calling user is a community admin.
 * Checks both legacy adminId and the adminIds array.
 */
async function verifyAdmin(uid: string): Promise<boolean> {
  const communityDoc = await db.collection('community').doc('northstar').get();
  if (!communityDoc.exists) return false;
  const data = communityDoc.data();
  if (!data) return false;
  return data.adminId === uid || (data.adminIds || []).includes(uid);
}

/**
 * Resolve the Firestore message collection for a given roomId.
 * Mirrors `constants/config.ts > CHAT_ROOMS[roomId].messagesCollection`.
 * Unknown roomIds fall back to `messages` (Northstar Coaching).
 */
function resolveCollectionName(roomId: unknown): string {
  if (roomId === 'inner-circle') return 'messages-elite';
  if (roomId === 'growth-lab') return 'messages-growth-lab';
  return 'messages';
}

/**
 * Throws permission-denied unless the user is allowed to post in `roomId`.
 *
 * This MUST mirror the Firestore security rules for each room's messages
 * collection. The secure send functions write via the Admin SDK, which bypasses
 * Firestore rules entirely — so without this check a member whose subscription
 * lapsed/was refunded could keep posting to paid rooms through the callable.
 *
 * - admin: may post anywhere.
 * - growth-lab: must be on room-settings/growth-lab.invitedUserIds
 *   (invite-gated, NOT subscription-gated).
 * - inner-circle: requires an active all-access subscription
 *   (matches hasAllAccessSubscription() in the rules).
 * - northstar / default: requires an active subscription, standard or
 *   all-access (matches hasActiveSubscription() in the rules).
 */
async function assertCanPostInRoom(uid: string, roomId: unknown): Promise<void> {
  // Admins can always post.
  if (await verifyAdmin(uid)) return;

  if (roomId === 'growth-lab') {
    const settingsDoc = await db.collection('room-settings').doc('growth-lab').get();
    const invited: string[] = (settingsDoc.exists && (settingsDoc.data()?.invitedUserIds as string[])) || [];
    if (!invited.includes(uid)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not invited to Growth Lab'
      );
    }
    return;
  }

  // Subscription gating for the paid rooms — mirrors the Firestore rules.
  const userDoc = await db.collection('users').doc(uid).get();
  const u = userDoc.data() || {};
  const active = u.subscriptionStatus === 'active';
  const hasStandard = active && (u.subscriptionTier === 'standard' || u.subscriptionTier === 'all-access');
  const hasAllAccess = active && u.subscriptionTier === 'all-access';

  if (roomId === 'inner-circle') {
    if (!hasAllAccess) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'An active all-access subscription is required to post here.'
      );
    }
    return;
  }

  // northstar (default) and any other standard room.
  if (!hasStandard) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'An active subscription is required to post here.'
    );
  }
}

/**
 * Sanitize a display name: trim, remove control characters, limit length.
 */
function sanitizeDisplayName(name: unknown): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .substring(0, 100);
}

/**
 * Validate an email address format.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate a phone number format (E.164).
 */
function isValidPhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

/**
 * Validate an invite code format (6 uppercase alphanumeric chars).
 */
function isValidInviteCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/**
 * Escape a value for safe interpolation into an HTML document. Use for any
 * user-supplied string placed inside an HTML email/template body.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Rate limiting configuration
const RATE_LIMIT = {
  maxMessages: 10,
  windowMs: 10000, // 10 seconds
  maxMessagesPerMinute: 30,
  minuteWindowMs: 60000,
};

// XSS patterns to block
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /data:text\/html/gi,
];

// Spam patterns
const SPAM_PATTERNS = [
  /(.)\1{15,}/,  // 15+ repeated characters
  /click here now/i,
  /free money/i,
  /act now/i,
  /limited time offer/i,
  /congratulations you won/i,
];

/**
 * Sanitize message content
 * Note: We don't HTML-encode characters because React Native Text components
 * don't interpret HTML entities. Encoding would show literal "&amp;" etc.
 */
function sanitizeContent(content: string): string {
  if (!content || typeof content !== 'string') return '';

  return content
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (except newlines, tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove script tags and event handlers for safety
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Limit consecutive newlines
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/**
 * Check for XSS patterns
 */
function containsXSS(content: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Check for spam patterns
 */
function containsSpam(content: string): boolean {
  return SPAM_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Profanity / hate-speech keyword filter.
 * Apple Guideline 1.2 requires a method for filtering objectionable content
 * in apps with user-generated content. This is a conservative starter list;
 * expand it as moderation needs evolve. Matching uses word boundaries so
 * substrings inside legitimate words won't false-positive.
 */
const OBJECTIONABLE_PATTERNS: RegExp[] = [
  // Slurs and severely offensive terms (intentionally generic — extend the list)
  /\b(n[i1]gg(?:er|a)s?)\b/i,
  /\b(f[a@]gg?[o0]ts?)\b/i,
  /\b(k[i1]kes?)\b/i,
  /\b(ch[i1]nks?)\b/i,
  /\b(sp[i1]cs?)\b/i,
  /\b(tr[a@]nn(?:y|ies))\b/i,
  /\b(ret[a@]rds?)\b/i,
  // Threats of violence (very rough heuristics)
  /\b(i('| a)?m? going to (kill|hurt|murder|stab|shoot)|kill yourself|kys|go die)\b/i,
  // CSAM / minor-related red flags
  /\b(child porn|cp|loli|underage (sex|nude))\b/i,
];

function containsObjectionableContent(content: string): boolean {
  return OBJECTIONABLE_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Validate message content
 */
function validateMessage(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Message content is required' };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > 5000) {
    return { valid: false, error: 'Message is too long (max 5000 characters)' };
  }

  if (containsXSS(trimmed)) {
    return { valid: false, error: 'Message contains prohibited content' };
  }

  if (containsSpam(trimmed)) {
    return { valid: false, error: 'Message flagged as spam' };
  }

  return { valid: true };
}

/**
 * Server-side rate limiting check
 */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; error?: string }> {
  const rateLimitRef = db.collection('rateLimits').doc(userId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      const now = Date.now();

      let data = doc.exists ? doc.data() : null;

      if (!data) {
        // First message from this user
        data = {
          timestamps: [now],
          minuteTimestamps: [now],
          lastReset: now,
        };
        transaction.set(rateLimitRef, data);
        return { allowed: true };
      }

      // Filter timestamps within the rate limit window
      const recentTimestamps = (data.timestamps || []).filter(
        (t: number) => now - t < RATE_LIMIT.windowMs
      );

      // Filter timestamps within the minute window
      const minuteTimestamps = (data.minuteTimestamps || []).filter(
        (t: number) => now - t < RATE_LIMIT.minuteWindowMs
      );

      // Check short-term rate limit (10 messages per 10 seconds)
      if (recentTimestamps.length >= RATE_LIMIT.maxMessages) {
        return {
          allowed: false,
          error: 'Rate limit exceeded. Please wait a few seconds.'
        };
      }

      // Check longer-term rate limit (30 messages per minute)
      if (minuteTimestamps.length >= RATE_LIMIT.maxMessagesPerMinute) {
        return {
          allowed: false,
          error: 'You are sending too many messages. Please slow down.'
        };
      }

      // Update timestamps
      recentTimestamps.push(now);
      minuteTimestamps.push(now);

      transaction.update(rateLimitRef, {
        timestamps: recentTimestamps,
        minuteTimestamps: minuteTimestamps,
        lastReset: now,
      });

      return { allowed: true };
    });

    return result;
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow message if rate limit check fails (fail open)
    return { allowed: true };
  }
}

/**
 * Callable function to send a message with server-side validation and rate limiting
 */
export const sendMessageSecure = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to send messages'
    );
  }

  const { content, roomId, replyTo, senderName, senderAvatar } = data;
  const userId = context.auth.uid;

  // Check rate limit
  const rateLimitResult = await checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      rateLimitResult.error || 'Rate limit exceeded'
    );
  }

  // Validate content
  const validation = validateMessage(content);
  if (!validation.valid) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      validation.error || 'Invalid message'
    );
  }

  // Sanitize content
  const sanitizedContent = sanitizeContent(content);

  // Verify user is a member
  const communityDoc = await db.collection('community').doc('northstar').get();
  if (!communityDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Community not found');
  }

  const communityData = communityDoc.data();
  if (!communityData?.memberIds?.includes(userId)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'You must be a member to send messages'
    );
  }

  // Per-room access control (Growth Lab invite list, etc.)
  await assertCanPostInRoom(userId, roomId);

  const collectionName = resolveCollectionName(roomId);

  // Build message document
  const messageData: Record<string, any> = {
    senderId: userId,
    senderName: senderName || 'Anonymous',
    content: sanitizedContent,
    type: 'text',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    readBy: [userId],
  };

  if (senderAvatar) {
    messageData.senderAvatar = senderAvatar;
  }

  if (replyTo) {
    messageData.replyTo = {
      id: replyTo.id,
      content: replyTo.type === 'image' ? 'Photo' : sanitizeContent(replyTo.content),
      senderName: replyTo.senderName,
      type: replyTo.type,
    };
  }

  // Save message
  const docRef = await db.collection(collectionName).add(messageData);

  return {
    success: true,
    messageId: docRef.id
  };
});

/**
 * Callable function to send an image message with validation.
 * Supports two modes:
 *   1. imageData (base64) — server uploads to Storage (bypasses client CORS)
 *   2. imageUrl — validates an existing Storage URL (legacy fallback)
 */
export const sendImageMessageSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to send images'
    );
  }

  const { imageUrl, imageData, imageContentType, imageWidth, imageHeight, roomId, senderName, senderAvatar } = data;
  const userId = context.auth.uid;

  // Check rate limit
  const rateLimitResult = await checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      rateLimitResult.error || 'Rate limit exceeded'
    );
  }

  let finalImageUrl = imageUrl;

  if (imageData && typeof imageData === 'string') {
    // --- Server-side upload from base64 (primary path) ---
    const buffer = Buffer.from(imageData, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      throw new functions.https.HttpsError('invalid-argument', 'Image too large (max 5MB)');
    }

    const contentType = (imageContentType && typeof imageContentType === 'string' && imageContentType.startsWith('image/'))
      ? imageContentType
      : 'image/jpeg';

    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${userId}_${timestamp}_${random}.${ext}`;
    const filePath = `chat-images/${userId}/${filename}`;

    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    const downloadToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    await file.save(buffer, {
      contentType,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    finalImageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
  } else if (finalImageUrl && typeof finalImageUrl === 'string') {
    // --- Legacy: validate existing Storage URL ---
    if (!finalImageUrl.includes('firebasestorage.googleapis.com') && !finalImageUrl.includes('firebasestorage.app')) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid image source');
    }
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'Image data or URL is required');
  }

  // Verify membership
  const communityDoc = await db.collection('community').doc('northstar').get();
  if (!communityDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Community not found');
  }

  const communityData = communityDoc.data();
  if (!communityData?.memberIds?.includes(userId)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'You must be a member to send images'
    );
  }

  await assertCanPostInRoom(userId, roomId);

  const collectionName = resolveCollectionName(roomId);

  const messageData: Record<string, any> = {
    senderId: userId,
    senderName: senderName || 'Anonymous',
    content: '',
    type: 'image',
    imageUrl: finalImageUrl,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    readBy: [userId],
  };

  if (imageWidth) messageData.imageWidth = imageWidth;
  if (imageHeight) messageData.imageHeight = imageHeight;
  if (senderAvatar) messageData.senderAvatar = senderAvatar;

  const docRef = await db.collection(collectionName).add(messageData);

  return {
    success: true,
    messageId: docRef.id
  };
});

/**
 * Callable function to send a video message with validation.
 * Client uploads video to Storage directly, then calls this to create the message.
 */
export const sendVideoMessageSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to send videos'
    );
  }

  const { videoUrl, videoDuration, roomId, senderName, senderAvatar } = data;
  const userId = context.auth.uid;

  // Check rate limit
  const rateLimitResult = await checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      rateLimitResult.error || 'Rate limit exceeded'
    );
  }

  // Validate video URL
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Video URL is required');
  }

  if (!videoUrl.includes('firebasestorage.googleapis.com') && !videoUrl.includes('firebasestorage.app')) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid video source');
  }

  // Verify membership
  const communityDoc = await db.collection('community').doc('northstar').get();
  if (!communityDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Community not found');
  }

  const communityData = communityDoc.data();
  if (!communityData?.memberIds?.includes(userId)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'You must be a member to send videos'
    );
  }

  await assertCanPostInRoom(userId, roomId);

  const collectionName = resolveCollectionName(roomId);

  const messageData: Record<string, any> = {
    senderId: userId,
    senderName: senderName || 'Anonymous',
    content: '',
    type: 'video',
    videoUrl,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    readBy: [userId],
  };

  if (videoDuration) messageData.videoDuration = videoDuration;
  if (senderAvatar) messageData.senderAvatar = senderAvatar;

  const docRef = await db.collection(collectionName).add(messageData);

  return {
    success: true,
    messageId: docRef.id
  };
});

/**
 * Firestore trigger for message validation (backup validation)
 * This runs on every message write as a safety net
 */
export const onMessageCreate = functions.firestore
  .document('{collectionId}/{messageId}')
  .onCreate(async (snap, context) => {
    const { collectionId, messageId } = context.params;

    // Only process message collections
    if (!collectionId.startsWith('messages')) {
      return null;
    }

    const data = snap.data();

    // Skip system messages
    if (data.senderId === 'system') {
      return null;
    }

    // Validate content
    if (data.content && typeof data.content === 'string') {
      const isXss = containsXSS(data.content);
      const isSpam = containsSpam(data.content);
      const isObjectionable = containsObjectionableContent(data.content);
      if (isXss || isSpam || isObjectionable) {
        const violation = isXss
          ? 'xss'
          : isObjectionable
          ? 'objectionable_content'
          : 'spam';

        // Log the violation
        await db.collection('messageViolations').add({
          messageId,
          collectionId,
          senderId: data.senderId,
          violation,
          content: data.content.substring(0, 200), // Store truncated content for review
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Soft delete the message
        await snap.ref.update({
          isDeleted: true,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          deletedBy: 'system',
          deletedReason: 'Content policy violation',
          content: '[Message removed for policy violation]',
        });
      }
    }

    return null;
  });

/**
 * Compute ISO 8601 week id (e.g. "2026-W23") for the given Date in UTC.
 * Mirrors services/winWall.ts > computeWeekId() so client + server agree.
 */
function computeWeekIdServer(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Firestore trigger that scans new Growth Lab wins for objectionable
 * content. Mirrors the safeguard on chat messages. Soft-deletes on match.
 */
export const onWinCreate = functions.firestore
  .document('growth-lab-wins/{winId}')
  .onCreate(async (snap, _context) => {
    const data = snap.data();
    if (!data || typeof data.content !== 'string') return null;
    if (containsXSS(data.content) || containsObjectionableContent(data.content)) {
      await db.collection('messageViolations').add({
        winId: snap.id,
        senderId: data.userId,
        violation: containsXSS(data.content) ? 'xss' : 'objectionable_content',
        content: data.content.substring(0, 300),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await snap.ref.update({
        isDeleted: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedBy: 'system',
        deletedReason: 'Content policy violation',
        content: '[Win removed for policy violation]',
      });
    }
    return null;
  });

// NOTE: The automatic weekly raffle draw (drawWeeklyRaffle, formerly scheduled
// '0 12 * * MON' America/New_York) was REMOVED so winners are never selected or
// announced automatically/unattended. Run a draw on demand with the manual
// `drawRaffleNow` callable below instead. (Original implementation is in git
// history if the automated draw is ever wanted back.)

/**
 * Manual one-shot raffle draw — admin can trigger via callable, useful if
 * the scheduled run misses or you want to demo. Operates on the previous
 * ISO week by default, or any explicit weekId you pass.
 */
export const drawRaffleNow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  const oneDayMs = 24 * 60 * 60 * 1000;
  const targetDate = new Date(Date.now() - oneDayMs);
  const weekId: string = typeof data?.weekId === 'string' ? data.weekId : computeWeekIdServer(targetDate);

  const snap = await db.collection('growth-lab-wins').where('weekId', '==', weekId).get();
  const participantsById = new Map<string, string>();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    if (d.isDeleted) return;
    if (typeof d.userId === 'string' && !participantsById.has(d.userId)) {
      participantsById.set(d.userId, typeof d.userName === 'string' ? d.userName : 'Member');
    }
  });
  const ids = Array.from(participantsById.keys());
  if (ids.length === 0) {
    return { ok: true, weekId, winnerId: null, count: 0 };
  }
  const winnerId = ids[Math.floor(Math.random() * ids.length)];
  const winnerName = participantsById.get(winnerId) || 'Member';
  await db.collection('growth-lab-raffle').doc(weekId).set({
    weekId,
    participantUserIds: ids,
    winnerId,
    winnerName,
    status: 'drawn',
    drawnAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('messages-growth-lab').add({
    senderId: 'system',
    senderName: 'System',
    content:
      `👑 This week's Win Wall winner is ${winnerName}! ` +
      `You've won a free 1:1 with Coach Ava ($650 value). ` +
      `Watch your DMs for booking details. ${ids.length} ${ids.length === 1 ? 'member' : 'members'} entered 💎`,
    type: 'system',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, weekId, winnerId, winnerName, count: ids.length };
});

/**
 * Self-service account deletion (Apple Guideline 5.1.1(v)).
 * Removes the user from the community, deletes their Firestore profile,
 * removes them from any invite lists, and deletes the Firebase Auth account.
 * The user must be authenticated and can only delete their OWN account.
 */
export const deleteOwnAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to delete your account'
    );
  }

  const uid = context.auth.uid;

  try {
    // 1. Remove from community memberIds + adminIds
    const communityRef = db.collection('community').doc('northstar');
    const communityDoc = await communityRef.get();
    if (communityDoc.exists) {
      const cdata = communityDoc.data() || {};
      const updates: Record<string, any> = {};
      if (Array.isArray(cdata.memberIds) && cdata.memberIds.includes(uid)) {
        updates.memberIds = admin.firestore.FieldValue.arrayRemove(uid);
        updates.memberCount = admin.firestore.FieldValue.increment(-1);
      }
      if (Array.isArray(cdata.adminIds) && cdata.adminIds.includes(uid)) {
        updates.adminIds = admin.firestore.FieldValue.arrayRemove(uid);
      }
      if (Object.keys(updates).length > 0) {
        await communityRef.update(updates);
      }
    }

    // 2. Remove from any room invite lists (Growth Lab, etc.)
    const roomSettingsSnap = await db.collection('room-settings').get();
    for (const settingsDoc of roomSettingsSnap.docs) {
      const settingsData = settingsDoc.data();
      const updates: Record<string, any> = {};
      if (
        Array.isArray(settingsData.invitedUserIds) &&
        settingsData.invitedUserIds.includes(uid)
      ) {
        updates.invitedUserIds = admin.firestore.FieldValue.arrayRemove(uid);
      }
      if (
        Array.isArray(settingsData.allowedSpeakers) &&
        settingsData.allowedSpeakers.includes(uid)
      ) {
        updates.allowedSpeakers = admin.firestore.FieldValue.arrayRemove(uid);
      }
      if (Object.keys(updates).length > 0) {
        await settingsDoc.ref.update(updates);
      }
    }

    // 3. Delete user profile document
    await db.collection('users').doc(uid).delete().catch(() => {});

    // 4. Delete the Firebase Auth account itself
    await admin.auth().deleteUser(uid);

    // 5. Log to audit_logs for compliance
    await db.collection('audit_logs').add({
      type: 'account_deletion',
      action: 'self_service_delete',
      userId: uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true };
  } catch (error: any) {
    console.error('[deleteOwnAccount] failed', error);
    throw new functions.https.HttpsError(
      'internal',
      error?.message || 'Failed to delete account'
    );
  }
});

/**
 * Cleanup old rate limit data (scheduled function)
 * Runs every hour to clean up stale rate limit entries
 */
export const cleanupRateLimits = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const oneHourAgo = Date.now() - 3600000;

    const staleEntries = await db.collection('rateLimits')
      .where('lastReset', '<', oneHourAgo)
      .limit(500)
      .get();

    const batch = db.batch();
    staleEntries.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`Cleaned up ${staleEntries.size} stale rate limit entries`);
    return null;
  });

/**
 * Report a message (for moderation)
 */
export const reportMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to report messages'
    );
  }

  const { messageId, collectionId, reason } = data;
  const reporterId = context.auth.uid;

  if (!messageId || !collectionId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Message ID and collection ID are required'
    );
  }

  // SECURITY: only allow reporting against real message collections. Without
  // this, collectionId/messageId are passed straight to db.collection(...).doc()
  // and become an arbitrary-document probe over any Firestore collection.
  const ALLOWED_REPORT_COLLECTIONS = ['messages', 'messages-elite', 'messages-growth-lab'];
  if (!ALLOWED_REPORT_COLLECTIONS.includes(collectionId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid collection');
  }

  // Check if message exists
  const messageRef = db.collection(collectionId).doc(messageId);
  const messageDoc = await messageRef.get();

  if (!messageDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Message not found');
  }

  const messageData = messageDoc.data();

  // Create report
  await db.collection('messageReports').add({
    messageId,
    collectionId,
    reporterId,
    senderId: messageData?.senderId,
    reason: reason || 'No reason provided',
    content: messageData?.content?.substring(0, 500),
    status: 'pending',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

/**
 * Callable function to send invite email
 */
export const sendInviteEmail = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to send invites'
    );
  }

  // Only admins can send invites
  const isCallerAdmin = await verifyAdmin(context.auth.uid);
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can send invites');
  }

  const { email, inviteCode, invitedByName } = data;

  if (!email || !inviteCode || !invitedByName) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Email, invite code, and inviter name are required'
    );
  }

  if (typeof email !== 'string' || !isValidEmail(email)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid email address format');
  }

  if (typeof inviteCode !== 'string' || !isValidInviteCode(inviteCode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid invite code format');
  }

  const safeName = sanitizeDisplayName(invitedByName);
  if (!safeName) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid inviter name');
  }

  try {
    // Get Gmail SMTP credentials from environment
    const gmailUser = functions.config().gmail?.user || process.env.GMAIL_USER;
    const gmailAppPassword = functions.config().gmail?.app_password || process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      throw new Error('Gmail SMTP credentials not configured');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    const safeCode = inviteCode.toUpperCase();
    const inviteLink = `https://community.example.com/invite/${safeCode}`;

    // Send email using sanitized values
    const emailResult = await transporter.sendMail({
      from: `"Northstar Coaching" <${gmailUser}>`,
      to: email,
      subject: `${safeName} invited you to Northstar Community`,
      text: `
${safeName} has invited you to join Northstar Community!

Your invite code is: ${safeCode}

Click here to join: ${inviteLink}

Or enter your invite code when you sign up.

This invite expires in 7 days.
      `.trim(),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>You're Invited!</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <!-- Logo/Header -->
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="background: linear-gradient(135deg, #FE2A94 0%, #FF6B9D 100%); color: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(254, 42, 148, 0.2);">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700;">Northstar Community</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">You've been invited!</p>
              </div>
            </div>

            <!-- Main Content -->
            <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <p style="margin: 0 0 20px 0; font-size: 18px; color: #333; line-height: 1.6;">
                <strong>${safeName}</strong> has invited you to join <strong>Northstar Community</strong>!
              </p>

              <p style="margin: 0 0 30px 0; font-size: 16px; color: #666; line-height: 1.6;">
                Click the button below to join the community and start connecting with other members.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #FE2A94 0%, #FF6B9D 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(254, 42, 148, 0.3); transition: transform 0.2s;">
                  Join Now
                </a>
              </div>

              <!-- Invite Code -->
              <div style="background: #f9f9f9; border-left: 4px solid #FE2A94; padding: 20px; margin: 30px 0; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Your Invite Code</p>
                <p style="margin: 0; font-size: 24px; font-weight: 700; color: #FE2A94; letter-spacing: 2px; font-family: 'Courier New', monospace;">
                  ${safeCode}
                </p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 14px; color: #999; line-height: 1.5;">
                Or copy and paste this link into your browser:<br>
                <a href="${inviteLink}" style="color: #FE2A94; word-break: break-all;">${inviteLink}</a>
              </p>
            </div>

            <!-- Footer -->
            <div style="text-align: center; margin-top: 30px; padding: 20px;">
              <p style="margin: 0; font-size: 13px; color: #999;">
                This invite will expire in 7 days.
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #bbb;">
                © ${new Date().getFullYear()} Northstar Community. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log('Invite email sent successfully. Message ID:', emailResult.messageId);

    return {
      success: true,
      messageId: emailResult.messageId || null,
    };
  } catch (error: any) {
    console.error('Failed to send invite email:', error.message);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to send email: ${error.message}`
    );
  }
});

/**
 * Cloud Function to send invite via SMS
 */
export const sendInviteSMS = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to send invites'
    );
  }

  // Only admins can send invites
  const isCallerAdmin = await verifyAdmin(context.auth.uid);
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can send invites');
  }

  const { phoneNumber, inviteCode, invitedByName } = data;

  if (!phoneNumber || !inviteCode || !invitedByName) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Phone number, invite code, and inviter name are required'
    );
  }

  if (typeof phoneNumber !== 'string' || !isValidPhoneNumber(phoneNumber)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number format');
  }

  if (typeof inviteCode !== 'string' || !isValidInviteCode(inviteCode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid invite code format');
  }

  const safeName = sanitizeDisplayName(invitedByName);
  if (!safeName) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid inviter name');
  }

  try {
    // Get Twilio credentials from environment
    const accountSid = functions.config().twilio?.account_sid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = functions.config().twilio?.auth_token || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = functions.config().twilio?.phone_number || process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const client = twilio.default(accountSid, authToken);
    const safeCode = inviteCode.toUpperCase();
    const inviteLink = `https://community.example.com/invite/${safeCode}`;

    const messageBody = `${safeName} invited you to Northstar Community!\n\nYour invite code: ${safeCode}\n\nJoin now: ${inviteLink}\n\nExpires in 7 days.`;

    // Send SMS
    const message = await client.messages.create({
      body: messageBody,
      from: fromNumber,
      to: phoneNumber,
    });

    console.log('Invite SMS sent successfully. Twilio SID:', message.sid);

    return {
      success: true,
      twilioSid: message.sid,
    };
  } catch (error: any) {
    console.error('Failed to send invite SMS:', error.message);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to send SMS: ${error.message}`
    );
  }
});

/**
 * Firestore trigger to automatically send invite emails or SMS
 * Triggers when a new invite document is created
 */
export const onInviteCreate = functions.firestore
  .document('invites/{inviteId}')
  .onCreate(async (snap, context) => {
    const inviteData = snap.data();
    const inviteId = context.params.inviteId;

    const { inviteCode, invitedByName, inviteType } = inviteData;
    const inviteLink = `https://community.example.com/invite/${inviteCode}`;

    // Handle email invites
    if (inviteType === 'email' && inviteData.email) {
      const { email } = inviteData;

    try {
      // Get Gmail SMTP credentials from Firebase config
      const gmailConfig = functions.config().gmail;
      const gmailUser = gmailConfig?.user || process.env.GMAIL_USER;
      const gmailAppPassword = gmailConfig?.app_password || process.env.GMAIL_APP_PASSWORD;

      if (!gmailUser || !gmailAppPassword) {
        throw new Error('Gmail SMTP credentials not configured');
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });

      // Log the email details before sending
      console.log('Preparing to send email:', {
        from: gmailUser,
        to: email,
        inviteCode: inviteCode,
      });

      // Send email using Nodemailer
      const emailResult = await transporter.sendMail({
        from: `"Northstar Coaching" <${gmailUser}>`,
        to: email,
        subject: `${invitedByName} invited you to Northstar Community`,
        text: `
${invitedByName} has invited you to join Northstar Community!

Your invite code is: ${inviteCode}

Click here to join: ${inviteLink}

Or enter your invite code when you sign up.

This invite expires in 7 days.
        `.trim(),
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>You're Invited!</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <!-- Logo/Header -->
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="background: linear-gradient(135deg, #FE2A94 0%, #FF6B9D 100%); color: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(254, 42, 148, 0.2);">
                  <h1 style="margin: 0; font-size: 28px; font-weight: 700;">Northstar Community</h1>
                  <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">You've been invited!</p>
                </div>
              </div>

              <!-- Main Content -->
              <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <p style="margin: 0 0 20px 0; font-size: 18px; color: #333; line-height: 1.6;">
                  <strong>${invitedByName}</strong> has invited you to join <strong>Northstar Community</strong>!
                </p>

                <p style="margin: 0 0 30px 0; font-size: 16px; color: #666; line-height: 1.6;">
                  Click the button below to join the community and start connecting with other members.
                </p>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 40px 0;">
                  <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #FE2A94 0%, #FF6B9D 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(254, 42, 148, 0.3); transition: transform 0.2s;">
                    Join Now
                  </a>
                </div>

                <!-- Invite Code -->
                <div style="background: #f9f9f9; border-left: 4px solid #FE2A94; padding: 20px; margin: 30px 0; border-radius: 8px;">
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Your Invite Code</p>
                  <p style="margin: 0; font-size: 24px; font-weight: 700; color: #FE2A94; letter-spacing: 2px; font-family: 'Courier New', monospace;">
                    ${inviteCode}
                  </p>
                </div>

                <p style="margin: 20px 0 0 0; font-size: 14px; color: #999; line-height: 1.5;">
                  Or copy and paste this link into your browser:<br>
                  <a href="${inviteLink}" style="color: #FE2A94; word-break: break-all;">${inviteLink}</a>
                </p>
              </div>

              <!-- Footer -->
              <div style="text-align: center; margin-top: 30px; padding: 20px;">
                <p style="margin: 0; font-size: 13px; color: #999;">
                  This invite will expire in 7 days.
                </p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #bbb;">
                  © ${new Date().getFullYear()} Northstar Community. All rights reserved.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      console.log(`Email sent successfully to ${email}. Message ID: ${emailResult.messageId}`);

      // Update invite document with email sent status
      await snap.ref.update({
        emailSent: true,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        emailMessageId: emailResult.messageId || null,
      });

      return null;
    } catch (error: any) {
      console.error(`Failed to send email to ${email}:`, error);

      // Update invite document with error
      await snap.ref.update({
        emailSent: false,
        emailError: error.message || 'Unknown error',
        emailErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return null;
    }
  }

    // Handle phone/SMS invites
    if (inviteType === 'phone' && inviteData.phoneNumber) {
      const { phoneNumber } = inviteData;

      try {
        // Get Twilio credentials from Firebase config
        const twilioConfig = functions.config().twilio;
        const accountSid = twilioConfig?.account_sid;
        const authToken = twilioConfig?.auth_token;
        const fromNumber = twilioConfig?.phone_number;

        if (!accountSid || !authToken || !fromNumber) {
          console.warn('Twilio credentials not configured, skipping SMS send');
          return null;
        }

        const client = twilio.default(accountSid, authToken);
        const messageBody = `${invitedByName} invited you to Northstar Community!\n\nYour invite code: ${inviteCode}\n\nJoin now: ${inviteLink}\n\nExpires in 7 days.`;

        // Send SMS
        const message = await client.messages.create({
          body: messageBody,
          from: fromNumber,
          to: phoneNumber,
        });

        console.log(`SMS sent successfully to ${phoneNumber}. Twilio SID: ${message.sid}`);

        // Update invite document with SMS sent status
        await snap.ref.update({
          smsSent: true,
          smsSentAt: admin.firestore.FieldValue.serverTimestamp(),
          twilioSid: message.sid,
        });

        return null;
      } catch (error: any) {
        console.error(`Failed to send SMS to ${phoneNumber}:`, error);

        // Update invite document with error
        await snap.ref.update({
          smsSent: false,
          smsError: error.message || 'Unknown error',
          smsErrorAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return null;
      }
    }

    console.log(`Invite ${inviteId} type ${inviteType} - no automatic send configured`);
    return null;
  });

/**
 * Admin function to manually create/fix user profile
 * This bypasses normal security rules
 */
export const fixUserProfile = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in'
    );
  }

  const userId = context.auth.uid;

  // Only admins can use this repair function
  const isCallerAdmin = await verifyAdmin(userId);
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can use this function'
    );
  }

  try {
    // Check if profile already exists
    const userDoc = await db.collection('users').doc(userId).get();

    if (userDoc.exists) {
      return {
        success: true,
        message: 'Profile already exists',
        profile: userDoc.data()
      };
    }

    const displayName = sanitizeDisplayName(data.displayName) || 'User';

    // Create user profile with member role (not admin)
    const userData = {
      phoneNumber: context.auth.token.phone_number || '',
      displayName,
      role: 'member',
      hasEliteAccess: false,
      isOnline: false,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(userId).set(userData, { merge: true });

    // Add to community if not already there
    const communityRef = db.collection('community').doc('northstar');
    const communityDoc = await communityRef.get();

    if (communityDoc.exists) {
      const communityData = communityDoc.data();
      if (!communityData?.memberIds?.includes(userId)) {
        await communityRef.update({
          memberIds: admin.firestore.FieldValue.arrayUnion(userId),
          memberCount: admin.firestore.FieldValue.increment(1)
        });
      }
    }

    console.log(`User profile created for ${userId}`);

    return {
      success: true,
      message: 'Profile created successfully',
      profile: userData
    };
  } catch (error: any) {
    console.error(`Failed to create profile for ${userId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to create profile: ${error.message}`
    );
  }
});

// Initialize library with sample items
export const initializeLibrary = functions.https.onCall(async (data, context) => {
  // Only allow admin to initialize
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  try {
    const sampleItems = [
      {
        title: 'Welcome Training',
        description: 'Get started with Northstar',
        category: 'training',
        url: 'https://example.com/welcome',
        order: 1,
        isActive: true,
        createdBy: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      {
        title: 'Morning Mind Training',
        description: 'Start your day with intention',
        category: 'mind_training',
        url: 'https://example.com/mind-training',
        order: 2,
        isActive: true,
        createdBy: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      {
        title: 'Gratitude Journal Prompt',
        description: 'Reflect on three things you\'re grateful for today',
        category: 'journal_prompt',
        content: 'Write about three things that brought you joy today and why they matter to you.',
        order: 3,
        isActive: true,
        createdBy: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }
    ];

    const batch = db.batch();
    sampleItems.forEach(item => {
      const ref = db.collection('menuItems').doc();
      batch.set(ref, item);
    });

    await batch.commit();

    return {
      success: true,
      message: `Added ${sampleItems.length} sample library items`
    };
  } catch (error: any) {
    console.error('Failed to initialize library:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Bootstrap function - adds welcome message and library items
export const bootstrapCommunity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  try {
    const results = {
      welcomeMessage: false,
      libraryItems: false,
      errors: [] as string[]
    };

    // Send welcome message to main chat
    try {
      await db.collection('messages').add({
        senderId: 'system',
        senderName: 'System',
        content: 'Welcome to Northstar Community! 🌟\n\nThis is your community space. Share, connect, and grow together.',
        type: 'system',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      results.welcomeMessage = true;
    } catch (error: any) {
      results.errors.push(`Welcome message failed: ${error.message}`);
    }

    // Add library items
    try {
      const sampleItems = [
        {
          title: 'Welcome Training',
          description: 'Get started with Northstar',
          category: 'training',
          url: 'https://example.com/welcome',
          order: 1,
          isActive: true,
          createdBy: context.auth.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          title: 'Morning Mind Training',
          description: 'Start your day with intention',
          category: 'mind_training',
          url: 'https://example.com/mind-training',
          order: 2,
          isActive: true,
          createdBy: context.auth.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        },
        {
          title: 'Gratitude Journal Prompt',
          description: 'Reflect on three things you\'re grateful for today',
          category: 'journal_prompt',
          content: 'Write about three things that brought you joy today and why they matter to you.',
          order: 3,
          isActive: true,
          createdBy: context.auth.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }
      ];

      const batch = db.batch();
      sampleItems.forEach(item => {
        const ref = db.collection('menuItems').doc();
        batch.set(ref, item);
      });
      await batch.commit();
      results.libraryItems = true;
    } catch (error: any) {
      results.errors.push(`Library items failed: ${error.message}`);
    }

    return {
      success: results.welcomeMessage || results.libraryItems,
      message: `Bootstrapped community: Welcome message ${results.welcomeMessage ? '✓' : '✗'}, Library items ${results.libraryItems ? '✓' : '✗'}`,
      details: results
    };
  } catch (error: any) {
    console.error('Failed to bootstrap community:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Fix all broken members - adds them to memberIds and sets subscription fields
 * Admin-only function
 */
export const fixAllMembers = functions.https.onCall(async (data, context) => {
  // Verify admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }

  // Only admins can run this repair function
  const isCallerAdmin = await verifyAdmin(context.auth.uid);
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can use this function');
  }

  try {
    console.log('Starting member fix...');

    // Get community document
    const communityRef = db.collection('community').doc('northstar');
    const communitySnap = await communityRef.get();

    if (!communitySnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Community not found');
    }

    const communityData = communitySnap.data();
    const currentMemberIds = communityData!.memberIds || [];
    const adminId = communityData!.adminId;

    console.log('Current memberIds:', currentMemberIds);
    console.log('Admin ID:', adminId);

    // Get all users
    const usersSnapshot = await db.collection('users').get();
    const fixes: string[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      const updates: any = {};

      // Check if user needs to be added to memberIds
      if (!currentMemberIds.includes(userId)) {
        console.log(`Adding ${userData.displayName} (${userId}) to memberIds`);
        await communityRef.update({
          memberIds: admin.firestore.FieldValue.arrayUnion(userId),
          memberCount: admin.firestore.FieldValue.increment(1),
        });
        fixes.push(`Added ${userData.displayName} to memberIds`);
      }

      // Check if user needs subscription fields
      if (!userData.subscriptionTier) {
        updates.subscriptionTier = 'standard';
      }

      if (!userData.subscriptionStatus) {
        updates.subscriptionStatus = 'active';
      }

      // Update user document if needed
      if (Object.keys(updates).length > 0) {
        console.log(`Updating ${userData.displayName} (${userId}) with:`, updates);
        await userDoc.ref.update(updates);
        fixes.push(`Updated ${userData.displayName} subscription fields`);
      }
    }

    // Get updated community data
    const updatedCommunitySnap = await communityRef.get();
    const updatedCommunityData = updatedCommunitySnap.data();

    return {
      success: true,
      message: `Fixed ${fixes.length} issue(s)`,
      fixes: fixes,
      finalState: {
        memberIds: updatedCommunityData!.memberIds,
        memberCount: updatedCommunityData!.memberCount,
      }
    };

  } catch (error: any) {
    console.error('Error fixing members:', error);
    throw new functions.https.HttpsError('internal', `Failed to fix members: ${error.message}`);
  }
});

/**
 * Delete a user completely - removes from Firebase Auth, Firestore, and community
 * Admin-only function
 */
export const deleteUser = functions.https.onCall(async (data, context) => {
  // Verify admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }

  // Only admins can delete users
  const isCallerAdmin = await verifyAdmin(context.auth.uid);
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can delete users');
  }

  const { userId } = data;

  if (!userId || typeof userId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
  }

  // Prevent admin from deleting themselves
  if (context.auth.uid === userId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot delete your own account');
  }

  // Prevent deleting the community owner
  const communityDoc = await db.collection('community').doc('northstar').get();
  if (communityDoc.exists && communityDoc.data()?.adminId === userId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot delete the community owner');
  }

  try {
    console.log(`Deleting user ${userId}...`);

    // Get user data before deletion
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userName = userData?.displayName || 'Unknown';

    // Remove from community memberIds
    const communityRef = db.collection('community').doc('northstar');
    await communityRef.update({
      memberIds: admin.firestore.FieldValue.arrayRemove(userId),
      memberCount: admin.firestore.FieldValue.increment(-1),
    });

    // Delete user document from Firestore
    await db.collection('users').doc(userId).delete();

    // Delete from Firebase Auth
    await admin.auth().deleteUser(userId);

    console.log(`Successfully deleted user ${userId} (${userName})`);

    return {
      success: true,
      message: `Successfully deleted user ${userName}`,
      userId: userId,
    };

  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new functions.https.HttpsError('internal', `Failed to delete user: ${error.message}`);
  }
});

/**
 * Validate Invite Code (Public Endpoint)
 * Allows unauthenticated users to validate invite codes without exposing PII
 *
 * This is needed because Firestore rules now protect invite data,
 * but we still need to allow users to validate codes before signing up.
 *
 * Returns only: { valid: boolean, inviteType: 'email' | 'phone' }
 * Does NOT return PII like email addresses or phone numbers
 */
export const validateInviteCode = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { inviteCode } = req.body;

    if (!inviteCode || typeof inviteCode !== 'string') {
      res.status(400).json({ valid: false, error: 'Invalid request' });
      return;
    }

    // Validate code format (6 uppercase alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(inviteCode)) {
      res.status(200).json({ valid: false });
      return;
    }

    // Check if invite exists and is not expired
    const inviteSnapshot = await db
      .collection('invites')
      .where('inviteCode', '==', inviteCode)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (inviteSnapshot.empty) {
      res.status(200).json({ valid: false });
      return;
    }

    const invite = inviteSnapshot.docs[0].data();

    // Check if invite is expired
    const expiresAt = invite.expiresAt?.toDate();
    if (expiresAt && expiresAt < new Date()) {
      res.status(200).json({ valid: false });
      return;
    }

    // Return minimal data - only validity and type, NO PII
    res.status(200).json({
      valid: true,
      inviteType: invite.inviteType || 'email',
      invitedByName: invite.invitedByName || 'Admin',
    });
  } catch (error: any) {
    console.error('Error validating invite code:', error);
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

/**
 * Initialize Community (Atomic Operation)
 * Ensures only ONE user can become the first admin
 *
 * This Cloud Function uses Firestore transactions to atomically check
 * if a community exists and create it if it doesn't, preventing race conditions
 * where multiple users could simultaneously become admin.
 *
 * Returns: { isAdmin: boolean, communityExists: boolean }
 */
export const initializeCommunity = functions.https.onCall(async (data, context) => {
  // Must be authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const userId = context.auth.uid;
  const userName = sanitizeDisplayName(data.displayName) || 'Unknown';

  try {
    const communityRef = db.collection('community').doc('northstar');

    // Use transaction to atomically check and create community
    const result = await db.runTransaction(async (transaction) => {
      const communityDoc = await transaction.get(communityRef);

      // Community doesn't exist - this user becomes admin
      if (!communityDoc.exists) {
        console.log(`Creating new community with admin: ${userId}`);

        transaction.set(communityRef, {
          adminId: userId,
          adminIds: [userId],
          adminName: userName,
          memberIds: [userId],
          memberCount: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { isAdmin: true, communityExists: false };
      }

      // Community exists - check if user is admin or member
      const community = communityDoc.data();
      const isAdmin = community?.adminId === userId;
      const isMember = community?.memberIds?.includes(userId);

      return {
        isAdmin,
        isMember,
        communityExists: true,
      };
    });

    return result;
  } catch (error: any) {
    console.error('Error initializing community:', error);
    throw new functions.https.HttpsError('internal', `Failed to initialize community: ${error.message}`);
  }
});

/**
 * Add User to Community
 * Called during signup to add a new user to the community.
 * Runs with admin SDK privileges so it can write system messages
 * and update community docs regardless of Firestore security rules.
 */
export const addUserToCommunity = functions.https.onCall(async (data, context) => {
  try {
    // Check if caller is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const { userId, displayName, contactInfo, contactType } = data;

    if (!userId || typeof userId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'userId is required');
    }

    // Users can only add themselves (unless admin)
    if (userId !== context.auth.uid) {
      const isCallerAdmin = await verifyAdmin(context.auth.uid);
      if (!isCallerAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'You can only add yourself to the community');
      }
    }

    // Validate optional inputs
    const safeName = sanitizeDisplayName(displayName);
    const safeContactType = (contactType === 'email' || contactType === 'phone') ? contactType : undefined;

    console.log(`Adding ${safeName || 'user'} (${userId}) to community...`);

    const communityRef = db.collection('community').doc('northstar');
    const communityDoc = await communityRef.get();

    if (!communityDoc.exists) {
      // SECURITY: do NOT create the community (and grant admin) from this
      // self-service path. Any authenticated user can call addUserToCommunity
      // for themselves, so auto-creating here let the first such caller become
      // admin whenever the community doc was absent. Community bootstrap and
      // first-admin assignment are handled transactionally by
      // initializeCommunity — defer to it instead.
      console.error('addUserToCommunity called before community was initialized');
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Community has not been initialized yet'
      );
    }

    const communityData = communityDoc.data();
    const currentMemberIds = communityData?.memberIds || [];

    // Check if user is already a member
    if (currentMemberIds.includes(userId)) {
      console.log('User is already in the community memberIds!');
      return { success: true, message: 'User is already in the community', alreadyMember: true };
    }

    // Add user to memberIds
    await communityRef.update({
      memberIds: admin.firestore.FieldValue.arrayUnion(userId),
      memberCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Successfully added ${displayName || 'user'} to community!`);
    console.log(`Total members: ${currentMemberIds.length + 1}`);

    // Try to accept any pending invite (non-blocking).
    // SECURITY: only ever match invites against the caller's OWN verified
    // contact from the auth token — never a raw client-supplied value.
    // Otherwise a user could accept (consume) someone else's pending invite by
    // passing that person's email/phone as contactInfo.
    const callerEmail = (context.auth.token.email || '').toLowerCase();
    const callerPhone = context.auth.token.phone_number || '';
    const verifiedContact =
      safeContactType === 'email'
        ? (typeof contactInfo === 'string' && contactInfo.toLowerCase() === callerEmail && callerEmail ? callerEmail : null)
        : (contactInfo === callerPhone && callerPhone ? callerPhone : null);

    if (!verifiedContact && contactInfo) {
      console.warn('Skipping invite acceptance: contactInfo does not match caller verified token claim');
    }

    if (verifiedContact && safeContactType) {
      try {
        const field = safeContactType === 'email' ? 'email' : 'phone';
        const invitesSnapshot = await db.collection('invites')
          .where(field, '==', verifiedContact)
          .where('status', '==', 'pending')
          .limit(1)
          .get();

        if (!invitesSnapshot.empty) {
          const inviteDoc = invitesSnapshot.docs[0];
          await inviteDoc.ref.update({
            status: 'accepted',
            acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
            acceptedByUserId: userId,
          });
          console.log('Invite marked as accepted:', inviteDoc.id);
        }
      } catch (inviteError) {
        console.warn('Failed to accept invite (non-critical):', inviteError);
      }
    }

    // Send system message using admin SDK (non-blocking)
    if (safeName) {
      try {
        await db.collection('messages').add({
          senderId: 'system',
          senderName: 'System',
          content: `${safeName} has joined the community`,
          type: 'system',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('System message sent for new member join');
      } catch (msgError) {
        console.warn('Failed to send system message (non-critical):', msgError);
      }
    }

    // Send email notification to admins about new signup (non-blocking)
    try {
      const gmailUser = functions.config().gmail?.user || process.env.GMAIL_USER;
      const gmailAppPassword = functions.config().gmail?.app_password || process.env.GMAIL_APP_PASSWORD;

      if (gmailUser && gmailAppPassword) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: gmailAppPassword,
          },
        });

        const memberName = safeName || 'A new user';
        const contactDisplay = contactInfo || 'No contact info provided';
        const signupTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        // Escaped variants for the HTML body. contactInfo is fully
        // client-controlled and never sanitized, so interpolating it raw is an
        // HTML-injection vector into the admin inbox.
        const memberNameHtml = escapeHtml(memberName);
        const contactDisplayHtml = escapeHtml(contactDisplay);

        await transporter.sendMail({
          from: `"Northstar Coaching" <${gmailUser}>`,
          to: 'support@example.com',
          subject: `New Member Signup: ${memberName}`,
          text: `
New Member Signup Notification

Name: ${memberName}
Contact: ${contactDisplay}
Contact Type: ${safeContactType || 'Unknown'}
User ID: ${userId}
Signup Time: ${signupTime}
Total Members: ${currentMemberIds.length + 1}

This is an automated notification from Northstar Community.
          `.trim(),
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
              <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="background: linear-gradient(135deg, #FE2A94 0%, #FF6B9D 100%); color: white; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
                  <h1 style="margin: 0; font-size: 24px;">New Member Signup!</h1>
                </div>
                <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600; color: #333;">Name</td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">${memberNameHtml}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600; color: #333;">Contact</td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">${contactDisplayHtml}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600; color: #333;">Contact Type</td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">${safeContactType || 'Unknown'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; font-weight: 600; color: #333;">Signup Time</td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">${signupTime}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0; font-weight: 600; color: #333;">Total Members</td>
                      <td style="padding: 12px 0; color: #FE2A94; font-weight: 600;">${currentMemberIds.length + 1}</td>
                    </tr>
                  </table>
                </div>
                <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
                  Automated notification from Northstar Community
                </p>
              </div>
            </body>
            </html>
          `.trim(),
        });
        console.log('Admin notification email sent for new signup');
      } else {
        console.log('Gmail credentials not configured, skipping admin notification email');
      }
    } catch (emailError) {
      console.warn('Failed to send admin notification email (non-critical):', emailError);
    }

    return {
      success: true,
      message: `Successfully added user to community`,
      totalMembers: currentMemberIds.length + 1,
    };
  } catch (error: any) {
    console.error('Error adding user to community:', error);
    throw new functions.https.HttpsError('internal', `Failed to add user: ${error.message}`);
  }
});

/**
 * ThriveCart Webhook Handler
 *
 * Receives IPN (Instant Payment Notification) from ThriveCart when:
 * - A customer completes a purchase (order.success)
 * - A recurring subscription payment succeeds (order.subscription_payment)
 * - A refund is issued (order.refund)
 * - A subscription is cancelled (order.subscription_cancelled)
 *
 * The checkout URL passes Firebase UID and plan via passthrough parameters.
 * Falls back to email lookup if passthrough is unavailable.
 *
 * Webhook URL to configure in ThriveCart:
 *   https://us-central1-<your-project>.cloudfunctions.net/thriveCartWebhook
 */
export const thriveCartWebhook = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Allow GET requests for ThriveCart URL verification
  if (req.method === 'GET') {
    res.status(200).json({ status: 'ok', message: 'ThriveCart webhook endpoint active' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body;

    // Log event type only (avoid logging full payload with customer PII)
    console.log('[ThriveCart Webhook] Received event:', body.event || 'unknown');

    // Verify webhook secret. This is the ONLY thing that proves the request
    // actually came from ThriveCart — everything below (customer UID, plan,
    // amount) is taken from the request body, so without a verified secret an
    // anonymous caller could grant themselves a paid tier. Fail CLOSED: if no
    // secret is configured we refuse to process rather than trusting the body.
    const webhookSecret = functions.config().thrivecart?.webhook_secret || process.env.THRIVECART_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[ThriveCart Webhook] Refusing request: THRIVECART_WEBHOOK_SECRET is not configured');
      res.status(500).json({ error: 'Webhook not configured' });
      return;
    }
    const providedSecret = body.thrivecart_secret || body.secret || req.headers['x-thrivecart-secret'];
    if (!secretsMatch(providedSecret, webhookSecret)) {
      console.warn('[ThriveCart Webhook] Invalid webhook secret');
      res.status(403).json({ error: 'Invalid webhook secret' });
      return;
    }

    // --- Extract customer info from various ThriveCart payload formats ---

    const customerEmail: string | undefined =
      body.customer?.email ||
      body.thrivecart?.customer?.email ||
      body.email;

    // Extract passthrough data (Firebase UID + plan)
    // ThriveCart can nest passthrough in different places depending on config
    const passthrough =
      body.thrivecart?.passthrough ||
      body.passthrough ||
      {};

    // passthrough can be a string (single value) or object (keyed values)
    const passthroughObj = typeof passthrough === 'string'
      ? { customer_id: passthrough }
      : passthrough;

    // Only use passthrough customer_id as Firebase UID (not body.customer_id which is ThriveCart's internal ID)
    const firebaseUid = passthroughObj?.customer_id || null;
    const passthroughPlan = passthroughObj?.plan;

    // Determine event type
    const event: string = body.event || '';

    // Log key fields for debugging tier detection
    console.log('[ThriveCart Webhook] Event:', event, '| Email:', customerEmail, '| FirebaseUID:', firebaseUid, '| Plan:', passthroughPlan);
    console.log('[ThriveCart Webhook] Passthrough raw:', JSON.stringify(passthrough));
    console.log('[ThriveCart Webhook] Order:', JSON.stringify({
      total: body.order?.total,
      item: body.order?.item,
      product: body.order?.product,
      product_name: body.order?.product_name,
      thrivecart_total: body.thrivecart?.order?.total,
      thrivecart_item: body.thrivecart?.order?.item,
      amount: body.amount,
      base_product: body.base_product,
      product_id: body.product_id,
    }));

    // --- Find the Firebase user ---
    // Priority: 1) Firebase UID from passthrough, 2) email lookup in Firestore, 3) email lookup in Firebase Auth

    let userId: string | null = firebaseUid;

    // If no Firebase UID from passthrough, look up by email
    if (!userId && customerEmail) {
      // Normalize email to lowercase for comparison
      const normalizedEmail = customerEmail.toLowerCase();

      // Try Firestore users collection first (case-insensitive)
      // First try exact match
      let usersByEmail = await db.collection('users')
        .where('email', '==', customerEmail)
        .limit(1)
        .get();

      // If not found, try lowercase version
      if (usersByEmail.empty) {
        usersByEmail = await db.collection('users')
          .where('email', '==', normalizedEmail)
          .limit(1)
          .get();
      }

      if (!usersByEmail.empty) {
        userId = usersByEmail.docs[0].id;
        console.log('[ThriveCart Webhook] Found user by Firestore email:', userId);
      } else {
        // Try Firebase Auth lookup
        try {
          const authUser = await admin.auth().getUserByEmail(customerEmail);
          userId = authUser.uid;
          console.log('[ThriveCart Webhook] Found user by Firebase Auth email:', userId);
        } catch (e) {
          console.warn('[ThriveCart Webhook] User not found by email in Auth:', customerEmail);
        }
      }
    }

    if (!userId) {
      console.error('[ThriveCart Webhook] Could not identify user. Email:', customerEmail, 'PassthroughUID:', firebaseUid);
      // Return 200 so ThriveCart doesn't retry (the order data is logged above)
      res.status(200).json({ success: false, error: 'User not found' });
      return;
    }

    // Verify user exists in Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.error('[ThriveCart Webhook] User doc not found in Firestore:', userId);
      res.status(200).json({ success: false, error: 'User document not found' });
      return;
    }

    // --- Determine subscription tier ---

    let tier: 'standard' | 'all-access' = 'standard';

    // Check passthrough plan parameter
    const plan = passthroughPlan || body.plan;
    if (plan === 'elite' || plan === 'all-access') {
      tier = 'all-access';
    }

    // Check product/item name for tier keywords (ThriveCart includes product info)
    if (!plan) {
      const productName: string = (
        body.order?.item ||
        body.order?.product ||
        body.order?.product_name ||
        body.base_product ||
        body.thrivecart?.order?.item ||
        ''
      ).toString().toLowerCase();

      if (productName.includes('elite') || productName.includes('all-access') || productName.includes('all access')) {
        tier = 'all-access';
      }
    }

    // Fallback: check order amount ($57 = standard, $97 = all-access)
    if (tier === 'standard' && !plan) {
      const rawAmount =
        body.order?.total ||
        body.thrivecart?.order?.total ||
        body.order?.amount ||
        body.amount ||
        body.order?.total_price ||
        body.invoice?.total ||
        0;
      // ThriveCart may send amount in cents or dollars
      const amountNum = typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
      const amountInDollars = amountNum > 200 ? amountNum / 100 : amountNum;

      console.log('[ThriveCart Webhook] Amount detection: raw=', rawAmount, 'parsed=', amountNum, 'dollars=', amountInDollars);

      if (amountInDollars >= 90) {
        tier = 'all-access';
      }
    }

    console.log('[ThriveCart Webhook] Resolved tier:', tier);

    // --- Handle the event ---

    const orderId =
      body.order?.id ||
      body.thrivecart?.order?.id ||
      body.invoice_id ||
      null;

    // --- IDEMPOTENCY: Prevent duplicate webhook processing ---
    // Critical for preventing duplicate subscription activations. We require an
    // order identifier (without one we cannot dedupe a payment event) and write
    // the idempotency marker as part of the SAME batch that mutates the
    // subscription, using batch.create(). Because create() fails if the doc
    // already exists, a replayed webhook fails the whole commit atomically —
    // no read-then-write race, and a genuine processing failure rolls back the
    // marker too so ThriveCart's retry can reprocess cleanly.
    if (!orderId) {
      console.error('[ThriveCart Webhook] Rejecting event with no order identifier (cannot guarantee idempotency)');
      res.status(400).json({ error: 'Missing order identifier' });
      return;
    }
    const webhookLogRef = db.collection('webhook_logs').doc(`thrivecart_${orderId}_${event}`);
    const webhookLogData = {
      orderId,
      event,
      userId,
      customerEmail,
      tier,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      webhookBody: {
        event,
        orderId,
        amount: body.order?.total || body.amount,
        product: body.order?.item || body.base_product,
      },
    };

    // Returns true if the error is a Firestore "document already exists"
    // failure from batch.create() on the idempotency marker — i.e. a replay.
    const isDuplicateWebhook = (error: any): boolean =>
      error?.code === 6 || error?.code === 'already-exists';

    if (
      event === 'order.success' ||
      event === 'order.payment' ||
      event === 'order.subscription_payment' ||
      event === '' // No event field = treat as successful order
    ) {
      // Activate subscription with transaction for atomicity
      const userRef = db.collection('users').doc(userId);
      const subscriptionRef = db.collection('subscriptions').doc(userId);

      // Use batch write for atomicity - all updates succeed or all fail.
      // The idempotency marker is created in the same batch so a replayed
      // webhook fails the whole commit (see isDuplicateWebhook below).
      const batch = db.batch();

      batch.create(webhookLogRef, webhookLogData);

      batch.update(userRef, {
        subscriptionTier: tier,
        subscriptionStatus: 'active',
        hasEliteAccess: tier === 'all-access',
      });

      batch.set(subscriptionRef, {
        userId,
        tier,
        status: 'active',
        cancelAtPeriodEnd: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentProvider: 'thrivecart',
        thriveCartOrderId: orderId,
      }, { merge: true });

      // Add subscription history record
      const historyRef = subscriptionRef.collection('history').doc();
      batch.set(historyRef, {
        event: 'activated',
        tier,
        status: 'active',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          provider: 'thrivecart',
          orderId,
          customerEmail,
          webhookEvent: event,
        },
      });

      // Add comprehensive audit log
      const auditLogRef = db.collection('audit_logs').doc();
      batch.set(auditLogRef, {
        type: 'payment',
        action: 'subscription_activated',
        userId,
        tier,
        orderId,
        provider: 'thrivecart',
        webhookEvent: event,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          customerEmail,
          previousTier: 'none', // Could query current tier before update
          amount: body.order?.total || body.amount,
        }
      });

      // Commit all writes atomically
      try {
        await batch.commit();
        console.log(`[ThriveCart Webhook] ✅ Activated ${tier} subscription for user ${userId}`);
      } catch (error: any) {
        if (isDuplicateWebhook(error)) {
          console.log('[ThriveCart Webhook] ⚠️ Duplicate webhook (idempotent), skipping:', { orderId, event });
          res.status(200).json({ success: true, message: 'Webhook already processed (idempotent)', orderId, event });
          return;
        }
        console.error('[ThriveCart Webhook] ❌ Batch commit failed:', error);
        throw error; // Will trigger retry from ThriveCart
      }

      // Send personalized welcome message to the Inner Circle chat
      // Only for all-access tier, and only if the user hasn't already been welcomed
      if (tier === 'all-access') {
        try {
          const userName = userDoc.data()?.displayName || 'A member';
          const welcomeContent = `Welcome, @${userName} ✨\nYou've entered the Inner Circle.\nWe're so glad you're here.\n\nWhen you're ready, please introduce yourself to the community by sharing:\n\n✨ One thing you're currently manifesting\n\n📍 The city you're living in\n\n🌙 Your sun, moon, and rising signs (if you know them)\n\nThis space is intentional, high-frequency, and deeply supportive.\nWe're honored to have you inside.`;

          // Check for existing welcome message to prevent duplicates on webhook retries
          const existingWelcome = await db.collection('messages-elite')
            .where('senderId', '==', 'system')
            .where('content', '==', welcomeContent)
            .limit(1)
            .get();

          if (existingWelcome.empty) {
            await db.collection('messages-elite').add({
              senderId: 'system',
              senderName: 'System',
              content: welcomeContent,
              type: 'system',
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`[ThriveCart Webhook] ✅ Sent elite welcome message for ${userName}`);
          } else {
            console.log(`[ThriveCart Webhook] Skipped welcome (already exists) for ${userName}`);
          }
        } catch (welcomeErr: any) {
          // Don't fail the webhook if welcome message fails
          console.error('[ThriveCart Webhook] ⚠️ Failed to send welcome message:', welcomeErr?.message);
        }
      }

    } else if (
      event === 'order.refund' ||
      event === 'order.subscription_cancelled' ||
      event === 'order.rebill_cancelled'
    ) {
      // Deactivate subscription with batch for atomicity
      const userRef = db.collection('users').doc(userId);
      const subscriptionRef = db.collection('subscriptions').doc(userId);

      const currentUserData = userDoc.data();
      const previousTier = currentUserData?.subscriptionTier || 'none';

      const batch = db.batch();

      batch.create(webhookLogRef, webhookLogData);

      batch.update(userRef, {
        subscriptionTier: 'none',
        subscriptionStatus: event === 'order.refund' ? 'inactive' : 'cancelled',
        hasEliteAccess: false,
      });

      batch.set(subscriptionRef, {
        userId,
        tier: 'none',
        status: event === 'order.refund' ? 'inactive' : 'cancelled',
        cancelAtPeriodEnd: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentProvider: 'thrivecart',
      }, { merge: true });

      // Add subscription history record
      const historyRef = subscriptionRef.collection('history').doc();
      batch.set(historyRef, {
        event: event === 'order.refund' ? 'refunded' : 'cancelled',
        tier: previousTier,
        status: event === 'order.refund' ? 'inactive' : 'cancelled',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          provider: 'thrivecart',
          orderId,
          customerEmail,
          webhookEvent: event,
          reason: event === 'order.refund' ? 'refund' : 'cancellation',
        },
      });

      // Add comprehensive audit log
      const auditLogRef = db.collection('audit_logs').doc();
      batch.set(auditLogRef, {
        type: 'payment',
        action: event === 'order.refund' ? 'subscription_refunded' : 'subscription_cancelled',
        userId,
        previousTier,
        orderId,
        provider: 'thrivecart',
        webhookEvent: event,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          customerEmail,
          reason: event === 'order.refund' ? 'refund' : 'cancellation',
        }
      });

      // Commit all writes atomically
      try {
        await batch.commit();
        console.log(`[ThriveCart Webhook] ✅ Deactivated subscription for user ${userId} (${event})`);
      } catch (error: any) {
        if (isDuplicateWebhook(error)) {
          console.log('[ThriveCart Webhook] ⚠️ Duplicate webhook (idempotent), skipping:', { orderId, event });
          res.status(200).json({ success: true, message: 'Webhook already processed (idempotent)', orderId, event });
          return;
        }
        console.error('[ThriveCart Webhook] ❌ Batch commit failed:', error);
        throw error; // Will trigger retry from ThriveCart
      }

    } else {
      console.log(`[ThriveCart Webhook] Unhandled event type: ${event}`);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      event,
      userId
    });
  } catch (error: any) {
    console.error('[ThriveCart Webhook] ❌ Error processing webhook:', {
      event: req.body?.event,
      error: error?.message,
      stack: error?.stack,
      orderId: req.body?.order?.id
    });

    // Log error to audit log for investigation
    try {
      await db.collection('audit_logs').add({
        type: 'payment_error',
        action: 'webhook_processing_failed',
        webhookEvent: req.body?.event,
        orderId: req.body?.order?.id,
        customerEmail: req.body?.customer?.email,
        error: error?.message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (logError) {
      console.error('[ThriveCart Webhook] Failed to log error to audit_logs:', logError);
    }

    // Return 500 to trigger ThriveCart retry
    res.status(500).json({
      error: 'Internal server error',
      message: 'Webhook processing failed - will retry'
    });
  }
});

/**
 * Admin-only: list candidate messages in the default `messages` collection
 * (Northstar Coaching) that look like they were misrouted from Growth Lab.
 * Heuristic: senderId is in room-settings/growth-lab.invitedUserIds
 * AND timestamp is within `sinceMinutes` ago (default 1440 = 24h).
 *
 * Returns a list of candidates so an admin can review before calling
 * `migrateMessageToGrowthLab` per-message.
 */
export const listMisroutedGrowthLabMessages = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const sinceMinutes = typeof data?.sinceMinutes === 'number' ? data.sinceMinutes : 1440;
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - sinceMinutes * 60 * 1000);

  const settingsDoc = await db.collection('room-settings').doc('growth-lab').get();
  const invited: string[] = (settingsDoc.exists && (settingsDoc.data()?.invitedUserIds as string[])) || [];
  if (invited.length === 0) {
    return { candidates: [], note: 'No invited users in Growth Lab yet' };
  }

  // Firestore `in` queries cap at 30 values; batch if needed.
  const candidates: any[] = [];
  for (let i = 0; i < invited.length; i += 30) {
    const batch = invited.slice(i, i + 30);
    const snap = await db
      .collection('messages')
      .where('senderId', 'in', batch)
      .where('timestamp', '>=', cutoff)
      .orderBy('timestamp', 'desc')
      .get();
    for (const doc of snap.docs) {
      const d = doc.data();
      candidates.push({
        id: doc.id,
        senderId: d.senderId,
        senderName: d.senderName,
        type: d.type,
        content: typeof d.content === 'string' ? d.content.substring(0, 200) : '',
        audioUrl: d.audioUrl || null,
        imageUrl: d.imageUrl || null,
        timestamp: d.timestamp ? d.timestamp.toMillis() : null,
      });
    }
  }

  candidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return { candidates, count: candidates.length };
});

/**
 * Admin-only diagnostic: returns the raw room-settings doc for Growth Lab
 * Empire AND, for each invited user, whether they're in community memberIds
 * (which is what determines if they can READ the room-settings doc — and
 * thus see the room as unlocked).
 */
export const debugGrowthLabAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const settingsDoc = await db.collection('room-settings').doc('growth-lab').get();
  const settingsData = settingsDoc.exists ? settingsDoc.data() : null;
  const invited: string[] = (settingsData?.invitedUserIds as string[]) || [];

  const communityDoc = await db.collection('community').doc('northstar').get();
  const communityData = communityDoc.data() || {};
  const memberIds: string[] = communityData.memberIds || [];

  const invitedUsers: any[] = [];
  for (const uid of invited) {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    invitedUsers.push({
      uid,
      isCommunityMember: memberIds.includes(uid),
      displayName: userData?.displayName || null,
      userDocExists: userDoc.exists,
      subscriptionTier: userData?.subscriptionTier || null,
      subscriptionStatus: userData?.subscriptionStatus || null,
      hasEliteAccess: userData?.hasEliteAccess || false,
      role: userData?.role || null,
    });
  }

  return {
    settingsDocExists: settingsDoc.exists,
    rawSettings: settingsData,
    invitedCount: invited.length,
    invitedUsers,
    communityMemberCount: memberIds.length,
  };
});

/**
 * Admin-only: add a user back to community.memberIds. Used to repair
 * "ghost" subscribers — users who have an active subscription but were
 * somehow removed from the community member list.
 */
export const repairCommunityMembership = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const uid = data?.uid;
  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  }

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', `User ${uid} not found`);
  }

  const communityRef = db.collection('community').doc('northstar');
  const before = await communityRef.get();
  const memberIds: string[] = (before.data()?.memberIds as string[]) || [];
  if (memberIds.includes(uid)) {
    return { ok: true, alreadyMember: true, uid };
  }

  await communityRef.update({
    memberIds: admin.firestore.FieldValue.arrayUnion(uid),
    memberCount: admin.firestore.FieldValue.increment(1),
  });

  return { ok: true, uid, displayName: userDoc.data()?.displayName || null };
});

/**
 * Admin-only: search the `messages` (Northstar Coaching) collection for
 * documents whose `content` contains the given case-insensitive substring.
 * Used to locate misrouted Growth Lab messages — including admin posts —
 * by typing a distinctive snippet of the text.
 *
 * Limit `sinceMinutes` keeps the scan bounded; default = 30 days.
 */
export const searchCoreMessagesByContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const query = (data?.query || '').toString().trim();
  if (query.length < 3) {
    throw new functions.https.HttpsError('invalid-argument', 'Query must be at least 3 characters');
  }
  const sinceMinutes = typeof data?.sinceMinutes === 'number' ? data.sinceMinutes : 60 * 24 * 30;
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - sinceMinutes * 60 * 1000);
  const needle = query.toLowerCase();

  const snap = await db
    .collection('messages')
    .where('timestamp', '>=', cutoff)
    .orderBy('timestamp', 'desc')
    .limit(500)
    .get();

  const matches: any[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const content = typeof d.content === 'string' ? d.content : '';
    if (content.toLowerCase().includes(needle)) {
      matches.push({
        id: doc.id,
        senderId: d.senderId,
        senderName: d.senderName,
        type: d.type,
        content: content.substring(0, 300),
        audioUrl: d.audioUrl || null,
        imageUrl: d.imageUrl || null,
        timestamp: d.timestamp ? d.timestamp.toMillis() : null,
      });
    }
  }

  return { matches, count: matches.length };
});

/**
 * Admin-only: move a single message from `messages` (Northstar Coaching)
 * to `messages-growth-lab`. Preserves the document ID. Atomic via batch.
 */
export const migrateMessageToGrowthLab = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!(await verifyAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const messageId = data?.messageId;
  if (!messageId || typeof messageId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'messageId is required');
  }

  const srcRef = db.collection('messages').doc(messageId);
  const srcDoc = await srcRef.get();
  if (!srcDoc.exists) {
    throw new functions.https.HttpsError('not-found', `Message ${messageId} not found in 'messages'`);
  }

  const dstRef = db.collection('messages-growth-lab').doc(messageId);
  const dstDoc = await dstRef.get();
  if (dstDoc.exists) {
    // Already migrated. Just delete the source to clean up.
    await srcRef.delete();
    return { ok: true, alreadyMigrated: true, messageId };
  }

  const batch = db.batch();
  batch.set(dstRef, srcDoc.data() as any);
  batch.delete(srcRef);
  await batch.commit();

  return { ok: true, messageId };
});

/**
 * One-time utility: move messages from the wrong collection
 * (messages-inner-circle) to the correct one (messages-elite).
 * Admin-only. Uses Admin SDK so Firestore rules don't apply.
 */
exports.moveEliteMessages = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const isAdminUser = await verifyAdmin(context.auth.uid);
  if (!isAdminUser) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const wrongCollection = 'messages-inner-circle';
  const rightCollection = 'messages-elite';

  const snapshot = await db.collection(wrongCollection).get();
  if (snapshot.empty) {
    return { moved: 0, message: 'No messages found in wrong collection' };
  }

  let moved = 0;
  for (const doc of snapshot.docs) {
    await db.collection(rightCollection).doc(doc.id).set(doc.data());
    await db.collection(wrongCollection).doc(doc.id).delete();
    moved++;
  }

  return { moved, message: `Moved ${moved} messages from ${wrongCollection} to ${rightCollection}` };
});

/**
 * Fix HTML-encoded apostrophes in existing messages
 * Replaces &#x27; with ' in message content
 * Admin only - run once to clean up existing data
 */
export const fixEncodedApostrophes = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  // Admin only
  const isAdminUser = await verifyAdmin(context.auth.uid);
  if (!isAdminUser) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const collections = ['messages', 'messages-elite'];
  let totalFixed = 0;
  const results: { collection: string; fixed: number }[] = [];

  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).get();
    let fixed = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      let needsUpdate = false;
      const updates: Record<string, any> = {};

      // Check and fix content field
      if (data.content && typeof data.content === 'string') {
        const fixedContent = data.content
          .replace(/&#x27;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');

        if (fixedContent !== data.content) {
          updates.content = fixedContent;
          needsUpdate = true;
        }
      }

      // Check and fix replyTo.content if present
      if (data.replyTo?.content && typeof data.replyTo.content === 'string') {
        const fixedReplyContent = data.replyTo.content
          .replace(/&#x27;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');

        if (fixedReplyContent !== data.replyTo.content) {
          updates.replyTo = { ...data.replyTo, content: fixedReplyContent };
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await db.collection(collectionName).doc(doc.id).update(updates);
        fixed++;
      }
    }

    results.push({ collection: collectionName, fixed });
    totalFixed += fixed;
  }

  console.log(`[fixEncodedApostrophes] Fixed ${totalFixed} messages across ${collections.length} collections`);

  return {
    success: true,
    totalFixed,
    results,
    message: `Fixed ${totalFixed} messages with encoded characters`
  };
});

/**
 * Delete system messages matching specific content patterns
 * Admin only - for cleaning up unwanted system messages
 */
export const deleteSystemMessages = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  // Admin only
  const isAdminUser = await verifyAdmin(context.auth.uid);
  if (!isAdminUser) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const { contentPatterns } = data;
  if (!contentPatterns || !Array.isArray(contentPatterns) || contentPatterns.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'contentPatterns array is required');
  }

  const collections = ['messages', 'messages-elite'];
  let totalDeleted = 0;

  for (const collectionName of collections) {
    // Query for system messages
    const snapshot = await db.collection(collectionName)
      .where('type', '==', 'system')
      .get();

    for (const doc of snapshot.docs) {
      const content = doc.data().content || '';

      // Check if content matches any of the patterns
      const shouldDelete = contentPatterns.some((pattern: string) =>
        content.toLowerCase().includes(pattern.toLowerCase())
      );

      if (shouldDelete) {
        await db.collection(collectionName).doc(doc.id).delete();
        totalDeleted++;
        console.log(`[deleteSystemMessages] Deleted: "${content}" from ${collectionName}`);
      }
    }
  }

  return {
    success: true,
    totalDeleted,
    message: `Deleted ${totalDeleted} system messages`
  };
});

/**
 * Send push notifications when a new message is created.
 * Triggers on new documents in the 'messages' collection.
 */
export const sendMessageNotification = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data();

    // Skip system messages and messages without sender info
    if (!message || message.type === 'system' || !message.senderId || !message.senderName) {
      console.log('Skipping notification for system message or invalid message');
      return null;
    }

    const senderId = message.senderId;
    const senderName = message.senderName;
    let messageContent = message.content || '';

    // Handle different message types
    if (message.type === 'image') {
      messageContent = '📷 Sent an image';
    } else if (message.type === 'voice') {
      messageContent = '🎤 Sent a voice message';
    } else if (message.type === 'poll') {
      messageContent = `📊 ${message.poll?.question || 'Created a poll'}`;
    }

    // Truncate long messages
    if (messageContent.length > 100) {
      messageContent = messageContent.substring(0, 100) + '...';
    }

    try {
      // Get all users with notification tokens (excluding the sender)
      const usersSnapshot = await db.collection('users')
        .where('notificationTokens', '!=', null)
        .get();

      if (usersSnapshot.empty) {
        console.log('No users with notification tokens found');
        return null;
      }

      const tokens: string[] = [];
      const tokenToUser: Record<string, string> = {};

      usersSnapshot.docs.forEach((userDoc) => {
        // Skip the sender
        if (userDoc.id === senderId) return;

        const userData = userDoc.data();
        const userTokens = userData.notificationTokens || [];

        // Only include users who have notifications enabled (default to true if not set)
        if (userData.notificationsEnabled === false) return;

        userTokens.forEach((token: string) => {
          if (token && typeof token === 'string') {
            tokens.push(token);
            tokenToUser[token] = userDoc.id;
          }
        });
      });

      if (tokens.length === 0) {
        console.log('No valid tokens to send notifications to');
        return null;
      }

      console.log(`Sending notification to ${tokens.length} tokens`);

      // Send notification using Firebase Admin SDK
      const notification = {
        title: senderName,
        body: messageContent,
      };

      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification,
        webpush: {
          notification: {
            icon: '/assets/logo.png',
            badge: '/assets/logo.png',
            tag: context.params.messageId,
            requireInteraction: false,
          },
          fcmOptions: {
            link: 'https://community.example.com/chat',
          },
        },
        data: {
          messageId: context.params.messageId,
          senderId,
          type: message.type || 'text',
        },
      });

      console.log(`Successfully sent ${response.successCount} notifications, ${response.failureCount} failures`);

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const tokensToRemove: { userId: string; token: string }[] = [];

        response.responses.forEach((resp, index) => {
          if (!resp.success) {
            const error = resp.error;
            // Remove tokens that are invalid or unregistered
            if (error?.code === 'messaging/invalid-registration-token' ||
                error?.code === 'messaging/registration-token-not-registered') {
              const token = tokens[index];
              const userId = tokenToUser[token];
              if (userId) {
                tokensToRemove.push({ userId, token });
              }
            }
          }
        });

        // Remove invalid tokens from user documents
        for (const { userId, token } of tokensToRemove) {
          try {
            await db.collection('users').doc(userId).update({
              notificationTokens: admin.firestore.FieldValue.arrayRemove(token),
            });
            console.log(`Removed invalid token for user ${userId}`);
          } catch (err) {
            console.warn(`Failed to remove invalid token for user ${userId}:`, err);
          }
        }
      }

      return { success: true, sent: response.successCount };
    } catch (error) {
      console.error('Error sending push notifications:', error);
      return null;
    }
  });

/**
 * Send push notifications for Inner Circle room messages.
 */
export const sendEliteMessageNotification = functions.firestore
  .document('messages_elite/{messageId}')
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data();

    if (!message || message.type === 'system' || !message.senderId || !message.senderName) {
      return null;
    }

    const senderId = message.senderId;
    const senderName = message.senderName;
    let messageContent = message.content || '';

    if (message.type === 'image') {
      messageContent = '📷 Sent an image';
    } else if (message.type === 'voice') {
      messageContent = '🎤 Sent a voice message';
    } else if (message.type === 'poll') {
      messageContent = `📊 ${message.poll?.question || 'Created a poll'}`;
    }

    if (messageContent.length > 100) {
      messageContent = messageContent.substring(0, 100) + '...';
    }

    try {
      // Get elite users (all-access subscription) with notification tokens
      const usersSnapshot = await db.collection('users')
        .where('notificationTokens', '!=', null)
        .get();

      const tokens: string[] = [];
      const tokenToUser: Record<string, string> = {};

      usersSnapshot.docs.forEach((userDoc) => {
        if (userDoc.id === senderId) return;

        const userData = userDoc.data();

        // Only notify users with elite access
        const hasEliteAccess = userData.subscriptionTier === 'all-access' || userData.role === 'admin';
        if (!hasEliteAccess) return;

        if (userData.notificationsEnabled === false) return;

        const userTokens = userData.notificationTokens || [];
        userTokens.forEach((token: string) => {
          if (token && typeof token === 'string') {
            tokens.push(token);
            tokenToUser[token] = userDoc.id;
          }
        });
      });

      if (tokens.length === 0) {
        return null;
      }

      console.log(`Sending Elite notification to ${tokens.length} tokens`);

      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `✨ ${senderName}`,
          body: messageContent,
        },
        webpush: {
          notification: {
            icon: '/assets/logo.png',
            badge: '/assets/logo.png',
            tag: context.params.messageId,
          },
          fcmOptions: {
            link: 'https://community.example.com/chat?roomId=inner-circle',
          },
        },
        data: {
          messageId: context.params.messageId,
          senderId,
          roomId: 'inner-circle',
        },
      });

      console.log(`Elite: Sent ${response.successCount}, failed ${response.failureCount}`);

      // Clean up invalid tokens (same as above)
      if (response.failureCount > 0) {
        response.responses.forEach(async (resp, index) => {
          if (!resp.success && (
            resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered'
          )) {
            const token = tokens[index];
            const userId = tokenToUser[token];
            if (userId) {
              try {
                await db.collection('users').doc(userId).update({
                  notificationTokens: admin.firestore.FieldValue.arrayRemove(token),
                });
              } catch (err) {
                // Ignore
              }
            }
          }
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending Elite push notifications:', error);
      return null;
    }
  });

// Migration: rename meditation category to mind_training
export const migrateMeditationToMindTraining = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }

  const isAdminUser = await verifyAdmin(context.auth.uid);
  if (!isAdminUser) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const snapshot = await db.collection('menuItems')
    .where('category', '==', 'meditation')
    .get();

  // Also check items using 'type' field
  const snapshot2 = await db.collection('menuItems')
    .where('type', '==', 'meditation')
    .get();

  const allDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  snapshot.docs.forEach(doc => allDocs.set(doc.id, doc));
  snapshot2.docs.forEach(doc => allDocs.set(doc.id, doc));

  const batch = db.batch();
  let count = 0;

  for (const [, doc] of allDocs) {
    const data = doc.data();
    const updates: any = {};
    if (data?.category === 'meditation') updates.category = 'mind_training';
    if (data?.type === 'meditation') updates.type = 'mind_training';
    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  return { success: true, updated: count };
});
