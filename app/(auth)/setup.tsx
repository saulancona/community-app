import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { getCommunity } from '../../services/admin';
import { getUserProfile } from '../../services/auth';
import { COLORS, SPACING } from '../../constants/config';
import { validateDisplayName, sanitizeDisplayName } from '../../utils/validators';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function SetupScreen() {
  const router = useRouter();
  const { setupProfile, firebaseUser, user } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingCommunity, setCheckingCommunity] = useState(true);
  const [communityExists, setCommunityExists] = useState<boolean>(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // If user already has a profile, redirect to welcome immediately
  // Check both context AND directly from Firestore (for browser back button cases)
  useEffect(() => {
    const checkExistingProfile = async () => {
      // First check context
      if (user && user.displayName) {
        console.log('User already has profile (from context), redirecting to welcome');
        router.replace('/(main)/welcome');
        return;
      }

      // Also check Firestore directly in case context hasn't loaded yet
      if (firebaseUser) {
        try {
          const profile = await getUserProfile(firebaseUser.uid);
          if (profile && profile.displayName) {
            console.log('User already has profile (from Firestore), redirecting to welcome');
            router.replace('/(main)/welcome');
          }
        } catch (error) {
          console.error('Error checking existing profile:', error);
          // Continue to setup screen if profile check fails
        }
      }
    };

    checkExistingProfile();
  }, [user, firebaseUser, router]);

  useEffect(() => {
    // Check if community already exists and has real members
    const checkCommunity = async () => {
      try {
        const currentUserId = firebaseUser?.uid;

        // FIRST: Check if user already has a profile - if so, redirect immediately
        if (currentUserId) {
          try {
            const existingProfile = await getUserProfile(currentUserId);
            if (existingProfile && existingProfile.displayName) {
              console.log('User already has profile - redirecting to welcome');
              router.replace('/(main)/welcome');
              return;
            }
          } catch (profileError) {
            console.error('Error fetching user profile:', profileError);
            // Continue with community check if profile fetch fails
          }
        }

        // Use Cloud Function for atomic community initialization check
        // This prevents race conditions where multiple users could become admin
        const functions = getFunctions();
        const initCommunity = httpsCallable(functions, 'initializeCommunity');

        try {
          const result = await initCommunity({ displayName: '' });
          const data = result.data as { isAdmin: boolean; isMember?: boolean; communityExists: boolean };

          if (data.communityExists) {
            // Community exists with members
            if (data.isAdmin) {
              // User is already admin, just needs profile setup
              console.log('User is already admin - setting up profile');
              setCommunityExists(false);
              setIsAdmin(true);
            } else if (data.isMember) {
              // User is already a member, just needs profile setup
              console.log('User is already member - setting up profile');
              setCommunityExists(false);
              setIsAdmin(false);
            } else {
              // New user joining the community
              console.log('Community exists - new user joining');
              setCommunityExists(true);
              setIsAdmin(false);
            }
          } else {
            // No community exists OR user just created it
            console.log('User will create/created community as admin');
            setCommunityExists(false);
            setIsAdmin(data.isAdmin);
          }
        } catch (fnError) {
          console.error('Cloud Function error, falling back to direct check:', fnError);

          // Fallback to direct Firestore check if Cloud Function fails
          const community = await getCommunity();
          if (!community) {
            setCommunityExists(false);
            setIsAdmin(true);
          } else {
            const isAlreadyMember = currentUserId && community.memberIds?.includes(currentUserId);
            const isCurrentAdmin = currentUserId && community.adminId === currentUserId;

            if (isAlreadyMember || isCurrentAdmin) {
              setCommunityExists(false);
              setIsAdmin(isCurrentAdmin || false);
            } else {
              setCommunityExists(true);
              setIsAdmin(false);
            }
          }
        }
      } catch (error) {
        console.error('Error checking community:', error);
        // If error, assume no community and make user admin
        setCommunityExists(false);
        setIsAdmin(true);
      } finally {
        setCheckingCommunity(false);
      }
    };

    if (firebaseUser) {
      checkCommunity();
    }
  }, [firebaseUser, router]);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    }
  };

  const handleComplete = async () => {
    // Sanitize the display name first
    const sanitizedName = sanitizeDisplayName(displayName);

    // Validate the sanitized name
    const validation = validateDisplayName(sanitizedName);
    if (!validation.valid) {
      showAlert('Invalid Name', validation.error || 'Please enter a valid name');
      return;
    }

    // Require active agreement to terms (Apple App Review Guideline 1.2 — UGC)
    if (!agreedToTerms) {
      showAlert(
        'Agreement Required',
        'You must agree to the Terms & Conditions to create your account.'
      );
      return;
    }

    setIsLoading(true);

    try {
      // If no community exists, this user becomes admin automatically
      const shouldBeAdmin = !communityExists || isAdmin;
      await setupProfile(sanitizedName, shouldBeAdmin);

      // No in-app purchase (Apple Guideline 3.1.1) — membership is handled
      // entirely on the website. Everyone goes straight into the app after setup.
      router.replace('/(main)/welcome');
    } catch (error: any) {
      console.error('Setup error:', error);
      showAlert('Error', error.message || 'Failed to create profile');
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingCommunity) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner fullScreen message="Loading..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome!</Text>
            <Text style={styles.subtitle}>
              {communityExists
                ? "Let's set up your profile for the community"
                : "You're creating a new community!"}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              placeholderTextColor={COLORS.textLight}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={50}
            />

            {/* Required EULA agreement — Apple Guideline 1.2 (UGC) */}
            <TouchableOpacity
              style={styles.agreementRow}
              onPress={() => setAgreedToTerms(!agreedToTerms)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreedToTerms }}
              accessibilityLabel="Agree to Terms and Conditions"
            >
              <View
                style={[
                  styles.checkbox,
                  agreedToTerms && styles.checkboxChecked,
                ]}
              >
                {agreedToTerms && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.agreementText}>
                I agree to the{' '}
                <Text
                  style={styles.agreementLink}
                  onPress={() => router.push('/(main)/terms')}
                >
                  Terms & Conditions
                </Text>
                {' '}and acknowledge that there is{' '}
                <Text style={styles.agreementBold}>zero tolerance</Text>
                {' '}for objectionable content or abusive users. Violations may result in immediate removal from the community.
              </Text>
            </TouchableOpacity>

            <Button
              title={communityExists ? "Join Community" : "Create Community"}
              onPress={handleComplete}
              loading={isLoading}
              disabled={!displayName.trim() || !agreedToTerms}
              style={styles.button}
            />
          </View>

          {!communityExists && (
            <View style={styles.adminNote}>
              <Text style={styles.adminNoteText}>
                You'll be the admin of this community. You can add and remove members.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl * 2,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  form: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  input: {
    height: 56,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  button: {
    height: 56,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: SPACING.sm,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  agreementText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  agreementLink: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  agreementBold: {
    color: COLORS.text,
    fontWeight: '700',
  },
  adminNote: {
    backgroundColor: COLORS.primaryLight + '20',
    padding: SPACING.md,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  adminNoteText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
});
