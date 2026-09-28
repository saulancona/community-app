import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getToken, onMessage, Unsubscribe } from 'firebase/messaging';
import { db, getMessagingInstance } from './firebase';

// VAPID key for FCM web push (generate in Firebase Console > Project Settings > Cloud Messaging)
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

// Check if browser supports notifications
export const isNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!isNotificationSupported()) {
    console.log('Notifications not supported');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission;
};

// Get current notification permission status
export const getNotificationPermission = (): NotificationPermission | null => {
  if (!isNotificationSupported()) {
    return null;
  }
  return Notification.permission;
};

// Show a local notification
export const showNotification = (
  title: string,
  options?: NotificationOptions
): Notification | null => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  const notification = new Notification(title, {
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    ...options,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  return notification;
};

// Show notification for new message
export const showMessageNotification = (
  senderName: string,
  messageContent: string,
  messageId: string
): Notification | null => {
  // Don't show notification if page is focused
  if (typeof document !== 'undefined' && document.hasFocus()) {
    return null;
  }

  return showNotification(`${senderName}`, {
    body: messageContent.length > 100
      ? messageContent.substring(0, 100) + '...'
      : messageContent,
    tag: messageId, // Prevents duplicate notifications for same message
    requireInteraction: false,
  } as NotificationOptions);
};

// Store notification preferences in user document
export const updateNotificationPreference = async (
  userId: string,
  enabled: boolean
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      notificationsEnabled: enabled,
    });
  } catch (error) {
    console.error('Error updating notification preference:', error);
    throw error;
  }
};

// Register Firebase messaging service worker for push notifications
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('Service workers not supported');
    return null;
  }

  try {
    // Use the Firebase messaging service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('Firebase messaging service worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
};

// Track notification token in Firestore (for future FCM integration)
export const saveNotificationToken = async (
  userId: string,
  token: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      notificationTokens: arrayUnion(token),
    });
  } catch (error) {
    console.error('Error saving notification token:', error);
    throw error;
  }
};

// Remove notification token
export const removeNotificationToken = async (
  userId: string,
  token: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      notificationTokens: arrayRemove(token),
    });
  } catch (error) {
    console.error('Error removing notification token:', error);
    throw error;
  }
};

// Initialize FCM and get token for push notifications
export const initializeFCM = async (
  userId: string
): Promise<string | null> => {
  try {
    // First, check if notifications are supported and permission is granted
    if (!isNotificationSupported()) {
      console.log('Notifications not supported');
      return null;
    }

    if (Notification.permission !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return null;
      }
    }

    // Get FCM messaging instance
    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.log('FCM not available');
      return null;
    }

    // Register service worker for receiving background messages
    const swRegistration = await registerServiceWorker();
    if (!swRegistration) {
      console.log('Service worker not registered, FCM may not work for background messages');
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration || undefined,
    });

    if (token) {
      // Save token to user's document
      await saveNotificationToken(userId, token);
      console.log('FCM token saved successfully');
      return token;
    } else {
      console.log('No FCM token received');
      return null;
    }
  } catch (error) {
    console.error('Error initializing FCM:', error);
    return null;
  }
};

// Listen for foreground messages (when app is open)
export const onForegroundMessage = (
  callback: (payload: { title: string; body: string; data?: Record<string, string> }) => void
): Unsubscribe | null => {
  // This is async but we need to return synchronously
  let unsubscribe: Unsubscribe | null = null;

  getMessagingInstance().then((messaging) => {
    if (!messaging) return;

    unsubscribe = onMessage(messaging, (payload) => {
      const notification = payload.notification;
      if (notification) {
        callback({
          title: notification.title || 'New Message',
          body: notification.body || '',
          data: payload.data,
        });
      }
    });
  });

  // Return a cleanup function that will work once unsubscribe is set
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
};

// Setup foreground message handler to show local notifications
export const setupForegroundNotifications = (): Unsubscribe | null => {
  return onForegroundMessage((payload) => {
    // Don't show notification if page is focused (user is looking at the chat)
    if (typeof document !== 'undefined' && document.hasFocus()) {
      return;
    }

    showNotification(payload.title, {
      body: payload.body,
      data: payload.data,
    });
  });
};
