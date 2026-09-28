import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/config';
import { getInitials } from '../../utils/formatters';

interface AvatarProps {
  name: string;
  imageUrl?: string;
  size?: 'small' | 'medium' | 'large';
  showOnlineStatus?: boolean;
  isOnline?: boolean;
}

const SIZES = {
  small: 32,
  medium: 48,
  large: 72,
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  imageUrl,
  size = 'medium',
  showOnlineStatus = false,
  isOnline = false,
}) => {
  const dimension = SIZES[size];
  const fontSize = dimension * 0.4;
  const statusSize = dimension * 0.3;

  const onlineStatusText = showOnlineStatus ? (isOnline ? ', online' : ', offline') : '';
  const accessibilityLabelText = `${name}'s avatar${onlineStatusText}`;

  return (
    <View
      style={[styles.container, { width: dimension, height: dimension }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabelText}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[
            styles.image,
            { width: dimension, height: dimension, borderRadius: dimension / 2 },
          ]}
          accessibilityElementsHidden
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: dimension, height: dimension, borderRadius: dimension / 2 },
          ]}
          accessibilityElementsHidden
        >
          <Text style={[styles.initials, { fontSize }]}>{getInitials(name)}</Text>
        </View>
      )}
      {showOnlineStatus && (
        <View
          style={[
            styles.statusIndicator,
            {
              width: statusSize,
              height: statusSize,
              borderRadius: statusSize / 2,
              backgroundColor: isOnline ? COLORS.online : COLORS.offline,
            },
          ]}
          accessibilityElementsHidden
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    backgroundColor: COLORS.border,
  },
  placeholder: {
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: COLORS.surface,
    fontWeight: '600',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
});
