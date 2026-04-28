import { databases, ID } from "@/lib/appwrite";
import { Query } from "appwrite";
import { getOfflineQueue, clearOfflineQueue, isSystemOnline } from "./offlineQueue";
import { DB_ID, COLLECTIONS } from "./constants";

export async function processOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;
  if (!isSystemOnline()) return;

  console.log(`[🔄 SYNC] Processing ${queue.length} offline records...`);

  const failedRecords: any[] = [];

  for (const record of queue) {
    try {
      // 1. Fetch current state (latest record)
      const searchResult = await databases.listDocuments(DB_ID, COLLECTIONS.OUTING, [
        Query.equal("roll_no", record.rollNo),
        Query.orderDesc("out_time"),
        Query.limit(1)
      ]);

      const openOuting = searchResult.documents.find((doc) => !doc.in_time);

      if (openOuting) {
        // CLOSE existing outing -> ARCHIVE & DELETE
        await databases.createDocument(DB_ID, COLLECTIONS.OUTING_ARCHIVE, ID.unique(), {
          roll_no: record.rollNo,
          out_time: openOuting.out_time,
          in_time: record.timestamp,
        });
        await databases.deleteDocument(DB_ID, COLLECTIONS.OUTING, openOuting.$id);

        await databases.updateDocument(DB_ID, COLLECTIONS.STUDENTS, record.rollNo, {
          is_out: false,
        });
        console.log(`[✅ SYNC] Check-IN synced & archived for ${record.rollNo}`);
      } else {
        // CREATE new outing
        await databases.createDocument(DB_ID, COLLECTIONS.OUTING, ID.unique(), {
          roll_no: record.rollNo,
          out_time: record.timestamp,
        });
        await databases.updateDocument(DB_ID, COLLECTIONS.STUDENTS, record.rollNo, {
          is_out: true,
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
}
