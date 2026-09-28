import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { COLORS, SPACING } from '../constants/config';

export default function Index() {
  const router = useRouter();
  const { isLoading, isAuthenticated, user, firebaseUser, isMember, profileError } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      // Not logged in - go to login
      router.replace('/(auth)/login');
    } else if (profileError) {
      // Profile FAILED to load (transient) — do NOT route to setup/removed,
      // which would wrongly deny a real member. Stay here showing "Loading…";
      // AuthContext auto-retries and will route correctly once it loads.
      return;
    } else if (!user) {
      // Logged in but no profile - go to setup
      router.replace('/(auth)/setup');
    } else if (!isMember) {
      // Has profile but not in community - show removed screen
      router.replace('/(auth)/removed');
    } else {
      // Has profile and is member - go to welcome page
      router.replace('/(main)/welcome');
    }
  }, [isLoading, isAuthenticated, user, isMember, profileError]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Northstar Coaching</Text>
      <Text style={styles.subtitle}>Community</Text>
      <LoadingSpinner message="Loading..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.surface,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: SPACING.xl,
  },
});
