import { useEffect, useState } from 'react';
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  AppleAuthenticationScope,
  isAvailableAsync,
  signInAsync,
} from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
  type Auth,
} from '@firebase/auth';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from './theme';

let googleSignInConfigured = false;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Sign-in failed. Please try again.';
}

async function signInWithGoogle(auth: Auth): Promise<void> {
  let googleSignIn: typeof import('@react-native-google-signin/google-signin');
  try {
    googleSignIn = await import('@react-native-google-signin/google-signin');
  } catch (error) {
    throw new Error(
      `Google Sign-In's native module could not load. Install the app's development build instead of Expo Go. ${messageFrom(error)}`,
    );
  }

  if (!googleSignInConfigured) {
    googleSignIn.GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
    googleSignInConfigured = true;
  }

  await googleSignIn.GoogleSignin.hasPlayServices({
    showPlayServicesUpdateDialog: true,
  });
  const response = await googleSignIn.GoogleSignin.signIn();
  if (response.type === 'cancelled') return;
  if (!response.data.idToken) {
    throw new Error('Google did not return an ID token. Check the Web OAuth client ID.');
  }
  await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(response.data.idToken),
  );
}

function GoogleSignInButton({
  auth,
  busy,
  setBusy,
  setError,
}: {
  auth: Auth;
  busy: boolean;
  setBusy: (busy: 'google' | 'apple' | null) => void;
  setError: (error: string | null) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      disabled={busy}
      onPress={() => {
        setError(null);
        setBusy('google');
        void signInWithGoogle(auth)
          .catch((signInError: unknown) => setError(messageFrom(signInError)))
          .finally(() => setBusy(null));
      }}
      style={({ pressed }) => [
        styles.googleButton,
        pressed && styles.pressed,
        busy && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      )}
    </Pressable>
  );
}

export function SignInScreen({ auth }: { auth: Auth }) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const webGoogleClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleConfigured =
    Boolean(webGoogleClientId) &&
    (Platform.OS === 'ios'
      ? Boolean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)
      : Platform.OS === 'android');

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    isAvailableAsync()
      .then(setAppleAvailable)
      .catch((availabilityError: unknown) => setError(messageFrom(availabilityError)));
  }, []);

  const setBusyState = (nextBusy: 'google' | 'apple' | null) => setBusy(nextBusy);

  const signInWithApple = async () => {
    setBusy('apple');
    setError(null);
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const result = await signInAsync({
        requestedScopes: [
          AppleAuthenticationScope.FULL_NAME,
          AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!result.identityToken) throw new Error('Apple did not return an identity token');
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: result.identityToken, rawNonce });
      const userCredential = await signInWithCredential(auth, credential);
      const fullName = [result.fullName?.givenName, result.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (fullName && !userCredential.user.displayName) {
        await updateProfile(userCredential.user, { displayName: fullName });
      }
    } catch (signInError) {
      if (
        signInError &&
        typeof signInError === 'object' &&
        'code' in signInError &&
        signInError.code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }
      setError(messageFrom(signInError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>FAMILY TODO</Text>
        <Text style={styles.title}>One list, shared by everyone.</Text>
        <Text style={styles.description}>
          Sign in to create a family space or join one with an invite code.
        </Text>

        {googleConfigured && (
          <GoogleSignInButton
            auth={auth}
            busy={busy !== null}
            setBusy={setBusyState}
            setError={setError}
          />
        )}

        {googleConfigured && (
          <Text style={styles.hint}>
            This Google sign-in button requires the app&apos;s development build; Expo Go does not
            include its native module.
          </Text>
        )}

        {appleAvailable && (
          <AppleAuthenticationButton
            buttonType={AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleButton}
            onPress={() => void signInWithApple()}
          />
        )}

        {!googleConfigured && (Platform.OS === 'ios' || Platform.OS === 'android') && (
          <Text style={styles.hint}>
            Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and, on iOS, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in
            .env to enable Google sign-in.
          </Text>
        )}
        {busy !== null && <ActivityIndicator color={colors.green} style={styles.loader} />}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Text style={styles.privacy}>
          Your family list is private to signed-in members of your family space.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.canvas,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: 28,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    marginTop: 16,
    color: colors.ink,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  description: {
    marginTop: 12,
    marginBottom: 28,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  googleButton: {
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleButtonText: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  appleButton: { width: '100%', height: 54, marginTop: 12 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  hint: { marginTop: 14, color: colors.muted, fontSize: 13, lineHeight: 19 },
  loader: { marginTop: 14 },
  error: { marginTop: 14, color: colors.danger, fontSize: 14, lineHeight: 20 },
  privacy: { marginTop: 24, color: colors.muted, fontSize: 12, lineHeight: 18 },
});
