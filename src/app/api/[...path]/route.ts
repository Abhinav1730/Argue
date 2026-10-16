import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const origin = request.headers.get("origin");
  let sameOrigin = !origin;
  if (origin) {
    try {
      sameOrigin = new URL(origin).host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin)
    return NextResponse.json(
      { error: "Cross-origin request rejected" },
      { status: 403 },
    );
  const path = (await params).path.join("/");
  if (!["rooms", "rooms/join", "rooms/renew", "translate"].includes(path))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (Number(request.headers.get("content-length") || 0) > 16384)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 16384)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const response = await fetch(
      "http://127.0.0.1:" + (process.env.ROOM_PORT || 8787) + "/" + path,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-room-secret": process.env.ROOM_SERVICE_SECRET || "",
          Authorization: request.headers.get("authorization") || "",
        },
        body,
        signal: AbortSignal.timeout(12000),
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Room service unavailable. Run npm run dev to start both services.",
      },
      { status: 503 },
    );
  }
}
