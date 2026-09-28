import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { RoomProvider } from '../context/RoomContext';
import { ChatProvider } from '../context/ChatContext';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { IframeMobileLauncher } from '../components/common/IframeMobileLauncher';
import { TabletFrame } from '../components/common/TabletFrame';
import { TermsGate } from '../components/common/TermsGate';
import { COLORS } from '../constants/config';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <IframeMobileLauncher>
      <TabletFrame>
      <TermsGate>
      <AuthProvider>
        <RoomProvider>
          <ChatProvider>
          <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: COLORS.primary,
            },
            headerTintColor: COLORS.surface,
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="(auth)/login"
            options={{
              title: 'Sign In',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="(auth)/verify"
            options={{
              title: 'Verify Code',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="(auth)/setup"
            options={{
              title: 'Set Up Profile',
              headerBackVisible: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="(main)/welcome"
            options={{
              headerShown: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="(main)/rooms"
            options={{
              headerShown: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="(main)/chat"
            options={{
              title: 'Northstar Coaching',
              headerBackVisible: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="(main)/members"
            options={{
              title: 'Members',
            }}
          />
          <Stack.Screen
            name="(main)/settings"
            options={{
              title: 'Settings',
            }}
          />
          <Stack.Screen
            name="(main)/terms"
            options={{
              title: 'Terms & Conditions',
            }}
          />
          <Stack.Screen
            name="(admin)/manage"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="(admin)/menu"
            options={{
              title: 'Library',
            }}
          />
          <Stack.Screen
            name="invite/[code]"
            options={{
              title: 'Join Community',
              headerShown: false,
            }}
            />
          </Stack>
          </ChatProvider>
        </RoomProvider>
      </AuthProvider>
      </TermsGate>
      </TabletFrame>
      </IframeMobileLauncher>
    </ErrorBoundary>
  );
}
