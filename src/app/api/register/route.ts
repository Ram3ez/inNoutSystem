import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const rollNo = formData.get("roll_no");
    const images = formData.getAll("images");
    
    console.log(`[Proxy] Normalizing request for roll_no: ${rollNo}, images found: ${images.length}`);

    // Create a fresh FormData to ensure specific key names for Flask
    const flaskData = new FormData();
    flaskData.append("roll_no", rollNo as string);
    images.forEach((img) => {
      flaskData.append("images", img as File);
    });

    // Proxy the request to your local model server on port 5000
    const response = await fetch("http://localhost:5000/register", {
      method: "POST",
      body: flaskData as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] AI Server Error (${response.status}): ${errorText}`);
      return NextResponse.json(
        { error: `Model server error: ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json().catch(() => null);
    console.log(`[Proxy] AI Server Response: ${JSON.stringify(data || "Success")}`);
    
    // If the response is just text but the status is OK, handle it
    if (data === null) {
        const text = await response.text();
        return NextResponse.json({ message: text });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Registration Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to connect to local model server" },
      { status: 500 },
    );
  }
}
