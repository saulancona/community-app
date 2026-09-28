import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { SPACING } from '../../constants/config';

export default function WelcomeScreen() {
  const router = useRouter();
  const { isMember, isLoading } = useAuth();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Redirect if user is no longer a member (but wait for auth to finish loading)
  useEffect(() => {
    if (!isLoading && !isMember) {
      router.replace('/(auth)/removed');
    }
  }, [isMember, isLoading, router]);

  useEffect(() => {
    // Create a slow heartbeat pulsating animation
    const pulse = Animated.loop(
      Animated.sequence([
        // Expand (systole)
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        // Contract (diastole)
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        // Small second beat
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        // Return to normal
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        // Pause between heartbeats
        Animated.delay(800),
      ])
    );

    pulse.start();

    return () => pulse.stop();
  }, [pulseAnim]);

  const handleEnterPortal = () => {
    router.replace('/(main)/rooms');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.welcomeText}>Welcome back.</Text>
        <Text style={styles.subText}>We're glad you've arrived.</Text>

        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>
            Step into the community where goals turn into momentum.
          </Text>
        </View>

        {/* Portal Button - Logo with pulsating animation */}
        <TouchableOpacity
          style={styles.portalButton}
          onPress={handleEnterPortal}
          activeOpacity={0.8}
        >
          <Animated.Image
            source={require('../../assets/logo.png')}
            style={[
              styles.logoImage,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <Text style={styles.tapHint}>Tap the portal to enter</Text>
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
    padding: SPACING.xl,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '300',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subText: {
    fontSize: 18,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: SPACING.xs,
    letterSpacing: 1,
  },
  messageContainer: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    maxWidth: 400,
  },
  messageText: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 26,
    fontStyle: 'italic',
  },
  portalButton: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACING.lg,
  },
  logoImage: {
    width: 280,
    height: 280,
  },
  tapHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: SPACING.md,
    letterSpacing: 1,
  },
});
