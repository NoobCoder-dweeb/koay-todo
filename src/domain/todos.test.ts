import { describe, expect, it } from 'vitest';
import {
  canAddFamilyMember,
  createTodo,
  editTodo,
  mergeTodos,
  removeTodo,
  setTodoCompleted,
  type Todo,
} from './todos';

const originalTodo: Todo = {
  id: 'todo-1',
  title: 'Buy milk',
  completed: false,
  assigneeId: null,
  createdAt: 100,
  updatedAt: 100,
  revision: 0,
  updatedBy: 'member-1',
  deletedAt: null,
};

describe('todo domain', () => {
  it('creates a trimmed, unassigned todo', () => {
    expect(
      createTodo({
        id: 'todo-2',
        title: '  Pick up bread  ',
        createdAt: 120,
        updatedBy: 'member-1',
      }),
    ).toEqual({
      id: 'todo-2',
      title: 'Pick up bread',
      completed: false,
      assigneeId: null,
      createdAt: 120,
      updatedAt: 120,
      revision: 0,
      updatedBy: 'member-1',
      deletedAt: null,
    });
  });

  it('rejects empty titles when creating or editing', () => {
    expect(() =>
      createTodo({
        id: 'todo-2',
        title: '   ',
        createdAt: 120,
        updatedBy: 'member-1',
      }),
    ).toThrow('Todo title cannot be empty');
    expect(() =>
      editTodo(originalTodo, { title: ' ' }, { updatedAt: 150, updatedBy: 'member-2' }),
    ).toThrow('Todo title cannot be empty');
  });

  it('rejects titles longer than the shared-list limit', () => {
    expect(() =>
      createTodo({
        id: 'todo-2',
        title: 'x'.repeat(121),
        createdAt: 120,
        updatedBy: 'member-1',
      }),
    ).toThrow('Todo title cannot exceed 120 characters');
  });

  it('edits without mutating the previous saved value', () => {
    const updated = editTodo(
      originalTodo,
      { title: '  Buy oat milk ', assigneeId: 'member-2' },
      { updatedAt: 150, updatedBy: 'member-2' },
    );

    expect(updated).toMatchObject({
      title: 'Buy oat milk',
      assigneeId: 'member-2',
      updatedAt: 150,
      updatedBy: 'member-2',
    });
    expect(originalTodo.title).toBe('Buy milk');
  });

  it('completes, undoes, and deletes through timestamped updates', () => {
    const completed = setTodoCompleted(originalTodo, true, {
      updatedAt: 140,
      updatedBy: 'member-2',
    });
    const undone = setTodoCompleted(completed, false, {
      updatedAt: 160,
      updatedBy: 'member-1',
    });
    const removed = removeTodo(undone, { updatedAt: 180, updatedBy: 'member-1' });

    expect(completed.completed).toBe(true);
    expect(undone.completed).toBe(false);
    expect(removed.deletedAt).toBe(180);
    expect(removed.updatedAt).toBe(180);
  });
});

describe('family membership and offline reconciliation', () => {
  it('allows five unique members but no duplicates or sixth member', () => {
    expect(canAddFamilyMember(['a', 'b', 'c', 'd'], 'e')).toBe(true);
    expect(canAddFamilyMember(['a', 'b', 'c', 'd', 'e'], 'f')).toBe(false);
    expect(canAddFamilyMember(['a', 'b'], 'b')).toBe(false);
  });

  it('keeps unsynced local creates and prefers the latest saved update', () => {
    const localCreate: Todo = {
      ...originalTodo,
      id: 'offline-create',
      updatedAt: 220,
    };
    const localEdit: Todo = {
      ...originalTodo,
      title: 'Latest local title',
      updatedAt: 240,
      updatedBy: 'member-2',
    };
    const staleRemote: Todo = {
      ...originalTodo,
      title: 'Older remote title',
      updatedAt: 210,
    };

    expect(mergeTodos([staleRemote], [localCreate, localEdit])).toEqual([
      localEdit,
      localCreate,
    ]);
  });

  it('uses the remote value when it was saved later and resolves timestamp ties deterministically', () => {
    const local: Todo = { ...originalTodo, title: 'Local', updatedAt: 300, updatedBy: 'member-a' };
    const remote: Todo = { ...originalTodo, title: 'Remote', updatedAt: 310, updatedBy: 'member-b' };
    const tie: Todo = { ...remote, title: 'Tie winner', updatedBy: 'member-z' };

    expect(mergeTodos([remote], [local])[0]).toEqual(remote);
    expect(mergeTodos([remote], [tie])[0]).toEqual(tie);
  });

  it('uses the server revision rather than device clocks to resolve saved conflicts', () => {
    const olderSave: Todo = {
      ...originalTodo,
      title: 'Older saved update',
      updatedAt: 900,
      revision: 6,
    };
    const latestSave: Todo = {
      ...originalTodo,
      title: 'Latest saved update',
      updatedAt: 100,
      revision: 7,
    };

    expect(mergeTodos([olderSave], [latestSave])[0]).toEqual(latestSave);
  });

  it('preserves a locally queued deletion until the deletion syncs', () => {
    const deleted = removeTodo(originalTodo, { updatedAt: 350, updatedBy: 'member-2' });

    expect(mergeTodos([originalTodo], [deleted])[0].deletedAt).toBe(350);
  });
});
