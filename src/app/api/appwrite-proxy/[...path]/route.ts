import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return proxyRequest(request, path);
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return proxyRequest(request, path);
}

export async function PUT(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return proxyRequest(request, path);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return proxyRequest(request, path);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return proxyRequest(request, path);
}

export async function OPTIONS(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    return proxyRequest(request, path);
}

async function proxyRequest(request: Request, pathSegments: string[]) {
    const path = pathSegments.join('/');
    const targetUrl = new URL(`https://hostel.ram3ez.dev/v1/${path}${new URL(request.url).search}`);

    // Clone headers and remove host to avoid SSL/Domain mismatch
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');

    try {
        const options: RequestInit = {
            method: request.method,
            headers: headers,
        };

        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
            const body = await request.arrayBuffer();
            options.body = body;
        }

        const response = await fetch(targetUrl.toString(), options);
        
        // Return response with original status and headers
        const responseHeaders = new Headers(response.headers);
        
        // Ensure CORS is allowed from our own origin
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'X-Appwrite-Project, X-Appwrite-Key, X-Appwrite-Response-Format, Content-Type, Authorization, X-Appwrite-ID');

        return new NextResponse(response.body, {
            status: response.status,
            headers: responseHeaders,
        });
    } catch (error: any) {
        console.error("[🌉 PROXY ERROR]", error);
        return NextResponse.json({ 
            success: false, 
            message: "Proxy failed to reach Appwrite tunnel",
            error: error.message 
        }, { status: 502 });
    }
}
