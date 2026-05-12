import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { serverTablesDB } from '@/lib/server/appwrite';
import { DB_ID, COLLECTIONS, formatToISTFull } from '@/lib/constants';
import { ID } from 'appwrite';
import fs from 'fs';
import path from 'path';

/**
 * Audit Logger API Route
 * Permanently stores transaction logs in the Appwrite database.
 */

export async function POST(req: Request) {
  try {
    const { action, message, userId, userName, metadata, level = "low" } = await req.json();
    
    // Log to server console for visibility (always happens)
    console.log(`\n\x1b[36m[📱 ${action} | ${level.toUpperCase()}]\x1b[0m ${userName || 'System'} (${userId || 'N/A'}): ${message}\n`);

    /**
     * Selective Persistence
     * We only save high-value events (Outing, Leave, Adaptive updates) to the DB/File.
     * High-frequency events (Recognition, Conflict) are only shown in the terminal.
     */
    const skipPersistence = ["RECOGNITION", "CONFLICT", "STUDENT_REGISTRATION"].includes(action);

    if (!skipPersistence) {
      /**
       * Primary Storage: Appwrite TablesDB
       */
      await serverTablesDB.createRow({
        databaseId: DB_ID,
        tableId: COLLECTIONS.AUDIT_LOGS,
        rowId: ID.unique(),
        data: {
          timestamp: formatToISTFull(new Date()),
          action,
          message,
          user_id: userId || 'SYSTEM',
          user_name: userName || 'SYSTEM',
          metadata: metadata ? JSON.stringify(metadata) : null,
          level,
        },
      });

      /**
       * Secondary Storage: Local File System
       */
      try {
        // Find the true repository root, especially in standalone mode
        let root = process.cwd();
        if (root.includes(path.join('.next', 'standalone'))) {
          // If CWD is inside standalone, the repo root is two levels up
          root = path.join(root, '..', '..');
        }
        
        const logDir = path.join(root, 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const logPath = path.join(logDir, 'audit.log');
        const istTime = formatToISTFull(new Date());
        const logLine = `[${istTime}] [${level.toUpperCase()}] [${action}] ${userName || 'System'} (${userId || 'N/A'}): ${message}${metadata ? ' | Metadata: ' + JSON.stringify(metadata) : ''}\n`;
        fs.appendFileSync(logPath, logLine);
      } catch (fileErr) {
        console.error("Local File Logging Error:", fileErr);
      }
    }
  
      return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Audit Logging Error:", err);
    return NextResponse.json({ success: false, error: err.message });
  }
}
