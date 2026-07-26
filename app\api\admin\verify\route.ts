import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string };
  const expected = process.env.ADMIN_PASSWORD || "admin123";

  if (!body.code || body.code !== expected) {
    return NextResponse.json({ error: "管理员密码不正确" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
