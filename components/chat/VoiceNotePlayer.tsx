import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { COLORS, SPACING } from '../../constants/config';

interface VoiceNotePlayerProps {
  audioUrl: string;
  duration?: number; // Duration in milliseconds
  isOwnMessage: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  audioUrl,
  duration = 0,
  isOwnMessage,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);

  // Native (expo-av) refs
  const soundRef = useRef<Audio.Sound | null>(null);

  // Web (HTMLAudioElement) refs
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up on unmount (both platforms)
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
      if (htmlAudioRef.current) {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.src = '';
        htmlAudioRef.current = null;
      }
    };
  }, []);

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setIsPlaying(status.isPlaying);
      if (status.durationMillis) {
        setTotalDuration(status.durationMillis);
      }
      // Reset when playback finishes
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  }, []);

  const loadAndPlayWeb = async () => {
    try {
      setIsLoading(true);
      let el = htmlAudioRef.current;
      if (!el) {
        el = new window.Audio(audioUrl);
        el.preload = 'metadata';
        el.addEventListener('loadedmetadata', () => {
          if (el && isFinite(el.duration) && el.duration > 0) {
            setTotalDuration(el.duration * 1000);
          }
        });
        el.addEventListener('timeupdate', () => {
          if (el) setPosition(el.currentTime * 1000);
        });
        el.addEventListener('ended', () => {
          setIsPlaying(false);
          setPosition(0);
        });
        el.addEventListener('pause', () => setIsPlaying(false));
        el.addEventListener('play', () => setIsPlaying(true));
        htmlAudioRef.current = el;
      }
      await el.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing voice note (web):', error);
    } finally {
      setIsLoading(false);
    }
  };

  const pauseWeb = () => {
    if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const loadAndPlayNative = async () => {
    try {
      setIsLoading(true);

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      if (soundRef.current) {
        await soundRef.current.playFromPositionAsync(position);
        setIsPlaying(true);
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        soundRef.current = newSound;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error playing voice note (native):', error);
    } finally {
      setIsLoading(false);
    }
  };

  const pauseNative = async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    }
  };

  const handlePlayPause = () => {
    if (Platform.OS === 'web') {
      if (isPlaying) pauseWeb();
      else loadAndPlayWeb();
    } else {
      if (isPlaying) pauseNative();
      else loadAndPlayNative();
    }
  };

  const progress = totalDuration > 0 ? (position / totalDuration) * 100 : 0;

  const buttonColor = isOwnMessage ? COLORS.surface : COLORS.primary;
  const textColor = isOwnMessage ? COLORS.surface : COLORS.text;
  const trackColor = isOwnMessage ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)';
  const progressColor = isOwnMessage ? COLORS.surface : COLORS.primary;

  return (
    <View style={styles.container}>
      {/* Play/Pause Button */}
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: buttonColor }]}
        onPress={handlePlayPause}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isOwnMessage ? COLORS.primary : COLORS.surface} />
        ) : isPlaying ? (
          <PauseIcon color={isOwnMessage ? COLORS.primary : COLORS.surface} />
        ) : (
          <PlayIcon color={isOwnMessage ? COLORS.primary : COLORS.surface} />
        )}
      </TouchableOpacity>

      {/* Waveform/Progress */}
      <View style={styles.waveformContainer}>
        <View style={[styles.waveformTrack, { backgroundColor: trackColor }]}>
          <View
            style={[
              styles.waveformProgress,
              { width: `${progress}%`, backgroundColor: progressColor },
            ]}
          />
          {/* Waveform bars (static visual representation) */}
          <View style={styles.waveformBars}>
            {Array.from({ length: 20 }).map((_, index) => {
              const height = 4 + Math.sin(index * 0.8) * 8 + Math.random() * 4;
              const isActive = (index / 20) * 100 <= progress;
              return (
                <View
                  key={index}
                  style={[
                    styles.waveformBar,
                    {
                      height,
                      backgroundColor: isActive ? progressColor : trackColor,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>

        {/* Duration */}
        <Text style={[styles.duration, { color: textColor }]}>
          {isPlaying || position > 0
            ? formatDuration(position)
            : formatDuration(totalDuration)}
        </Text>
      </View>
    </View>
  );
};

// Play icon
const PlayIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.playContainer}>
    <View
      style={[
        iconStyles.playTriangle,
        {
          borderLeftColor: color,
        },
      ]}
    />
  </View>
);

// Pause icon
const PauseIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.pauseContainer}>
    <View style={[iconStyles.pauseBar, { backgroundColor: color }]} />
    <View style={[iconStyles.pauseBar, { backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 180,
    maxWidth: 250,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  waveformContainer: {
    flex: 1,
  },
  waveformTrack: {
    height: 24,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  waveformProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    height: '100%',
  },
  waveformBar: {
    width: 2,
    borderRadius: 1,
  },
  duration: {
    fontSize: 11,
    marginTop: 4,
  },
});

const iconStyles = StyleSheet.create({
  playContainer: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 3,
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  pauseContainer: {
    flexDirection: 'row',
    width: 12,
    height: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pauseBar: {
    width: 4,
    height: 14,
    borderRadius: 1,
  },
});
