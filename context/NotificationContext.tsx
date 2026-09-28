import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  isNotificationSupported,
  requestNotificationPermission,
  getNotificationPermission,
  showMessageNotification,
  updateNotificationPreference,
} from '../services/notifications';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  isSupported: boolean;
  permission: NotificationPermission | null;
  isEnabled: boolean;
  requestPermission: () => Promise<boolean>;
  toggleNotifications: (enabled: boolean) => Promise<void>;
  notifyNewMessage: (senderName: string, content: string, messageId: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);

  // Check notification support on mount
  useEffect(() => {
    const supported = isNotificationSupported();
    setIsSupported(supported);

    if (supported) {
      setPermission(getNotificationPermission());
    }
  }, []);

  // Load user's notification preference
  useEffect(() => {
    if (user && permission === 'granted') {
      // Default to enabled if permission is granted
      setIsEnabled(true);
    }
  }, [user, permission]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      return false;
    }

    const result = await requestNotificationPermission();
    setPermission(result);

    if (result === 'granted') {
      setIsEnabled(true);
      if (user) {
        await updateNotificationPreference(user.id, true);
      }
      return true;
    }

    return false;
  }, [isSupported, user]);

  const toggleNotifications = useCallback(async (enabled: boolean): Promise<void> => {
    if (!isSupported) return;

    if (enabled && permission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return;
    }

    setIsEnabled(enabled);

    if (user) {
      await updateNotificationPreference(user.id, enabled);
    }
  }, [isSupported, permission, user, requestPermission]);

  const notifyNewMessage = useCallback((
    senderName: string,
    content: string,
    messageId: string
  ): void => {
    if (!isEnabled || permission !== 'granted') {
      return;
    }

    showMessageNotification(senderName, content, messageId);
  }, [isEnabled, permission]);

  const value: NotificationContextType = useMemo(
    () => ({
      isSupported,
      permission,
      isEnabled,
      requestPermission,
      toggleNotifications,
      notifyNewMessage,
    }),
    [isSupported, permission, isEnabled, requestPermission, toggleNotifications, notifyNewMessage]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
