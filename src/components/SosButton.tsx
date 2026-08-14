/**
 * SosButton — large, hard-to-miss SOS trigger button.
 * Requires a long-press to prevent accidental activation.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '../theme';

interface Props {
  onActivate: () => void;
  isActive?: boolean;
}

const HOLD_DURATION = 1500; // ms to hold before activation

export function SosButton({ onActivate, isActive = false }: Props) {
  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animation = useRef<Animated.CompositeAnimation | null>(null);

  const startHold = useCallback(() => {
    setHolding(true);
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION,
      useNativeDriver: false,
    });
    animation.current.start(({ finished }) => {
      if (finished) {
        onActivate();
        setHolding(false);
        progress.setValue(0);
      }
    });
  }, [onActivate, progress]);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    animation.current?.stop();
    setHolding(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const ringScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });
  const ringOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.6, 0],
  });

  return (
    <View style={styles.wrapper}>
      {/* Pulsing ring during hold */}
      <Animated.View
        style={[
          styles.ring,
          {
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          },
        ]}
      />

      <Pressable
        onPressIn={startHold}
        onPressOut={cancelHold}
        style={({ pressed }) => [
          styles.button,
          isActive && styles.buttonActive,
          pressed && styles.buttonPressed,
          Shadow.danger,
        ]}
        accessibilityRole="button"
        accessibilityLabel="SOS Emergency Button — hold to activate"
      >
        <Text style={styles.label}>SOS</Text>
        <Text style={styles.hint}>
          {isActive ? 'ALERT ACTIVE' : holding ? 'HOLD...' : 'HOLD TO SEND'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: Colors.danger,
  },
  button: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.dangerMuted,
    borderWidth: 3,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: Colors.danger,
  },
  buttonPressed: {
    backgroundColor: Colors.dangerDim,
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontSize: Typography.size.display,
    fontWeight: Typography.weight.heavy,
    color: Colors.danger,
    letterSpacing: 4,
  },
  hint: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.textSecondary,
    letterSpacing: 2,
    marginTop: 4,
  },
});
