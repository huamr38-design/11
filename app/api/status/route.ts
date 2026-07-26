import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

type StatusRequest = {
  character?: {
    name?: string;
    tags?: string[];
    profile?: string;
    personality?: string;
    scenario?: string;
    creatorNotes?: string;
    worldBook?: string;
  };
  userPersona?: string;
  userMessage?: string;
  assistantReply?: string;
  previousStatus?: Record<string, string | number>;
  memory?: string;
};

function clip(value: unknown, limit: number) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function safeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function chatCompletionsUrl(baseUrl: string) {
  if (baseUrl.endsWith("/v1")) return `${baseUrl}/chat/completions`;
  return `${baseUrl}/v1/chat/completions`;
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function buildStatusPrompt(body: StatusRequest) {
  const character = body.character || {};
  return [
    "根据这一轮聊天，更新状态面板。只返回 JSON，不要解释。",
    "格式：{\"status_update\":{\"当前阶段\":\"...\",\"调戏兴致\":0,\"脸红度\":0,\"身体燥热\":0,\"隐秘湿润\":0,\"禁忌感\":0,\"涵湿状态\":\"...\",\"衣衫完整度\":100,\"当前位置\":\"...\",\"心理状态\":\"...\",\"语气\":\"...\",\"眼神\":\"...\",\"当前穿着\":\"...\",\"身体反应\":\"...\"},\"memory_update\":\"\"}",
    "数值用 0-100，文字要短。没有长期记忆就让 memory_update 为空字符串。",
    `角色：${clip(character.name || "角色", 80)}`,
    `标签：${clip((character.tags || []).join(", "), 160)}`,
    `角色资料：${clip(character.profile, 360)}`,
    `当前场景：${clip(character.scenario, 260)}`,
    `用户设定：${clip(body.userPersona || "", 220)}`,
    `上一状态：${clip(JSON.stringify(body.previousStatus || {}), 700)}`,
    `长期记忆：${clip(body.memory || "", 450)}`,
    `用户刚说：${clip(body.userMessage || "", 600)}`,
    `角色刚回复：${clip(body.assistantReply || "", 900)}`
  ].join("\n");
}

function normalizeStatus(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const next: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry === "number") {
      next[key] = Math.max(0, Math.min(100, Math.round(entry)));
    } else if (typeof entry === "string") {
      next[key] = clip(entry, 40);
    }
  }
  return next;
}

export async function POST(request: Request) {
  const body = (await request.json()) as StatusRequest;
  const apiKey = process.env.AI_API_KEY;
  const rawBaseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const baseUrl = (rawBaseUrl || "").replace(/\/$/, "");
  const temperature = safeNumber(process.env.AI_TEMPERATURE, 0.55);
  const timeoutMs = Math.max(6000, Math.min(15000, safeNumber(process.env.AI_STATUS_TIMEOUT_MS, 12000)));

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json({ statusUpdate: {}, memoryUpdate: "" });
  }

  try {
    const upstream = await fetchWithTimeout(
      chatCompletionsUrl(baseUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: 260,
          messages: [{ role: "user", content: buildStatusPrompt(body) }]
        })
      },
      timeoutMs
    );

    if (!upstream.ok) {
      return NextResponse.json({ statusUpdate: {}, memoryUpdate: "" });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content) as { status_update?: unknown; statusUpdate?: unknown; memory_update?: unknown; memoryUpdate?: unknown } | null;
    if (!parsed) {
      return NextResponse.json({ statusUpdate: {}, memoryUpdate: "" });
    }

    return NextResponse.json({
      statusUpdate: normalizeStatus(parsed.status_update || parsed.statusUpdate),
      memoryUpdate: clip(parsed.memory_update || parsed.memoryUpdate || "", 500)
    });
  } catch {
    return NextResponse.json({ statusUpdate: {}, memoryUpdate: "" });
  }
}
