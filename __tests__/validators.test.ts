import {
  sanitizeText,
  sanitizeMessage,
  sanitizeForDisplay,
  sanitizeDisplayName,
  containsXSS,
  validatePhoneNumber,
  validateVerificationCode,
  validateDisplayName,
  validateMessage,
  validateUrl,
  sanitizeUrl,
  validateEmail,
  validateInviteCode,
  containsSpamPatterns,
  isWithinRateLimit,
} from '../utils/validators';

describe('XSS Prevention', () => {
  describe('containsXSS', () => {
    it('should detect script tags', () => {
      expect(containsXSS('<script>alert("xss")</script>')).toBe(true);
      expect(containsXSS('<SCRIPT>alert("xss")</SCRIPT>')).toBe(true);
    });

    it('should detect javascript: protocol', () => {
      expect(containsXSS('javascript:alert("xss")')).toBe(true);
      expect(containsXSS('JAVASCRIPT:alert("xss")')).toBe(true);
      expect(containsXSS('javascript : alert("xss")')).toBe(true);
    });

    it('should detect event handlers', () => {
      expect(containsXSS('<img onerror="alert(1)">')).toBe(true);
      expect(containsXSS('<div onclick="alert(1)">')).toBe(true);
      expect(containsXSS('<body onload="alert(1)">')).toBe(true);
    });

    it('should detect dangerous tags', () => {
      expect(containsXSS('<iframe src="evil.com">')).toBe(true);
      expect(containsXSS('<object data="evil.swf">')).toBe(true);
      expect(containsXSS('<embed src="evil.swf">')).toBe(true);
    });

    it('should detect data: text/html', () => {
      expect(containsXSS('data:text/html,<script>alert(1)</script>')).toBe(true);
    });

    it('should return false for safe content', () => {
      expect(containsXSS('Hello world!')).toBe(false);
      expect(containsXSS('Check out https://example.com')).toBe(false);
      expect(containsXSS('I love <3 this app')).toBe(false);
    });

    it('should handle empty and null inputs', () => {
      expect(containsXSS('')).toBe(false);
      expect(containsXSS(null as any)).toBe(false);
      expect(containsXSS(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeText', () => {
    it('should escape HTML entities', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should remove javascript: protocol', () => {
      expect(sanitizeText('javascript:alert(1)')).toBe('alert(1)');
    });

    it('should remove null bytes', () => {
      expect(sanitizeText('hello\0world')).toBe('helloworld');
    });

    it('should preserve normal text', () => {
      expect(sanitizeText('Hello, World!')).toBe('Hello, World!');
    });

    it('should handle empty input', () => {
      expect(sanitizeText('')).toBe('');
      expect(sanitizeText(null as any)).toBe('');
    });
  });

  describe('sanitizeMessage', () => {
    it('should remove script tags', () => {
      const result = sanitizeMessage('Hello <script>evil()</script> World');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should remove event handlers', () => {
      const result = sanitizeMessage('<img src="x" onerror="alert(1)">');
      expect(result).not.toContain('onerror');
    });

    it('should remove javascript: protocol', () => {
      const result = sanitizeMessage('Click javascript:void(0)');
      expect(result).not.toContain('javascript:');
    });

    it('should limit consecutive newlines', () => {
      expect(sanitizeMessage('a\n\n\n\n\nb')).toBe('a\n\n\nb');
    });

    it('should trim whitespace', () => {
      expect(sanitizeMessage('  hello  ')).toBe('hello');
    });

    it('should preserve safe content', () => {
      expect(sanitizeMessage('Hello! How are you?')).toBe('Hello! How are you?');
    });
  });

  describe('sanitizeForDisplay', () => {
    it('should escape HTML for display', () => {
      expect(sanitizeForDisplay('<div>')).toBe('&lt;div&gt;');
    });

    it('should not double-escape already escaped content', () => {
      expect(sanitizeForDisplay('&amp;')).toBe('&amp;');
      expect(sanitizeForDisplay('&lt;')).toBe('&lt;');
    });
  });
});

describe('sanitizeDisplayName', () => {
  it('should remove HTML tags', () => {
    expect(sanitizeDisplayName('<b>John</b>')).toBe('John');
  });

  it('should limit length to 50 characters', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeDisplayName(longName).length).toBe(50);
  });

  it('should normalize whitespace', () => {
    expect(sanitizeDisplayName('John   Doe')).toBe('John Doe');
  });

  it('should trim whitespace', () => {
    expect(sanitizeDisplayName('  John  ')).toBe('John');
  });
});

describe('Phone Validation', () => {
  describe('validatePhoneNumber', () => {
    it('should accept valid 10-digit numbers', () => {
      expect(validatePhoneNumber('5551234567')).toBe(true);
      expect(validatePhoneNumber('555-123-4567')).toBe(true);
      expect(validatePhoneNumber('(555) 123-4567')).toBe(true);
    });

    it('should accept valid 11-digit numbers with country code', () => {
      expect(validatePhoneNumber('15551234567')).toBe(true);
    });

    it('should reject numbers that are too short', () => {
      expect(validatePhoneNumber('123456789')).toBe(false);
    });

    it('should reject numbers that are too long', () => {
      expect(validatePhoneNumber('1234567890123456')).toBe(false);
    });
  });

  describe('validateVerificationCode', () => {
    it('should accept 6-digit codes', () => {
      expect(validateVerificationCode('123456')).toBe(true);
      expect(validateVerificationCode('000000')).toBe(true);
    });

    it('should reject codes that are not 6 digits', () => {
      expect(validateVerificationCode('12345')).toBe(false);
      expect(validateVerificationCode('1234567')).toBe(false);
      expect(validateVerificationCode('abcdef')).toBe(false);
    });
  });
});

describe('Display Name Validation', () => {
  describe('validateDisplayName', () => {
    it('should accept valid names', () => {
      expect(validateDisplayName('John Doe').valid).toBe(true);
      expect(validateDisplayName("Mary O'Brien").valid).toBe(true);
      expect(validateDisplayName('Anna-Marie').valid).toBe(true);
    });

    it('should reject names that are too short', () => {
      const result = validateDisplayName('J');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2');
    });

    it('should reject names that are too long', () => {
      const result = validateDisplayName('a'.repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('less than 50');
    });

    it('should reject names with numbers', () => {
      const result = validateDisplayName('John123');
      expect(result.valid).toBe(false);
    });

    it('should reject names with special characters', () => {
      const result = validateDisplayName('John@Doe');
      expect(result.valid).toBe(false);
    });
  });
});

describe('Message Validation', () => {
  describe('validateMessage', () => {
    it('should accept valid messages', () => {
      expect(validateMessage('Hello, world!').valid).toBe(true);
      expect(validateMessage('How are you?').valid).toBe(true);
    });

    it('should reject empty messages', () => {
      expect(validateMessage('').valid).toBe(false);
      expect(validateMessage('   ').valid).toBe(false);
    });

    it('should reject messages that are too long', () => {
      const result = validateMessage('a'.repeat(5001));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('5000');
    });

    it('should reject messages with XSS content', () => {
      const result = validateMessage('<script>alert(1)</script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('prohibited');
    });

    it('should reject messages with javascript: protocol', () => {
      const result = validateMessage('Click javascript:void(0)');
      expect(result.valid).toBe(false);
    });

    it('should handle null/undefined input', () => {
      expect(validateMessage(null as any).valid).toBe(false);
      expect(validateMessage(undefined as any).valid).toBe(false);
    });
  });
});

describe('URL Validation', () => {
  describe('validateUrl', () => {
    it('should accept valid HTTP/HTTPS URLs', () => {
      expect(validateUrl('https://example.com').valid).toBe(true);
      expect(validateUrl('http://example.com/path').valid).toBe(true);
      expect(validateUrl('https://example.com/path?query=1').valid).toBe(true);
    });

    it('should reject non-HTTP protocols', () => {
      expect(validateUrl('ftp://example.com').valid).toBe(false);
      expect(validateUrl('file:///etc/passwd').valid).toBe(false);
    });

    it('should reject javascript: URLs', () => {
      expect(validateUrl('javascript:alert(1)').valid).toBe(false);
    });

    it('should reject data: URLs', () => {
      expect(validateUrl('data:text/html,<script>').valid).toBe(false);
    });

    it('should reject invalid URL format', () => {
      expect(validateUrl('not a url').valid).toBe(false);
    });
  });

  describe('sanitizeUrl', () => {
    it('should add https:// if no protocol', () => {
      expect(sanitizeUrl('example.com')).toBe('https://example.com');
    });

    it('should preserve existing http://', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should preserve existing https://', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('should handle empty input', () => {
      expect(sanitizeUrl('')).toBe('');
      expect(sanitizeUrl(null as any)).toBe('');
    });
  });
});

describe('Email Validation', () => {
  describe('validateEmail', () => {
    it('should accept valid emails', () => {
      expect(validateEmail('user@example.com').valid).toBe(true);
      expect(validateEmail('user.name@example.com').valid).toBe(true);
      expect(validateEmail('user+tag@example.com').valid).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validateEmail('not-an-email').valid).toBe(false);
      expect(validateEmail('@example.com').valid).toBe(false);
      expect(validateEmail('user@').valid).toBe(false);
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(validateEmail(longEmail).valid).toBe(false);
    });
  });
});

describe('Invite Code Validation', () => {
  describe('validateInviteCode', () => {
    it('should accept valid codes', () => {
      expect(validateInviteCode('ABC123').valid).toBe(true);
      expect(validateInviteCode('abcdefghij').valid).toBe(true);
    });

    it('should reject codes that are too short', () => {
      expect(validateInviteCode('ABC').valid).toBe(false);
    });

    it('should reject codes that are too long', () => {
      expect(validateInviteCode('a'.repeat(33)).valid).toBe(false);
    });

    it('should reject codes with special characters', () => {
      expect(validateInviteCode('ABC-123').valid).toBe(false);
      expect(validateInviteCode('ABC_123').valid).toBe(false);
    });
  });
});

describe('Spam Detection', () => {
  describe('containsSpamPatterns', () => {
    it('should detect repeated characters', () => {
      expect(containsSpamPatterns('aaaaaaaaaaaaaaaa')).toBe(true);
    });

    it('should detect excessive caps', () => {
      expect(containsSpamPatterns('THIS IS ALL CAPS MESSAGE')).toBe(true);
    });

    it('should detect spam phrases', () => {
      expect(containsSpamPatterns('Click here now to win!')).toBe(true);
      expect(containsSpamPatterns('Free money available!')).toBe(true);
      expect(containsSpamPatterns('Act now before its too late')).toBe(true);
    });

    it('should not flag normal messages', () => {
      expect(containsSpamPatterns('Hello, how are you?')).toBe(false);
      expect(containsSpamPatterns('This is a normal message')).toBe(false);
    });

    it('should handle empty input', () => {
      expect(containsSpamPatterns('')).toBe(false);
      expect(containsSpamPatterns(null as any)).toBe(false);
    });
  });
});

describe('Rate Limiting', () => {
  describe('isWithinRateLimit', () => {
    it('should allow actions within limit', () => {
      const now = Date.now();
      const timestamps = [now - 1000, now - 2000];
      expect(isWithinRateLimit(timestamps, 10, 10000)).toBe(true);
    });

    it('should block when at limit', () => {
      const now = Date.now();
      const timestamps = Array(10).fill(now - 1000);
      expect(isWithinRateLimit(timestamps, 10, 10000)).toBe(false);
    });

    it('should not count old timestamps', () => {
      const now = Date.now();
      const timestamps = Array(10).fill(now - 20000); // 20 seconds ago
      expect(isWithinRateLimit(timestamps, 10, 10000)).toBe(true);
    });

    it('should handle empty timestamps', () => {
      expect(isWithinRateLimit([], 10, 10000)).toBe(true);
    });
  });
});
