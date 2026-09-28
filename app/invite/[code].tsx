import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { getInviteByCode, Invite } from '../../services/invites';
import { COLORS, SPACING } from '../../constants/config';

export default function InviteScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateInvite = async () => {
      if (!code) {
        setError('No invite code provided');
        setIsLoading(false);
        return;
      }

      try {
        const foundInvite = await getInviteByCode(code);
        if (foundInvite) {
          setInvite(foundInvite);
          // Store the invite code for later use during setup
          if (Platform.OS === 'web') {
            sessionStorage.setItem('pendingInviteCode', code);
          }
        } else {
          setError('This invite code is invalid or has expired.');
        }
      } catch (err) {
        console.error('Error validating invite:', err);
        setError('Failed to validate invite code.');
      } finally {
        setIsLoading(false);
      }
    };

    validateInvite();
  }, [code]);

  const handleContinue = () => {
    if (isAuthenticated) {
      // Check if user already has a profile (existing member/admin)
      // If they do, they don't need setup - just go to main app
      if (user?.displayName) {
        router.replace('/(main)/chat');
      } else {
        // New user who just signed in, go to setup with invite code
        router.replace({
          pathname: '/(auth)/setup',
          params: { inviteCode: code },
        });
      }
    } else {
      // User needs to sign in first
      router.replace({
        pathname: '/(auth)/login',
        params: { inviteCode: code },
      });
    }
  };

  if (isLoading || authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner fullScreen message="Validating invite..." />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.errorIcon}>!</Text>
          </View>
          <Text style={styles.title}>Invalid Invite</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Button
            title="Go to Login"
            onPress={() => router.replace('/(auth)/login')}
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.checkIcon}>✓</Text>
        </View>
        <Text style={styles.title}>You're Invited!</Text>
        <Text style={styles.subtitle}>
          {invite?.invitedByName} has invited you to join
        </Text>
        <Text style={styles.communityName}>Northstar Community</Text>

        <View style={styles.inviteCard}>
          <Text style={styles.inviteLabel}>Invite Code</Text>
          <Text style={styles.inviteCode}>{invite?.inviteCode}</Text>
        </View>

        <Button
          title={isAuthenticated ? "Continue to Setup" : "Sign In to Join"}
          onPress={handleContinue}
          style={styles.button}
        />

        <Text style={styles.hint}>
          {isAuthenticated
            ? "You'll set up your profile next"
            : "Sign in with your phone number to join"}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  checkIcon: {
    fontSize: 40,
    color: COLORS.success,
    fontWeight: 'bold',
  },
  errorIcon: {
    fontSize: 40,
    color: COLORS.error,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.surface,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  communityName: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.surface,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  errorText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  inviteCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    width: '100%',
    maxWidth: 300,
  },
  inviteLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  inviteCode: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.surface,
    letterSpacing: 4,
  },
  button: {
    width: '100%',
    maxWidth: 300,
    height: 56,
    backgroundColor: COLORS.surface,
  },
  hint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});
