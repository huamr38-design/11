import { NextResponse } from "next/server";
import { isAdminRequest } from "../../lib/globalConfigStore";

export const runtime = "nodejs";
export const maxDuration = 60;

function withV1(baseUrl: string, path: string) {
  const clean = baseUrl.replace(/\/$/, "");
  if (clean.endsWith("/v1")) return `${clean}${path}`;
  return `${clean}/v1${path}`;
}

async function probe(name: string, url: string, body: unknown, apiKey: string) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    return {
      name,
      status: response.status,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      preview: text.slice(0, 180)
    };
  } catch (error) {
    return {
      name,
      status: 0,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      preview: error instanceof Error ? error.name : "request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "admin password is invalid" }, { status: 401 });
  }

  const apiKey = process.env.AI_API_KEY || "";
  const baseUrl = (process.env.AI_BASE_URL || "").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "";

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json({ error: "AI env is incomplete" }, { status: 500 });
  }

  const results = await Promise.all([
    probe("responses", `${baseUrl}/responses`, { model, input: "只回答 ok" }, apiKey),
    probe("v1-responses", withV1(baseUrl, "/responses"), { model, input: "只回答 ok" }, apiKey),
    probe(
      "v1-chat",
      withV1(baseUrl, "/chat/completions"),
      { model, messages: [{ role: "user", content: "只回答 ok" }], max_tokens: 50 },
      apiKey
    )
  ]);

  return NextResponse.json({
    model,
    baseHost: new URL(baseUrl).host,
    results
  });
}
