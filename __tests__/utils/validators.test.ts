import {
  sanitizeText,
  sanitizeMessage,
  sanitizeDisplayName,
  validatePhoneNumber,
  formatPhoneForFirebase,
  validateVerificationCode,
  validateDisplayName,
  validateMessage,
  validateUrl,
  sanitizeUrl,
  validateEmail,
  validateInviteCode,
  containsSpamPatterns,
  isWithinRateLimit,
} from '../../utils/validators';

// ============================================
// Sanitization Tests
// ============================================

describe('sanitizeText', () => {
  it('should return empty string for null/undefined input', () => {
    expect(sanitizeText(null as any)).toBe('');
    expect(sanitizeText(undefined as any)).toBe('');
    expect(sanitizeText('')).toBe('');
  });

  it('should escape HTML entities', () => {
    expect(sanitizeText('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
    expect(sanitizeText("Test & 'quotes'")).toBe("Test &amp; &#x27;quotes&#x27;");
  });

  it('should remove null bytes', () => {
    expect(sanitizeText('hello\0world')).toBe('hello&amp;world'.replace('&amp;', ''));
    expect(sanitizeText('test\x00string')).toBe('teststring');
  });

  it('should remove control characters except newlines and tabs', () => {
    expect(sanitizeText('hello\x08world')).toBe('helloworld');
    expect(sanitizeText('test\nline')).toContain('\n');
    expect(sanitizeText('test\ttab')).toContain('\t');
  });

  it('should handle normal text without modification (except escaping)', () => {
    const normalText = 'Hello World 123';
    expect(sanitizeText(normalText)).toBe(normalText);
  });
});

describe('sanitizeMessage', () => {
  it('should return empty string for invalid input', () => {
    expect(sanitizeMessage(null as any)).toBe('');
    expect(sanitizeMessage(undefined as any)).toBe('');
    expect(sanitizeMessage('')).toBe('');
  });

  it('should remove null bytes and control characters', () => {
    expect(sanitizeMessage('hello\0world')).toBe('helloworld');
    expect(sanitizeMessage('test\x08string')).toBe('teststring');
  });

  it('should limit consecutive newlines to 3', () => {
    expect(sanitizeMessage('a\n\n\n\n\nb')).toBe('a\n\n\nb');
    expect(sanitizeMessage('a\n\n\n\n\n\n\n\nb')).toBe('a\n\n\nb');
  });

  it('should trim whitespace', () => {
    expect(sanitizeMessage('  hello  ')).toBe('hello');
    expect(sanitizeMessage('\n\nhello\n\n')).toBe('hello');
  });

  it('should preserve normal text with newlines', () => {
    expect(sanitizeMessage('Hello\nWorld')).toBe('Hello\nWorld');
  });
});

describe('sanitizeDisplayName', () => {
  it('should return empty string for invalid input', () => {
    expect(sanitizeDisplayName(null as any)).toBe('');
    expect(sanitizeDisplayName(undefined as any)).toBe('');
    expect(sanitizeDisplayName('')).toBe('');
  });

  it('should remove HTML tags', () => {
    expect(sanitizeDisplayName('<b>John</b>')).toBe('John');
    expect(sanitizeDisplayName('<script>hack</script>')).toBe('hack');
  });

  it('should collapse excessive whitespace', () => {
    expect(sanitizeDisplayName('John    Doe')).toBe('John Doe');
    expect(sanitizeDisplayName('  John  Doe  ')).toBe('John Doe');
  });

  it('should limit length to 50 characters', () => {
    const longName = 'A'.repeat(100);
    expect(sanitizeDisplayName(longName)).toBe('A'.repeat(50));
  });

  it('should remove control characters', () => {
    expect(sanitizeDisplayName('John\x00Doe')).toBe('JohnDoe');
  });
});

// ============================================
// Phone Validation Tests
// ============================================

describe('validatePhoneNumber', () => {
  it('should validate correct phone numbers', () => {
    expect(validatePhoneNumber('1234567890')).toBe(true);
    expect(validatePhoneNumber('12345678901')).toBe(true);
    expect(validatePhoneNumber('123-456-7890')).toBe(true);
    expect(validatePhoneNumber('(123) 456-7890')).toBe(true);
  });

  it('should reject invalid phone numbers', () => {
    expect(validatePhoneNumber('12345')).toBe(false);
    expect(validatePhoneNumber('')).toBe(false);
    expect(validatePhoneNumber('123456789012345678')).toBe(false);
  });
});

describe('formatPhoneForFirebase', () => {
  it('should add country code when missing', () => {
    expect(formatPhoneForFirebase('1234567890')).toBe('+11234567890');
    expect(formatPhoneForFirebase('1234567890', '+44')).toBe('+441234567890');
  });

  it('should handle numbers that already have country code', () => {
    expect(formatPhoneForFirebase('+11234567890')).toBe('+11234567890');
    expect(formatPhoneForFirebase('11234567890')).toBe('+11234567890');
  });

  it('should clean non-digit characters', () => {
    expect(formatPhoneForFirebase('(123) 456-7890')).toBe('+11234567890');
  });
});

describe('validateVerificationCode', () => {
  it('should validate 6-digit codes', () => {
    expect(validateVerificationCode('123456')).toBe(true);
    expect(validateVerificationCode('000000')).toBe(true);
  });

  it('should reject invalid codes', () => {
    expect(validateVerificationCode('12345')).toBe(false);
    expect(validateVerificationCode('1234567')).toBe(false);
    expect(validateVerificationCode('')).toBe(false);
    expect(validateVerificationCode('abcdef')).toBe(false);
  });

  it('should handle codes with separators', () => {
    expect(validateVerificationCode('123-456')).toBe(true);
    expect(validateVerificationCode('123 456')).toBe(true);
  });
});

// ============================================
// Display Name Validation Tests
// ============================================

describe('validateDisplayName', () => {
  it('should validate correct display names', () => {
    expect(validateDisplayName('John Doe')).toEqual({ valid: true });
    expect(validateDisplayName("Mary O'Brien")).toEqual({ valid: true });
    expect(validateDisplayName('Jean-Pierre')).toEqual({ valid: true });
  });

  it('should reject names that are too short', () => {
    const result = validateDisplayName('A');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 2 characters');
  });

  it('should reject names that are too long', () => {
    const longName = 'A'.repeat(51);
    const result = validateDisplayName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('less than 50 characters');
  });

  it('should reject names with invalid characters', () => {
    const result = validateDisplayName('John123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('only contain letters');
  });
});

// ============================================
// Message Validation Tests
// ============================================

describe('validateMessage', () => {
  it('should validate correct messages', () => {
    expect(validateMessage('Hello world!')).toEqual({ valid: true });
    expect(validateMessage('A')).toEqual({ valid: true });
  });

  it('should reject null/undefined messages', () => {
    expect(validateMessage(null as any).valid).toBe(false);
    expect(validateMessage(undefined as any).valid).toBe(false);
  });

  it('should reject empty messages', () => {
    const result = validateMessage('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot be empty');
  });

  it('should reject messages that are too long', () => {
    const longMessage = 'A'.repeat(5001);
    const result = validateMessage(longMessage);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('less than 5000 characters');
  });
});

// ============================================
// URL Validation Tests
// ============================================

describe('validateUrl', () => {
  it('should validate correct URLs', () => {
    expect(validateUrl('https://example.com')).toEqual({ valid: true });
    expect(validateUrl('http://example.com/path')).toEqual({ valid: true });
    expect(validateUrl('https://example.com:8080/path?query=1')).toEqual({ valid: true });
  });

  it('should reject non-http/https URLs', () => {
    const result = validateUrl('ftp://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTTP and HTTPS');
  });

  it('should reject javascript: URLs', () => {
    const result = validateUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
  });

  it('should reject data: URLs', () => {
    const result = validateUrl('data:text/html,<script>alert(1)</script>');
    expect(result.valid).toBe(false);
    // data: URLs are rejected either by protocol check or specific data URL check
    expect(result.error).toBeTruthy();
  });

  it('should reject invalid URLs', () => {
    const result = validateUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid URL format');
  });

  it('should reject null/undefined', () => {
    expect(validateUrl(null as any).valid).toBe(false);
    expect(validateUrl(undefined as any).valid).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  it('should return empty string for invalid input', () => {
    expect(sanitizeUrl(null as any)).toBe('');
    expect(sanitizeUrl(undefined as any)).toBe('');
    expect(sanitizeUrl('')).toBe('');
  });

  it('should add https:// if no protocol', () => {
    expect(sanitizeUrl('example.com')).toBe('https://example.com');
    expect(sanitizeUrl('example.com/path')).toBe('https://example.com/path');
  });

  it('should preserve existing http/https protocol', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('should trim whitespace', () => {
    expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
  });
});

// ============================================
// Email Validation Tests
// ============================================

describe('validateEmail', () => {
  it('should validate correct emails', () => {
    expect(validateEmail('test@example.com')).toEqual({ valid: true });
    expect(validateEmail('user.name@domain.co.uk')).toEqual({ valid: true });
    expect(validateEmail('user+tag@example.com')).toEqual({ valid: true });
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('invalid').valid).toBe(false);
    expect(validateEmail('invalid@').valid).toBe(false);
    expect(validateEmail('@domain.com').valid).toBe(false);
    expect(validateEmail('user @domain.com').valid).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(validateEmail(null as any).valid).toBe(false);
    expect(validateEmail(undefined as any).valid).toBe(false);
  });

  it('should reject emails that are too long', () => {
    const longEmail = 'a'.repeat(255) + '@example.com';
    const result = validateEmail(longEmail);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
  });
});

// ============================================
// Invite Code Validation Tests
// ============================================

describe('validateInviteCode', () => {
  it('should validate correct invite codes', () => {
    expect(validateInviteCode('ABC123')).toEqual({ valid: true });
    expect(validateInviteCode('ABCDEF12')).toEqual({ valid: true });
  });

  it('should reject codes that are too short', () => {
    const result = validateInviteCode('ABC');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('length');
  });

  it('should reject codes that are too long', () => {
    const longCode = 'A'.repeat(33);
    const result = validateInviteCode(longCode);
    expect(result.valid).toBe(false);
  });

  it('should reject codes with special characters', () => {
    const result = validateInviteCode('ABC-123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('format');
  });

  it('should reject null/undefined', () => {
    expect(validateInviteCode(null as any).valid).toBe(false);
    expect(validateInviteCode(undefined as any).valid).toBe(false);
  });
});

// ============================================
// Spam Detection Tests
// ============================================

describe('containsSpamPatterns', () => {
  it('should return false for normal content', () => {
    expect(containsSpamPatterns('Hello, how are you?')).toBe(false);
    expect(containsSpamPatterns('This is a normal message.')).toBe(false);
  });

  it('should detect excessive repeated characters', () => {
    expect(containsSpamPatterns('aaaaaaaaaaaa')).toBe(true);
    expect(containsSpamPatterns('helloooooooooooo')).toBe(true);
  });

  it('should detect excessive caps', () => {
    expect(containsSpamPatterns('THIS IS ALL CAPS MESSAGE')).toBe(true);
    expect(containsSpamPatterns('HELLO WORLD TEST')).toBe(true);
  });

  it('should not flag short all-caps messages', () => {
    expect(containsSpamPatterns('HELLO')).toBe(false);
    expect(containsSpamPatterns('OK')).toBe(false);
  });

  it('should detect spam phrases', () => {
    expect(containsSpamPatterns('Click here now to win!')).toBe(true);
    expect(containsSpamPatterns('Free money for you!')).toBe(true);
    expect(containsSpamPatterns('Act now before too late')).toBe(true);
    expect(containsSpamPatterns('This is a limited time offer!')).toBe(true);
    expect(containsSpamPatterns('Congratulations you won a prize!')).toBe(true);
  });

  it('should return false for empty/null content', () => {
    expect(containsSpamPatterns('')).toBe(false);
    expect(containsSpamPatterns(null as any)).toBe(false);
  });
});

// ============================================
// Rate Limiting Tests
// ============================================

describe('isWithinRateLimit', () => {
  it('should return true when under the limit', () => {
    const timestamps = [Date.now() - 1000, Date.now() - 2000];
    expect(isWithinRateLimit(timestamps, 5, 60000)).toBe(true);
  });

  it('should return false when at the limit', () => {
    const now = Date.now();
    const timestamps = [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000];
    expect(isWithinRateLimit(timestamps, 5, 60000)).toBe(false);
  });

  it('should ignore timestamps outside the window', () => {
    const now = Date.now();
    const timestamps = [
      now - 1000, // within window
      now - 2000, // within window
      now - 120000, // outside window (2 minutes ago)
      now - 180000, // outside window (3 minutes ago)
    ];
    expect(isWithinRateLimit(timestamps, 3, 60000)).toBe(true);
  });

  it('should return true for empty timestamp array', () => {
    expect(isWithinRateLimit([], 5, 60000)).toBe(true);
  });

  it('should handle edge case of exactly at limit', () => {
    const now = Date.now();
    const timestamps = [now - 1000, now - 2000, now - 3000, now - 4000];
    // 4 actions in window, limit is 5, should be allowed
    expect(isWithinRateLimit(timestamps, 5, 60000)).toBe(true);
  });
});
