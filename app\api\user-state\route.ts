import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

type UserState = {
  messagesByCharacter?: Record<string, unknown[]>;
  statusByCharacter?: Record<string, Record<string, string | number>>;
  memoryByCharacter?: Record<string, string>;
  userPersona?: string;
  memoryLimit?: number;
};

function userFile(user: string) {
  const safe = user.trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]/gi, "_").slice(0, 40);
  if (!safe) return null;
  return path.join(process.cwd(), "data", "users", `${safe}.json`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const file = userFile(url.searchParams.get("user") || "");
  if (!file) return NextResponse.json({ error: "user is required" }, { status: 400 });

  try {
    const text = await fs.readFile(file, "utf8");
    return NextResponse.json({ state: JSON.parse(text) });
  } catch {
    return NextResponse.json({ state: null });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const file = userFile(String(body?.user || ""));
  if (!file) return NextResponse.json({ error: "user is required" }, { status: 400 });

  const state = (body?.state || {}) as UserState;
  const cleanState: UserState = {
    messagesByCharacter: state.messagesByCharacter || {},
    statusByCharacter: state.statusByCharacter || {},
    memoryByCharacter: state.memoryByCharacter || {},
    userPersona: String(state.userPersona || ""),
    memoryLimit: Math.max(1000, Math.min(50000, Number(state.memoryLimit || 7000)))
  };

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(cleanState, null, 2), "utf8");
  return NextResponse.json({ ok: true });
}
