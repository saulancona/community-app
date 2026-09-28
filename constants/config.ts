import { ChatRoomConfig, ChatRoomId } from '../types';

export const APP_CONFIG = {
  communityId: 'northstar',
  communityName: 'Northstar Community',
  messagesPerPage: 50,
  maxMembers: 500,
  defaultSettings: {
    maxMembers: 500,
    allowMedia: true,
    allowLinks: true,
    chatLocked: false,
    allowedSpeakers: [],
  },
};

// Chat room configurations
export const CHAT_ROOMS: Record<ChatRoomId, ChatRoomConfig> = {
  'inner-circle': {
    id: 'inner-circle',
    name: 'Inner Circle',
    description: 'An exclusive realm for those ready to unlock their highest potential.',
    icon: '👁️',
    gradient: ['#2d1b4e', '#1a0a2e'],
    sendPermission: 'elite-only', // Only Elite subscribers can send
    viewPermission: 'elite-only', // Only Elite subscribers can view
    messagesCollection: 'messages-elite', // Separate collection for Elite messages
  },
  'growth-lab': {
    id: 'growth-lab',
    name: 'Growth Lab',
    description: '🔑 Welcome in. The Growth Lab is now unlocked',
    icon: '👑',
    gradient: ['#F5E6C8', '#E8D08F'],
    sendPermission: 'invited-only', // Open forum: any invited member can send
    viewPermission: 'invited-only', // Only invited members can view
    messagesCollection: 'messages-growth-lab',
    activeFrom: '2026-05-01T00:00:00.000Z',
    activeUntil: '2027-12-31T23:59:59.999Z',
  },
};

// Helper to get room config
export const getRoomConfig = (roomId: ChatRoomId): ChatRoomConfig => {
  return CHAT_ROOMS[roomId] || CHAT_ROOMS['inner-circle'];
};

export const COLORS = {
  // Pink and black theme
  primary: '#FE2A94',
  primaryDark: '#d91f7a',
  primaryLight: '#ff5aad',
  secondary: '#FE2A94',
  background: '#E8DCD5',
  surface: '#ffffff',
  text: '#000000',
  textSecondary: '#333333',
  textLight: '#666666',
  border: '#d4c4bc',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
  online: '#22c55e',
  offline: '#94a3b8',
  messageSent: '#FE2A94',
  messageReceived: '#ffffff',
  chatBackground: '#E8DCD5',
  headerBackground: '#FE2A94',
  inputBackground: '#ffffff',
  tealGreen: '#FE2A94',
  lightGreen: '#FE2A94',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
