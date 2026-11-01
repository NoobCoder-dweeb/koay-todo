export const MAX_FAMILY_MEMBERS = 5;
export const MAX_TODO_TITLE_LENGTH = 120;

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  assigneeId: string | null;
  createdAt: number;
  updatedAt: number;
  revision: number;
  updatedBy: string;
  deletedAt: number | null;
}

interface UpdateMetadata {
  updatedAt: number;
  updatedBy: string;
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new Error('Todo title cannot be empty');
  if (normalized.length > MAX_TODO_TITLE_LENGTH) {
    throw new Error(`Todo title cannot exceed ${MAX_TODO_TITLE_LENGTH} characters`);
  }
  return normalized;
}

export function createTodo(input: {
  id: string;
  title: string;
  assigneeId?: string | null;
  createdAt: number;
  updatedBy: string;
}): Todo {
  const title = normalizeTitle(input.title);
  return {
    id: input.id,
    title,
    completed: false,
    assigneeId: input.assigneeId ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    revision: 0,
    updatedBy: input.updatedBy,
    deletedAt: null,
  };
}

export function editTodo(
  todo: Todo,
  changes: { title?: string; assigneeId?: string | null },
  metadata: UpdateMetadata,
): Todo {
  return {
    ...todo,
    title: changes.title === undefined ? todo.title : normalizeTitle(changes.title),
    assigneeId: changes.assigneeId === undefined ? todo.assigneeId : changes.assigneeId,
    updatedAt: metadata.updatedAt,
    updatedBy: metadata.updatedBy,
  };
}

export function setTodoCompleted(
  todo: Todo,
  completed: boolean,
  metadata: UpdateMetadata,
): Todo {
  return { ...todo, completed, updatedAt: metadata.updatedAt, updatedBy: metadata.updatedBy };
}

export function removeTodo(todo: Todo, metadata: UpdateMetadata): Todo {
  return {
    ...todo,
    deletedAt: metadata.updatedAt,
    updatedAt: metadata.updatedAt,
    updatedBy: metadata.updatedBy,
  };
}

export function canAddFamilyMember(memberIds: string[], userId: string): boolean {
  return !memberIds.includes(userId) && new Set(memberIds).size < MAX_FAMILY_MEMBERS;
}

function isNewer(candidate: Todo, current: Todo): boolean {
  if (candidate.revision !== current.revision) return candidate.revision > current.revision;
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  return candidate.updatedBy > current.updatedBy;
}

export function mergeTodos(remoteTodos: Todo[], pendingTodos: Todo[]): Todo[] {
  const merged = new Map(remoteTodos.map((todo) => [todo.id, todo]));
  for (const pending of pendingTodos) {
    const current = merged.get(pending.id);
    if (!current || isNewer(pending, current)) merged.set(pending.id, pending);
  }
  return Array.from(merged.values());
}

export function overlayPendingTodos(remoteTodos: Todo[], pendingTodos: Todo[]): Todo[] {
  const merged = new Map(remoteTodos.map((todo) => [todo.id, todo]));
  for (const pending of pendingTodos) merged.set(pending.id, pending);
  return Array.from(merged.values());
}
