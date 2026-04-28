import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Proxy the request to your local model server on port 5000
    const response = await fetch("http://localhost:5000/recognize", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] Recognition Error (${response.status}): ${errorText}`);
      return NextResponse.json(
        { error: `Model server error: ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(`[Proxy] Recognized Identity: ${JSON.stringify(data)}`);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to connect to local model server" },
      { status: 500 },
    );
  }
}
