import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getCommunity } from '../services/admin';
import { COLORS, SPACING } from '../constants/config';

export default function DebugUserScreen() {
  const { user, firebaseUser, isMember, isAdmin } = useAuth();
  const [community, setCommunity] = useState<any>(null);

  useEffect(() => {
    getCommunity().then(setCommunity);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>User Debug Info</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Firebase User</Text>
          <Text style={styles.label}>UID: <Text style={styles.value}>{firebaseUser?.uid || 'N/A'}</Text></Text>
          <Text style={styles.label}>Email: <Text style={styles.value}>{firebaseUser?.email || 'N/A'}</Text></Text>
          <Text style={styles.label}>Phone: <Text style={styles.value}>{firebaseUser?.phoneNumber || 'N/A'}</Text></Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Profile</Text>
          <Text style={styles.label}>Display Name: <Text style={styles.value}>{user?.displayName || 'N/A'}</Text></Text>
          <Text style={styles.label}>Role: <Text style={styles.value}>{user?.role || 'N/A'}</Text></Text>
          <Text style={styles.label}>Subscription Tier: <Text style={styles.value}>{user?.subscriptionTier || 'NOT SET ❌'}</Text></Text>
          <Text style={styles.label}>Subscription Status: <Text style={styles.value}>{user?.subscriptionStatus || 'NOT SET ❌'}</Text></Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions</Text>
          <Text style={styles.label}>Is Member: <Text style={styles.value}>{isMember ? '✅ YES' : '❌ NO'}</Text></Text>
          <Text style={styles.label}>Is Admin: <Text style={styles.value}>{isAdmin ? '✅ YES' : '❌ NO'}</Text></Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community</Text>
          <Text style={styles.label}>Admin ID: <Text style={styles.value}>{community?.adminId || 'N/A'}</Text></Text>
          <Text style={styles.label}>Member IDs: <Text style={styles.value}>{JSON.stringify(community?.memberIds || [])}</Text></Text>
          <Text style={styles.label}>Member Count: <Text style={styles.value}>{community?.memberCount || 0}</Text></Text>
          <Text style={styles.label}>User in memberIds: <Text style={styles.value}>
            {community?.memberIds?.includes(firebaseUser?.uid) ? '✅ YES' : '❌ NO'}
          </Text></Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What's Wrong?</Text>
          {!user?.subscriptionTier && (
            <Text style={styles.error}>❌ Missing subscriptionTier field</Text>
          )}
          {!user?.subscriptionStatus && (
            <Text style={styles.error}>❌ Missing subscriptionStatus field</Text>
          )}
          {!community?.memberIds?.includes(firebaseUser?.uid) && (
            <Text style={styles.error}>❌ User not in community memberIds array</Text>
          )}
          {user?.subscriptionTier && user?.subscriptionStatus && community?.memberIds?.includes(firebaseUser?.uid) && (
            <Text style={styles.success}>✅ Everything looks good!</Text>
          )}
        </View>
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
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  section: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  value: {
    color: COLORS.text,
    fontWeight: '600',
  },
  error: {
    fontSize: 14,
    color: COLORS.error,
    marginBottom: SPACING.xs,
  },
  success: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '600',
  },
});
