import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import type { Todo } from '../domain/todos';
import type { StoredTodoState, TodoCache, TodoCloud } from '../domain/todoStore';

function isTodo(value: unknown): value is Todo {
  if (!value || typeof value !== 'object') return false;
  const todo = value as Record<string, unknown>;
  return (
    typeof todo.id === 'string' &&
    typeof todo.title === 'string' &&
    typeof todo.completed === 'boolean' &&
    (typeof todo.assigneeId === 'string' || todo.assigneeId === null) &&
    typeof todo.createdAt === 'number' &&
    Number.isInteger(todo.createdAt) &&
    typeof todo.updatedAt === 'number' &&
    Number.isFinite(todo.updatedAt) &&
    typeof todo.revision === 'number' &&
    Number.isInteger(todo.revision) &&
    todo.revision >= 0 &&
    typeof todo.updatedBy === 'string' &&
    (typeof todo.deletedAt === 'number' || todo.deletedAt === null)
  );
}

function parseStoredState(value: unknown): StoredTodoState {
  if (!value || typeof value !== 'object') throw new Error('Saved todo data is invalid');
  const state = value as Record<string, unknown>;
  if (
    !Array.isArray(state.todos) ||
    !Array.isArray(state.pending) ||
    !state.todos.every(isTodo) ||
    !state.pending.every(isTodo)
  ) {
    throw new Error('Saved todo data is invalid');
  }
  return { todos: state.todos, pending: state.pending };
}

export class AsyncStorageTodoCache implements TodoCache {
  constructor(private readonly key: string) {}

  async read(): Promise<StoredTodoState | null> {
    const raw = await AsyncStorage.getItem(this.key);
    if (raw === null) return null;
    const stored: unknown = JSON.parse(raw);
    return parseStoredState(stored);
  }

  async write(state: StoredTodoState): Promise<void> {
    await AsyncStorage.setItem(this.key, JSON.stringify(state));
  }
}

function parseRemoteTodo(id: string, value: unknown): Todo {
  if (!value || typeof value !== 'object') {
    throw new Error(`Todo ${id} has invalid data`);
  }
  const remote = value as Record<string, unknown>;
  const updatedAt =
    remote.updatedAt instanceof Timestamp ? remote.updatedAt.toMillis() : remote.updatedAt;
  const parsed = { ...remote, updatedAt };
  if (!isTodo(parsed) || parsed.id !== id) {
    throw new Error(`Todo ${id} has invalid data`);
  }
  return parsed;
}

export function createFirestoreTodoCloud(db: Firestore, familyId: string): TodoCloud {
  const todosRef = collection(db, 'families', familyId, 'todos');
  return {
    saveTodo: async (todo) => {
      const todoRef = doc(todosRef, todo.id);
      await runTransaction(db, async (transaction) => {
        const remote = await transaction.get(todoRef);
        const revision = remote.exists()
          ? parseRemoteTodo(remote.id, remote.data()).revision + 1
          : 1;
        transaction.set(todoRef, {
          ...todo,
          revision,
          updatedAt: serverTimestamp(),
        });
      });
      const saved = await getDoc(todoRef);
      if (!saved.exists()) throw new Error('Todo save completed without a saved document');
      return parseRemoteTodo(saved.id, saved.data());
    },
    subscribe: (onTodos, onError) =>
      onSnapshot(
        todosRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.fromCache) return;
          try {
            onTodos(snapshot.docs.map((item) => parseRemoteTodo(item.id, item.data())));
          } catch (error) {
            onError?.(error instanceof Error ? error : new Error('Remote todo data is invalid'));
          }
        },
        (error) => onError?.(error),
      ),
  };
}
