import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Task, TaskList, TasksState } from '@smart-display/shared';

interface TaskListRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface TaskRow {
  id: string;
  list_id: string;
  title: string;
  done: number;
  due_date: string | null;
  sort_order: number;
  created_at: string;
}

export class TasksService {
  constructor(private readonly db: Database.Database) {}

  private toList(r: TaskListRow): TaskList {
    return { id: r.id, name: r.name, color: r.color, sortOrder: r.sort_order };
  }

  private toTask(r: TaskRow): Task {
    return {
      id: r.id,
      listId: r.list_id,
      title: r.title,
      done: r.done === 1,
      dueDate: r.due_date,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    };
  }

  getState(): TasksState {
    const lists = (this.db.prepare('SELECT * FROM task_lists ORDER BY sort_order ASC, created_at ASC').all() as TaskListRow[]).map((r) => this.toList(r));
    const tasks = (this.db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC, created_at ASC').all() as TaskRow[]).map((r) => this.toTask(r));
    return { lists, tasks };
  }

  addList(name: string, color: string): TaskList {
    const id = randomUUID();
    this.db.prepare('INSERT INTO task_lists (id, name, color) VALUES (?, ?, ?)').run(id, name, color);
    return this.toList(this.db.prepare('SELECT * FROM task_lists WHERE id = ?').get(id) as TaskListRow);
  }

  removeList(id: string): void {
    this.db.prepare('DELETE FROM task_lists WHERE id = ?').run(id);
  }

  addTask(listId: string, title: string, dueDate?: string): Task {
    const id = randomUUID();
    this.db.prepare('INSERT INTO tasks (id, list_id, title, due_date) VALUES (?, ?, ?, ?)').run(id, listId, title, dueDate ?? null);
    return this.toTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow);
  }

  toggleTask(id: string): Task {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!row) throw new Error(`Task not found: ${id}`);
    const newDone = row.done === 0 ? 1 : 0;
    this.db.prepare(`UPDATE tasks SET done = ?, updated_at = datetime('now') WHERE id = ?`).run(newDone, id);
    return this.toTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow);
  }

  updateTask(id: string, title?: string, dueDate?: string | null): Task {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!row) throw new Error(`Task not found: ${id}`);
    const newTitle = title !== undefined ? title : row.title;
    const newDueDate = dueDate !== undefined ? dueDate : row.due_date;
    this.db.prepare(`UPDATE tasks SET title = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?`).run(newTitle, newDueDate, id);
    return this.toTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow);
  }

  removeTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }
}
