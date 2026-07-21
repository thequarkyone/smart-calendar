import type { FastifyInstance } from 'fastify';
import type { TasksService } from '../services/tasks.js';
import type { EventBus } from '../event-bus.js';

const COLOR_HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function createTasksRoutes(tasksService: TasksService, bus: EventBus) {
  return async function tasksRoutes(app: FastifyInstance): Promise<void> {
    app.get('/api/tasks', async (_req, reply) => {
      return reply.send(tasksService.getState());
    });

    app.post('/api/tasks/lists', {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'color'],
          properties: {
            name: { type: 'string', maxLength: 200 },
            color: { type: 'string' },
          },
        },
      },
    }, async (req, reply) => {
      const { name, color } = req.body as { name: string; color: string };
      if (!COLOR_HEX_RE.test(color)) {
        return reply.status(400).send({ error: 'color must be a 6-digit hex color (e.g. #4a90e2)' });
      }
      tasksService.addList(name, color);
      const state = tasksService.getState();
      bus.emit('tasks:state', state);
      return reply.status(201).send(state);
    });

    app.delete('/api/tasks/lists/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      tasksService.removeList(id);
      const state = tasksService.getState();
      bus.emit('tasks:state', state);
      return reply.send(state);
    });

    app.post('/api/tasks/lists/:listId/tasks', {
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 200 },
            dueDate: { type: 'string', maxLength: 20, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
    }, async (req, reply) => {
      const { listId } = req.params as { listId: string };
      const { title, dueDate } = req.body as { title: string; dueDate?: string };
      tasksService.addTask(listId, title, dueDate);
      const state = tasksService.getState();
      bus.emit('tasks:state', state);
      return reply.status(201).send(state);
    });

    app.patch('/api/tasks/tasks/:id', {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            dueDate: { type: ['string', 'null'], maxLength: 20, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const { title, dueDate } = req.body as { title?: string; dueDate?: string | null };
      try {
        tasksService.updateTask(id, title, dueDate);
      } catch {
        return reply.status(404).send({ error: 'Task not found' });
      }
      const state = tasksService.getState();
      bus.emit('tasks:state', state);
      return reply.send(state);
    });

    app.patch('/api/tasks/tasks/:id/toggle', async (req, reply) => {
      const { id } = req.params as { id: string };
      tasksService.toggleTask(id);
      const state = tasksService.getState();
      bus.emit('tasks:state', state);
      return reply.send(state);
    });

    app.delete('/api/tasks/tasks/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      tasksService.removeTask(id);
      const state = tasksService.getState();
      bus.emit('tasks:state', state);
      return reply.send(state);
    });
  };
}
