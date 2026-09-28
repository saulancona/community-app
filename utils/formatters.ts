import { Timestamp } from 'firebase/firestore';

export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
};

// Helper to safely convert any timestamp format to a Date object
// Handles: Firestore Timestamp, plain object with seconds/nanoseconds, Date, number (ms)
// Exported for use in other files that need safe timestamp conversion
export const toDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;

  // Already a Date
  if (timestamp instanceof Date) return timestamp;

  // Firestore Timestamp (has toDate method)
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }

  // Plain object from offline cache: { seconds: number, nanoseconds: number }
  if (typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }

  // Number (milliseconds since epoch)
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }

  // String (ISO date string)
  if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

export const formatMessageTime = (timestamp: Timestamp | any | null): string => {
  if (!timestamp) return '';

  const date = toDate(timestamp);
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// Absolute calendar date for a message (e.g. "Jun 22, 2026"), used where the
// full date is shown alongside the time (e.g. search results).
export const formatMessageDate = (timestamp: Timestamp | any | null): string => {
  const date = toDate(timestamp);
  if (!date) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatFullDate = (timestamp: Timestamp | any | null): string => {
  if (!timestamp) return '';

  const date = toDate(timestamp);
  if (!date) return '';

  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatRelativeTime = (timestamp: Timestamp | any | null): string => {
  if (!timestamp) return '';

  const date = toDate(timestamp);
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const getInitials = (name: string): string => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};
