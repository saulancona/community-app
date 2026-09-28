// ============================================
// Input Sanitization
// ============================================

// XSS pattern strings to detect and block
// Using strings instead of RegExp objects to avoid stateful regex issues
const XSS_PATTERN_STRINGS = [
  '<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>',
  'javascript\\s*:',
  'on\\w+\\s*=',
  '<iframe',
  '<object',
  '<embed',
  '<form',
  '<input',
  '<button',
  'data\\s*:\\s*text\\/html',
  'vbscript\\s*:',
  'expression\\s*\\(',
  'url\\s*\\(\\s*["\']?\\s*data:',
];

// Dangerous HTML tags to strip
const DANGEROUS_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'style', 'link', 'meta', 'base', 'applet', 'frame', 'frameset',
];

/**
 * Check if content contains XSS patterns
 */
export const containsXSS = (input: string): boolean => {
  if (!input || typeof input !== 'string') return false;
  // Create new RegExp instances each time to avoid stateful issues
  return XSS_PATTERN_STRINGS.some(patternStr => {
    const pattern = new RegExp(patternStr, 'gi');
    return pattern.test(input);
  });
};

/**
 * Strip dangerous HTML tags from content
 */
const stripDangerousTags = (input: string): string => {
  let result = input;
  DANGEROUS_TAGS.forEach(tag => {
    // Remove opening tags with attributes
    const openingPattern = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    result = result.replace(openingPattern, '');
    // Remove closing tags
    const closingPattern = new RegExp(`</${tag}>`, 'gi');
    result = result.replace(closingPattern, '');
  });
  return result;
};

/**
 * HTML-escape a string. The leading `&` rule uses a negative lookahead so we
 * never double-escape existing entities (e.g. "&amp;" stays "&amp;").
 */
const escapeHtmlEntities = (input: string): string =>
  input
    .replace(/&(?!(?:amp|lt|gt|quot|#x27|#39);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

/**
 * Sanitize text input to prevent XSS: strip control chars and dangerous
 * protocols, then HTML-escape the remainder (without double-escaping existing
 * entities) so it is safe to place in an HTML context.
 */
export const sanitizeText = (input: string): string => {
  if (!input || typeof input !== 'string') return '';

  const cleaned = input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, '')
    // Remove vbscript: protocol
    .replace(/vbscript\s*:/gi, '')
    // Remove data: URLs (except safe image types)
    .replace(/data\s*:\s*(?!image\/(png|jpeg|jpg|gif|webp))[^;,]*/gi, '');

  return escapeHtmlEntities(cleaned);
};

/**
 * Sanitize message content - comprehensive XSS prevention
 * Allows safe formatting but prevents all XSS vectors
 */
export const sanitizeMessage = (input: string): string => {
  if (!input || typeof input !== 'string') return '';

  let result = input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (except newlines, tabs, carriage returns)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, '')
    // Remove vbscript: protocol
    .replace(/vbscript\s*:/gi, '')
    // Remove data: text/html
    .replace(/data\s*:\s*text\/html/gi, '')
    // Remove event handlers (onclick, onload, etc.)
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '');

  // Strip dangerous HTML tags
  result = stripDangerousTags(result);

  // Limit consecutive newlines to 3
  result = result.replace(/\n{4,}/g, '\n\n\n');

  // Trim excessive whitespace at start/end
  return result.trim();
};

/**
 * Sanitize content for display in an HTML context by HTML-escaping it.
 * Escaping neutralizes any tags/handlers, and the shared helper avoids
 * double-escaping content that is already encoded.
 */
export const sanitizeForDisplay = (input: string): string => {
  if (!input || typeof input !== 'string') return '';

  return escapeHtmlEntities(input);
};

/**
 * Sanitize display name - strict sanitization
 */
export const sanitizeDisplayName = (input: string): string => {
  if (!input || typeof input !== 'string') return '';

  return input
    // Remove any HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Limit length
    .substring(0, 50);
};

// ============================================
// Phone Validation
// ============================================

export const validatePhoneNumber = (phone: string): boolean => {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Check for valid phone number lengths (10-15 digits)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return false;
  }

  return true;
};

export const formatPhoneForFirebase = (phone: string, countryCode: string = '+1'): string => {
  const cleaned = phone.replace(/\D/g, '');

  // If the number already includes country code
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return '+' + cleaned;
  }

  // Add country code if not present
  if (!phone.startsWith('+')) {
    return countryCode + cleaned;
  }

  return phone;
};

export const validateVerificationCode = (code: string): boolean => {
  // Firebase verification codes are 6 digits
  const cleaned = code.replace(/\D/g, '');
  return cleaned.length === 6;
};

export const validateDisplayName = (name: string): { valid: boolean; error?: string } => {
  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Name must be less than 50 characters' };
  }

  // Check for valid characters (letters, spaces, hyphens, apostrophes)
  const validPattern = /^[a-zA-Z\s\-']+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
  }

  return { valid: true };
};

export const validateMessage = (message: string): { valid: boolean; error?: string } => {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message is required' };
  }

  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > 5000) {
    return { valid: false, error: 'Message must be less than 5000 characters' };
  }

  // Check for XSS patterns
  if (containsXSS(trimmed)) {
    return { valid: false, error: 'Message contains prohibited content' };
  }

  return { valid: true };
};

// ============================================
// URL Validation
// ============================================

/**
 * Validate URL format and ensure it's safe (http/https only)
 */
export const validateUrl = (url: string): { valid: boolean; error?: string } => {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  const trimmed = url.trim();

  // Check for valid URL format
  try {
    const parsed = new URL(trimmed);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }

    // Block javascript: URLs (XSS prevention)
    if (trimmed.toLowerCase().includes('javascript:')) {
      return { valid: false, error: 'Invalid URL' };
    }

    // Block data: URLs
    if (trimmed.toLowerCase().startsWith('data:')) {
      return { valid: false, error: 'Data URLs are not allowed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
};

/**
 * Sanitize URL - ensure it starts with https:// if no protocol
 */
export const sanitizeUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();

  // If no protocol, add https://
  if (!trimmed.match(/^https?:\/\//i)) {
    return `https://${trimmed}`;
  }

  return trimmed;
};

// ============================================
// Email Validation (for future use)
// ============================================

export const validateEmail = (email: string): { valid: boolean; error?: string } => {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim().toLowerCase();

  // Basic email regex pattern
  const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailPattern.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }

  return { valid: true };
};

// ============================================
// Invite Code Validation
// ============================================

export const validateInviteCode = (code: string): { valid: boolean; error?: string } => {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Invite code is required' };
  }

  const trimmed = code.trim();

  // Invite codes should be alphanumeric
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return { valid: false, error: 'Invalid invite code format' };
  }

  // Check reasonable length
  if (trimmed.length < 6 || trimmed.length > 32) {
    return { valid: false, error: 'Invalid invite code length' };
  }

  return { valid: true };
};

// ============================================
// Content Validation Helpers
// ============================================

/**
 * Check if content contains potential spam patterns
 */
export const containsSpamPatterns = (content: string): boolean => {
  if (!content) return false;

  const lowerContent = content.toLowerCase();

  // Check for excessive repeated characters (12+ of the same character in a row)
  if (/(.)\1{11,}/.test(content)) return true;

  // Check for excessive capitalization (shouting). Require a meaningful number
  // of letters so short acronyms ("OK", "HELLO") are not flagged as spam.
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 10) {
    const upperCount = content.replace(/[^A-Z]/g, '').length;
    if (upperCount / letters.length >= 0.8) return true;
  }

  // Check for common spam phrases
  const spamPhrases = [
    'click here now',
    'free money',
    'act now',
    'limited time offer',
    'congratulations you won',
  ];

  return spamPhrases.some((phrase) => lowerContent.includes(phrase));
};

/**
 * Rate limiting helper - check if action is within rate limit
 */
export const isWithinRateLimit = (
  timestamps: number[],
  maxActions: number,
  windowMs: number
): boolean => {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Count actions within the window
  const recentActions = timestamps.filter((t) => t > windowStart);

  return recentActions.length < maxActions;
};
