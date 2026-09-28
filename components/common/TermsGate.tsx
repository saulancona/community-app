import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../../constants/config';

/**
 * Unavoidable Terms of Service acceptance gate (Apple Guideline 1.2 — UGC).
 *
 * Mounts BEFORE any other auth/main UI. Once a user accepts, the acceptance
 * is persisted permanently for that device — they will not be prompted again.
 * If acceptance fails to persist (private browsing, storage quota), the user
 * may be re-prompted on next launch — that is the correct fallback.
 *
 * UX:
 * - Full-screen blocker with the terms text in a scrollable area
 * - A single tappable checkbox "I have read and agree to the Terms of Use"
 * - The Continue button is enabled the moment the checkbox is ticked
 *
 * Storage: writes to BOTH AsyncStorage and (on web) localStorage directly,
 * because AsyncStorage's web backend can fail silently under some browser
 * storage policies. Reads check both — first hit wins.
 */
const ACCEPTED_KEY = 'terms_accepted_v2';

// Cross-platform persistence helpers
const persistAccept = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(ACCEPTED_KEY, '1');
  } catch (e) {
    console.warn('[TermsGate] AsyncStorage write failed', e);
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ACCEPTED_KEY, '1');
    } catch (e) {
      console.warn('[TermsGate] localStorage write failed', e);
    }
  }
};

const readAccepted = async (): Promise<boolean> => {
  // Check localStorage first on web (most reliable across reloads)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem(ACCEPTED_KEY) === '1') return true;
    } catch {
      /* ignore */
    }
  }
  try {
    const v = await AsyncStorage.getItem(ACCEPTED_KEY);
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
};

interface TermsGateProps {
  children: React.ReactNode;
}

export const TermsGate: React.FC<TermsGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'checking' | 'needs_accept' | 'accepted'>('checking');
  const [agreed, setAgreed] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    (async () => {
      const already = await readAccepted();
      setStatus(already ? 'accepted' : 'needs_accept');
    })();
  }, []);

  const handleAccept = async () => {
    if (!agreed) return;
    setIsAccepting(true);
    await persistAccept();
    setStatus('accepted');
    setIsAccepting(false);
  };

  if (status === 'checking') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (status === 'accepted') {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Terms of Use</Text>
        <Text style={styles.subtitle}>Please read and accept to continue</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.body}>
          By using Northstar Community, you agree to these Terms of Use.
        </Text>

        <Text style={styles.h2}>1. Zero Tolerance for Objectionable Content or Abusive Users</Text>
        <Text style={styles.body}>
          Northstar Coaching has{' '}
          <Text style={styles.bold}>ZERO tolerance</Text> for objectionable
          content or abusive behavior of any kind. You agree that you will NOT
          post, transmit, or share content that is unlawful, harmful,
          threatening, abusive, harassing, defamatory, vulgar, obscene, hateful,
          sexually explicit, or otherwise objectionable. Hate speech, harassment,
          bullying, threats of violence, sexual content involving minors,
          doxxing, and impersonation are{' '}
          <Text style={styles.bold}>strictly forbidden</Text>.
        </Text>

        <Text style={styles.h2}>2. Reporting Objectionable Content</Text>
        <Text style={styles.body}>
          You may flag any message you believe violates these terms by tapping
          the message (or the ⋯ More button) and selecting{' '}
          <Text style={styles.bold}>Report</Text>. Reported content is reviewed
          by our team and will be acted on{' '}
          <Text style={styles.bold}>within 24 hours</Text>. Confirmed violations
          result in immediate removal of the content and, where appropriate,
          permanent ejection of the offending user from the community.
        </Text>

        <Text style={styles.h2}>3. Blocking Abusive Users</Text>
        <Text style={styles.body}>
          You may block any user at any time by tapping any of their messages
          and selecting <Text style={styles.bold}>Block User</Text>. Blocked
          users' content is hidden from your feed{' '}
          <Text style={styles.bold}>instantly</Text>, and our moderation team is
          notified for review.
        </Text>

        <Text style={styles.h2}>4. Account Deletion</Text>
        <Text style={styles.body}>
          You may permanently delete your account at any time from{' '}
          <Text style={styles.bold}>Settings → Delete Account</Text>. This
          permanently removes your profile, your community membership, and
          deletes your authentication record.
        </Text>

        <Text style={styles.h2}>5. Content Moderation</Text>
        <Text style={styles.body}>
          We operate automated and manual content filtering. Messages
          containing slurs, threats, or other prohibited content are
          automatically removed and logged for review. We reserve the right to
          remove any content and terminate any account that violates these
          terms, at our sole discretion, without notice or refund.
        </Text>

        <Text style={styles.h2}>6. Educational Purpose Only</Text>
        <Text style={styles.body}>
          The content provided in this app is for educational and personal
          development purposes only. It is not a substitute for medical,
          psychological, legal, or financial advice. You are solely responsible
          for your decisions, actions, and results.
        </Text>

        <Text style={styles.h2}>7. Acknowledgment</Text>
        <Text style={styles.body}>
          By tapping <Text style={styles.bold}>Continue</Text> below, you
          confirm that you have read, understood, and agree to these Terms of
          Use, including the zero-tolerance policy for objectionable content
          and abusive users.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setAgreed(!agreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="I have read and agree to the Terms of Use"
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            I have read and agree to the Terms of Use, including the{' '}
            <Text style={styles.bold}>zero-tolerance policy</Text> for
            objectionable content and abusive users.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.acceptButton,
            (!agreed || isAccepting) && styles.acceptButtonDisabled,
          ]}
          onPress={handleAccept}
          disabled={!agreed || isAccepting}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          accessibilityState={{ disabled: !agreed || isAccepting }}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.acceptButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          You only need to do this once on this device.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'web' ? SPACING.xl : SPACING.lg + 30,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  body: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: SPACING.sm,
  },
  bold: { fontWeight: '700' },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
    paddingRight: SPACING.sm,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  acceptButton: {
    height: 54,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerNote: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
