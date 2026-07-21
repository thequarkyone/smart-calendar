export interface Task {
  id: string;
  listId: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  sortOrder: number;
  createdAt: string;
}
export interface TaskList {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}
export interface TasksState {
  lists: TaskList[];
  tasks: Task[];
}
