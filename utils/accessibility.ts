import { AccessibilityInfo, AccessibilityRole } from 'react-native';

/**
 * Check if screen reader is enabled
 */
export const isScreenReaderEnabled = async (): Promise<boolean> => {
  try {
    return await AccessibilityInfo.isScreenReaderEnabled();
  } catch {
    return false;
  }
};

/**
 * Check if reduce motion is enabled
 */
export const isReduceMotionEnabled = async (): Promise<boolean> => {
  try {
    return await AccessibilityInfo.isReduceMotionEnabled();
  } catch {
    return false;
  }
};

/**
 * Announce a message to screen readers
 */
export const announceForAccessibility = (message: string): void => {
  AccessibilityInfo.announceForAccessibility(message);
};

/**
 * Announce with politeness level (for web)
 * polite: waits for current speech to finish
 * assertive: interrupts current speech
 */
export const announceWithPoliteness = (
  message: string,
  politeness: 'polite' | 'assertive' = 'polite'
): void => {
  // For React Native, we use the standard announce function
  AccessibilityInfo.announceForAccessibility(message);

  // For web, we can also use aria-live regions
  if (typeof document !== 'undefined') {
    const announcer = document.getElementById('a11y-announcer');
    if (announcer) {
      announcer.setAttribute('aria-live', politeness);
      announcer.textContent = message;
      // Clear after announcement
      setTimeout(() => {
        announcer.textContent = '';
      }, 1000);
    }
  }
};

/**
 * Standard accessibility props for buttons
 */
export const buttonA11yProps = (label: string, hint?: string) => ({
  accessible: true,
  accessibilityRole: 'button' as AccessibilityRole,
  accessibilityLabel: label,
  accessibilityHint: hint,
});

/**
 * Standard accessibility props for images
 */
export const imageA11yProps = (label: string) => ({
  accessible: true,
  accessibilityRole: 'image' as AccessibilityRole,
  accessibilityLabel: label,
});

/**
 * Standard accessibility props for text inputs
 */
export const inputA11yProps = (
  label: string,
  hint?: string,
  hasError?: boolean,
  errorMessage?: string
) => ({
  accessible: true,
  accessibilityLabel: label,
  accessibilityHint: hint,
  accessibilityState: {
    error: hasError,
  },
  accessibilityValue: hasError && errorMessage ? { text: errorMessage } : undefined,
});

/**
 * Standard accessibility props for links
 */
export const linkA11yProps = (label: string) => ({
  accessible: true,
  accessibilityRole: 'link' as AccessibilityRole,
  accessibilityLabel: label,
});

/**
 * Standard accessibility props for headers
 */
export const headerA11yProps = (text: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 1) => ({
  accessible: true,
  accessibilityRole: 'header' as AccessibilityRole,
  accessibilityLabel: text,
});

/**
 * Generate accessibility label for message
 */
export const getMessageA11yLabel = (
  senderName: string,
  content: string,
  timestamp: string,
  isOwnMessage: boolean,
  messageType: 'text' | 'image' | 'system' = 'text'
): string => {
  const prefix = isOwnMessage ? 'Your message' : `Message from ${senderName}`;

  if (messageType === 'image') {
    return `${prefix}: Photo. Sent at ${timestamp}`;
  }

  if (messageType === 'system') {
    return `System message: ${content}`;
  }

  return `${prefix}: ${content}. Sent at ${timestamp}`;
};

/**
 * Color contrast ratios for WCAG compliance
 * WCAG AA requires 4.5:1 for normal text, 3:1 for large text
 * WCAG AAA requires 7:1 for normal text, 4.5:1 for large text
 */
export const CONTRAST_RATIOS = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3,
  AAA_NORMAL: 7,
  AAA_LARGE: 4.5,
};

/**
 * Calculate relative luminance of a color
 */
const getLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

/**
 * Calculate contrast ratio between two colors
 */
export const getContrastRatio = (
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): number => {
  const l1 = getLuminance(color1.r, color1.g, color1.b);
  const l2 = getLuminance(color2.r, color2.g, color2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Check if a color combination meets WCAG AA
 */
export const meetsContrastAA = (
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number },
  isLargeText: boolean = false
): boolean => {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= (isLargeText ? CONTRAST_RATIOS.AA_LARGE : CONTRAST_RATIOS.AA_NORMAL);
};

/**
 * Minimum touch target size (in dp/points)
 * WCAG recommends at least 44x44 pixels
 */
export const MIN_TOUCH_TARGET = 44;

/**
 * Standard accessible colors that meet WCAG AA
 */
export const A11Y_COLORS = {
  // Text on white background
  textOnWhite: '#1a1a1a', // contrast ratio 16.1:1
  secondaryTextOnWhite: '#666666', // contrast ratio 5.74:1
  linkOnWhite: '#0055cc', // contrast ratio 7.1:1

  // Text on dark background
  textOnDark: '#ffffff', // full white
  secondaryTextOnDark: '#cccccc', // contrast ratio 8.59:1
  linkOnDark: '#6db3f2', // contrast ratio 4.56:1

  // Error states
  errorText: '#d32f2f', // contrast ratio 5.76:1 on white
  successText: '#2e7d32', // contrast ratio 4.58:1 on white

  // Focus indicator
  focusRing: '#005fcc',
};

/**
 * Focus trap utilities for modal dialogs
 */
export const createFocusTrap = (containerRef: React.RefObject<any>): (() => void) | null => {
  if (typeof document === 'undefined') return null;

  const container = containerRef.current;
  if (!container) return null;

  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  // Focus first element
  firstElement?.focus();

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
};
