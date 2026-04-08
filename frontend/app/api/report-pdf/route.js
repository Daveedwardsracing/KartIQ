import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.REPORT_BACKEND_URL || "http://127.0.0.1:8000";

export async function GET() {
  return NextResponse.json({ ok: true, provider: "backend-proxy" });
}

export async function POST(request) {
  const body = await request.text();
  const response = await fetch(`${BACKEND_BASE_URL}/reports/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return new NextResponse(text || "PDF export failed", {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  }

  const blob = await response.arrayBuffer();
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/pdf",
      "Content-Disposition": response.headers.get("content-disposition") || "attachment; filename=session-report.pdf",
    },
  });
}
