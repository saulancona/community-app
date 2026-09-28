import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Error report interface
interface ErrorReport {
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  userId?: string;
  userAgent?: string;
  url?: string;
  timestamp: any;
  context?: Record<string, any>;
  componentStack?: string;
}

// Initialize error reporting
let isInitialized = false;
let currentUserId: string | null = null;

export const initErrorReporting = (userId?: string): void => {
  if (isInitialized) return;

  currentUserId = userId || null;

  // Set up global error handler for uncaught errors
  if (typeof window !== 'undefined') {
    window.onerror = (message, source, lineno, colno, error) => {
      reportError(error || new Error(String(message)), 'high', {
        source,
        lineno,
        colno,
      });
      return false; // Let the error propagate
    };

    // Handle unhandled promise rejections
    window.onunhandledrejection = (event) => {
      reportError(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
        'high',
        { type: 'unhandledrejection' }
      );
    };
  }

  isInitialized = true;
  console.log('Error reporting initialized');
};

// Set the current user ID for error reports
export const setErrorReportingUser = (userId: string | null): void => {
  currentUserId = userId;
};

// Report an error to Firestore
export const reportError = async (
  error: Error,
  severity: ErrorSeverity = 'medium',
  context?: Record<string, any>
): Promise<void> => {
  try {
    const errorReport: ErrorReport = {
      message: error.message,
      stack: error.stack,
      severity,
      userId: currentUserId || undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      timestamp: serverTimestamp(),
      context,
    };

    // Log to console in development
    if (__DEV__) {
      console.error('Error Report:', errorReport);
    }

    // Store in Firestore for production monitoring
    await addDoc(collection(db, 'error_reports'), errorReport);
  } catch (reportingError) {
    // Don't throw if error reporting fails - just log it
    console.error('Failed to report error:', reportingError);
  }
};

// Report an error from an error boundary
export const reportErrorBoundary = async (
  error: Error,
  componentStack: string,
  additionalContext?: Record<string, any>
): Promise<void> => {
  try {
    const errorReport: ErrorReport = {
      message: error.message,
      stack: error.stack,
      severity: 'critical',
      userId: currentUserId || undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      timestamp: serverTimestamp(),
      componentStack,
      context: { source: 'ErrorBoundary', ...additionalContext },
    };

    if (__DEV__) {
      console.error('Error Boundary Report:', errorReport);
    }

    await addDoc(collection(db, 'error_reports'), errorReport);
  } catch (reportingError) {
    console.error('Failed to report error boundary error:', reportingError);
  }
};

// Helper to wrap async functions with error reporting
export const withErrorReporting = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T => {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      reportError(
        error instanceof Error ? error : new Error(String(error)),
        'medium',
        { function: context || fn.name, args: args.map(a => typeof a) }
      );
      throw error;
    }
  }) as T;
};

// Track custom events/metrics
export const trackEvent = async (
  eventName: string,
  properties?: Record<string, any>
): Promise<void> => {
  try {
    await addDoc(collection(db, 'analytics_events'), {
      event: eventName,
      userId: currentUserId,
      properties,
      timestamp: serverTimestamp(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  } catch (error) {
    console.error('Failed to track event:', error);
  }
};

// Performance metrics tracking
interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count';
  context?: Record<string, any>;
}

// Track performance metrics
export const trackPerformance = async (metric: PerformanceMetric): Promise<void> => {
  try {
    await addDoc(collection(db, 'performance_metrics'), {
      ...metric,
      userId: currentUserId,
      timestamp: serverTimestamp(),
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
  } catch (error) {
    console.error('Failed to track performance:', error);
  }
};

// Helper to measure and track function execution time
export const measurePerformance = async <T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> => {
  const startTime = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - startTime;

    // Only track if duration is significant (> 100ms)
    if (duration > 100) {
      trackPerformance({
        name,
        value: Math.round(duration),
        unit: 'ms',
      });
    }

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    trackPerformance({
      name: `${name}_error`,
      value: Math.round(duration),
      unit: 'ms',
      context: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
};

// Track user sessions
let sessionStartTime: number | null = null;

export const startSession = (): void => {
  sessionStartTime = Date.now();
  trackEvent('session_start', {
    screenWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
    screenHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
    platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
  });
};

export const endSession = (): void => {
  if (sessionStartTime) {
    const duration = Date.now() - sessionStartTime;
    trackEvent('session_end', {
      durationMs: duration,
      durationMinutes: Math.round(duration / 60000),
    });
    sessionStartTime = null;
  }
};

// Track page/screen views
export const trackScreenView = (screenName: string): void => {
  trackEvent('screen_view', {
    screen: screenName,
  });
};

// Track user actions
export const trackAction = (
  action: string,
  category: string,
  label?: string,
  value?: number
): void => {
  trackEvent('user_action', {
    action,
    category,
    label,
    value,
  });
};

// Health check - call periodically to ensure app is working
export const reportHealthCheck = async (): Promise<void> => {
  try {
    await addDoc(collection(db, 'health_checks'), {
      userId: currentUserId,
      timestamp: serverTimestamp(),
      status: 'ok',
      memoryUsage: typeof performance !== 'undefined' && 'memory' in performance
        ? (performance as any).memory?.usedJSHeapSize
        : undefined,
    });
  } catch (error) {
    console.error('Health check failed:', error);
  }
};

// Initialize performance observer for web vitals
export const initPerformanceMonitoring = (): void => {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return;
  }

  try {
    // Observe Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        trackPerformance({
          name: 'LCP',
          value: Math.round(lastEntry.startTime),
          unit: 'ms',
        });
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // Observe First Input Delay
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach((entry: any) => {
        trackPerformance({
          name: 'FID',
          value: Math.round(entry.processingStart - entry.startTime),
          unit: 'ms',
        });
      });
    });
    fidObserver.observe({ type: 'first-input', buffered: true });

    // Observe Cumulative Layout Shift
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      });
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    // Report CLS when page unloads
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && clsValue > 0) {
          trackPerformance({
            name: 'CLS',
            value: Math.round(clsValue * 1000) / 1000, // 3 decimal places
            unit: 'count',
          });
        }
      });
    }
  } catch (error) {
    console.warn('Performance monitoring not supported:', error);
  }
};
