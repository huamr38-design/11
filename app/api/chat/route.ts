import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 60;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CharacterCard = {
  id?: string;
  name: string;
  tags?: string[];
  profile?: string;
  personality?: string;
  scenario?: string;
  creatorNotes?: string;
  worldBook?: string;
};

type BackendAgent = {
  id?: string;
  name?: string;
  description?: string;
  systemPrompt?: string;
  replyStyle?: string;
  statusRule?: string;
  memoryRule?: string;
  photos?: Array<{ name?: string; url?: string; note?: string }>;
};

type ChatRequest = {
  character: CharacterCard;
  backendAgent?: BackendAgent;
  userPersona?: string;
  messages?: ChatMessage[];
  status?: Record<string, string | number>;
  memory?: string;
  memoryLimit?: number;
  userMessage: string;
};

type ChatTiming = {
  serverStartAt: string;
  promptChars: number;
  requestBytes: number;
  upstreamMs?: number;
  serverTotalMs?: number;
  upstreamStatus?: number;
  errorName?: string;
  fallbackUsed?: boolean;
  fallbackMs?: number;
  fallbackErrorName?: string;
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

function buildSystemPrompt(body: ChatRequest) {
  const character = body.character || { name: "角色" };
  const agent = body.backendAgent || {};
  const memoryLimit = Math.max(1000, Math.min(5000, safeNumber(body.memoryLimit, 7000)));
  const limitedMemory = clip((body.memory || "").slice(-memoryLimit), 2000);
  const status = body.status || {};

  return [
    "你是一个私有角色聊天网站的后端导演。只输出 JSON，不要 Markdown，不要解释规则。",
    "你要用前台角色卡做人设，用通用智能体控制回复风格、状态栏和记忆。",
    "所有角色与用户默认都是成年人。遇到不合适内容时，保持角色口吻自然转向安全互动。",
    "回复 JSON 格式必须是：",
    "{\"reply\":\"角色回复正文\",\"status_update\":{\"当前阶段\":\"...\",\"心情\":\"...\",\"当前位置\":\"...\",\"语气\":\"...\",\"眼神\":\"...\",\"身体反应\":\"...\"},\"memory_update\":\"值得长期记住的新事实，没有就空字符串\"}",
    "",
    "通用智能体：",
    `名称：${clip(agent.name, 80)}`,
    `说明：${clip(agent.description, 160)}`,
    `总规则：${clip(agent.systemPrompt, 800)}`,
    `回复风格：${clip(agent.replyStyle, 300)}`,
    `状态栏规则：${clip(agent.statusRule, 300)}`,
    `记忆规则：${clip(agent.memoryRule, 300)}`,
    "",
    "用户设定：",
    clip(body.userPersona || "用户没有填写自己的角色设定。", 500),
    "",
    "前台角色卡：",
    `角色名：${clip(character.name, 80)}`,
    `标签：${clip((character.tags || []).join(", "), 200)}`,
    `角色背景：${clip(character.profile, 800)}`,
    `性格/说话方式：${clip(character.personality, 500)}`,
    `当前场景：${clip(character.scenario, 500)}`,
    `作者设定：${clip(character.creatorNotes, 600)}`,
    `世界书：${clip(character.worldBook, 600)}`,
    "",
    `当前状态栏：${clip(JSON.stringify(status), 500)}`,
    `长期记忆：${limitedMemory || "暂无"}`
  ].join("\n");
}

function buildFastSystemPrompt(body: ChatRequest) {
  const character = body.character || { name: "角色" };
  const agent = body.backendAgent || {};

  return [
    "请用中文自然回复，语气贴近下面的人物资料，正文不要太长。",
    `人物：${clip(character.name, 80)}`,
    `资料：${clip(character.profile, 300)}`,
    `性格：${clip(character.personality, 220)}`,
    `场景：${clip(character.scenario, 220)}`,
    `风格：${clip(agent.replyStyle || agent.systemPrompt, 220)}`,
    `用户：${clip(body.userPersona || "", 180)}`,
    `记忆：${clip(body.memory || "", 300)}`
  ].join("\n");
}

function buildRescueSystemPrompt(body: ChatRequest) {
  const character = body.character || { name: "角色" };
  const agent = body.backendAgent || {};

  return [
    "中文角色聊天，快速回复，不要解释规则，不要总结。",
    `角色：${clip(character.name, 40)}`,
    `核心：${clip(character.profile || character.personality || "", 160)}`,
    `场景：${clip(character.scenario || "", 120)}`,
    `风格：${clip(agent.replyStyle || agent.systemPrompt || "", 120)}`
  ].join("\n");
}

function recentMessages(body: ChatRequest) {
  return (body.messages || []).slice(-4).map((message) => ({
    role: message.role,
    content: clip(message.content, 700)
  }));
}

function buildConversationText(body: ChatRequest) {
  const history = recentMessages(body)
    .map((message) => `${message.role === "user" ? "用户" : "角色"}：${message.content}`)
    .join("\n");

  return [
    buildSystemPrompt(body),
    "",
    "最近对话：",
    history || "暂无",
    "",
    `用户：${clip(body.userMessage, 2000)}`
  ].join("\n");
}

function parseResponsesApiText(data: unknown) {
  const record = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (record.output_text) return record.output_text;
  return (
    record.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .filter(Boolean)
      .join("\n") || ""
  );
}

function chatCompletionsUrl(baseUrl: string) {
  if (baseUrl.endsWith("/v1")) return `${baseUrl}/chat/completions`;
  return `${baseUrl}/v1/chat/completions`;
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

function chatRequestInit(apiKey: string, body: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body
  };
}

export async function POST(request: Request) {
  const serverStart = Date.now();
  const body = (await request.json()) as ChatRequest;
  const apiKey = process.env.AI_API_KEY;
  const rawBaseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const baseUrl = (rawBaseUrl || "").replace(/\/$/, "");
  const temperature = safeNumber(process.env.AI_TEMPERATURE, 0.85);
  const configuredWireApi = process.env.AI_WIRE_API || "chat";
  const wireApi = model?.toLowerCase().includes("grok") ? "chat" : configuredWireApi;
  const maxTokens = Math.max(80, Math.min(2500, safeNumber(process.env.AI_MAX_TOKENS, 180)));
  const timeoutMs = Math.max(15000, Math.min(55000, safeNumber(process.env.AI_TIMEOUT_MS, 55000)));
  const primaryTimeoutMs = Math.min(timeoutMs, 32000);
  const rescueTimeoutMs = Math.min(18000, Math.max(8000, timeoutMs - primaryTimeoutMs));
  const fastSystemPrompt = buildFastSystemPrompt(body);
  const fullSystemPrompt = buildSystemPrompt(body);
  const timing: ChatTiming = {
    serverStartAt: new Date(serverStart).toISOString(),
    promptChars: fastSystemPrompt.length + clip(body.userMessage, 2000).length,
    requestBytes: 0
  };

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json({ error: "还没有配置模型 API，请检查 Vercel 环境变量。", timing }, { status: 500 });
  }

  if (request.headers.get("x-chat-debug") === "1") {
    return NextResponse.json({
      model,
      wireApi,
      baseHost: new URL(baseUrl).host,
      fastPromptChars: fastSystemPrompt.length,
      fullPromptChars: fullSystemPrompt.length,
      historyCount: recentMessages(body).length,
      maxTokens,
      timeoutMs,
      primaryTimeoutMs,
      rescueTimeoutMs
    });
  }

  try {
    const upstreamStart = Date.now();
    const upstreamBody =
      wireApi === "responses"
        ? JSON.stringify({
            model,
            temperature,
            input: buildConversationText(body)
          })
        : JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            messages: [
              ...recentMessages(body),
              { role: "user", content: `${fastSystemPrompt}\n\n用户：${clip(body.userMessage, 2000)}` }
            ]
          });
    timing.requestBytes = new TextEncoder().encode(upstreamBody).length;
    let upstream: Response;
    try {
      upstream =
        wireApi === "responses"
          ? await fetchWithTimeout(
              `${baseUrl}/responses`,
              chatRequestInit(apiKey, upstreamBody),
              primaryTimeoutMs
            )
          : await fetchWithTimeout(
              chatCompletionsUrl(baseUrl),
              chatRequestInit(apiKey, upstreamBody),
              primaryTimeoutMs
            );
    } catch (primaryError) {
      const primaryTimedOut = primaryError instanceof Error && primaryError.name === "AbortError";
      if (!primaryTimedOut || wireApi !== "chat") throw primaryError;

      timing.fallbackUsed = true;
      timing.errorName = primaryError.name;
      const fallbackStart = Date.now();
      const rescuePrompt = buildRescueSystemPrompt(body);
      const rescueBody = JSON.stringify({
        model,
        temperature,
        max_tokens: Math.min(120, maxTokens),
        messages: [
          ...recentMessages(body).slice(-2),
          { role: "user", content: `${rescuePrompt}\n\n用户：${clip(body.userMessage, 1000)}` }
        ]
      });
      timing.requestBytes = new TextEncoder().encode(rescueBody).length;
      try {
        upstream = await fetchWithTimeout(
          chatCompletionsUrl(baseUrl),
          chatRequestInit(apiKey, rescueBody),
          rescueTimeoutMs
        );
        timing.fallbackMs = Date.now() - fallbackStart;
      } catch (fallbackError) {
        timing.fallbackMs = Date.now() - fallbackStart;
        timing.fallbackErrorName = fallbackError instanceof Error ? fallbackError.name : "UnknownError";
        throw fallbackError;
      }
    }
    timing.upstreamMs = Date.now() - upstreamStart;
    timing.upstreamStatus = upstream.status;

    if (!upstream.ok) {
      const text = await upstream.text();
      timing.serverTotalMs = Date.now() - serverStart;
      return NextResponse.json(
        { error: `模型接口返回错误：${upstream.status}`, detail: text.slice(0, 800), timing },
        { status: 502 }
      );
    }

    const data = await upstream.json();
    const content =
      wireApi === "responses" ? parseResponsesApiText(data) : data?.choices?.[0]?.message?.content || "";
    timing.serverTotalMs = Date.now() - serverStart;
    if (wireApi === "chat") {
      return NextResponse.json({ reply: content || "我在。", statusUpdate: {}, memoryUpdate: "", timing });
    }

    const parsed = extractJson(content);

    if (!parsed) {
      return NextResponse.json({ reply: content || "模型没有返回内容。", statusUpdate: {}, memoryUpdate: "", timing });
    }

    return NextResponse.json({
      reply: parsed.reply || content,
      statusUpdate: parsed.status_update || parsed.statusUpdate || {},
      memoryUpdate: parsed.memory_update || parsed.memoryUpdate || "",
      timing
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    timing.errorName = error instanceof Error ? error.name : "UnknownError";
    timing.serverTotalMs = Date.now() - serverStart;
    return NextResponse.json(
      { error: isTimeout ? "模型响应超时，请稍后重试或换更快的模型。" : "模型请求失败，请检查中转站或模型配置。", timing },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
