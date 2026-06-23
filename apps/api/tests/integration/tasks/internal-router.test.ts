import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../src/app.js';

describe('POST /internal/tasks/:name', () => {
  beforeEach(() => { process.env.TASKS_SECRET = 'test-secret'; });

  it('401s without the secret', async () => {
    const res = await request(app).post('/internal/tasks/reminder-scan').send({});
    expect(res.status).toBe(401);
  });

  it('404s for an unknown task name', async () => {
    const res = await request(app)
      .post('/internal/tasks/nope').set('X-Tasks-Secret', 'test-secret').send({});
    expect(res.status).toBe(404);
  });
});
