import type { TasksState } from '@smart-display/shared';

export function TasksTile({ state }: { state: TasksState }) {
  const { lists, tasks } = state;
  if (lists.length === 0) {
    return (
      <div style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: 'calc(0.75rem * var(--tile-font-scale, 1))' }}>
        No task lists
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
      {lists.map((list) => {
        const listTasks = tasks.filter((t) => t.listId === list.id && !t.done);
        return (
          <div key={list.id}>
            <div style={{ fontSize: 'calc(0.85rem * var(--tile-font-scale, 1))', fontWeight: 600, color: list.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              {list.name}
            </div>
            {listTasks.length === 0 ? (
              <div style={{ fontSize: 'calc(0.85rem * var(--tile-font-scale, 1))', color: 'var(--text-faint)' }}>All done ✓</div>
            ) : (
              listTasks.slice(0, 5).map((task) => (
                <div key={task.id} style={{ fontSize: 'calc(1rem * var(--tile-font-scale, 1))', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ color: list.color }}>○</span>
                  <span>{task.title}</span>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
