import { Timestamp } from 'firebase/firestore';

export type SubscriptionTier = 'none' | 'standard' | 'all-access';
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'past_due';

export interface User {
  id: string;
  phoneNumber?: string; // Optional - user may sign up with email instead
  email?: string; // Optional - user may sign up with phone instead
  displayName: string;
  avatarUrl?: string;
  role: 'admin' | 'member';
  joinedAt: Timestamp;
  lastSeen: Timestamp;
  isOnline: boolean;
  blockedUsers?: string[]; // User IDs this user has blocked
  mutedUsers?: string[]; // User IDs this user has muted (no notifications)
  notificationTokens?: string[]; // FCM tokens for push notifications
  // Subscription management
  subscriptionTier: SubscriptionTier; // 'none' | 'standard' | 'all-access'
  subscriptionStatus: SubscriptionStatus; // 'active' | 'inactive' | 'cancelled' | 'past_due'
  subscriptionExpiresAt?: Timestamp; // When subscription expires
  stripeCustomerId?: string; // Stripe customer ID
  // Legacy field for backward compatibility
  hasEliteAccess?: boolean; // Computed: subscriptionTier === 'all-access' && status === 'active'
  eliteAccessExpiry?: Timestamp; // Same as subscriptionExpiresAt
}

export interface Subscription {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart?: Timestamp;
  currentPeriodEnd?: Timestamp;
  cancelAtPeriodEnd: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SubscriptionHistory {
  id: string;
  event: 'created' | 'upgraded' | 'downgraded' | 'cancelled' | 'renewed' | 'expired';
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}

export interface Community {
  id: string;
  name: string;
  adminId: string;
  adminIds: string[];
  memberIds: string[];
  memberCount: number;
  createdAt: Timestamp;
  settings: CommunitySettings;
}

export interface CommunitySettings {
  maxMembers: number;
  allowMedia: boolean;
  allowLinks: boolean;
  // Chat control settings
  chatLocked: boolean; // When true, only admin and allowed users can send messages
  allowedSpeakers: string[]; // User IDs who can speak when chat is locked
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

// Poll types
export type PollType = 'single' | 'multiple';

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
  voterIds: string[]; // Empty array if poll is anonymous
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  pollType: PollType;
  isAnonymous: boolean;
  expiresAt?: Timestamp | null; // null means no expiration
  isClosed: boolean;
  totalVotes: number;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'system' | 'voice' | 'poll';
  timestamp: Timestamp;
  readBy?: string[];
  // Poll fields
  poll?: Poll;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  // Video fields
  videoUrl?: string;
  videoThumbnailUrl?: string;
  videoDuration?: number; // Duration in seconds
  // Voice note fields
  audioUrl?: string;
  audioDuration?: number; // Duration in milliseconds
  // Reply fields
  replyTo?: {
    id: string;
    content: string;
    senderName: string;
    type: 'text' | 'image' | 'video' | 'voice';
  };
  // Reactions
  reactions?: MessageReaction[];
  // Soft delete
  isDeleted?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
  // Edit fields
  isEdited?: boolean;
  editedAt?: Timestamp;
  editHistory?: {
    content: string;
    editedAt: Timestamp;
  }[];
  // Pin fields
  isPinned?: boolean;
  pinnedAt?: Timestamp;
  pinnedBy?: string;
  pinDuration?: '24h' | '1w' | '1m' | 'forever'; // Pin duration
  pinExpiresAt?: Timestamp; // When the pin expires (null for forever)
}

export type PinDuration = '24h' | '1w' | '1m' | 'forever';

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  verificationId: string | null;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  lastVisible: any;
}

export type LibraryCategory =
  | 'training'      // Links to trainings
  | 'event'         // Links to events
  | 'journal_prompt' // Journal prompts
  | 'mind_training'  // Mind Training
  | 'mindset' // Mindset tools
  | 'podcast'       // Podcasts
  | 'business_mastery' // Business Mastery
  | 'rituals'            // Rituals
  | 'motherhood'         // Motherhood
  | 'audio_library'       // Audio Library (Growth Lab only)
  | 'growth_lab_wins'     // Growth Lab Wins — weekly giveaways (Growth Lab only)
  | 'growth_lab_templates'    // Growth Lab Templates — PDFs (Growth Lab only)
  | 'growth_lab_journals';    // Growth Lab journal prompts (Growth Lab only); shown as a subcategory under Journal Prompts

export type LibrarySubcategory =
  | 'love_relationships'    // Love and Relationships
  | 'money_career'          // Money and Career
  | 'friendships'           // Friendships
  | 'self_worth'            // Self-Worth
  | 'getting_started'       // Getting Started
  | 'focus' // Focus
  | 'plan'      // Plan
  | 'act'             // Act
  | 'review'           // Review
  | 'daily_practices'       // Daily Practices
  | 'spring_sprint'       // Spring Sprint
  | 'growth_lab'      // Growth Lab journals (Growth Lab-only journal prompts)
  // Growth Lab Templates subcategories
  | 'templates_instagram'         // Instagram
  | 'templates_sales_scripts'     // Sales Scripts
  | 'templates_contracts'         // Contracts
  | 'templates_event_planning'    // Event Planning
  | 'templates_customer_support'  // Customer Support
  | 'templates_email'             // Email Templates
  | 'templates_marketing'         // Marketing
  | 'templates_money'             // Money
  | 'templates_business'          // Business
  | 'templates_ai';               // AI

export interface MenuItem {
  id: string;
  type: LibraryCategory;
  subcategory?: LibrarySubcategory; // Optional subcategory for journal_prompt and mind_training
  title: string;
  content: string;
  url?: string;
  createdAt: Timestamp;
  createdBy: string;
  isActive: boolean;
  order: number;
}

export type ChatRoomId = 'inner-circle' | 'growth-lab';

export interface ChatRoomConfig {
  id: ChatRoomId;
  name: string;
  description: string;
  icon: string;
  gradient: [string, string];
  // Permission settings
  sendPermission: 'admin-only' | 'members' | 'elite-only' | 'invited-only';
  viewPermission: 'members' | 'elite-only' | 'invited-only';
  // Firestore collection name for messages
  messagesCollection: string;
  // Optional ISO date strings (UTC) bounding when the room is visible/active.
  activeFrom?: string;
  activeUntil?: string;
}

export interface ChatRoom {
  id: ChatRoomId;
  name: string;
  description: string;
  icon: string;
  gradient: [string, string];
}

// Reaction on a Win Wall entry (shape mirrors MessageReaction)
export interface WinReaction {
  emoji: string;
  userIds: string[];
}

// Growth Lab Win Wall entry — user-generated win posts.
// Lives at /growth-lab-wins/{id} in Firestore.
export interface WinWallEntry {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  winDate: Timestamp;       // the date the user says the win happened
  content: string;           // the win description (≤ 2000 chars)
  imageUrl?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  weekId: string;            // ISO week bucket, e.g. "2026-W23"
  reactions?: WinReaction[];
  isDeleted?: boolean;
}

// Weekly raffle aggregation doc at /growth-lab-raffle/{weekId}.
export interface WinRaffle {
  weekId: string;            // e.g. "2026-W23"
  participantUserIds: string[];
  winnerId?: string;
  winnerName?: string;
  drawnAt?: Timestamp;
  status: 'open' | 'drawn';
}

// Room-specific settings (stored in Firestore room-settings/{roomId})
export interface RoomSettings {
  roomId: ChatRoomId;
  chatLocked: boolean; // When true, only admin and allowed users can send messages
  allowedSpeakers: string[]; // User IDs who can speak when chat is locked
  invitedUserIds?: string[]; // User IDs invited to invite-only rooms
}
