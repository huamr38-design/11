import { NextResponse } from "next/server";
import { bearerUser } from "../../lib/auth";
import { readUserState, saveUserState, type UserState } from "../../lib/userStore";

export async function GET(request: Request) {
  const username = bearerUser(request);
  if (!username) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ state: await readUserState(username) });
}

export async function PUT(request: Request) {
  const username = bearerUser(request);
  if (!username) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const state = (body?.state || {}) as UserState;
  await saveUserState(username, state);
  return NextResponse.json({ ok: true });
}
