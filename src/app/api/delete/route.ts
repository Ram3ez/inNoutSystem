import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { roll_no } = await request.json();

    if (!roll_no) {
      return NextResponse.json(
        { error: "Roll number is required" },
        { status: 400 }
      );
    }

    // Proxy the request to the local model server on port 5000
    const response = await fetch("http://localhost:5000/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roll_no }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
      console.error(`[Proxy] Delete Error (${response.status}): ${JSON.stringify(errorData)}`);
      return NextResponse.json(
        { error: `Model server error: ${errorData.message || response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`[Proxy] Delete Result for ${roll_no}: ${JSON.stringify(data)}`);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Delete Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to connect to local model server" },
      { status: 500 }
    );
  }
}
