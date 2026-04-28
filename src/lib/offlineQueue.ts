interface QueuedSync {
  rollNo: string;
  timestamp: string;
}

const QUEUE_KEY = "nitpy_offline_sync_queue";

export const addToOfflineQueue = (rollNo: string) => {
  const queue: QueuedSync[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  queue.push({
    rollNo,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const getOfflineQueue = (): QueuedSync[] => {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
};

export const clearOfflineQueue = () => {
  localStorage.removeItem(QUEUE_KEY);
};

export const isSystemOnline = () => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
};
