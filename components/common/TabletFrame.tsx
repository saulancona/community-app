import React from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { COLORS } from '../../constants/config';

const TABLET_BREAKPOINT = 768;
const PHONE_FRAME_MAX_WIDTH = 480;

/**
 * Wraps the app so it renders as a centered phone-shaped column on
 * tablets/desktop while staying full-width on phones. Mirrors the standard
 * chat-app pattern (WhatsApp Web, Telegram on tablets, etc.).
 */
export const TabletFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width } = useWindowDimensions();

  // Web: always full-width (let the browser handle layout).
  // Native iPad: constrain so the chat doesn't stretch awkwardly across the screen.
  // Native phones: render full-width.
  const shouldConstrain =
    Platform.OS === 'ios' && width >= TABLET_BREAKPOINT;

  if (!shouldConstrain) {
    return <>{children}</>;
  }

  return (
    <View style={styles.outer}>
      <View style={styles.frame}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: PHONE_FRAME_MAX_WIDTH,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 0 24px rgba(0, 0, 0, 0.08)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
    }),
  },
});
