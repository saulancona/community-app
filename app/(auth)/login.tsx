import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { signUpWithEmail, signInWithEmail, resetPassword } from '../../services/auth';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING } from '../../constants/config';
import { validatePhoneNumber, formatPhoneForFirebase, validateEmail } from '../../utils/validators';

// Store confirmation result globally so verify screen can access it
export let confirmationResult: ConfirmationResult | null = null;

type AuthMode = 'phone' | 'email';
type AuthSubMode = 'signin' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  // TODO: Re-enable phone auth once Twilio is approved
  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [phoneMode, setPhoneMode] = useState<AuthSubMode>('signup');
  const [emailMode, setEmailMode] = useState<AuthSubMode>('signup');

  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');

  // Email auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    // Initialize reCAPTCHA verifier for web (only needed for phone auth)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Create a container for reCAPTCHA if it doesn't exist
      let recaptchaContainer = document.getElementById('recaptcha-container');
      if (!recaptchaContainer) {
        recaptchaContainer = document.createElement('div');
        recaptchaContainer.id = 'recaptcha-container';
        // Hide the reCAPTCHA badge completely since we're using invisible mode
        recaptchaContainer.style.cssText = 'position: fixed; bottom: -100px; right: -100px; z-index: -1; visibility: hidden;';
        document.body.appendChild(recaptchaContainer);
      }

      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          // Reset reCAPTCHA
          recaptchaVerifierRef.current?.render();
        },
      });
    }

    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
      }
    };
  }, []);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handlePhoneAuth = async () => {
    const fullNumber = formatPhoneForFirebase(phoneNumber, countryCode);

    if (!validatePhoneNumber(phoneNumber)) {
      showAlert('Invalid Phone Number', 'Please enter a valid phone number.');
      return;
    }

    setIsLoading(true);

    try {
      if (Platform.OS === 'web' && recaptchaVerifierRef.current) {
        // Web: Use reCAPTCHA verifier
        confirmationResult = await signInWithPhoneNumber(
          auth,
          fullNumber,
          recaptchaVerifierRef.current
        );

        router.push({
          pathname: '/(auth)/verify',
          params: { phoneNumber: fullNumber, authType: 'phone' },
        });
      } else {
        // Mobile: Would use expo-auth-session or react-native-firebase
        showAlert('Info', 'Phone auth on mobile requires additional setup. Please use web for now.');
      }
    } catch (error: any) {
      console.error('Phone auth error:', error);
      showAlert('Error', error.message || 'Failed to send verification code');

      // Reset reCAPTCHA on error
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.render();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      showAlert('Invalid Email', emailValidation.error || 'Please enter a valid email address.');
      return;
    }

    // Validate password
    if (password.length < 6) {
      showAlert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }

    // For signup, validate confirm password
    if (emailMode === 'signup' && password !== confirmPassword) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      if (emailMode === 'signup') {
        // Sign up with email
        await signUpWithEmail(email, password);
        // Navigate to setup (email verification will be checked there)
        router.push({
          pathname: '/(auth)/setup',
          params: { authType: 'email', email },
        });
      } else {
        // Sign in with email
        await signInWithEmail(email, password);
        // Navigate to setup (will redirect to chat if profile exists)
        router.replace('/(auth)/setup');
      }
    } catch (error: any) {
      console.error('Email auth error:', error);
      showAlert('Error', error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      showAlert('Email Required', 'Please enter a valid email address first.');
      return;
    }

    setIsLoading(true);

    try {
      await resetPassword(email);
      showAlert('Password Reset', 'If an account exists with this email, you will receive a password reset link.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Northstar Coaching</Text>
              <Text style={styles.subtitle}>Community</Text>
              <Text style={styles.description}>
                {authMode === 'phone'
                  ? phoneMode === 'signup'
                    ? 'Create an account to join the community'
                    : 'Sign in to your account'
                  : emailMode === 'signup'
                    ? 'Create an account to join the community'
                    : 'Sign in to your account'}
              </Text>
            </View>

            {/* Auth Mode Toggle - Hidden while waiting for Twilio approval */}
            {/* TODO: Re-enable this toggle once phone auth is ready
            <View style={styles.authModeToggle}>
              <TouchableOpacity
                style={[styles.authModeButton, authMode === 'phone' && styles.authModeButtonActive]}
                onPress={() => setAuthMode('phone')}
              >
                <Text style={[styles.authModeText, authMode === 'phone' && styles.authModeTextActive]}>
                  Phone
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authModeButton, authMode === 'email' && styles.authModeButtonActive]}
                onPress={() => setAuthMode('email')}
              >
                <Text style={[styles.authModeText, authMode === 'email' && styles.authModeTextActive]}>
                  Email
                </Text>
              </TouchableOpacity>
            </View>
            */}

            <View style={styles.form}>
              {authMode === 'phone' ? (
                <>
                  <Text style={styles.label}>Phone Number</Text>
                  <View style={styles.phoneInputContainer}>
                    <TextInput
                      style={styles.countryCodeInput}
                      value={countryCode}
                      onChangeText={setCountryCode}
                      keyboardType="phone-pad"
                      maxLength={4}
                      accessibilityLabel="Country code"
                      accessibilityHint="Enter your country code, for example plus 1 for United States"
                    />
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="(555) 123-4567"
                      placeholderTextColor={COLORS.textLight}
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      maxLength={14}
                      accessibilityLabel="Phone number"
                      accessibilityHint="Enter your phone number to receive a verification code"
                    />
                  </View>

                  <Button
                    title={phoneMode === 'signup' ? 'Create Account' : 'Sign In'}
                    onPress={handlePhoneAuth}
                    loading={isLoading}
                    disabled={!phoneNumber.trim()}
                    style={styles.button}
                  />

                  <TouchableOpacity
                    onPress={() => setPhoneMode(phoneMode === 'signin' ? 'signup' : 'signin')}
                    style={styles.switchMode}
                  >
                    <Text style={styles.switchModeText}>
                      {phoneMode === 'signin'
                        ? "Don't have an account? Sign up"
                        : 'Already have an account? Sign in'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor={COLORS.textLight}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    accessibilityLabel="Email address"
                  />

                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter your password"
                      placeholderTextColor={COLORS.textLight}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
                      accessibilityLabel="Password"
                    />
                    <TouchableOpacity
                      style={styles.showPasswordButton}
                      onPress={() => setShowPassword(!showPassword)}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Text style={styles.showPasswordText}>
                        {showPassword ? 'Hide' : 'Show'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {emailMode === 'signup' && (
                    <>
                      <Text style={styles.label}>Confirm Password</Text>
                      <View style={styles.passwordInputContainer}>
                        <TextInput
                          style={styles.passwordInput}
                          placeholder="Confirm your password"
                          placeholderTextColor={COLORS.textLight}
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          secureTextEntry={!showPassword}
                          autoComplete="new-password"
                          accessibilityLabel="Confirm password"
                        />
                        <TouchableOpacity
                          style={styles.showPasswordButton}
                          onPress={() => setShowPassword(!showPassword)}
                          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        >
                          <Text style={styles.showPasswordText}>
                            {showPassword ? 'Hide' : 'Show'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  <Button
                    title={emailMode === 'signup' ? 'Create Account' : 'Sign In'}
                    onPress={handleEmailAuth}
                    loading={isLoading}
                    disabled={!email.trim() || !password.trim()}
                    style={styles.button}
                  />

                  {emailMode === 'signin' && (
                    <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPassword}>
                      <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => setEmailMode(emailMode === 'signin' ? 'signup' : 'signin')}
                    style={styles.switchMode}
                  >
                    <Text style={styles.switchModeText}>
                      {emailMode === 'signin'
                        ? "Don't have an account? Sign up"
                        : 'Already have an account? Sign in'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.footerBlock}>
              <Text style={styles.footer}>
                By continuing, you agree to our{' '}
                <Text
                  style={styles.footerLink}
                  onPress={() => router.push('/(auth)/terms')}
                  accessibilityRole="link"
                  accessibilityLabel="View Terms and Conditions"
                >
                  Terms & Conditions
                </Text>
                {' '}and acknowledge our{' '}
                <Text style={styles.footerBold}>zero-tolerance policy</Text>
                {' '}for objectionable content and abusive users.
                {authMode === 'phone' && ' You also agree to receive SMS messages for verification.'}
              </Text>
            </View>
          </View>
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  authModeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: SPACING.lg,
  },
  authModeButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: 10,
  },
  authModeButtonActive: {
    backgroundColor: COLORS.primary,
  },
  authModeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  authModeTextActive: {
    color: '#fff',
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
  phoneInputContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  countryCodeInput: {
    width: 60,
    height: 56,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
    marginRight: SPACING.sm,
    textAlign: 'center',
  },
  phoneInput: {
    flex: 1,
    height: 56,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
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
    marginBottom: SPACING.md,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  passwordInput: {
    flex: 1,
    height: 56,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
  },
  showPasswordButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  showPasswordText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    height: 56,
    marginTop: SPACING.sm,
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 14,
  },
  switchMode: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  switchModeText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    lineHeight: 18,
  },
  footerBlock: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  footerLink: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  footerBold: {
    color: COLORS.text,
    fontWeight: '700',
  },
});
