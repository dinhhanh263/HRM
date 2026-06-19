import { describe, it, expect } from 'vitest';
import { TASK_CONFIG, TASK_NAMES } from '../../../src/infrastructure/tasks/task-names.js';

describe('task-names', () => {
  it('exposes the five job names', () => {
    expect([...TASK_NAMES].sort()).toEqual(
      ['cv-parse', 'employee-import', 'employee-invite', 'reminder-email', 'reminder-scan'].sort(),
    );
  });

  it('maps every name to a queue id and route path', () => {
    for (const name of TASK_NAMES) {
      expect(TASK_CONFIG[name].queue).toBe(`hrm-${name}`);
      expect(TASK_CONFIG[name].path).toBe(`/internal/tasks/${name}`);
    }
  });
});
