import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { action, message } = await req.json();
    console.log(`\n\x1b[36m[📱 ${action}]\x1b[0m ${message}\n`);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false });
  }
}
