import { CloudTasksClient } from '@google-cloud/tasks';
import type { TaskDriver } from './inline-driver.js';
import { TASK_CONFIG, type TaskName } from './task-names.js';

export interface CloudDriverConfig {
  project: string;
  location: string;
  /** Base URL of the hrm-api Cloud Run service (no trailing slash). */
  serviceUrl: string;
  /** Shared secret sent as X-Tasks-Secret. */
  secret: string;
}

/** Production driver: enqueues an HTTP-target Cloud Task per job. */
export function makeCloudDriver(config: CloudDriverConfig): TaskDriver {
  const client = new CloudTasksClient();
  return {
    async enqueue(name: TaskName, payload: unknown, opts) {
      const { queue, path } = TASK_CONFIG[name];
      const parent = client.queuePath(config.project, config.location, queue);
      await client.createTask({
        parent,
        task: {
          ...(opts?.delaySeconds
            ? { scheduleTime: { seconds: Math.floor(Date.now() / 1000) + opts.delaySeconds } }
            : {}),
          httpRequest: {
            httpMethod: 'POST',
            url: `${config.serviceUrl}${path}`,
            headers: { 'Content-Type': 'application/json', 'X-Tasks-Secret': config.secret },
            // protobufjs decodes a base64 string into the `bytes` body field.
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          },
        },
        // Cast: the generated protobuf types model httpMethod as a numeric enum
        // and body as Uint8Array, but the client accepts the string/base64 forms
        // above at runtime. The cast is on the request shape only.
      } as any);
    },
  };
}
