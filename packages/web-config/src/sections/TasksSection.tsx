import { useState, useEffect, useRef } from 'react';
import { getTasks, addTaskList, deleteTaskList, addTask, updateTask, toggleTask, deleteTask } from '../api.js';
import type { TasksState } from '@smart-display/shared';
import { WidgetsLink } from '../components/WidgetsLink.js';

export function TasksSection() {
  const [state, setState] = useState<TasksState | null>(null);
  const [listName, setListName] = useState('');
  const [listColor, setListColor] = useState('#4a90e2');
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<string | null>(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const load = () => getTasks().then(setState).catch((e: unknown) => setError(String(e)));

  useEffect(() => { void load(); }, []);

  const handleAddList = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      setState(await addTaskList(listName.trim(), listColor));
      setListName('');
    } catch (e: unknown) { setError(String(e)); }
    finally { setAdding(false); }
  };

  const handleDeleteList = async (id: string) => {
    setConfirmDeleteListId(null);
    try { setState(await deleteTaskList(id)); } catch (e: unknown) { setError(String(e)); }
  };

  const handleAddTask = async (listId: string, e: React.FormEvent) => {
    e.preventDefault();
    const title = taskTitles[listId] ?? '';
    if (!title.trim()) return;
    try {
      setState(await addTask(listId, title.trim()));
      setTaskTitles((t) => ({ ...t, [listId]: '' }));
    } catch (e: unknown) { setError(String(e)); }
  };

  const handleToggle = async (id: string) => {
    try { setState(await toggleTask(id)); } catch (e: unknown) { setError(String(e)); }
  };

  const handleDeleteTask = async (id: string) => {
    setConfirmDeleteTaskId(null);
    try { setState(await deleteTask(id)); } catch (e: unknown) { setError(String(e)); }
  };

  const startEdit = (id: string, currentTitle: string) => {
    setEditingTaskId(id);
    setEditingTitle(currentTitle);
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const commitEdit = async (id: string) => {
    const title = editingTitle.trim();
    setEditingTaskId(null);
    if (!title) return;
    try { setState(await updateTask(id, { title })); } catch (e: unknown) { setError(String(e)); }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold text-slate-100 mb-1">Tasks</h2>
      <p className="text-sm text-slate-400 mb-6">Manage your local to-do lists shown on the display.</p>

      {error && (
        <div role="alert" className="mb-4 rounded-md bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void load(); }} className="text-red-300 hover:text-white text-xs underline flex-shrink-0">Try again</button>
        </div>
      )}

      <form onSubmit={(e) => { void handleAddList(e); }} className="mb-6 flex gap-3 items-center">
        <input
          className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          placeholder="New list name"
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          required
        />
        <input type="color" value={listColor} onChange={(e) => setListColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer bg-transparent border border-slate-700" />
        <button type="submit" disabled={adding} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">{adding ? 'Adding…' : 'Add List'}</button>
      </form>

      <div className="space-y-6">
        {state?.lists.map((list) => {
          const listTasks = state.tasks.filter((t) => t.listId === list.id);
          return (
            <div key={list.id} className="p-4 rounded-lg bg-slate-800/60 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: list.color }} />
                  <span className="text-sm font-semibold text-slate-100">{list.name}</span>
                </div>
                {confirmDeleteListId === list.id ? (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { void handleDeleteList(list.id); }} className="text-xs text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded">Confirm</button>
                    <button type="button" onClick={() => setConfirmDeleteListId(null)} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-600">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteListId(list.id)} className="text-xs text-red-400 hover:text-red-300">Delete list</button>
                )}
              </div>

              <div className="space-y-1 mb-3">
                {listTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={() => { void handleToggle(task.id); }} className={`min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0`} aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}>
                      <span className={`w-4 h-4 rounded border block flex-shrink-0 ${task.done ? 'bg-blue-600 border-blue-600' : 'border-slate-600'}`} />
                    </button>
                    {editingTaskId === task.id ? (
                      <input
                        ref={editInputRef}
                        className="flex-1 rounded bg-slate-700 border border-blue-500 px-2 py-0.5 text-sm text-slate-100 focus:outline-none"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => { void commitEdit(task.id); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { void commitEdit(task.id); }
                          if (e.key === 'Escape') { setEditingTaskId(null); }
                        }}
                      />
                    ) : (
                      <span
                        className={`${task.done ? 'line-through text-slate-500' : 'text-slate-300'} cursor-text flex-1`}
                        onClick={() => { if (!task.done) startEdit(task.id, task.title); }}
                        title={task.done ? undefined : 'Click to edit'}
                      >
                        {task.title}
                      </span>
                    )}
                    {confirmDeleteTaskId === task.id ? (
                      <div className="ml-auto flex gap-1">
                        <button type="button" onClick={() => { void handleDeleteTask(task.id); }} className="text-xs text-white bg-red-600 hover:bg-red-500 px-1.5 py-0.5 rounded">✓</button>
                        <button type="button" onClick={() => setConfirmDeleteTaskId(null)} className="text-xs text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded border border-slate-700">✕</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDeleteTaskId(task.id)} className="ml-auto text-xs text-slate-600 hover:text-red-400">×</button>
                    )}
                  </div>
                ))}
                {listTasks.length === 0 && <div className="text-xs text-slate-600">No tasks yet.</div>}
              </div>

              <form onSubmit={(e) => { void handleAddTask(list.id, e); }} className="flex gap-2">
                <input
                  className="flex-1 rounded bg-slate-700 border border-slate-600 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Add task…"
                  value={taskTitles[list.id] ?? ''}
                  onChange={(e) => setTaskTitles((t) => ({ ...t, [list.id]: e.target.value }))}
                />
                <button type="submit" className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-white text-xs">Add</button>
              </form>
            </div>
          );
        })}
        {state?.lists.length === 0 && <div className="text-sm text-slate-500">No lists yet. Add one above.</div>}
      </div>
      <WidgetsLink />
    </div>
  );
}
