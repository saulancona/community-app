// Mock react-native before importing accessibility utils
jest.mock('react-native', () => ({
  AccessibilityInfo: {
    isScreenReaderEnabled: jest.fn().mockResolvedValue(false),
    isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
    announceForAccessibility: jest.fn(),
  },
}));

import {
  buttonA11yProps,
  imageA11yProps,
  inputA11yProps,
  linkA11yProps,
  headerA11yProps,
  getMessageA11yLabel,
  getContrastRatio,
  meetsContrastAA,
  CONTRAST_RATIOS,
  A11Y_COLORS,
  MIN_TOUCH_TARGET,
  isScreenReaderEnabled,
  isReduceMotionEnabled,
  announceForAccessibility,
  announceWithPoliteness,
} from '../utils/accessibility';

import { AccessibilityInfo } from 'react-native';

describe('Accessibility Utilities', () => {
  describe('buttonA11yProps', () => {
    it('returns correct props with label only', () => {
      const props = buttonA11yProps('Submit');
      expect(props).toEqual({
        accessible: true,
        accessibilityRole: 'button',
        accessibilityLabel: 'Submit',
        accessibilityHint: undefined,
      });
    });

    it('returns correct props with label and hint', () => {
      const props = buttonA11yProps('Submit', 'Double tap to submit the form');
      expect(props).toEqual({
        accessible: true,
        accessibilityRole: 'button',
        accessibilityLabel: 'Submit',
        accessibilityHint: 'Double tap to submit the form',
      });
    });
  });

  describe('imageA11yProps', () => {
    it('returns correct props', () => {
      const props = imageA11yProps('Profile picture of John');
      expect(props).toEqual({
        accessible: true,
        accessibilityRole: 'image',
        accessibilityLabel: 'Profile picture of John',
      });
    });
  });

  describe('inputA11yProps', () => {
    it('returns correct props for basic input', () => {
      const props = inputA11yProps('Email address');
      expect(props).toEqual({
        accessible: true,
        accessibilityLabel: 'Email address',
        accessibilityHint: undefined,
        accessibilityState: {
          error: undefined,
        },
        accessibilityValue: undefined,
      });
    });

    it('returns correct props with hint', () => {
      const props = inputA11yProps('Email address', 'Enter your email');
      expect(props.accessibilityHint).toBe('Enter your email');
    });

    it('returns correct props with error state', () => {
      const props = inputA11yProps('Email address', undefined, true, 'Invalid email format');
      expect(props.accessibilityState).toEqual({ error: true });
      expect(props.accessibilityValue).toEqual({ text: 'Invalid email format' });
    });

    it('does not include error message when no error', () => {
      const props = inputA11yProps('Email address', undefined, false, 'Invalid email format');
      expect(props.accessibilityState).toEqual({ error: false });
      expect(props.accessibilityValue).toBeUndefined();
    });
  });

  describe('linkA11yProps', () => {
    it('returns correct props', () => {
      const props = linkA11yProps('Visit our website');
      expect(props).toEqual({
        accessible: true,
        accessibilityRole: 'link',
        accessibilityLabel: 'Visit our website',
      });
    });
  });

  describe('headerA11yProps', () => {
    it('returns correct props with default level', () => {
      const props = headerA11yProps('Welcome');
      expect(props).toEqual({
        accessible: true,
        accessibilityRole: 'header',
        accessibilityLabel: 'Welcome',
      });
    });

    it('returns correct props with custom level', () => {
      const props = headerA11yProps('Section Title', 2);
      expect(props).toEqual({
        accessible: true,
        accessibilityRole: 'header',
        accessibilityLabel: 'Section Title',
      });
    });
  });

  describe('getMessageA11yLabel', () => {
    it('generates correct label for own text message', () => {
      const label = getMessageA11yLabel('John', 'Hello world', '10:30 AM', true, 'text');
      expect(label).toBe('Your message: Hello world. Sent at 10:30 AM');
    });

    it('generates correct label for other user text message', () => {
      const label = getMessageA11yLabel('Jane', 'Hi there', '2:15 PM', false, 'text');
      expect(label).toBe('Message from Jane: Hi there. Sent at 2:15 PM');
    });

    it('generates correct label for own image message', () => {
      const label = getMessageA11yLabel('John', '', '10:30 AM', true, 'image');
      expect(label).toBe('Your message: Photo. Sent at 10:30 AM');
    });

    it('generates correct label for other user image message', () => {
      const label = getMessageA11yLabel('Jane', '', '2:15 PM', false, 'image');
      expect(label).toBe('Message from Jane: Photo. Sent at 2:15 PM');
    });

    it('generates correct label for system message', () => {
      const label = getMessageA11yLabel('', 'Jane joined the chat', '3:00 PM', false, 'system');
      expect(label).toBe('System message: Jane joined the chat');
    });

    it('defaults to text type when not specified', () => {
      const label = getMessageA11yLabel('John', 'Test message', '10:30 AM', true);
      expect(label).toBe('Your message: Test message. Sent at 10:30 AM');
    });
  });

  describe('getContrastRatio', () => {
    it('returns 21:1 for black on white', () => {
      const ratio = getContrastRatio(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('returns 1:1 for same colors', () => {
      const ratio = getContrastRatio(
        { r: 128, g: 128, b: 128 },
        { r: 128, g: 128, b: 128 }
      );
      expect(ratio).toBe(1);
    });

    it('returns same ratio regardless of color order', () => {
      const ratio1 = getContrastRatio(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      const ratio2 = getContrastRatio(
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 0, b: 0 }
      );
      expect(ratio1).toBe(ratio2);
    });

    it('calculates correct ratio for grey on white', () => {
      const ratio = getContrastRatio(
        { r: 119, g: 119, b: 119 },
        { r: 255, g: 255, b: 255 }
      );
      // Grey #777 on white should be around 4.48:1
      expect(ratio).toBeGreaterThan(4);
      expect(ratio).toBeLessThan(5);
    });
  });

  describe('meetsContrastAA', () => {
    it('returns true for black on white (normal text)', () => {
      const result = meetsContrastAA(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
        false
      );
      expect(result).toBe(true);
    });

    it('returns true for black on white (large text)', () => {
      const result = meetsContrastAA(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
        true
      );
      expect(result).toBe(true);
    });

    it('returns false for light grey on white (normal text)', () => {
      // Light grey #ccc on white has contrast ratio around 1.6:1
      const result = meetsContrastAA(
        { r: 204, g: 204, b: 204 },
        { r: 255, g: 255, b: 255 },
        false
      );
      expect(result).toBe(false);
    });

    it('returns false for light grey on white (large text)', () => {
      const result = meetsContrastAA(
        { r: 204, g: 204, b: 204 },
        { r: 255, g: 255, b: 255 },
        true
      );
      expect(result).toBe(false);
    });

    it('handles borderline cases correctly for normal text', () => {
      // #767676 on white is exactly 4.54:1 - should pass AA normal
      const result = meetsContrastAA(
        { r: 118, g: 118, b: 118 },
        { r: 255, g: 255, b: 255 },
        false
      );
      expect(result).toBe(true);
    });

    it('handles borderline cases correctly for large text', () => {
      // #949494 on white is about 3.03:1 - should pass AA large
      const result = meetsContrastAA(
        { r: 148, g: 148, b: 148 },
        { r: 255, g: 255, b: 255 },
        true
      );
      expect(result).toBe(true);
    });

    it('defaults to normal text when isLargeText not specified', () => {
      const result = meetsContrastAA(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(result).toBe(true);
    });
  });

  describe('CONTRAST_RATIOS', () => {
    it('has correct WCAG AA values', () => {
      expect(CONTRAST_RATIOS.AA_NORMAL).toBe(4.5);
      expect(CONTRAST_RATIOS.AA_LARGE).toBe(3);
    });

    it('has correct WCAG AAA values', () => {
      expect(CONTRAST_RATIOS.AAA_NORMAL).toBe(7);
      expect(CONTRAST_RATIOS.AAA_LARGE).toBe(4.5);
    });
  });

  describe('MIN_TOUCH_TARGET', () => {
    it('is at least 44 pixels (WCAG recommendation)', () => {
      expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
    });
  });

  describe('A11Y_COLORS', () => {
    it('has defined text colors for white background', () => {
      expect(A11Y_COLORS.textOnWhite).toBeDefined();
      expect(A11Y_COLORS.secondaryTextOnWhite).toBeDefined();
      expect(A11Y_COLORS.linkOnWhite).toBeDefined();
    });

    it('has defined text colors for dark background', () => {
      expect(A11Y_COLORS.textOnDark).toBeDefined();
      expect(A11Y_COLORS.secondaryTextOnDark).toBeDefined();
      expect(A11Y_COLORS.linkOnDark).toBeDefined();
    });

    it('has defined error and success colors', () => {
      expect(A11Y_COLORS.errorText).toBeDefined();
      expect(A11Y_COLORS.successText).toBeDefined();
    });

    it('has defined focus indicator color', () => {
      expect(A11Y_COLORS.focusRing).toBeDefined();
    });
  });

  describe('isScreenReaderEnabled', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns result from AccessibilityInfo', async () => {
      (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValueOnce(true);
      const result = await isScreenReaderEnabled();
      expect(result).toBe(true);
      expect(AccessibilityInfo.isScreenReaderEnabled).toHaveBeenCalled();
    });

    it('returns false on error', async () => {
      (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockRejectedValueOnce(new Error('test'));
      const result = await isScreenReaderEnabled();
      expect(result).toBe(false);
    });
  });

  describe('isReduceMotionEnabled', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns result from AccessibilityInfo', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
      const result = await isReduceMotionEnabled();
      expect(result).toBe(true);
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });

    it('returns false on error', async () => {
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockRejectedValueOnce(new Error('test'));
      const result = await isReduceMotionEnabled();
      expect(result).toBe(false);
    });
  });

  describe('announceForAccessibility', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('calls AccessibilityInfo.announceForAccessibility', () => {
      announceForAccessibility('Test announcement');
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Test announcement');
    });
  });

  describe('announceWithPoliteness', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('calls AccessibilityInfo.announceForAccessibility', () => {
      announceWithPoliteness('Test message', 'polite');
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Test message');
    });

    it('defaults to polite level', () => {
      announceWithPoliteness('Test message');
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Test message');
    });

    it('handles assertive level', () => {
      announceWithPoliteness('Urgent message', 'assertive');
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Urgent message');
    });
  });
});
