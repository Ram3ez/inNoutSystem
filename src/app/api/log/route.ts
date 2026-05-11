import { NextResponse } from 'next/server';
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
    
    // Log to server console for visibility
    console.log(`\n\x1b[36m[📱 ${action} | ${level.toUpperCase()}]\x1b[0m ${userName || 'System'} (${userId || 'N/A'}): ${message}\n`);

    /**
     * Primary Storage: Appwrite TablesDB
     * This powers the /audit-logs administrative dashboard.
     * Metadata is stringified to fit standard relational columns.
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
     * Records raw logs to /logs/audit.log on the server.
     * Useful for forensic analysis or if database connectivity is intermittent.
     */
    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, 'audit.log');
      const istTime = formatToISTFull(new Date());
      const logLine = `[${istTime}] [${level.toUpperCase()}] [${action}] ${userName || 'System'} (${userId || 'N/A'}): ${message}${metadata ? ' | Metadata: ' + JSON.stringify(metadata) : ''}\n`;
      fs.appendFileSync(logPath, logLine);
    } catch (fileErr) {
      console.error("Local File Logging Error:", fileErr);
      // We don't fail the request if file logging fails, as DB logging is the primary source
    }
  
      return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Audit Logging Error:", err);
    return NextResponse.json({ success: false, error: err.message });
  }
}
