/**
 * Sync Service
 * Manages the synchronization of offline-captured records to the Appwrite cloud.
 * Handles both student outing transactions and system audit logs.
 */
import { tablesDB, ID } from "./appwrite";
import { Query } from "appwrite";
import {
  getOfflineQueue,
  clearOfflineQueue,
  getLogQueue,
  clearLogQueue,
  isSystemOnline,
} from "./offlineQueue";
import { DB_ID, COLLECTIONS } from "./constants";
import { logTransaction } from "./auditLogger";

let isProcessing = false;

/**
 * Triggers a full synchronization of all offline queues (Outings and Logs).
 */
export async function processOfflineQueue() {
  if (isProcessing) return;
  if (!isSystemOnline()) return;

  isProcessing = true;
  try {
    await Promise.all([
      syncOutingRecords(),
      syncAuditLogs()
    ]);
  } finally {
    isProcessing = false;
  }
}

/**
 * Synchronizes offline student check-in/out records.
 */
async function syncOutingRecords() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  console.log(`[🔄 SYNC] Processing ${queue.length} offline outing records...`);
  const failedRecords: any[] = [];

  for (const record of queue) {
    try {
      const { rows: documents } = await tablesDB.listRows({
        databaseId: DB_ID,
        tableId: COLLECTIONS.OUTING,
        queries: [
          Query.equal("roll_no", record.rollNo),
          Query.orderDesc("out_time"),
          Query.limit(1),
        ],
      });

      const openOuting = documents.find((doc) => !doc.in_time);

      if (openOuting) {
        await tablesDB.createRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.OUTING_ARCHIVE,
          rowId: ID.unique(),
          data: {
            roll_no: record.rollNo,
            out_time: openOuting.out_time,
            in_time: record.timestamp,
          },
        });
        await tablesDB.deleteRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.OUTING,
          rowId: openOuting.$id,
        });
        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          rowId: record.rollNo,
          data: { is_out: false },
        });
        console.log(`[✅ SYNC] Check-IN synced for ${record.rollNo}`);
        await logTransaction({
          action: "OUTING_ENTRY_SYNC",
          message: `Student ${record.rollNo} check-in synced from offline queue.`,
          userId: record.rollNo,
          metadata: { originalTimestamp: record.timestamp },
        });
      } else {
        await tablesDB.createRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.OUTING,
          rowId: ID.unique(),
          data: {
            roll_no: record.rollNo,
            out_time: record.timestamp,
          },
        });
        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          rowId: record.rollNo,
          data: { is_out: true },
        });
        console.log(`[✅ SYNC] Check-OUT synced for ${record.rollNo}`);
        await logTransaction({
          action: "OUTING_EXIT_SYNC",
          message: `Student ${record.rollNo} check-out synced from offline queue.`,
          userId: record.rollNo,
          metadata: { originalTimestamp: record.timestamp },
        });
      }
    } catch (error) {
      console.error(`[❌ SYNC] Outing failed for ${record.rollNo}:`, error);
      failedRecords.push(record);
    }
  }

  if (failedRecords.length > 0) {
    localStorage.setItem("nitpy_offline_sync_queue", JSON.stringify(failedRecords));
  } else {
    clearOfflineQueue();
  }
}

/**
 * Synchronizes offline audit logs.
 */
async function syncAuditLogs() {
  const queue = getLogQueue();
  if (queue.length === 0) return;

  console.log(`[🛡️ SYNC] Processing ${queue.length} offline audit logs...`);
  const failedLogs: any[] = [];

  for (const log of queue) {
    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(log.data),
      });
      console.log(`[🛡️ SYNC] Audit log synced: ${log.data.action}`);
    } catch (error) {
      console.error(`[❌ SYNC] Log failed for ${log.data.action}:`, error);
      failedLogs.push(log);
    }
  }

  if (failedLogs.length > 0) {
    localStorage.setItem("nitpy_offline_log_queue", JSON.stringify(failedLogs));
  } else {
    clearLogQueue();
  }
}
