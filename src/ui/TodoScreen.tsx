import { Picker } from '@react-native-picker/picker';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { User } from '@firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { LocalTodoStore, type TodoStoreSnapshot } from '../domain/todoStore';
import type { Todo } from '../domain/todos';
import { Family } from '../services/families';
import { AsyncStorageTodoCache, createFirestoreTodoCloud } from '../services/todoPersistence';
import { colors } from './theme';

const EMPTY_SNAPSHOT: TodoStoreSnapshot = {
  todos: [],
  pendingCount: 0,
  syncing: false,
  syncError: null,
  online: true,
};

interface TodoScreenProps {
  db: Firestore;
  user: User;
  family: Family;
  familyLoadError: string | null;
  onSignOut: () => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function MemberChips({ family }: { family: Family }) {
  return (
    <View style={styles.memberRow} accessibilityLabel="Family members">
      {family.memberIds.map((memberId) => (
        <View key={memberId} style={styles.memberChip}>
          <View style={styles.memberDot} />
          <Text style={styles.memberText} numberOfLines={1}>
            {family.memberNames[memberId] ?? 'Family member'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TodoRow({
  todo,
  family,
  onComplete,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  family: Family;
  onComplete: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  const assignee = todo.assigneeId ? family.memberNames[todo.assigneeId] ?? 'Family member' : null;

  return (
    <View style={styles.todoRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${todo.completed ? 'Mark incomplete' : 'Complete'} ${todo.title}`}
        accessibilityState={{ checked: todo.completed }}
        onPress={() => onComplete(todo)}
        style={[styles.checkbox, todo.completed && styles.checkboxChecked]}
      >
        {todo.completed && <Text style={styles.checkmark}>✓</Text>}
      </Pressable>
      <View style={styles.todoCopy}>
        <Text style={[styles.todoTitle, todo.completed && styles.todoTitleCompleted]}>
          {todo.title}
        </Text>
        <Text style={styles.assignee}>{assignee ? `For ${assignee}` : 'Unassigned'}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${todo.title}`}
        onPress={() => onEdit(todo)}
        style={styles.rowAction}
      >
        <Text style={styles.rowActionText}>Edit</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${todo.title}`}
        onPress={() => onDelete(todo)}
        style={styles.rowAction}
      >
        <Text style={[styles.rowActionText, styles.deleteText]}>Delete</Text>
      </Pressable>
    </View>
  );
}

function EditTodoModal({
  todo,
  family,
  onClose,
  onSave,
}: {
  todo: Todo | null;
  family: Family;
  onClose: () => void;
  onSave: (title: string, assigneeId: string | null) => void;
}) {
  const [title, setTitle] = useState(todo?.title ?? '');
  const [assigneeId, setAssigneeId] = useState(todo?.assigneeId ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(todo?.title ?? '');
    setAssigneeId(todo?.assigneeId ?? '');
    setError(null);
  }, [todo]);

  return (
    <Modal animationType="slide" transparent visible={todo !== null} onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit todo</Text>
          <Text style={styles.fieldLabel}>What needs doing?</Text>
          <TextInput
            accessibilityLabel="Todo title"
            autoFocus
            maxLength={120}
            onChangeText={setTitle}
            onSubmitEditing={() => {
              if (!title.trim()) setError('Todo title cannot be empty');
              else onSave(title, assigneeId || null);
            }}
            returnKeyType="done"
            style={styles.input}
            value={title}
          />
          <Text style={styles.fieldLabel}>Assign to</Text>
          <View style={styles.pickerWrap}>
            <Picker
              accessibilityLabel="Assign todo to a family member"
              onValueChange={(value: string) => setAssigneeId(value)}
              selectedValue={assigneeId}
              style={styles.picker}
            >
              <Picker.Item label="Unassigned" value="" />
              {family.memberIds.map((memberId) => (
                <Picker.Item
                  key={memberId}
                  label={family.memberNames[memberId] ?? 'Family member'}
                  value={memberId}
                />
              ))}
            </Picker>
          </View>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (!title.trim()) setError('Todo title cannot be empty');
                else onSave(title, assigneeId || null);
              }}
              style={styles.saveButton}
            >
              <Text style={styles.saveText}>Save changes</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function TodoScreen({
  db,
  user,
  family,
  familyLoadError,
  onSignOut,
}: TodoScreenProps) {
  const storeRef = useRef<LocalTodoStore | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const store = new LocalTodoStore(
      new AsyncStorageTodoCache(`family-todos:${user.uid}:${family.id}`),
      createFirestoreTodoCloud(db, family.id),
    );
    storeRef.current = store;
    const unsubscribeStore = store.subscribe(setSnapshot);
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      void store.setOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    void NetInfo.fetch()
      .then((state) => store.setOnline(state.isConnected === true && state.isInternetReachable !== false))
      .then(() => store.start())
      .then(() => setLoading(false))
      .catch((error: unknown) => {
        setActionError(getErrorMessage(error));
        setLoading(false);
      });

    return () => {
      unsubscribeNetwork();
      unsubscribeStore();
      store.stop();
      storeRef.current = null;
    };
  }, [db, family.id, user.uid]);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    setWorking(true);
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const addTodo = () => {
    const title = newTitle;
    if (!title.trim()) {
      setActionError('Todo title cannot be empty');
      return;
    }
    void runAction(async () => {
      await storeRef.current?.addTodo(title, user.uid);
      setNewTitle((current) => (current === title ? '' : current));
    });
  };

  const editTodo = (todo: Todo, title: string, assigneeId: string | null) => {
    setEditingTodo(null);
    void runAction(async () => {
      await storeRef.current?.editTodo(
        todo.id,
        { title, assigneeId },
        user.uid,
      );
    });
  };

  const completeTodo = (todo: Todo) => {
    void runAction(async () => {
      await storeRef.current?.setTodoCompleted(todo.id, !todo.completed, user.uid);
    });
  };

  const confirmDelete = (todo: Todo) => {
    Alert.alert('Delete this todo?', todo.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void runAction(async () => {
            await storeRef.current?.removeTodo(todo.id, user.uid);
          });
        },
      },
    ]);
  };

  const shareInvite = async () => {
    setActionError(null);
    try {
      await Share.share({
        message: `Join ${family.name} on Family Todo. Enter this invite code in the app: ${family.inviteCode}`,
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const visibleTodos = snapshot.todos.filter((todo) => todo.deletedAt === null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.eyebrow}>FAMILY TODO</Text>
              <Text style={styles.heading} numberOfLines={1}>{family.name}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
          <MemberChips family={family} />
          <View style={styles.inviteRow}>
            <Text style={styles.inviteLabel}>Invite code</Text>
            <Text selectable style={styles.inviteCode}>{family.inviteCode}</Text>
            <Pressable accessibilityRole="button" onPress={() => void shareInvite()}>
              <Text style={styles.shareText}>Share</Text>
            </Pressable>
          </View>
          <View style={[styles.syncPill, !snapshot.online && styles.offlinePill]}>
            <View style={[styles.syncDot, !snapshot.online && styles.offlineDot]} />
            <Text style={[styles.syncText, !snapshot.online && styles.offlineText]}>
              {!snapshot.online
                ? 'Offline · changes saved on this device'
                : snapshot.syncing
                  ? `Syncing ${snapshot.pendingCount} ${snapshot.pendingCount === 1 ? 'change' : 'changes'}`
                  : snapshot.pendingCount > 0
                    ? `${snapshot.pendingCount} ${snapshot.pendingCount === 1 ? 'change' : 'changes'} waiting to sync`
                    : 'All changes synced'}
            </Text>
          </View>
          {familyLoadError && (
            <Text accessibilityRole="alert" style={styles.syncError}>
              Family sync issue: {familyLoadError}
            </Text>
          )}
          {snapshot.syncError && (
            <Text accessibilityRole="alert" style={styles.syncError}>
              Sync issue: {snapshot.syncError}. Your changes remain saved on this device.
            </Text>
          )}
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.green} />
            <Text style={styles.loadingText}>Opening your family list…</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={visibleTodos}
            keyExtractor={(todo) => todo.id}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>✓</Text>
                <Text style={styles.emptyTitle}>A little more breathing room.</Text>
                <Text style={styles.emptyCopy}>Add the first todo your family can share.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TodoRow
                family={family}
                onComplete={completeTodo}
                onDelete={confirmDelete}
                onEdit={setEditingTodo}
                todo={item}
              />
            )}
          />
        )}

        <View style={styles.composer}>
          {actionError && <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>}
          <View style={styles.composerRow}>
            <TextInput
              accessibilityLabel="New todo"
              editable={!working}
              maxLength={120}
              onChangeText={setNewTitle}
              onSubmitEditing={addTodo}
              placeholder="Add something to the list…"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              style={styles.newTodoInput}
              value={newTitle}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add todo"
              disabled={working || !newTitle.trim()}
              onPress={addTodo}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.pressed,
                (working || !newTitle.trim()) && styles.disabled,
              ]}
            >
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.accountText} numberOfLines={1}>{user.email ?? user.displayName}</Text>
        </View>
      </KeyboardAvoidingView>
      <EditTodoModal
        family={family}
        onClose={() => setEditingTodo(null)}
        onSave={(title, assigneeId) => {
          if (editingTodo) editTodo(editingTodo, title, assigneeId);
        }}
        todo={editingTodo}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleWrap: { flex: 1, marginRight: 12 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  heading: { marginTop: 5, color: colors.ink, fontSize: 28, fontWeight: '800' },
  signOut: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surface },
  signOutText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 7 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  memberDot: { width: 7, height: 7, marginRight: 7, borderRadius: 4, backgroundColor: colors.green },
  memberText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  inviteLabel: { color: colors.muted, fontSize: 12 },
  inviteCode: { marginLeft: 8, color: colors.ink, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  shareText: { marginLeft: 12, color: colors.green, fontSize: 12, fontWeight: '700' },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.greenSoft,
  },
  offlinePill: { backgroundColor: colors.warningSoft },
  syncDot: { width: 7, height: 7, marginRight: 7, borderRadius: 4, backgroundColor: colors.green },
  offlineDot: { backgroundColor: colors.warning },
  syncText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  offlineText: { color: colors.warning },
  syncError: { marginTop: 7, color: colors.danger, fontSize: 12, lineHeight: 17 },
  listContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 18 },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  checkbox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 9,
  },
  checkboxChecked: { borderColor: colors.green, backgroundColor: colors.green },
  checkmark: { color: colors.white, fontSize: 16, fontWeight: '800' },
  todoCopy: { flex: 1, marginHorizontal: 11 },
  todoTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  todoTitleCompleted: { color: colors.muted, textDecorationLine: 'line-through' },
  assignee: { marginTop: 4, color: colors.muted, fontSize: 11 },
  rowAction: { paddingHorizontal: 5, paddingVertical: 8 },
  rowActionText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  deleteText: { color: colors.danger },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyIcon: {
    width: 54,
    height: 54,
    paddingTop: 9,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.greenSoft,
    color: colors.green,
    fontSize: 27,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyTitle: { marginTop: 16, color: colors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { marginTop: 7, color: colors.muted, fontSize: 14, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: colors.muted, fontSize: 14 },
  composer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: colors.canvas },
  composerRow: { flexDirection: 'row', alignItems: 'center' },
  newTodoInput: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 17,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  addButton: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
    borderRadius: 17,
    backgroundColor: colors.green,
  },
  addButtonText: { color: colors.white, fontSize: 31, fontWeight: '400', lineHeight: 34 },
  accountText: { marginTop: 8, color: colors.muted, fontSize: 11 },
  error: { marginBottom: 8, color: colors.danger, fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  modalCard: { padding: 22, paddingBottom: 30, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  modalTitle: { marginBottom: 20, color: colors.ink, fontSize: 22, fontWeight: '800' },
  fieldLabel: { marginBottom: 7, color: colors.ink, fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.ink,
    fontSize: 15,
  },
  pickerWrap: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  picker: { color: colors.ink },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 10 },
  cancelButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  cancelText: { color: colors.muted, fontWeight: '700' },
  saveButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.green },
  saveText: { color: colors.white, fontWeight: '700' },
});
