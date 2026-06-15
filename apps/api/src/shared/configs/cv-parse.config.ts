// Config for the background CV-parsing feature (Task 3.3). Kept in one place so
// queue, worker, and tests share the exact same names and retention.

/** BullMQ queue name for the CV resume parser. See naming-conventions.md. */
export const CV_PARSE_QUEUE_NAME = 'hrm.recruitment.cv_parse';

/** The named job within the CV-parse queue. */
export const CV_PARSE_JOB_NAME = 'parse-cv';

/** How long a finished parse job is retained in the queue before BullMQ removes it. */
export const CV_PARSE_JOB_RETENTION_SECONDS = 24 * 60 * 60;
