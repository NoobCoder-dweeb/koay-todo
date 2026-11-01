import { beforeEach, describe, expect, it } from 'vitest';
import {
  LocalTodoStore,
  type StoredTodoState,
  type TodoCache,
  type TodoCloud,
} from './todoStore';
import type { Todo } from './todos';

class MemoryCache implements TodoCache {
  state: StoredTodoState | null = null;

  async read(): Promise<StoredTodoState | null> {
    return this.state;
  }

  async write(state: StoredTodoState): Promise<void> {
    this.state = state;
  }
}

class FakeCloud implements TodoCloud {
  saved: Todo[] = [];
  listener: ((todos: Todo[]) => void) | null = null;
  failure: Error | null = null;
  saveGate: Promise<void> | null = null;
  saveStarted: (() => void) | null = null;

  async saveTodo(todo: Todo): Promise<Todo> {
    if (this.failure) throw this.failure;
    this.saveStarted?.();
    if (this.saveGate) await this.saveGate;
    this.saved.push(todo);
    return { ...todo, revision: todo.revision + 1 };
  }

  subscribe(listener: (todos: Todo[]) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
}

describe('LocalTodoStore', () => {
  let cache: MemoryCache;
  let cloud: FakeCloud;
  let store: LocalTodoStore;

  beforeEach(async () => {
    cache = new MemoryCache();
    cloud = new FakeCloud();
    store = new LocalTodoStore(cache, cloud, {
      now: () => 200,
      createId: () => 'todo-local',
    });
    await store.start();
  });

  it('updates locally and persists an edit while offline, then syncs on reconnect', async () => {
    await store.setOnline(false);
    await store.addTodo('  Buy fruit ', 'member-1');

    expect(store.getSnapshot()).toMatchObject({
      todos: [{ id: 'todo-local', title: 'Buy fruit', deletedAt: null }],
      pendingCount: 1,
      syncing: false,
    });
    expect(cache.state?.pending).toHaveLength(1);
    expect(cloud.saved).toHaveLength(0);

    await store.setOnline(true);

    expect(cloud.saved).toHaveLength(1);
    expect(store.getSnapshot().pendingCount).toBe(0);
    expect(cache.state?.pending).toHaveLength(0);
  });

  it('hydrates previously saved todos before waiting for a cloud snapshot', async () => {
    cache.state = {
      todos: [
        {
          id: 'cached',
          title: 'Cached item',
          completed: false,
          assigneeId: null,
          createdAt: 100,
          updatedAt: 100,
          revision: 1,
          updatedBy: 'member-1',
          deletedAt: null,
        },
      ],
      pending: [],
    };
    const restoredStore = new LocalTodoStore(cache, cloud);

    await restoredStore.start();

    expect(restoredStore.getSnapshot().todos[0].title).toBe('Cached item');
  });

  it('does not delay startup while restoring an item that is waiting to sync', async () => {
    let releaseSave = () => {};
    let notifySaveStarted: (() => void) | null = null;
    cloud.saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const saveStarted = new Promise<void>((resolve) => {
      notifySaveStarted = resolve;
    });
    cache.state = {
      todos: [
        {
          id: 'queued',
          title: 'Queued item',
          completed: false,
          assigneeId: null,
          createdAt: 100,
          updatedAt: 100,
          revision: 0,
          updatedBy: 'member-1',
          deletedAt: null,
        },
      ],
      pending: [
        {
          id: 'queued',
          title: 'Queued item',
          completed: false,
          assigneeId: null,
          createdAt: 100,
          updatedAt: 100,
          revision: 0,
          updatedBy: 'member-1',
          deletedAt: null,
        },
      ],
    };
    cloud.saveStarted = () => notifySaveStarted?.();
    const restoredStore = new LocalTodoStore(cache, cloud);

    const startPromise = restoredStore.start();
    await saveStarted;
    const resolvedBeforeCloud = await Promise.race([
      startPromise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25)),
    ]);

    expect(resolvedBeforeCloud).toBe(true);
    releaseSave();
    await startPromise;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('keeps unsynced work and exposes an error if cloud synchronization fails', async () => {
    cloud.failure = new Error('Temporary service error');
    await store.addTodo('Send a message', 'member-1');

    expect(store.getSnapshot()).toMatchObject({
      pendingCount: 1,
      syncError: 'Temporary service error',
    });
    expect(cache.state?.pending).toHaveLength(1);
  });

  it('reconciles cloud snapshots with pending local changes', async () => {
    await store.setOnline(false);
    await store.addTodo('Offline item', 'member-1');
    cloud.listener?.([
      {
        id: 'remote-item',
        title: 'Shared item',
        completed: false,
        assigneeId: null,
        createdAt: 100,
        updatedAt: 100,
        revision: 1,
        updatedBy: 'member-2',
        deletedAt: null,
      },
    ]);

    expect(store.getSnapshot().todos.map(({ id }) => id)).toEqual([
      'remote-item',
      'todo-local',
    ]);
  });

  it('keeps pending local edits visible while they wait to be saved', async () => {
    await store.setOnline(false);
    await store.addTodo('Offline item', 'member-1');
    cloud.listener?.([
      {
        id: 'todo-local',
        title: 'Saved from another device',
        completed: false,
        assigneeId: null,
        createdAt: 100,
        updatedAt: 250,
        revision: 1,
        updatedBy: 'member-2',
        deletedAt: null,
      },
    ]);

    expect(store.getSnapshot()).toMatchObject({
      todos: [{ id: 'todo-local', title: 'Offline item' }],
      pendingCount: 1,
    });
  });

  it('keeps sequential local edits in order even when the clock has the same millisecond', async () => {
    await store.setOnline(false);
    await store.addTodo('First title', 'member-1');
    await store.editTodo('todo-local', { title: 'Second title' }, 'member-1');

    expect(store.getSnapshot()).toMatchObject({
      todos: [{ title: 'Second title', updatedAt: 201 }],
      pendingCount: 1,
    });
    expect(cache.state?.pending[0].title).toBe('Second title');
  });
});
