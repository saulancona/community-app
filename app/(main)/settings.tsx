import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../../components/common/Button';
import { Avatar } from '../../components/common/Avatar';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SPACING } from '../../constants/config';
import { formatPhoneNumber } from '../../utils/formatters';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from '../../services/notifications';
import { uploadProfilePicture } from '../../services/storage';
import { updateUserProfile } from '../../services/users';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { linkEmailToAccount } from '../../services/auth';
import { ScreenErrorBoundary } from '../../components/common/ScreenErrorBoundary';
import { callFunction } from '../../services/firebase';

function SettingsScreenContent() {
  const router = useRouter();
  const { user, signOut, isAdmin, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Link email state
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkEmailPassword, setLinkEmailPassword] = useState('');
  const [linkEmailConfirmPassword, setLinkEmailConfirmPassword] = useState('');
  const [isSavingLinkEmail, setIsSavingLinkEmail] = useState(false);

  useEffect(() => {
    const supported = isNotificationSupported();
    setNotificationsSupported(supported);
    if (supported) {
      const permission = getNotificationPermission();
      setNotificationPermission(permission);
      setNotificationsEnabled(permission === 'granted');
    }
  }, []);

  const handleNotificationToggle = async (value: boolean) => {
    if (value) {
      const permission = await requestNotificationPermission();
      setNotificationPermission(permission);
      setNotificationsEnabled(permission === 'granted');
      if (permission === 'denied') {
        if (Platform.OS === 'web') {
          window.alert('Notifications are blocked. Please enable them in your browser settings.');
        }
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleEditName = () => {
    setNewDisplayName(user?.displayName || '');
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setNewDisplayName('');
  };

  const handleSaveName = async () => {
    if (!user || !newDisplayName.trim()) return;

    if (newDisplayName.trim() === user.displayName) {
      setIsEditingName(false);
      return;
    }

    try {
      setIsSavingName(true);

      // Update user profile with new display name
      await updateUserProfile(user.id, { displayName: newDisplayName.trim() });

      // Refresh user data
      await refreshUser();

      setIsEditingName(false);

      if (Platform.OS === 'web') {
        window.alert('Name updated successfully!');
      }
    } catch (error) {
      console.error('Error updating name:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to update name. Please try again.');
      }
    } finally {
      setIsSavingName(false);
    }
  };

  const handleUploadProfilePicture = async () => {
    if (!user) return;

    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        if (Platform.OS === 'web') {
          window.alert('Sorry, we need camera roll permissions to upload a profile picture.');
        }
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploadingImage(true);

        // Upload to Firebase Storage
        const imageUrl = await uploadProfilePicture(user.id, result.assets[0].uri);

        // Update user profile with new avatar URL
        await updateUserProfile(user.id, { avatarUrl: imageUrl });

        // Refresh user data
        await refreshUser();

        if (Platform.OS === 'web') {
          window.alert('Profile picture updated successfully!');
        }
      }
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to upload profile picture. Please try again.');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSignOut = async () => {
    // On web, use window.confirm instead of Alert.alert
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (!confirmed) return;
    }

    setIsLoading(true);
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Sign out error:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to sign out');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveCommunity = () => {
    if (isAdmin) {
      if (Platform.OS === 'web') {
        window.alert('As an admin, you must transfer admin role before leaving the community.');
      }
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to leave the community? You will need to be added back by an admin.');
      if (confirmed) {
        // Implement leave functionality
        window.alert('You have left the community.');
        router.replace('/(auth)/login');
      }
    }
  };

  const handleDeleteAccount = async () => {
    // Apple-mandated in-app account deletion (5.1.1(v)), with two confirmation
    // steps, working on BOTH native (react-native Alert) and web (window.confirm).
    // Previously this returned early on native and did nothing — a dead button.
    const performDelete = async () => {
      setIsLoading(true);
      try {
        await callFunction('deleteOwnAccount', {});
        await signOut();
        if (Platform.OS === 'web') {
          window.alert('Your account has been permanently deleted.');
        } else {
          Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
        }
        router.replace('/(auth)/login');
      } catch (error: any) {
        console.error('Delete account error:', error);
        const msg = error?.message || 'Failed to delete account. Please try again.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Error', msg);
        }
      } finally {
        setIsLoading(false);
      }
    };

    const details =
      'This permanently deletes your profile, display name, and avatar, removes you ' +
      'from the community and all chat rooms, and erases your account. This action CANNOT be undone.';

    if (Platform.OS === 'web') {
      if (!window.confirm('Permanently delete your account?\n\n' + details)) return;
      if (!window.confirm('Final confirmation: Delete your account? This cannot be reversed.')) return;
      await performDelete();
      return;
    }

    // Native: two-step confirmation via react-native Alert
    Alert.alert('Delete Account', details, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Final Confirmation',
            'Permanently delete your account? This cannot be reversed.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete Account', style: 'destructive', onPress: () => { performDelete(); } },
            ]
          );
        },
      },
    ]);
  };

  const handleChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsChangingPassword(true);
  };

  const handleCancelChangePassword = () => {
    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSavePassword = async () => {
    if (!user || !auth.currentUser) return;

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
      if (Platform.OS === 'web') {
        window.alert('Please fill in all password fields.');
      }
      return;
    }

    if (newPassword.length < 6) {
      if (Platform.OS === 'web') {
        window.alert('New password must be at least 6 characters long.');
      }
      return;
    }

    if (newPassword !== confirmPassword) {
      if (Platform.OS === 'web') {
        window.alert('New passwords do not match.');
      }
      return;
    }

    if (newPassword === currentPassword) {
      if (Platform.OS === 'web') {
        window.alert('New password must be different from current password.');
      }
      return;
    }

    try {
      setIsSavingPassword(true);

      // Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Update password
      await updatePassword(auth.currentUser, newPassword);

      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (Platform.OS === 'web') {
        window.alert('Password updated successfully!');
      }
    } catch (error: any) {
      console.error('Error updating password:', error);
      let errorMessage = 'Failed to update password. Please try again.';

      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Current password is incorrect.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'New password is too weak.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Please sign out and sign in again before changing your password.';
      }

      if (Platform.OS === 'web') {
        window.alert(errorMessage);
      }
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Link email handlers
  const handleStartLinkEmail = () => {
    setLinkEmail('');
    setLinkEmailPassword('');
    setLinkEmailConfirmPassword('');
    setIsLinkingEmail(true);
  };

  const handleCancelLinkEmail = () => {
    setIsLinkingEmail(false);
    setLinkEmail('');
    setLinkEmailPassword('');
    setLinkEmailConfirmPassword('');
  };

  const handleSaveLinkEmail = async () => {
    if (!user) return;

    // Validate email
    if (!linkEmail || !linkEmail.includes('@')) {
      if (Platform.OS === 'web') {
        window.alert('Please enter a valid email address.');
      }
      return;
    }

    // Validate password
    if (linkEmailPassword.length < 6) {
      if (Platform.OS === 'web') {
        window.alert('Password must be at least 6 characters long.');
      }
      return;
    }

    if (linkEmailPassword !== linkEmailConfirmPassword) {
      if (Platform.OS === 'web') {
        window.alert('Passwords do not match.');
      }
      return;
    }

    try {
      setIsSavingLinkEmail(true);

      await linkEmailToAccount(linkEmail, linkEmailPassword);

      // Refresh user data
      await refreshUser();

      setIsLinkingEmail(false);
      setLinkEmail('');
      setLinkEmailPassword('');
      setLinkEmailConfirmPassword('');

      if (Platform.OS === 'web') {
        window.alert('Email linked successfully! You can now sign in with either your phone number or email.');
      }
    } catch (error: any) {
      console.error('Error linking email:', error);
      if (Platform.OS === 'web') {
        window.alert(error.message || 'Failed to link email. Please try again.');
      }
    } finally {
      setIsSavingLinkEmail(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileSection}>
          <TouchableOpacity
            onPress={handleUploadProfilePicture}
            disabled={isUploadingImage}
            style={styles.avatarContainer}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
            accessibilityHint="Tap to upload a new profile picture"
          >
            <Avatar
              name={user?.displayName || 'User'}
              imageUrl={user?.avatarUrl}
              size="large"
            />
            {isUploadingImage ? (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : (
              <View style={styles.editBadge}>
                <Text style={styles.editIcon}>📷</Text>
              </View>
            )}
          </TouchableOpacity>

          {isEditingName ? (
            <View style={styles.nameEditContainer}>
              <TextInput
                style={styles.nameInput}
                value={newDisplayName}
                onChangeText={setNewDisplayName}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textLight}
                maxLength={50}
                autoFocus
                accessibilityLabel="Edit display name"
              />
              <View style={styles.nameEditButtons}>
                <TouchableOpacity
                  style={[styles.nameEditButton, styles.cancelButton]}
                  onPress={handleCancelEditName}
                  disabled={isSavingName}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing name"
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nameEditButton, styles.saveButton]}
                  onPress={handleSaveName}
                  disabled={isSavingName || !newDisplayName.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Save new name"
                >
                  {isSavingName ? (
                    <ActivityIndicator size="small" color={COLORS.surface} />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleEditName}
              style={styles.nameContainer}
              accessibilityRole="button"
              accessibilityLabel="Edit name"
              accessibilityHint="Tap to edit your display name"
            >
              <Text style={styles.name}>{user?.displayName}</Text>
              <Text style={styles.editNameIcon}>✏️</Text>
            </TouchableOpacity>
          )}

          {user?.phoneNumber && (
            <Text style={styles.contactInfo}>
              {formatPhoneNumber(user.phoneNumber)}
            </Text>
          )}
          {user?.email && (
            <Text style={styles.contactInfo}>
              {user.email}
            </Text>
          )}
          {isAdmin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminText}>Admin</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Role</Text>
              <Text style={styles.infoValue}>
                {isAdmin ? 'Administrator' : 'Member'}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={[styles.infoValue, styles.onlineStatus]}>
                Online
              </Text>
            </View>
          </View>

          {isChangingPassword ? (
            <View style={styles.passwordChangeContainer}>
              <TextInput
                style={styles.passwordInput}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Current Password"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry
                autoFocus
                accessibilityLabel="Current password"
              />
              <TextInput
                style={styles.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New Password (min 6 characters)"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry
                accessibilityLabel="New password"
              />
              <TextInput
                style={styles.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm New Password"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry
                accessibilityLabel="Confirm new password"
              />
              <View style={styles.passwordButtons}>
                <TouchableOpacity
                  style={[styles.passwordButton, styles.cancelButton]}
                  onPress={handleCancelChangePassword}
                  disabled={isSavingPassword}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel password change"
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.passwordButton, styles.saveButton]}
                  onPress={handleSavePassword}
                  disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword}
                  accessibilityRole="button"
                  accessibilityLabel="Save new password"
                >
                  {isSavingPassword ? (
                    <ActivityIndicator size="small" color={COLORS.surface} />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Button
              title="Change Password"
              onPress={handleChangePassword}
              variant="outline"
              style={styles.changePasswordButton}
            />
          )}

          {/* Link Email Section - only show if user has phone but no email */}
          {user?.phoneNumber && !user?.email && (
            isLinkingEmail ? (
              <View style={styles.linkEmailContainer}>
                <Text style={styles.linkEmailTitle}>Link Email Address</Text>
                <Text style={styles.linkEmailSubtext}>
                  Add an email to sign in with either your phone or email
                </Text>
                <TextInput
                  style={styles.passwordInput}
                  value={linkEmail}
                  onChangeText={setLinkEmail}
                  placeholder="Email Address"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                  accessibilityLabel="Email address"
                />
                <TextInput
                  style={styles.passwordInput}
                  value={linkEmailPassword}
                  onChangeText={setLinkEmailPassword}
                  placeholder="Password (min 6 characters)"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  accessibilityLabel="Password for email sign in"
                />
                <TextInput
                  style={styles.passwordInput}
                  value={linkEmailConfirmPassword}
                  onChangeText={setLinkEmailConfirmPassword}
                  placeholder="Confirm Password"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  accessibilityLabel="Confirm password"
                />
                <View style={styles.passwordButtons}>
                  <TouchableOpacity
                    style={[styles.passwordButton, styles.cancelButton]}
                    onPress={handleCancelLinkEmail}
                    disabled={isSavingLinkEmail}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel linking email"
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.passwordButton, styles.saveButton]}
                    onPress={handleSaveLinkEmail}
                    disabled={isSavingLinkEmail || !linkEmail || !linkEmailPassword || !linkEmailConfirmPassword}
                    accessibilityRole="button"
                    accessibilityLabel="Link email to account"
                  >
                    {isSavingLinkEmail ? (
                      <ActivityIndicator size="small" color={COLORS.surface} />
                    ) : (
                      <Text style={styles.saveButtonText}>Link Email</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Button
                title="Link Email Address"
                onPress={handleStartLinkEmail}
                variant="outline"
                style={styles.changePasswordButton}
              />
            )
          )}
        </View>

        {notificationsSupported && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.card}>
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <View style={styles.notificationInfo}>
                  <Text style={styles.infoLabel}>Push Notifications</Text>
                  <Text style={styles.notificationSubtext}>
                    {notificationPermission === 'denied'
                      ? 'Blocked in browser settings'
                      : 'Get notified of new messages'}
                  </Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotificationToggle}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor={COLORS.surface}
                  disabled={notificationPermission === 'denied'}
                  accessibilityLabel="Push notifications"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: notificationsEnabled, disabled: notificationPermission === 'denied' }}
                />
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.infoRow, styles.linkRow, { borderBottomWidth: 0 }]}
              onPress={() => router.push('/(main)/terms')}
              accessibilityRole="link"
              accessibilityLabel="Terms and Conditions"
              accessibilityHint="Opens terms and conditions page"
            >
              <Text style={styles.infoLabel}>Terms & Conditions</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsContainer}>
            {!isAdmin && (
              <Button
                title="Leave Community"
                onPress={handleLeaveCommunity}
                variant="outline"
                style={styles.actionButton}
              />
            )}
            <Button
              title="Sign Out"
              onPress={handleSignOut}
              variant="danger"
              loading={isLoading}
              style={styles.actionButton}
            />
            <Button
              title="Delete Account"
              onPress={handleDeleteAccount}
              variant="danger"
              loading={isLoading}
              style={styles.actionButton}
            />
            <Text style={styles.deleteAccountHint}>
              Permanently deletes your account, profile, and removes you from
              all rooms. This action cannot be undone.
            </Text>
          </View>
        </View>

        <Text style={styles.version}>Northstar Community v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  avatarContainer: {
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  editIcon: {
    fontSize: 18,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  editNameIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  nameEditContainer: {
    width: '100%',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  nameInput: {
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.text,
    textAlign: 'center',
  },
  nameEditButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  nameEditButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 8px rgba(254, 42, 148, 0.3)',
      },
    }),
  },
  saveButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  phone: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  contactInfo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  adminBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    marginTop: SPACING.sm,
  },
  adminText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 8px rgba(0, 0, 0, 0.06)',
      },
    }),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  onlineStatus: {
    color: COLORS.success,
    fontWeight: '500',
  },
  linkRow: {
    alignItems: 'center',
  },
  chevron: {
    fontSize: 24,
    color: COLORS.textLight,
    fontWeight: '300',
  },
  actionsContainer: {
    gap: SPACING.md,
  },
  actionButton: {
    height: 52,
    borderRadius: 12,
  },
  deleteAccountHint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationSubtext: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  version: {
    textAlign: 'center',
    color: COLORS.textLight,
    fontSize: 12,
    marginTop: SPACING.xl,
  },
  passwordChangeContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 8px rgba(0, 0, 0, 0.06)',
      },
    }),
  },
  passwordInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: 16,
    color: COLORS.text,
  },
  passwordButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  passwordButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  changePasswordButton: {
    marginTop: SPACING.md,
    height: 48,
    borderRadius: 12,
  },
  linkEmailContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 8px rgba(0, 0, 0, 0.06)',
      },
    }),
  },
  linkEmailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  linkEmailSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
});

// Auth loading gate
function SettingsScreenWithAuth() {
  const { isLoading: authLoading } = useAuth();

  if (authLoading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  return <SettingsScreenContent />;
}

export default function SettingsScreen() {
  return (
    <ScreenErrorBoundary screenType="settings">
      <SettingsScreenWithAuth />
    </ScreenErrorBoundary>
  );
}
