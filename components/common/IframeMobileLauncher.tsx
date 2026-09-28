import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { COLORS } from '../../constants/config';

/**
 * Detects when the app is running inside an iframe and shows a branded
 * launch screen that opens the full app in a new tab. This is needed
 * because browsers restrict storage access in third-party iframes,
 * causing auth sessions to be lost when navigating between parent pages.
 */
export function IframeMobileLauncher({ children }: { children: React.ReactNode }) {
  const [showLauncher, setShowLauncher] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    try {
      const isInIframe = window.self !== window.top;
      if (isInIframe) {
        setShowLauncher(true);
      }
    } catch {
      // Cross-origin iframe — treat as iframe
      setShowLauncher(true);
    }
  }, []);

  useEffect(() => {
    if (!showLauncher) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(800),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [showLauncher, pulseAnim]);

  const handleOpenApp = () => {
    if (Platform.OS !== 'web') return;
    // Open the app URL in a new tab, escaping the iframe
    window.open(window.location.href, '_blank');
  };

  if (!showLauncher) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Text style={styles.title}>Northstar Coaching</Text>
        <Text style={styles.subtitle}>Community</Text>

        <TouchableOpacity
          style={styles.launchButton}
          onPress={handleOpenApp}
          activeOpacity={0.8}
        >
          <Text style={styles.launchButtonText}>Open App</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>Opens in a new tab for the best experience</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  logo: {
    width: 160,
    height: 160,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '300',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 1,
    marginBottom: 40,
  },
  launchButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
  },
  launchButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 16,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
