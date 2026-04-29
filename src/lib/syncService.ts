import { databases, tablesDB, ID, client } from "./appwrite";
import { Query } from "appwrite";
import {
  getOfflineQueue,
  clearOfflineQueue,
  isSystemOnline,
} from "./offlineQueue";
import { DB_ID, COLLECTIONS } from "./constants";

let isProcessing = false;

export async function processOfflineQueue() {
  if (isProcessing) return;

  const queue = getOfflineQueue();
  if (queue.length === 0) return;
  if (!isSystemOnline()) return;

  isProcessing = true;
  console.log(`[🔄 SYNC] Processing ${queue.length} offline records...`);

  try {
    const failedRecords: any[] = [];

    for (const record of queue) {
      try {
        // 1. Fetch current state (latest record)
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
          // CLOSE existing outing -> ARCHIVE & DELETE
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
            data: {
              is_out: false,
            },
          });
          console.log(
            `[✅ SYNC] Check-IN synced & archived for ${record.rollNo}`,
          );
        } else {
          // CREATE new outing
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
            data: {
              is_out: true,
            },
          });
          console.log(`[✅ SYNC] Check-OUT synced for ${record.rollNo}`);
        }
      } catch (error) {
        console.error(`[❌ SYNC] Failed for ${record.rollNo}:`, error);
        failedRecords.push(record);
      }
    }

    // Update queue with only the ones that failed
    if (failedRecords.length > 0) {
      const QUEUE_KEY = "nitpy_offline_sync_queue";
      localStorage.setItem(QUEUE_KEY, JSON.stringify(failedRecords));
    } else {
      clearOfflineQueue();
    }
  } finally {
    isProcessing = false;
  }
}
