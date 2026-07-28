import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

type BackendAgent = {
  name?: string;
  systemPrompt?: string;
};

type StatusRequest = {
  character?: {
    name?: string;
    tags?: string[];
    statusPrompt?: string;
    profile?: string;
    personality?: string;
    scenario?: string;
    creatorNotes?: string;
    worldBook?: string;
  };
  backendAgent?: BackendAgent;
  statusAgent?: BackendAgent;
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
  const statusRule = String(character.statusPrompt || body.statusAgent?.systemPrompt || "").trim();
  const defaultRule = [
    "你是独立的状态栏智能体，只负责根据本轮对话更新聊天下方的状态栏和长期记忆。",
    "状态栏必须跟随角色卡、通用智能体、用户本轮发言、角色本轮回复、上一轮状态变化。",
    "只返回 JSON，不要解释，不要 Markdown。文字字段要短，数值字段用 0-100。"
  ].join("\n");

  return [
    statusRule ? `Status bar agent rule:\n${clip(statusRule, 1800)}` : defaultRule,
    `通用智能体总规则摘要：\n${clip(body.backendAgent?.systemPrompt || "", 900)}`,
    `角色名：${clip(character.name || "角色", 80)}`,
    `角色资料：${clip(character.profile, 500)}`,
    `角色性格：${clip(character.personality, 420)}`,
    `当前场景：${clip(character.scenario, 360)}`,
    `角色卡正文：${clip(character.creatorNotes, 900)}`,
    `世界观/补充：${clip(character.worldBook, 500)}`,
    `我的设定：${clip(body.userPersona || "", 360)}`,
    `上一轮状态：${clip(JSON.stringify(body.previousStatus || {}), 900)}`,
    `长期记忆：${clip(body.memory || "", 650)}`,
    `用户刚说：${clip(body.userMessage || "", 700)}`,
    `角色刚回复：${clip(body.assistantReply || "", 1100)}`,
    "返回格式：",
    "{\"status_update\":{\"当前阶段\":\"...\",\"调戏兴致\":0,\"脸红度\":0,\"身体燥热\":0,\"隐私湿润\":0,\"禁忌感\":0,\"濡湿状态\":\"...\",\"衣物完整度\":100,\"当前位置\":\"...\",\"心理状态\":\"...\",\"语气\":\"...\",\"眼神\":\"...\",\"当前穿着\":\"...\",\"身体反应\":\"...\"},\"memory_update\":\"\"}",
    "如果没有新的重要长期记忆，memory_update 返回空字符串。"
  ].join("\n\n");
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

function clampPercent(value: unknown, fallback: number, delta: number) {
  const base = typeof value === "number" ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(base + delta)));
}

function fallbackStatus(body: StatusRequest) {
  const previous = body.previousStatus || {};
  const combined = `${body.userMessage || ""}\n${body.assistantReply || ""}`;
  const intensity = Math.min(10, Math.max(2, Math.ceil(combined.length / 80)));
  const warmWords = /喜欢|靠近|抱|害羞|脸红|紧张|心跳|温柔|暧昧|亲密/.test(combined);
  const calmWords = /你好|在吗|吃饭|工作|今天|聊天|普通|随便/.test(combined);
  const delta = warmWords ? intensity : calmWords ? 1 : Math.max(1, Math.floor(intensity / 2));

  return {
    当前阶段: String(previous.当前阶段 || "持续交流"),
    调戏兴致: clampPercent(previous.调戏兴致, 35, delta),
    脸红度: clampPercent(previous.脸红度, 20, warmWords ? delta : 1),
    身体燥热: clampPercent(previous.身体燥热, 10, warmWords ? Math.ceil(delta / 2) : 0),
    隐私湿润: clampPercent(previous.隐私湿润, 5, warmWords ? Math.ceil(delta / 3) : 0),
    禁忌感: clampPercent(previous.禁忌感, 15, Math.max(0, Math.floor(delta / 3))),
    濡湿状态: String(previous.濡湿状态 || "房间内，不在场"),
    衣物完整度: clampPercent(previous.衣物完整度, 95, 0),
    当前位置: String(previous.当前位置 || body.character?.scenario || "聊天中").slice(0, 40),
    心理状态: warmWords ? "有些动摇，继续观察" : "专注回应，等待下文",
    语气: warmWords ? "放轻，带一点迟疑" : "自然，低声",
    眼神: warmWords ? "微微闪躲，又忍不住看你" : "专注，带着笑意",
    当前穿着: String(previous.当前穿着 || "日常服装"),
    身体反应: warmWords ? "呼吸略乱" : "呼吸平稳"
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as StatusRequest;
  const apiKey = process.env.AI_API_KEY;
  const rawBaseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const baseUrl = (rawBaseUrl || "").replace(/\/$/, "");
  const temperature = safeNumber(process.env.AI_TEMPERATURE, 0.55);
  const timeoutMs = Math.max(6000, Math.min(25000, safeNumber(process.env.AI_STATUS_TIMEOUT_MS, 22000)));

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json({ statusUpdate: fallbackStatus(body), memoryUpdate: "" });
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
          max_tokens: 360,
          messages: [{ role: "user", content: buildStatusPrompt(body) }]
        })
      },
      timeoutMs
    );

    if (!upstream.ok) {
      return NextResponse.json({ statusUpdate: fallbackStatus(body), memoryUpdate: "" });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content) as { status_update?: unknown; statusUpdate?: unknown; memory_update?: unknown; memoryUpdate?: unknown } | null;
    if (!parsed) {
      return NextResponse.json({ statusUpdate: fallbackStatus(body), memoryUpdate: "" });
    }
    const statusUpdate = normalizeStatus(parsed.status_update || parsed.statusUpdate);

    return NextResponse.json({
      statusUpdate: Object.keys(statusUpdate).length ? statusUpdate : fallbackStatus(body),
      memoryUpdate: clip(parsed.memory_update || parsed.memoryUpdate || "", 500)
    });
  } catch {
    return NextResponse.json({ statusUpdate: fallbackStatus(body), memoryUpdate: "" });
  }
}
