import { describe, it, expect, vi } from 'vitest';

const createTask = vi.fn().mockResolvedValue([{ name: 'projects/p/locations/l/queues/q/tasks/t' }]);
const queuePath = vi.fn((p: string, l: string, q: string) => `projects/${p}/locations/${l}/queues/${q}`);
vi.mock('@google-cloud/tasks', () => ({
  CloudTasksClient: vi.fn(() => ({ createTask, queuePath })),
}));

import { makeCloudDriver } from '../../../src/infrastructure/tasks/cloud-driver.js';

describe('cloudDriver', () => {
  it('creates an HTTP task with the secret header and JSON body', async () => {
    const driver = makeCloudDriver({
      project: 'proj', location: 'asia-southeast1',
      serviceUrl: 'https://hrm-api.run.app', secret: 's3cr3t',
    });
    await driver.enqueue('cv-parse', { kind: 'attachment', attachmentId: 'a1' });

    expect(queuePath).toHaveBeenCalledWith('proj', 'asia-southeast1', 'hrm-cv-parse');
    const arg = createTask.mock.calls[0][0];
    expect(arg.parent).toBe('projects/proj/locations/asia-southeast1/queues/hrm-cv-parse');
    expect(arg.task.httpRequest.url).toBe('https://hrm-api.run.app/internal/tasks/cv-parse');
    expect(arg.task.httpRequest.httpMethod).toBe('POST');
    expect(arg.task.httpRequest.headers['X-Tasks-Secret']).toBe('s3cr3t');
    expect(arg.task.httpRequest.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(Buffer.from(arg.task.httpRequest.body, 'base64').toString())).toEqual({
      kind: 'attachment', attachmentId: 'a1',
    });
  });
});
