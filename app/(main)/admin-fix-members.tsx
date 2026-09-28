import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLORS, SPACING } from '../../constants/config';

interface UserStatus {
  id: string;
  displayName: string;
  inMemberIds: boolean;
  hasSubscription: boolean;
  needsFix: boolean;
}

export default function AdminFixMembersScreen() {
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [users, setUsers] = useState<UserStatus[]>([]);
  const [fixedCount, setFixedCount] = useState(0);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.errorText}>Admin access required</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const analyzeMembers = async () => {
    setIsAnalyzing(true);
    try {
      // Get community document
      const communityRef = doc(db, 'community', 'northstar');
      const communitySnap = await getDoc(communityRef);

      if (!communitySnap.exists()) {
        Alert.alert('Error', 'Community document not found');
        return;
      }

      const communityData = communitySnap.data();
      const memberIds = communityData.memberIds || [];

      // Get all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const userStatuses: UserStatus[] = [];

      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        const inMemberIds = memberIds.includes(doc.id);
        const hasSubscription = !!(userData.subscriptionTier && userData.subscriptionStatus);

        userStatuses.push({
          id: doc.id,
          displayName: userData.displayName || 'Unknown',
          inMemberIds,
          hasSubscription,
          needsFix: !inMemberIds || !hasSubscription,
        });
      });

      setUsers(userStatuses);
    } catch (error: any) {
      console.error('Error analyzing members:', error);
      Alert.alert('Error', error.message || 'Failed to analyze members');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fixAllMembers = async () => {
    setIsLoading(true);
    setFixedCount(0);

    try {
      const communityRef = doc(db, 'community', 'northstar');
      const communitySnap = await getDoc(communityRef);

      if (!communitySnap.exists()) {
        Alert.alert('Error', 'Community document not found');
        return;
      }

      const communityData = communitySnap.data();
      const currentMemberIds = communityData.memberIds || [];

      let fixed = 0;

      for (const userStatus of users) {
        if (!userStatus.needsFix) continue;

        try {
          const userRef = doc(db, 'users', userStatus.id);

          // Update user document with subscription fields if missing
          if (!userStatus.hasSubscription) {
            await updateDoc(userRef, {
              subscriptionTier: 'standard',
              subscriptionStatus: 'active',
            });
          }

          // Add to memberIds if not already there
          if (!userStatus.inMemberIds) {
            await updateDoc(communityRef, {
              memberIds: arrayUnion(userStatus.id),
              memberCount: increment(1),
            });
          }

          fixed++;
          setFixedCount(fixed);
        } catch (error) {
          console.error(`Error fixing user ${userStatus.id}:`, error);
        }
      }

      Alert.alert(
        'Success',
        `Fixed ${fixed} member(s)`,
        [{ text: 'OK', onPress: () => analyzeMembers() }]
      );
    } catch (error: any) {
      console.error('Error fixing members:', error);
      Alert.alert('Error', error.message || 'Failed to fix members');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Fix Members Tool</Text>
        <Text style={styles.subtitle}>
          This tool will fix any members who are missing from the memberIds array
          or don't have subscription fields set.
        </Text>

        <View style={styles.buttonGroup}>
          <Button
            title="Analyze Members"
            onPress={analyzeMembers}
            loading={isAnalyzing}
            style={styles.button}
          />

          {users.length > 0 && (
            <Button
              title={`Fix ${users.filter(u => u.needsFix).length} Broken Member(s)`}
              onPress={fixAllMembers}
              loading={isLoading}
              disabled={users.filter(u => u.needsFix).length === 0}
              style={styles.button}
            />
          )}
        </View>

        {isLoading && (
          <View style={styles.progress}>
            <Text style={styles.progressText}>
              Fixed {fixedCount} / {users.filter(u => u.needsFix).length} members...
            </Text>
          </View>
        )}

        {users.length > 0 && (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>
              Analysis Results ({users.length} total users)
            </Text>

            {users.map(user => (
              <View
                key={user.id}
                style={[
                  styles.userCard,
                  user.needsFix ? styles.userCardError : styles.userCardSuccess
                ]}
              >
                <Text style={styles.userName}>{user.displayName}</Text>
                <Text style={styles.userId}>{user.id}</Text>

                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>In memberIds:</Text>
                  <Text style={user.inMemberIds ? styles.statusYes : styles.statusNo}>
                    {user.inMemberIds ? '✅' : '❌'}
                  </Text>
                </View>

                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Has subscription:</Text>
                  <Text style={user.hasSubscription ? styles.statusYes : styles.statusNo}>
                    {user.hasSubscription ? '✅' : '❌'}
                  </Text>
                </View>

                {user.needsFix && (
                  <Text style={styles.needsFixLabel}>⚠️ Needs Fix</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  buttonGroup: {
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  button: {
    height: 56,
  },
  progress: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  progressText: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  results: {
    marginTop: SPACING.md,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  userCard: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
  },
  userCardSuccess: {
    borderLeftColor: COLORS.success,
  },
  userCardError: {
    borderLeftColor: COLORS.error,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  userId: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    fontFamily: 'monospace',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  statusLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  statusYes: {
    fontSize: 16,
  },
  statusNo: {
    fontSize: 16,
  },
  needsFixLabel: {
    fontSize: 14,
    color: COLORS.error,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
});
