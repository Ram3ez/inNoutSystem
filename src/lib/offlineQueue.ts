/**
 * Offline Sync Queue
 * Manages the local storage queue for check-in/out events and audit logs captured during network outages.
 */

export interface QueuedSync {
  rollNo: string;
  timestamp: string;
}

export interface QueuedLog {
  data: any;
  timestamp: string;
}

const QUEUE_KEY = "nitpy_offline_sync_queue";
const LOG_QUEUE_KEY = "nitpy_offline_log_queue";

/**
 * Adds a check-in/out event to the offline queue.
 */
export const addToOfflineQueue = (rollNo: string) => {
  const queue: QueuedSync[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  queue.push({
    rollNo,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

/**
 * Adds an audit log entry to the offline log queue.
 */
export const addToLogQueue = (data: any) => {
  const queue: QueuedLog[] = JSON.parse(localStorage.getItem(LOG_QUEUE_KEY) || "[]");
  queue.push({
    data,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(LOG_QUEUE_KEY, JSON.stringify(queue));
};

export const getOfflineQueue = (): QueuedSync[] => {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
};

export const getLogQueue = (): QueuedLog[] => {
  return JSON.parse(localStorage.getItem(LOG_QUEUE_KEY) || "[]");
};

export const clearOfflineQueue = () => {
  localStorage.removeItem(QUEUE_KEY);
};

export const clearLogQueue = () => {
  localStorage.removeItem(LOG_QUEUE_KEY);
};

export const isSystemOnline = () => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
};
