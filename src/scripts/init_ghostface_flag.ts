import { tablesDB, fetchAllRows } from "../lib/appwrite";
import { Query } from "appwrite";

const DB_ID = "69cb970a000853f23489";
const COLL_STUDENTS = "student_details";

async function initializeGhostFaceFlag() {
  console.log("🚀 Starting database migration...");
  
  try {
    // 1. Fetch all students
    const students = await fetchAllRows<any>(DB_ID, COLL_STUDENTS);
    console.log(`🔍 Found ${students.length} students to process.`);

    let updatedCount = 0;
    
    // 2. Update each student to have ghostface_registered = false
    // We do this sequentially to avoid rate limits, or in small chunks
    for (const student of students) {
      if (student.ghostface_registered === undefined || student.ghostface_registered === null) {
        try {
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLL_STUDENTS,
            rowId: student.$id,
            data: {
              ghostface_registered: false
            }
          });
          updatedCount++;
          if (updatedCount % 50 === 0) console.log(`✅ Processed ${updatedCount} students...`);
        } catch (err) {
          console.error(`❌ Failed to update ${student.$id}:`, err);
        }
      }
    }

    console.log(`✨ Migration complete! Updated ${updatedCount} students.`);
    console.log("💡 You can now search for students in the GhostFace registration page.");
    
  } catch (error) {
    console.error("💀 Migration failed:", error);
  }
}

initializeGhostFaceFlag();
