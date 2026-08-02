import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 70;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CharacterCard = {
  id?: string;
  name: string;
  tags?: string[];
  statusPrompt?: string;
  statusNames?: string[];
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
  statusAgent?: BackendAgent;
  userPersona?: string;
  messages?: ChatMessage[];
  status?: Record<string, string | number>;
  memory?: string;
  memoryLimit?: number;
  contextMessageLimit?: number;
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

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPerspectiveRules(body: ChatRequest, statusNames: string[]) {
  const mentionedNames = statusNames.filter((name) => new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=\\s|$|[，。！？,.!?])`).test(body.userMessage || ""));
  return [
    "视角和称谓硬规则：",
    "1. 用户永远是“你”，不要把用户改写成角色名、我、他或她。",
    "2. 当前正在说话的角色自称可以用“我”；其他角色必须用角色名、他或她，不要把其他角色写成“你”或“我”。",
    "3. 如果剧情里出现 A 说 B、A 看向 B、A 对 B 做动作，必须保留 A/B 的主语关系，不要把 B 改成用户“你”，也不要把 A 改成“我”。",
    "4. 每句动作描写先确认主语；动作属于谁就写谁，不要互换角色动作和台词。",
    "5. 用户输入里的第三人称叙述要按第三人称处理，不要擅自改写成第一人称体验。",
    mentionedNames.length ? `6. 本轮用户明确 @ 了：${mentionedNames.join("、")}。优先让被 @ 的角色回应用户；其他角色可以少量反应，但不要抢主回复。` : ""
  ].filter(Boolean).join("\n");
}

function buildSystemPrompt(body: ChatRequest) {
  const character = body.character || { name: "角色" };
  const agent = body.backendAgent || {};
  const statusInstruction = statusMarkerInstruction(body);
  const statusNames = Array.isArray(character.statusNames) ? character.statusNames.map(String).filter(Boolean) : [];
  const multiRoleRule = statusNames.length > 1
    ? `Multi-character rule: the character card contains these characters: ${statusNames.join(", ")}. When the user says "you", treat it as the user speaking to these characters, not one character speaking to another. Do not rewrite the user's words as dialogue between characters; let each relevant character answer the user directly.`
    : "";
  const perspectiveRules = buildPerspectiveRules(body, statusNames);
  const memoryLimit = Math.max(1000, Math.min(5000, safeNumber(body.memoryLimit, 7000)));
  const limitedMemory = clip((body.memory || "").slice(-memoryLimit), 2000);
  const status = body.status || {};

  return [
    "你是一个私有角色聊天网站的后端导演。只输出 JSON，不要 Markdown，不要解释规则。",
    "你要用前台角色卡做人设，用通用智能体控制回复风格、状态栏和记忆。",
    "所有角色与用户默认都是成年人。遇到不合适内容时，保持角色口吻自然转向安全互动。",
    statusInstruction,
    multiRoleRule,
    perspectiveRules,
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
  const statusInstruction = statusMarkerInstruction(body);
  const statusNames = Array.isArray(character.statusNames) ? character.statusNames.map(String).filter(Boolean) : [];
  const multiRoleRule = statusNames.length > 1
    ? `Multi-character rule: characters are ${statusNames.join(", ")}. User "you" means the user is speaking to these characters. Do not turn the user's sentence into one character asking another character.`
    : "";
  const perspectiveRules = buildPerspectiveRules(body, statusNames);

  return [
    "请用中文自然完整回复，语气贴近下面的人物资料。主回复正文至少400个中文字符，除非用户明确要求极短回答。",
    "说话内容和动作描写都要服务当前剧情，不要机械总结。",
    statusInstruction,
    multiRoleRule,
    perspectiveRules,
    `人物：${clip(character.name, 80)}`,
    `资料：${clip(character.profile, 900)}`,
    `性格：${clip(character.personality, 700)}`,
    `场景：${clip(character.scenario, 500)}`,
    `作者设定：${clip(character.creatorNotes, 500)}`,
    `风格：${clip([agent.systemPrompt, agent.replyStyle].filter(Boolean).join("\n"), 1200)}`,
    `用户：${clip(body.userPersona || "", 300)}`,
    `当前状态栏：${clip(JSON.stringify(body.status || {}), 1200)}`,
    `记忆：${clip(body.memory || "", 700)}`
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
  const limit = Math.max(2, Math.min(24, safeNumber(body.contextMessageLimit, 8)));
  return (body.messages || []).slice(-limit).map((message) => ({
    role: message.role,
    content: clip(message.content, 600)
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

function sseMessage(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

const STATUS_OPEN_MARKER = "<APP_STATUS_JSON>";
const STATUS_CLOSE_MARKER = "</APP_STATUS_JSON>";

function statusMarkerInstruction(body: ChatRequest) {
  const character = body.character || { name: "角色" };
  const statusAgent = body.statusAgent || {};
  const statusRule = String(character.statusPrompt || "").trim()
    || String(statusAgent.systemPrompt || statusAgent.statusRule || statusAgent.replyStyle || "").trim()
    || "根据本轮剧情更新状态栏。";

  return [
    "状态栏生成规则：",
    statusRule,
    "状态栏必须写本轮剧情后的具体结果，不要原样输出规则文字，例如不要写“随剧情变化”“保持原设定”这种规则句。",
    "不要在聊天正文开头或正文中写“状态栏”“当前阶段：”“好感度：”等状态栏文字；这些只能放进最后的隐藏 JSON。",
    "状态栏字段优先沿用“当前状态栏”里的字段名；数值字段输出 0-100 的数字，文字字段输出具体状态。",
    `正文结束后，在最后单独追加一行：${STATUS_OPEN_MARKER}{\"status_update\":{},\"memory_update\":\"\"}${STATUS_CLOSE_MARKER}`,
    "标记里的 JSON 只给系统读取，不要在正文里解释它。"
  ].join("\n");
}

function parseCombinedReply(text: string) {
  const openIndex = text.indexOf(STATUS_OPEN_MARKER);
  const closeIndex = text.indexOf(STATUS_CLOSE_MARKER, openIndex + STATUS_OPEN_MARKER.length);
  let reply = text;
  let metaText = "";

  if (openIndex >= 0) {
    reply = text.slice(0, openIndex);
    metaText = closeIndex >= 0
      ? text.slice(openIndex + STATUS_OPEN_MARKER.length, closeIndex)
      : text.slice(openIndex + STATUS_OPEN_MARKER.length);
  } else {
    const parsed = extractJson(text) as { reply?: string; status_update?: unknown; statusUpdate?: unknown; memory_update?: string; memoryUpdate?: string } | null;
    if (parsed?.reply) {
      return {
        reply: parsed.reply,
        statusUpdate: parsed.status_update || parsed.statusUpdate || {},
        memoryUpdate: parsed.memory_update || parsed.memoryUpdate || ""
      };
    }
  }

  const parsed = extractJson(metaText) as { status_update?: unknown; statusUpdate?: unknown; memory_update?: string; memoryUpdate?: string } | null;
  return {
    reply: stripInlineStatusBlock(reply),
    statusUpdate: parsed?.status_update || parsed?.statusUpdate || {},
    memoryUpdate: parsed?.memory_update || parsed?.memoryUpdate || ""
  };
}

function stripInlineStatusBlock(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const lines = trimmed.split(/\r?\n/);
  if (!/^【?状态栏】?/i.test(lines[0].trim())) return trimmed;
  const firstBlank = lines.findIndex((line, index) => index > 0 && !line.trim());
  if (firstBlank >= 0 && firstBlank < lines.length - 1) return lines.slice(firstBlank + 1).join("\n").trim();
  const replyStart = lines.findIndex((line, index) => index > 0 && !/[:：]/.test(line) && line.trim().length > 12);
  return replyStart > 0 ? lines.slice(replyStart).join("\n").trim() : "";
}

function parseStreamDelta(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[DONE]") return { done: trimmed === "[DONE]", text: "" };
  try {
    const data = JSON.parse(trimmed);
    const choice = data?.choices?.[0];
    const text =
      choice?.delta?.content ||
      choice?.message?.content ||
      data?.delta ||
      data?.text ||
      data?.content ||
      "";
    return { done: Boolean(choice?.finish_reason), text: typeof text === "string" ? text : "" };
  } catch {
    return { done: false, text: trimmed };
  }
}

function streamUpstreamResponse(upstream: Response, timing: ChatTiming, serverStart: number) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body?.getReader();

  if (!reader) {
    return NextResponse.json({ error: "模型没有返回可读取的流。", timing }, { status: 502 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let rawReply = "";
      let emittedLength = 0;
      try {
        const emitVisibleText = () => {
          const markerIndex = rawReply.indexOf(STATUS_OPEN_MARKER);
          const visibleEnd = markerIndex >= 0
            ? markerIndex
            : Math.max(0, rawReply.length - STATUS_OPEN_MARKER.length + 1);
          if (visibleEnd <= emittedLength) return;
          const nextText = rawReply.slice(emittedLength, visibleEnd);
          emittedLength = visibleEnd;
          if (nextText) controller.enqueue(encoder.encode(sseMessage({ type: "delta", text: nextText })));
        };

        const finish = () => {
          const parsedReply = parseCombinedReply(rawReply);
          const reply = parsedReply.reply || rawReply.slice(0, emittedLength).trim();
          timing.serverTotalMs = Date.now() - serverStart;
          controller.enqueue(encoder.encode(sseMessage({
            type: "done",
            reply,
            statusUpdate: parsedReply.statusUpdate || {},
            memoryUpdate: parsedReply.memoryUpdate || "",
            timing
          })));
          controller.close();
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith(":")) continue;
            const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
            const parsed = parseStreamDelta(payload);
            if (parsed.text) {
              rawReply += parsed.text;
              emitVisibleText();
            }
            if (parsed.done) {
              finish();
              return;
            }
          }
        }

        if (buffer.trim()) {
          const payload = buffer.trim().startsWith("data:") ? buffer.trim().slice(5).trim() : buffer.trim();
          const parsed = parseStreamDelta(payload);
          if (parsed.text) {
            rawReply += parsed.text;
            emitVisibleText();
          }
        }

        finish();
      } catch (error) {
        timing.errorName = error instanceof Error ? error.name : "StreamError";
        timing.serverTotalMs = Date.now() - serverStart;
        controller.enqueue(encoder.encode(sseMessage({ type: "error", error: "模型流式返回中断。", timing })));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function shouldRetryUpstream(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
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
  const maxTokens = Math.max(400, Math.min(2500, safeNumber(process.env.AI_MAX_TOKENS, 1000)));
  const timeoutMs = Math.max(12000, Math.min(70000, safeNumber(process.env.AI_TIMEOUT_MS, 70000)));
  const primaryTimeoutMs = timeoutMs;
  const rescueTimeoutMs = 0;
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
    if (wireApi === "chat") {
      const streamBody = JSON.stringify({ ...JSON.parse(upstreamBody), stream: true });
      timing.requestBytes = new TextEncoder().encode(streamBody).length;
      const streamStarted = Date.now();
      const streamUpstream = await fetchWithTimeout(
        chatCompletionsUrl(baseUrl),
        chatRequestInit(apiKey, streamBody),
        primaryTimeoutMs
      );
      timing.upstreamMs = Date.now() - streamStarted;
      timing.upstreamStatus = streamUpstream.status;

      if (!streamUpstream.ok) {
        const text = await streamUpstream.text();
        timing.serverTotalMs = Date.now() - serverStart;
        return NextResponse.json(
          { error: `模型接口返回错误：${streamUpstream.status}`, detail: text.slice(0, 800), timing },
          { status: 502 }
        );
      }

      return streamUpstreamResponse(streamUpstream, timing, serverStart);
    }

    let upstream: Response;
    let rescueBody = "";
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
      if (primaryTimedOut) timing.errorName = primaryError.name;
      if (primaryTimedOut && wireApi === "chat") throw primaryError;
      if (!primaryTimedOut || wireApi !== "chat") throw primaryError;
      timing.fallbackUsed = true;
      const fallbackStart = Date.now();
      const rescuePrompt = buildRescueSystemPrompt(body);
      rescueBody = JSON.stringify({
        model,
        temperature,
        max_tokens: Math.min(120, maxTokens),
        messages: [
          ...recentMessages(body).slice(-2),
          { role: "user", content: `${rescuePrompt}\n\n用户：${clip(body.userMessage, 1000)}` }
        ]
      });
      timing.requestBytes = new TextEncoder().encode(rescueBody).length;
      upstream = await fetchWithTimeout(
        chatCompletionsUrl(baseUrl),
        chatRequestInit(apiKey, rescueBody),
        rescueTimeoutMs
      );
      timing.fallbackMs = Date.now() - fallbackStart;
    }
    timing.upstreamMs = Date.now() - upstreamStart;
    timing.upstreamStatus = upstream.status;

    if (!upstream.ok && wireApi === "chat" && rescueTimeoutMs > 0 && shouldRetryUpstream(upstream.status)) {
      timing.fallbackUsed = true;
      const fallbackStart = Date.now();
      const rescuePrompt = buildRescueSystemPrompt(body);
      rescueBody = JSON.stringify({
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
        timing.upstreamStatus = upstream.status;
        timing.upstreamMs = Date.now() - upstreamStart;
      } catch (fallbackError) {
        timing.fallbackMs = Date.now() - fallbackStart;
        timing.fallbackErrorName = fallbackError instanceof Error ? fallbackError.name : "UnknownError";
        throw fallbackError;
      }
    }

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
