import { NextResponse } from "next/server";
import { readMaintenance, saveMaintenance } from "../../lib/settingsStore";

function isAdmin(request: Request) {
  const expected = process.env.ADMIN_PASSWORD || "admin123";
  return request.headers.get("x-admin-code") === expected;
}

export async function GET() {
  return NextResponse.json({ maintenance: await readMaintenance() });
}

export async function PUT(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "管理员密码不正确" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const maintenance = await saveMaintenance(body?.maintenance || {});
  return NextResponse.json({ maintenance });
}
