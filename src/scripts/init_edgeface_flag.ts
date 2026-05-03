import { tablesDB, fetchAllRows } from "../lib/appwrite";
import { Query } from "appwrite";

const DB_ID = "69cb970a000853f23489";
const COLL_STUDENTS = "student_details";

async function initializeGhostFaceV2Flag() {
  console.log("🚀 Starting database migration for edgeface_registered...");

  try {
    // 1. Fetch all students
    const students = await fetchAllRows<any>(DB_ID, COLL_STUDENTS);
    console.log(`🔍 Found ${students.length} students to process.`);

    let updatedCount = 0;

    // 2. Update each student to have ghostface_v2_registered = false
    // We do this sequentially to avoid rate limits
    for (const student of students) {
      if (
        student.edgeface_registered === undefined ||
        student.edgeface_registered === null
      ) {
        try {
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLL_STUDENTS,
            rowId: student.$id,
            data: {
              edgeface_registered: false,
            },
          });
          updatedCount++;
          if (updatedCount % 50 === 0)
            console.log(`✅ Processed ${updatedCount} students...`);
        } catch (err) {
          console.error(`❌ Failed to update ${student.$id}:`, err);
        }
      }
    }

    console.log(`✨ Migration complete! Updated ${updatedCount} students.`);
    console.log(
      "💡 You can now search for students in the edgeface_registered registration page.",
    );
  } catch (error) {
    console.error("💀 Migration failed:", error);
  }
}

initializeGhostFaceV2Flag();
