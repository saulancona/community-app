import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from '../../constants/config';
import { reportErrorBoundary } from '../../services/errorReporting';

// Screen-specific error configurations
export type ScreenType = 'chat' | 'members' | 'settings' | 'admin' | 'auth' | 'default';

interface ScreenErrorConfig {
  icon: string;
  title: string;
  message: string;
  retryLabel: string;
  showHomeButton: boolean;
}

const screenConfigs: Record<ScreenType, ScreenErrorConfig> = {
  chat: {
    icon: '💬',
    title: 'Chat Unavailable',
    message: 'We couldn\'t load the chat. This might be a temporary issue with your connection.',
    retryLabel: 'Reload Chat',
    showHomeButton: true,
  },
  members: {
    icon: '👥',
    title: 'Members List Unavailable',
    message: 'We couldn\'t load the members list. Please try again.',
    retryLabel: 'Reload Members',
    showHomeButton: true,
  },
  settings: {
    icon: '⚙️',
    title: 'Settings Unavailable',
    message: 'We couldn\'t load your settings. Please try again.',
    retryLabel: 'Reload Settings',
    showHomeButton: true,
  },
  admin: {
    icon: '🔧',
    title: 'Admin Panel Unavailable',
    message: 'We couldn\'t load the admin panel. Please check your permissions and try again.',
    retryLabel: 'Reload Panel',
    showHomeButton: true,
  },
  auth: {
    icon: '🔐',
    title: 'Authentication Error',
    message: 'We encountered an issue with authentication. Please try signing in again.',
    retryLabel: 'Try Again',
    showHomeButton: false,
  },
  default: {
    icon: '⚠️',
    title: 'Something Went Wrong',
    message: 'We\'re sorry, but something unexpected happened. Please try again.',
    retryLabel: 'Try Again',
    showHomeButton: true,
  },
};

interface Props {
  children: ReactNode;
  screenType?: ScreenType;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ScreenErrorBoundaryClass extends Component<Props & { router: ReturnType<typeof useRouter> }, State> {
  constructor(props: Props & { router: ReturnType<typeof useRouter> }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error with screen context
    const screenType = this.props.screenType || 'default';
    console.error(`[${screenType}] Error caught:`, error, errorInfo);

    // Report to error service with screen context
    reportErrorBoundary(error, errorInfo.componentStack || '', {
      screen: screenType,
    });
  }

  handleRetry = (): void => {
    // Call custom retry handler if provided
    if (this.props.onRetry) {
      this.props.onRetry();
    }

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = (): void => {
    // Navigate to rooms selection screen
    this.props.router.replace('/(main)/rooms');

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const screenType = this.props.screenType || 'default';
      const config = screenConfigs[screenType];

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.icon}>{config.icon}</Text>
            <Text style={styles.title}>{config.title}</Text>
            <Text style={styles.message}>{config.message}</Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={this.handleRetry}
                accessibilityRole="button"
                accessibilityLabel={config.retryLabel}
              >
                <Text style={styles.retryButtonText}>{config.retryLabel}</Text>
              </TouchableOpacity>

              {config.showHomeButton && (
                <TouchableOpacity
                  style={styles.homeButton}
                  onPress={this.handleGoHome}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Rooms"
                >
                  <Text style={styles.homeButtonText}>Go to Rooms</Text>
                </TouchableOpacity>
              )}
            </View>

            {this.state.error && (
              <View style={styles.devInfo}>
                <Text style={styles.devInfoTitle}>Error Details:</Text>
                <Text style={styles.devInfoText}>
                  {this.state.error.message}
                </Text>
                {this.state.error.stack && (
                  <Text style={[styles.devInfoText, { marginTop: 8 }]}>
                    {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Functional component wrapper to use hooks
export const ScreenErrorBoundary: React.FC<Props> = (props) => {
  const router = useRouter();
  return <ScreenErrorBoundaryClass {...props} router={router} />;
};

// HOC for wrapping screens
export const withScreenErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  screenType: ScreenType
) => {
  return function WithScreenErrorBoundary(props: P) {
    const router = useRouter();
    return (
      <ScreenErrorBoundaryClass router={router} screenType={screenType}>
        <WrappedComponent {...props} />
      </ScreenErrorBoundaryClass>
    );
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  icon: {
    fontSize: 64,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
    gap: SPACING.sm,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  homeButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  homeButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  devInfo: {
    marginTop: SPACING.xl,
    padding: SPACING.md,
    backgroundColor: 'rgba(255, 0, 0, 0.05)',
    borderRadius: 8,
    width: '100%',
  },
  devInfoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: SPACING.xs,
  },
  devInfoText: {
    fontSize: 11,
    color: COLORS.error,
    fontFamily: 'monospace',
  },
});
