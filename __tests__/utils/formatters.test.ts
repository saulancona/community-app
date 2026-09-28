import { Timestamp } from 'firebase/firestore';
import {
  formatPhoneNumber,
  formatMessageTime,
  formatFullDate,
  formatRelativeTime,
  getInitials,
  truncateText,
} from '../../utils/formatters';

// Mock Firebase Timestamp
const createMockTimestamp = (date: Date): Timestamp => ({
  toDate: () => date,
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: 0,
  toMillis: () => date.getTime(),
  isEqual: () => false,
  valueOf: () => '',
  toJSON: () => ({ seconds: 0, nanoseconds: 0, type: 'timestamp' }),
});

// ============================================
// Phone Number Formatting Tests
// ============================================

describe('formatPhoneNumber', () => {
  it('should format 10-digit US phone numbers', () => {
    expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890');
    expect(formatPhoneNumber('5555555555')).toBe('(555) 555-5555');
  });

  it('should format 11-digit US phone numbers with country code', () => {
    expect(formatPhoneNumber('11234567890')).toBe('+1 (123) 456-7890');
    expect(formatPhoneNumber('15555555555')).toBe('+1 (555) 555-5555');
  });

  it('should handle already formatted numbers', () => {
    expect(formatPhoneNumber('(123) 456-7890')).toBe('(123) 456-7890');
  });

  it('should return original for non-standard lengths', () => {
    expect(formatPhoneNumber('123')).toBe('123');
    expect(formatPhoneNumber('12345678901234')).toBe('12345678901234');
  });

  it('should clean non-digit characters before formatting', () => {
    expect(formatPhoneNumber('123-456-7890')).toBe('(123) 456-7890');
    expect(formatPhoneNumber('(123) 456 7890')).toBe('(123) 456-7890');
  });
});

// ============================================
// Message Time Formatting Tests
// ============================================

describe('formatMessageTime', () => {
  it('should return empty string for null timestamp', () => {
    expect(formatMessageTime(null)).toBe('');
  });

  it('should return time for today', () => {
    const now = new Date();
    const timestamp = createMockTimestamp(now);
    const result = formatMessageTime(timestamp);
    // Should be in HH:MM format
    expect(result).toMatch(/^\d{1,2}:\d{2}\s*(AM|PM)?$/i);
  });

  it('should return "Yesterday" for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const timestamp = createMockTimestamp(yesterday);
    expect(formatMessageTime(timestamp)).toBe('Yesterday');
  });

  it('should return weekday for dates within a week', () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const timestamp = createMockTimestamp(threeDaysAgo);
    const result = formatMessageTime(timestamp);
    // Should be a short weekday like "Mon", "Tue", etc.
    expect(result).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
  });

  it('should return month and day for older dates', () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const timestamp = createMockTimestamp(twoWeeksAgo);
    const result = formatMessageTime(timestamp);
    // Should be like "Jan 5" or "Dec 25"
    expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
  });
});

// ============================================
// Full Date Formatting Tests
// ============================================

describe('formatFullDate', () => {
  it('should return empty string for null timestamp', () => {
    expect(formatFullDate(null)).toBe('');
  });

  it('should format date with full details', () => {
    const date = new Date(2024, 0, 15, 14, 30); // January 15, 2024 2:30 PM
    const timestamp = createMockTimestamp(date);
    const result = formatFullDate(timestamp);
    // Should contain year, month, day, and time
    expect(result).toContain('2024');
    expect(result).toContain('January');
    expect(result).toContain('15');
  });
});

// ============================================
// Relative Time Formatting Tests
// ============================================

describe('formatRelativeTime', () => {
  it('should return empty string for null timestamp', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('should return "Just now" for very recent timestamps', () => {
    const justNow = new Date();
    const timestamp = createMockTimestamp(justNow);
    expect(formatRelativeTime(timestamp)).toBe('Just now');
  });

  it('should return minutes ago for recent timestamps', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const timestamp = createMockTimestamp(fiveMinutesAgo);
    expect(formatRelativeTime(timestamp)).toBe('5m ago');
  });

  it('should return hours ago for timestamps within a day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const timestamp = createMockTimestamp(threeHoursAgo);
    expect(formatRelativeTime(timestamp)).toBe('3h ago');
  });

  it('should return days ago for timestamps within a week', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const timestamp = createMockTimestamp(threeDaysAgo);
    expect(formatRelativeTime(timestamp)).toBe('3d ago');
  });

  it('should return date for older timestamps', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const timestamp = createMockTimestamp(twoWeeksAgo);
    const result = formatRelativeTime(timestamp);
    // Should be like "Jan 5"
    expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
  });
});

// ============================================
// Initials Tests
// ============================================

describe('getInitials', () => {
  it('should return initials for two-word names', () => {
    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('Alice Smith')).toBe('AS');
  });

  it('should return initials for multi-word names', () => {
    expect(getInitials('John Michael Doe')).toBe('JD');
    expect(getInitials('Mary Jane Watson Parker')).toBe('MP');
  });

  it('should handle single word names', () => {
    expect(getInitials('John')).toBe('JO');
    expect(getInitials('Al')).toBe('AL');
  });

  it('should handle single character names', () => {
    expect(getInitials('J')).toBe('J');
  });

  it('should uppercase the initials', () => {
    expect(getInitials('john doe')).toBe('JD');
    expect(getInitials('alice smith')).toBe('AS');
  });

  it('should trim whitespace', () => {
    expect(getInitials('  John Doe  ')).toBe('JD');
  });
});

// ============================================
// Text Truncation Tests
// ============================================

describe('truncateText', () => {
  it('should not truncate text shorter than maxLength', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
    expect(truncateText('Short', 100)).toBe('Short');
  });

  it('should truncate text longer than maxLength', () => {
    expect(truncateText('Hello World', 8)).toBe('Hello...');
    expect(truncateText('This is a long message', 10)).toBe('This is...');
  });

  it('should handle exact length text', () => {
    expect(truncateText('Hello', 5)).toBe('Hello');
  });

  it('should handle empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('should handle very short maxLength', () => {
    expect(truncateText('Hello', 4)).toBe('H...');
    expect(truncateText('Hello World', 3)).toBe('...');
  });
});
