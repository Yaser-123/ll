/**
 * Root layout — sets up Expo Router tab navigation and bootstraps the app.
 *
 * Initialises device identity and loads all persistent stores on first render.
 * All tabs share the same dark theme.
 */

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, Typography } from '../src/theme';
import { useDeviceStore } from '../src/store/useDeviceStore';
import { usePeerStore } from '../src/store/usePeerStore';
import { useMessageStore } from '../src/store/useMessageStore';
import { useSosStore } from '../src/store/useSosStore';
import { useLocationStore } from '../src/store/useLocationStore';
import { transportManager } from '../src/network/TransportManager';
import { createBleTransport } from '../src/network/BleTransport';


function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45, color: Colors.primary }}>
      {symbol}
    </Text>
  );
}

export default function RootLayout() {
  const { initDevice, isInitialised, updateNetworkStatus } = useDeviceStore();
  const { loadPeers } = usePeerStore();
  const { loadMessages } = useMessageStore();
  const { loadEvents } = useSosStore();
  const { loadLocations } = useLocationStore();

  useEffect(() => {
    // Bootstrap all stores and the transport layer
    async function bootstrap() {
      await Promise.all([
        initDevice(),
        loadPeers(),
        loadMessages(),
        loadEvents(),
        loadLocations(),
      ]);

      // Register real BLE transport AFTER identity is initialised so we
      // have a stable deviceId and displayName to advertise.
      const { deviceId, displayName } = useDeviceStore.getState();
      transportManager.registerTransport(
        createBleTransport(deviceId, displayName)
      );

      // Start all registered transports and wire their events to stores.
      // All store mutation methods are safe to call outside of React components
      // via Zustand's getState() pattern.
      await transportManager.start({
        onPeerDiscovered: (peer) => {
          usePeerStore.getState().upsertPeer(peer);
        },
        onPeerLost: (peerId) => {
          usePeerStore.getState().markOffline(peerId);
        },
        onMessageReceived: (message) => {
          useMessageStore.getState().addMessage(message);
        },
        onSosReceived: (sos) => {
          useSosStore.getState().addEvent(sos);
        },
        onLocationReceived: (location) => {
          useLocationStore.getState().upsertLocation(location);
        },
        onError: (err) => console.error('[Transport error]', err.message),
      });

      updateNetworkStatus(transportManager.getNetworkStatus());

      const interval = setInterval(() => {
        updateNetworkStatus(transportManager.getNetworkStatus());
      }, 5000);

      return () => {
        clearInterval(interval);
        transportManager.stop();
      };
    }

    bootstrap();
  }, []);


  if (!isInitialised) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <Text style={styles.splashTitle}>LIFELINE</Text>
        <Text style={styles.splashSub}>Initialising…</Text>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textTertiary,
          tabBarLabelStyle: styles.tabLabel,
          headerStyle: styles.header,
          headerTitleStyle: styles.headerTitle,
          headerTintColor: Colors.textPrimary,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'HOME',
            headerTitle: 'LIFELINE',
            tabBarIcon: ({ focused }) => <TabIcon symbol="⌂" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'CHAT',
            tabBarIcon: ({ focused }) => <TabIcon symbol="◈" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="sos"
          options={{
            title: 'SOS',
            tabBarIcon: ({ focused }) => (
              <View style={[styles.sosTabIcon, focused && styles.sosTabIconActive]}>
                <Text style={{ fontSize: 16, color: Colors.danger, fontWeight: '800' }}>!</Text>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'MAP',
            tabBarIcon: ({ focused }) => <TabIcon symbol="◉" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="ai"
          options={{
            title: 'AI',
            tabBarIcon: ({ focused }) => <TabIcon symbol="⬡" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'SETTINGS',
            tabBarIcon: ({ focused }) => <TabIcon symbol="⚙" focused={focused} />,
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 8,
  },
  splashSub: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 8,
    letterSpacing: 2,
  },
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.surfaceBorder,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
  },
  header: {
    backgroundColor: Colors.surface,
    borderBottomColor: Colors.surfaceBorder,
    borderBottomWidth: 1,
  },
  headerTitle: {
    color: Colors.primary,
    fontSize: Typography.size.lg,
    fontWeight: '800',
    letterSpacing: 4,
  },
  sosTabIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosTabIconActive: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerMuted,
  },
});
