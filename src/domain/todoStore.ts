import {
  createTodo,
  editTodo,
  mergeTodos,
  overlayPendingTodos,
  removeTodo,
  setTodoCompleted,
  type Todo,
} from './todos';

export interface StoredTodoState {
  todos: Todo[];
  pending: Todo[];
}

export interface TodoCache {
  read(): Promise<StoredTodoState | null>;
  write(state: StoredTodoState): Promise<void>;
}

export interface TodoCloud {
  saveTodo(todo: Todo): Promise<Todo>;
  subscribe(
    onTodos: (todos: Todo[]) => void,
    onError?: (error: Error) => void,
  ): () => void;
}

export interface TodoStoreSnapshot {
  todos: Todo[];
  pendingCount: number;
  syncing: boolean;
  syncError: string | null;
  online: boolean;
}

interface TodoStoreOptions {
  now?: () => number;
  createId?: () => string;
}

export class LocalTodoStore {
  private todos: Todo[] = [];
  private remoteTodos: Todo[] = [];
  private pending: Todo[] = [];
  private syncing = false;
  private syncError: string | null = null;
  private online = true;
  private started = false;
  private syncTask: Promise<void> | null = null;
  private unsubscribeCloud: (() => void) | null = null;
  private readonly listeners = new Set<(snapshot: TodoStoreSnapshot) => void>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private lastTimestamp = 0;

  constructor(
    private readonly cache: TodoCache,
    private readonly cloud: TodoCloud,
    options: TodoStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => `${this.now()}-${Math.random().toString(36).slice(2)}`);
  }

  async start(): Promise<void> {
    if (this.started) return;
    const cached = await this.cache.read();
    if (cached) {
      this.todos = cached.todos;
      this.pending = cached.pending;
    }
    this.started = true;
    this.emit();
    this.unsubscribeCloud = this.cloud.subscribe(
      (remoteTodos) => {
        this.applyRemoteTodos(remoteTodos);
      },
      (error) => {
        this.recordError(error);
      },
    );
    if (this.online && this.pending.length > 0) void this.syncPending();
  }

  stop(): void {
    this.unsubscribeCloud?.();
    this.unsubscribeCloud = null;
    this.started = false;
  }

  getSnapshot(): TodoStoreSnapshot {
    return {
      todos: [...this.todos],
      pendingCount: this.pending.length,
      syncing: this.syncing,
      syncError: this.syncError,
      online: this.online,
    };
  }

  subscribe(listener: (snapshot: TodoStoreSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async setOnline(online: boolean): Promise<void> {
    this.online = online;
    this.emit();
    if (online) await this.syncPending();
  }

  async addTodo(title: string, userId: string, assigneeId: string | null = null): Promise<Todo> {
    const timestamp = this.nextTimestamp();
    const todo = createTodo({
      id: this.createId(),
      title,
      assigneeId,
      createdAt: timestamp,
      updatedBy: userId,
    });
    await this.commit(todo);
    return todo;
  }

  async editTodo(
    id: string,
    changes: { title?: string; assigneeId?: string | null },
    userId: string,
  ): Promise<Todo> {
    const current = this.findActiveTodo(id);
    const todo = editTodo(current, changes, { updatedAt: this.nextTimestamp(), updatedBy: userId });
    await this.commit(todo);
    return todo;
  }

  async setTodoCompleted(id: string, completed: boolean, userId: string): Promise<Todo> {
    const current = this.findActiveTodo(id);
    const todo = setTodoCompleted(current, completed, {
      updatedAt: this.nextTimestamp(),
      updatedBy: userId,
    });
    await this.commit(todo);
    return todo;
  }

  async removeTodo(id: string, userId: string): Promise<Todo> {
    const current = this.findActiveTodo(id);
    const todo = removeTodo(current, { updatedAt: this.nextTimestamp(), updatedBy: userId });
    await this.commit(todo);
    return todo;
  }

  private findActiveTodo(id: string): Todo {
    const todo = this.todos.find((item) => item.id === id && item.deletedAt === null);
    if (!todo) throw new Error('Todo not found');
    return todo;
  }

  private async commit(todo: Todo): Promise<void> {
    this.todos = mergeTodos(this.todos, [todo]);
    this.pending = mergeTodos(this.pending, [todo]);
    this.syncError = null;
    this.emit();
    await this.persist();
    if (this.online) await this.syncPending();
  }

  private async syncPending(): Promise<void> {
    if (this.syncTask) return this.syncTask;
    if (!this.online || this.pending.length === 0) return;

    this.syncing = true;
    this.syncError = null;
    this.emit();
    this.syncTask = (async () => {
      try {
        while (this.online && this.pending.length > 0) {
          const queued = this.pending[0];
          const savedTodo = await this.cloud.saveTodo(queued);
          this.remoteTodos = mergeTodos(this.remoteTodos, [savedTodo]);
          this.pending = this.pending.filter(
            (item) => item.id !== queued.id || item.updatedAt !== queued.updatedAt,
          );
          this.todos = overlayPendingTodos(this.remoteTodos, this.pending);
          await this.persist();
          this.emit();
        }
      } catch (error) {
        this.recordError(error);
      } finally {
        this.syncing = false;
        this.syncTask = null;
        this.emit();
      }
    })();
    return this.syncTask;
  }

  private async persist(): Promise<void> {
    await this.cache.write({ todos: [...this.todos], pending: [...this.pending] });
  }

  private applyRemoteTodos(remoteTodos: Todo[]): void {
    this.remoteTodos = remoteTodos;
    this.todos = overlayPendingTodos(remoteTodos, this.pending);
    this.emit();
    void this.persist().catch((error: unknown) => this.recordError(error));
  }

  private nextTimestamp(): number {
    const latestTodoTimestamp = this.todos.reduce(
      (latest, todo) => Math.max(latest, todo.updatedAt),
      0,
    );
    this.lastTimestamp = Math.max(this.now(), latestTodoTimestamp + 1, this.lastTimestamp + 1);
    return this.lastTimestamp;
  }

  private recordError(error: unknown): void {
    this.syncError = error instanceof Error ? error.message : 'Unable to sync changes';
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
