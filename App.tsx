import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { onAuthStateChanged, signOut, type Auth, type User } from '@firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { FamilySetupScreen } from './src/ui/FamilySetupScreen';
import { SignInScreen } from './src/ui/SignInScreen';
import { TodoScreen } from './src/ui/TodoScreen';
import { colors } from './src/ui/theme';
import { auth, db, isFirebaseConfigured } from './src/services/firebase';
import {
  createFamily,
  cacheFamily,
  ensureUserProfile,
  getCachedFamily,
  getFamilyForUser,
  joinFamily,
  subscribeToFamily,
  type Family,
} from './src/services/families';

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function ConfigurationScreen() {
  return (
    <View style={styles.centered}>
      <Text style={styles.eyebrow}>FAMILY TODO</Text>
      <Text style={styles.title}>Connect your Firebase project</Text>
      <Text style={styles.description}>
        Copy .env.example to .env and fill in the Firebase project values. Configure Google
        sign-in credentials for the providers you want to enable, then restart Expo.
      </Text>
    </View>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.green} />
      <Text style={styles.description}>{message}</Text>
    </View>
  );
}

function AuthenticatedApp({ activeAuth, firestore }: { activeAuth: Auth; firestore: Firestore }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [family, setFamily] = useState<Family | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(
      activeAuth,
      (signedInUser) => {
        setUser(signedInUser);
        setFamily(null);
        setFamilyError(null);
        setAuthLoading(false);
      },
      (error) => {
        setFamilyError(messageFrom(error));
        setAuthLoading(false);
      },
    );
  }, [activeAuth]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setFamilyLoading(true);
    setFamilyError(null);
    void (async () => {
      const cachedFamily = await getCachedFamily(user.uid);
      if (active && cachedFamily !== undefined) {
        setFamily(cachedFamily);
        setFamilyLoading(false);
      }

      const network = await NetInfo.fetch();
      const online = network.isConnected === true && network.isInternetReachable !== false;
      if (!online) {
        if (cachedFamily === undefined) {
          setFamilyError('Connect to the internet to open your family space.');
        }
        return;
      }

      await ensureUserProfile(firestore, user);
      const loadedFamily = await getFamilyForUser(firestore, user.uid);
      if (active) {
        setFamily(loadedFamily);
        await cacheFamily(user.uid, loadedFamily);
      }
    })()
      .catch((error: unknown) => {
        if (active) setFamilyError(messageFrom(error));
      })
      .finally(() => {
        if (active) setFamilyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [firestore, user]);

  useEffect(() => {
    if (!family) return;
    return subscribeToFamily(
      firestore,
      family.id,
      (nextFamily) => {
        setFamily(nextFamily);
        setFamilyError(null);
        if (user) {
          void cacheFamily(user.uid, nextFamily).catch((error: unknown) =>
            setFamilyError(messageFrom(error)),
          );
        }
      },
      (error) => setFamilyError(messageFrom(error)),
    );
  }, [family?.id, firestore, user]);

  const performFamilyAction = async (action: () => Promise<Family>) => {
    setFamilyError(null);
    setFamilyBusy(true);
    try {
      const nextFamily = await action();
      setFamily(nextFamily);
      if (user) await cacheFamily(user.uid, nextFamily);
    } catch (error) {
      setFamilyError(messageFrom(error));
    } finally {
      setFamilyBusy(false);
    }
  };

  if (authLoading) return <LoadingScreen message="Checking your sign-in…" />;
  if (!user) return <SignInScreen auth={activeAuth} />;
  if (familyLoading) return <LoadingScreen message="Opening your family space…" />;

  if (!family) {
    return (
      <FamilySetupScreen
        busy={familyBusy}
        error={familyError}
        onCreate={(name) => performFamilyAction(() => createFamily(firestore, user, name))}
        onJoin={(inviteCode) => performFamilyAction(() => joinFamily(firestore, user, inviteCode))}
      />
    );
  }

  return (
    <TodoScreen
      db={firestore}
      family={family}
      familyLoadError={familyError}
      onSignOut={() => {
        setFamilyError(null);
        void signOut(activeAuth).catch((error: unknown) => setFamilyError(messageFrom(error)));
      }}
      user={user}
    />
  );
}

export default function App() {
  if (!isFirebaseConfigured || !auth || !db) return <ConfigurationScreen />;
  return (
    <>
      <StatusBar style="dark" />
      <AuthenticatedApp activeAuth={auth} firestore={db} />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: colors.canvas,
  },
  eyebrow: { color: colors.green, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 14, color: colors.ink, fontSize: 29, fontWeight: '800', lineHeight: 36 },
  description: { marginTop: 12, color: colors.muted, fontSize: 15, lineHeight: 23 },
});
