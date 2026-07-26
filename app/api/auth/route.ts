import { NextResponse } from "next/server";
import { createSessionToken } from "../../lib/auth";
import { loginUser, registerUser } from "../../lib/userStore";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const mode = String(body?.mode || "login");
    const username = String(body?.username || "");
    const password = String(body?.password || "");

    const result = mode === "register"
      ? await registerUser(username, password)
      : await loginUser(username, password);

    if (!result.ok || !result.username) {
      return NextResponse.json({ error: result.error || "账号处理失败" }, { status: 400 });
    }

    return NextResponse.json({
      user: result.username,
      token: createSessionToken(result.username)
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "账号服务异常"
    }, { status: 500 });
  }
}
