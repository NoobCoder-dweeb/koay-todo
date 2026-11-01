import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { canAddFamilyMember } from '../domain/todos';

export interface Family {
  id: string;
  name: string;
  createdAt: number;
  inviteCode: string;
  memberIds: string[];
  memberNames: Record<string, string>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((memberName) => typeof memberName === 'string')
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseFamily(id: string, value: unknown): Family {
  if (!value || typeof value !== 'object') throw new Error('Family data is invalid');
  const family = value as Record<string, unknown>;
  if (
    typeof family.name !== 'string' ||
    family.name.length === 0 ||
    family.name.length > 60 ||
    typeof family.createdAt !== 'number' ||
    !Number.isInteger(family.createdAt) ||
    typeof family.inviteCode !== 'string' ||
    !/^[A-F0-9]{10}$/.test(family.inviteCode) ||
    !isStringArray(family.memberIds) ||
    !isStringRecord(family.memberNames)
  ) {
    throw new Error('Family data is invalid');
  }
  const memberIds = family.memberIds;
  const memberNames = family.memberNames;
  if (
    memberIds.length === 0 ||
    memberIds.length > 5 ||
    new Set(memberIds).size !== memberIds.length ||
    memberIds.some((memberId) => !(memberId in memberNames)) ||
    Object.keys(memberNames).length !== memberIds.length
  ) {
    throw new Error('Family member data is invalid');
  }
  return {
    id,
    name: family.name,
    createdAt: family.createdAt,
    inviteCode: family.inviteCode,
    memberIds,
    memberNames,
  };
}

function memberDisplayName(user: User): string {
  return user.displayName?.trim() || user.email?.split('@')[0] || 'Family member';
}

function createInviteCode(): string {
  return Crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
}

export async function ensureUserProfile(db: Firestore, user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  await runTransaction(db, async (transaction) => {
    const profile = await transaction.get(userRef);
    const profileData = {
      displayName: memberDisplayName(user),
    };
    if (!profile.exists()) {
      transaction.set(userRef, { ...profileData, familyId: null });
    } else {
      transaction.update(userRef, profileData);
    }
  });
}

export async function getFamilyForUser(db: Firestore, userId: string): Promise<Family | null> {
  const profile = await getDoc(doc(db, 'users', userId));
  if (!profile.exists()) throw new Error('Your account profile is missing');
  const familyId = profile.data().familyId;
  if (familyId === null) return null;
  if (typeof familyId !== 'string' || familyId.length === 0) {
    throw new Error('Your family membership is invalid');
  }
  const family = await getDoc(doc(db, 'families', familyId));
  if (!family.exists()) throw new Error('Your family space could not be found');
  return parseFamily(family.id, family.data());
}

export async function getCachedFamily(userId: string): Promise<Family | null | undefined> {
  const raw = await AsyncStorage.getItem(`family-profile:${userId}`);
  if (raw === null) return undefined;
  const value: unknown = JSON.parse(raw);
  if (value === null) return null;
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string'
  ) {
    throw new Error('Saved family data is invalid');
  }
  return parseFamily(value.id, value);
}

export async function cacheFamily(userId: string, family: Family | null): Promise<void> {
  await AsyncStorage.setItem(`family-profile:${userId}`, JSON.stringify(family));
}

export function subscribeToFamily(
  db: Firestore,
  familyId: string,
  onFamily: (family: Family) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'families', familyId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onError(new Error('Your family space could not be found'));
        return;
      }
      try {
        onFamily(parseFamily(snapshot.id, snapshot.data()));
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Family data is invalid'));
      }
    },
    onError,
  );
}

export async function createFamily(db: Firestore, user: User, name: string): Promise<Family> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('Family name cannot be empty');
  if (normalizedName.length > 60) throw new Error('Family name cannot exceed 60 characters');
  const familyRef = doc(collection(db, 'families'));
  const inviteCode = createInviteCode();
  const inviteRef = doc(db, 'invites', inviteCode);
  const profileRef = doc(db, 'users', user.uid);
  const displayName = memberDisplayName(user);
  const createdAt = Date.now();

  await runTransaction(db, async (transaction) => {
    const [profile, invite] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(inviteRef),
    ]);
    if (!profile.exists()) throw new Error('Your account profile is missing');
    if (profile.data().familyId) throw new Error('You already belong to a family');
    if (invite.exists()) throw new Error('Unable to create a unique invite code. Try again.');

    transaction.set(familyRef, {
      name: normalizedName,
      createdAt,
      inviteCode,
      memberIds: [user.uid],
      memberNames: { [user.uid]: displayName },
    });
    transaction.set(inviteRef, { familyId: familyRef.id, createdAt });
    transaction.update(profileRef, { familyId: familyRef.id });
  });

  return {
    id: familyRef.id,
    name: normalizedName,
    createdAt,
    inviteCode,
    memberIds: [user.uid],
    memberNames: { [user.uid]: displayName },
  };
}

export async function joinFamily(
  db: Firestore,
  user: User,
  rawInviteCode: string,
): Promise<Family> {
  const inviteCode = rawInviteCode.trim().toUpperCase();
  if (!/^[A-F0-9]{10}$/.test(inviteCode)) {
    throw new Error('Enter a valid 10-character invite code');
  }
  const inviteRef = doc(db, 'invites', inviteCode);
  const profileRef = doc(db, 'users', user.uid);
  let joinedFamily: Family | null = null;

  await runTransaction(db, async (transaction) => {
    const inviteSnapshot = await transaction.get(inviteRef);
    if (!inviteSnapshot.exists()) throw new Error('That invite code was not found');
    const inviteFamilyId = inviteSnapshot.data().familyId;
    if (typeof inviteFamilyId !== 'string' || !inviteFamilyId) {
      throw new Error('That invite code is invalid');
    }

    const familyRef = doc(db, 'families', inviteFamilyId);
    const [familySnapshot, profileSnapshot] = await Promise.all([
      transaction.get(familyRef),
      transaction.get(profileRef),
    ]);
    if (!familySnapshot.exists()) throw new Error('That family space no longer exists');
    if (!profileSnapshot.exists()) throw new Error('Your account profile is missing');
    const family = parseFamily(familySnapshot.id, familySnapshot.data());
    const currentFamilyId = profileSnapshot.data().familyId;
    if (currentFamilyId && currentFamilyId !== family.id) {
      throw new Error('You already belong to a family');
    }
    if (family.memberIds.includes(user.uid)) {
      if (currentFamilyId === null) {
        transaction.update(profileRef, { familyId: family.id });
      }
      joinedFamily = family;
      return;
    }
    if (!canAddFamilyMember(family.memberIds, user.uid)) {
      throw new Error('This family already has five members');
    }

    const memberIds = [...family.memberIds, user.uid];
    const memberNames = { ...family.memberNames, [user.uid]: memberDisplayName(user) };
    transaction.update(familyRef, { memberIds, memberNames });
    transaction.update(profileRef, { familyId: family.id });
    joinedFamily = { ...family, memberIds, memberNames };
  });

  if (!joinedFamily) throw new Error('Unable to join family');
  return joinedFamily;
}
