import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SPACING } from '../../constants/config';

export default function RemovedScreen() {
  const router = useRouter();
  const { signOut, isMember } = useAuth();

  // If membership resolves after we were already redirected here, go back to welcome
  useEffect(() => {
    if (isMember) {
      router.replace('/(main)/welcome');
    }
  }, [isMember, router]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🚫</Text>
        </View>

        <Text style={styles.title}>Access Removed</Text>

        <Text style={styles.message}>
          You have been removed from Northstar Community.
          If you believe this is a mistake, please contact the community admin.
        </Text>

        <Button
          title="Sign Out"
          onPress={handleSignOut}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  icon: {
    fontSize: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl * 2,
    lineHeight: 24,
  },
  button: {
    width: '100%',
    maxWidth: 300,
    height: 56,
  },
});
