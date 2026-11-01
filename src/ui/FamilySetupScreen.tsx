import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from './theme';

interface FamilySetupScreenProps {
  busy: boolean;
  error: string | null;
  onCreate: (name: string) => Promise<void>;
  onJoin: (inviteCode: string) => Promise<void>;
}

function ActionButton({
  label,
  onPress,
  disabled,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

export function FamilySetupScreen({
  busy,
  error,
  onCreate,
  onJoin,
}: FamilySetupScreenProps) {
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>YOUR FAMILY SPACE</Text>
        <Text style={styles.title}>Make room for less forgetting.</Text>
        <Text style={styles.description}>
          Start a shared family list, or join one with the code someone sent you.
          A family can have up to five members.
        </Text>

        <Text style={styles.label}>Create a family</Text>
        <TextInput
          accessibilityLabel="Family name"
          autoCapitalize="words"
          maxLength={60}
          onChangeText={setFamilyName}
          placeholder="e.g. The Parkers"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          value={familyName}
        />
        <ActionButton
          disabled={busy || !familyName.trim()}
          label="Create family"
          onPress={() => void onCreate(familyName)}
        />

        <View style={styles.divider} />

        <Text style={styles.label}>Join a family</Text>
        <TextInput
          accessibilityLabel="Family invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          onChangeText={setInviteCode}
          placeholder="10-character invite code"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.codeInput]}
          value={inviteCode}
        />
        <ActionButton
          disabled={busy || inviteCode.trim().length !== 10}
          label="Join family"
          onPress={() => void onJoin(inviteCode)}
          secondary
        />
        {busy && <ActivityIndicator color={colors.green} style={styles.loader} />}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.canvas,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: 26,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
  eyebrow: { color: colors.green, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 14, color: colors.ink, fontSize: 29, fontWeight: '800', lineHeight: 36 },
  description: { marginTop: 10, marginBottom: 24, color: colors.muted, fontSize: 15, lineHeight: 22 },
  label: { marginBottom: 8, color: colors.ink, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 52,
    marginBottom: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    color: colors.ink,
    fontSize: 16,
    backgroundColor: colors.white,
  },
  codeInput: { letterSpacing: 2, fontWeight: '700' },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.green,
  },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.green },
  secondaryButtonText: { color: colors.green },
  divider: { height: 1, marginVertical: 22, backgroundColor: colors.border },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.48 },
  loader: { marginTop: 14 },
  error: { marginTop: 12, color: colors.danger, fontSize: 14, lineHeight: 20 },
});
