import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../constants/config';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Northstar Coaching Membership</Text>
        <Text style={styles.subtitle}>Terms & Conditions</Text>

        <Text style={styles.intro}>
          By purchasing and participating in the Northstar Coaching Membership, you agree to the following terms and conditions:
        </Text>

        <Text style={styles.sectionTitle}>1. Educational & Personal Development Disclaimer</Text>
        <Text style={styles.sectionText}>
          The Northstar Coaching Membership provides mindset and business coaching, mindset tools, meditations, workshops, and community support for educational and personal development purposes only. It is not a substitute for medical, psychological, legal, or financial advice. You are solely responsible for your decisions, actions, and results.
        </Text>

        <Text style={styles.sectionTitle}>2. Assumption of Risk & Release of Liability</Text>
        <Text style={styles.sectionText}>
          By participating, you acknowledge that personal growth work may involve emotional shifts. You voluntarily assume full responsibility for your participation and agree to release Northstar Coaching, Vivian Raquel Dayan, and all affiliated parties from any and all liability, claims, or damages arising from your participation.
        </Text>

        <Text style={styles.sectionTitle}>3. No Guarantees</Text>
        <Text style={styles.sectionText}>
          Results vary for each individual. No guarantees are made regarding specific outcomes, income, relationships, or life results.
        </Text>

        <Text style={styles.sectionTitle}>4. No Refund Policy</Text>
        <Text style={styles.sectionText}>
          All payments for the Northstar Coaching Membership are final and non-refundable. This includes unused time, missed sessions, workshops, or member content.
        </Text>

        <Text style={styles.sectionTitle}>5. Cancellation Policy</Text>
        <Text style={styles.sectionText}>
          You may cancel your membership at any time. Once canceled, you will continue to have access through the end of your current billing period. No partial refunds or prorated amounts will be issued. To cancel your membership which will occur on the next billing cycle please email support@example.com
        </Text>

        <Text style={styles.sectionTitle}>6. Membership Access & Conduct</Text>
        <Text style={styles.sectionText}>
          This membership is a respectful, high-integrity space. Disruptive, harmful, or inappropriate behavior may result in removal from the membership without refund.
        </Text>

        <Text style={styles.sectionTitle}>7. No Tolerance for Objectionable Content or Abusive Users</Text>
        <Text style={styles.sectionText}>
          Northstar Coaching has ZERO tolerance for objectionable content or abusive behavior of any kind. By using this app, you agree that you will NOT post, transmit, or share content that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, hateful, sexually explicit, or otherwise objectionable. Hate speech, harassment, bullying, threats of violence, sexual content involving minors, doxxing, and impersonation are strictly forbidden.
        </Text>
        <Text style={styles.sectionText}>
          You may flag any message you believe violates these terms by long-pressing (or tapping the menu on) the message and selecting "Report." Reported content is reviewed by our team and will be acted on within 24 hours. Confirmed violations result in the immediate removal of the content and, where appropriate, the permanent ejection of the offending user from the community.
        </Text>
        <Text style={styles.sectionText}>
          You may also block any user at any time by long-pressing any of their messages and selecting "Block." Blocked users' content is hidden from your feed instantly and their reports are routed to our moderation team for review.
        </Text>
        <Text style={styles.sectionText}>
          We reserve the right to remove any content and terminate any account that violates these terms, at our sole discretion, without notice or refund.
        </Text>

        <Text style={styles.sectionTitle}>8. Content Ownership</Text>
        <Text style={styles.sectionText}>
          All materials, meditations, workshops, and content provided are the intellectual property of Northstar Coaching and may not be shared, reproduced, or distributed without written permission.
        </Text>

        <Text style={styles.footer}>
          By completing your purchase, you confirm that you have read, understood, and agreed to these Terms & Conditions.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  intro: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sectionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  footer: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.lg,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
