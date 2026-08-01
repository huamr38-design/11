import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

type BackendAgent = {
  name?: string;
  systemPrompt?: string;
};

type StatusMessage = {
  role?: "user" | "assistant";
  content?: string;
};

type StatusRequest = {
  character?: {
    name?: string;
    tags?: string[];
    statusPrompt?: string;
    statusNames?: string[];
    profile?: string;
    personality?: string;
    scenario?: string;
    creatorNotes?: string;
    worldBook?: string;
  };
  backendAgent?: BackendAgent;
  statusAgent?: BackendAgent;
  messages?: StatusMessage[];
  userPersona?: string;
  userMessage?: string;
  assistantReply?: string;
  previousStatus?: Record<string, string | number | Record<string, string | number>>;
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

function cleanStatusNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function cleanFieldName(value: string) {
  return value
    .replace(/^[\s\-*•·\d.、)）(（]+/, "")
    .replace(/^[^\p{L}\p{N}_]+/u, "")
    .replace(/[：:・|-].*$/, "")
    .replace(/[0-9０-９]+%?$/, "")
    .trim()
    .slice(0, 18);
}

function extractStatusFieldNames(...rules: unknown[]) {
  const text = rules.map((rule) => String(rule || "")).join("\n");
  const names = new Set<string>();
  const defaultFields = ["当前阶段", "心情", "位置", "动作", "对用户态度", "语气", "眼神", "穿着", "身体反应"];
  const stopWords = new Set(["STATUS", "状态", "状态栏", "角色", "用户", "返回格式", "JSON", "说明", "规则", "注意", "示例"]);

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) continue;
    const match = trimmed.match(/^(.{1,24}?)(?:[：:・|]| {2,}| - | – | — )/);
    const rawName = match ? match[1] : "";
    const name = cleanFieldName(rawName);
    if (name.length >= 2 && !stopWords.has(name) && !/^\d+$/.test(name)) names.add(name);
  }

  return names.size ? Array.from(names).slice(0, 18) : defaultFields;
}

function recentStatusMessages(messages: StatusMessage[] | undefined) {
  return (messages || [])
    .slice(-8)
    .map((message) => `${message.role === "assistant" ? "AI" : "User"}: ${clip(message.content || "", 700)}`)
    .join("\n");
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
  const globalStatusRule = String(body.statusAgent?.systemPrompt || "").trim();
  const characterStatusRule = String(character.statusPrompt || "").trim();
  const statusNames = cleanStatusNames(character.statusNames);
  const multiRoleRule = statusNames.length
    ? [
        "Multi-character status mode is ON.",
        `The status character names are: ${statusNames.join(", ")}`,
        "You must return status_update as an object whose top-level keys are exactly these names.",
        "Each top-level character value must be a separate status object.",
        "Never merge multiple characters into one shared status object.",
        "If a character did not appear this round, keep or gently update that character's previous status."
      ].join("\n")
    : "";
  const defaultRule = [
    "你是独立的状态栏智能体，只负责根据本轮对话更新聊天下方的状态栏和长期记忆。",
    "状态栏必须跟随角色卡、通用智能体、用户本轮发言、角色本轮回复、上一轮状态变化。",
    "只返回 JSON，不要解释，不要 Markdown。文字字段要短，数值字段用 0-100。"
  ].join("\n");

  return [
    globalStatusRule ? `Global status bar rule:\n${clip(globalStatusRule, 1800)}` : defaultRule,
    characterStatusRule ? `Current character status supplement rule:\n${clip(characterStatusRule, 1400)}` : "",
    multiRoleRule,
    "Hard rules: status must match the latest plot. If a field is not changed by the latest dialogue, inherit previous status. Do not invent a new location, relationship phase, clothing, or body state.",
    "In multi-character cards, the user's word \"you\" means the user is speaking to the listed characters, not one character speaking to another.",
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

function normalizeFlatStatus(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const next: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry === "number") {
      next[key] = Math.max(0, Math.min(100, Math.round(entry)));
    } else if (typeof entry === "string") {
      next[key] = clip(entry, 40);
    } else if (Array.isArray(entry)) {
      next[key] = clip(entry.map(String).filter(Boolean).slice(0, 8).join("、"), 80);
    }
  }
  return next;
}

function normalizeStatus(value: unknown, statusNames: string[]) {
  const flat = normalizeFlatStatus(value);
  if (!statusNames.length) return flat;
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const grouped: Record<string, Record<string, string | number>> = {};

  for (const name of statusNames) {
    const direct = normalizeFlatStatus(raw[name]);
    grouped[name] = Object.keys(direct).length ? direct : flat;
  }

  return grouped;
}

function shapeStatusFields(status: Record<string, string | number>, fields: string[], body: StatusRequest) {
  const combined = `${body.userMessage || ""}\n${body.assistantReply || ""}`;
  const base: Record<string, string | number> = {};
  for (const field of fields) {
    if (status[field] !== undefined && status[field] !== "") {
      base[field] = status[field];
      continue;
    }
    if (/度|值|系数|进度|欲望|好感|亲密|警惕|信任|恐惧|羞耻|紧张|堕落|温度/.test(field)) {
      base[field] = Math.min(100, Math.max(0, Math.ceil(combined.length / 18)));
    } else if (/位置|地点|场景/.test(field)) {
      base[field] = clip(String(body.character?.scenario || "当前场景"), 40);
    } else if (/穿|衣|服装/.test(field)) {
      base[field] = String(status[field] || "保持角色卡设定");
    } else if (/动作|姿态|行为/.test(field)) {
      base[field] = combined ? "根据本轮对话继续反应" : "等待下文";
    } else if (/眼神/.test(field)) {
      base[field] = "专注观察";
    } else if (/语气/.test(field)) {
      base[field] = "贴合本轮情绪";
    } else if (/阶段/.test(field)) {
      base[field] = String(status[field] || "持续交流");
    } else {
      base[field] = String(status[field] || "随本轮剧情轻微变化");
    }
  }
  return base;
}

function shapeStatusUpdate(value: unknown, body: StatusRequest) {
  const character = body.character || {};
  const statusNames = cleanStatusNames(character.statusNames);
  const fields = extractStatusFieldNames(body.statusAgent?.systemPrompt, character.statusPrompt);
  const normalized = normalizeStatus(value, statusNames);

  if (!statusNames.length) {
    return shapeStatusFields(normalizeFlatStatus(normalized), fields, body);
  }

  const raw = normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized as Record<string, unknown> : {};
  return Object.fromEntries(statusNames.map((name) => {
    const group = normalizeFlatStatus(raw[name]);
    return [name, shapeStatusFields(group, fields, body)];
  }));
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

  const next = {
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
  const statusNames = cleanStatusNames(body.character?.statusNames);
  if (!statusNames.length) return next;
  return Object.fromEntries(statusNames.map((name) => [name, next]));
}

function fallbackStatusV2(body: StatusRequest) {
  const statusNames = cleanStatusNames(body.character?.statusNames);
  const previous = body.previousStatus || {};
  const combined = `${body.userMessage || ""}\n${body.assistantReply || ""}`;
  const changed = Math.min(10, Math.max(1, Math.ceil(combined.length / 160)));
  const fields = extractStatusFieldNames(body.statusAgent?.systemPrompt, body.character?.statusPrompt);
  const makeOne = (prior: Record<string, string | number> = {}) => ({
    "\u5f53\u524d\u9636\u6bb5": String(prior["\u5f53\u524d\u9636\u6bb5"] || "\u6301\u7eed\u4ea4\u6d41"),
    "\u5fc3\u60c5": combined ? "\u88ab\u672c\u8f6e\u5bf9\u8bdd\u7275\u52a8" : String(prior["\u5fc3\u60c5"] || "\u5e73\u7a33"),
    "\u4f4d\u7f6e": String(prior["\u4f4d\u7f6e"] || body.character?.scenario || "\u5bf9\u8bdd\u573a\u666f").slice(0, 40),
    "\u52a8\u4f5c": combined ? "\u6839\u636e\u5bf9\u8bdd\u7ee7\u7eed\u53cd\u5e94" : String(prior["\u52a8\u4f5c"] || "\u7b49\u5f85\u4e0b\u4e00\u6b65"),
    "\u5bf9\u7528\u6237\u6001\u5ea6": String(prior["\u5bf9\u7528\u6237\u6001\u5ea6"] || "\u4fdd\u6301\u5173\u6ce8"),
    "\u8bed\u6c14": String(prior["\u8bed\u6c14"] || "\u81ea\u7136"),
    "\u773c\u795e": String(prior["\u773c\u795e"] || "\u4e13\u6ce8"),
    "\u7a7f\u7740": String(prior["\u7a7f\u7740"] || "\u4fdd\u6301\u539f\u8bbe\u5b9a"),
    "\u8eab\u4f53\u53cd\u5e94": String(prior["\u8eab\u4f53\u53cd\u5e94"] || "\u968f\u5267\u60c5\u8f7b\u5fae\u53d8\u5316"),
    "\u5173\u7cfb\u63a8\u8fdb": Math.max(0, Math.min(100, Number(prior["\u5173\u7cfb\u63a8\u8fdb"] || 30) + changed))
  });
  const makeShaped = (prior: Record<string, string | number> = {}) => shapeStatusFields({ ...makeOne(prior), ...prior }, fields, body);

  if (!statusNames.length) return makeShaped(previous as Record<string, string | number>);
  return Object.fromEntries(statusNames.map((name) => {
    const prior = previous[name];
    return [name, makeShaped(prior && typeof prior === "object" && !Array.isArray(prior) ? prior as Record<string, string | number> : {})];
  }));
}

function buildStatusPromptV2(body: StatusRequest) {
  const character = body.character || {};
  const statusNames = cleanStatusNames(character.statusNames);
  const globalStatusRule = String(body.statusAgent?.systemPrompt || "").trim();
  const characterStatusRule = String(character.statusPrompt || "").trim();
  const multiRoleRule = statusNames.length
    ? [
        "Multi-character status mode is ON.",
        `Status character names: ${statusNames.join(", ")}`,
        "Return status_update as an object whose top-level keys are exactly these names.",
        "Each top-level value must be that character's own status object.",
        "Never merge multiple characters into one shared status object."
      ].join("\n")
    : "Single-character status mode.";

  return [
    globalStatusRule ? `Global status bar rule - highest priority:\n${clip(globalStatusRule, 2400)}` : "",
    characterStatusRule ? `Current character status supplement rule - second priority:\n${clip(characterStatusRule, 2600)}` : "",
    "You are the independent status-bar agent. Return JSON only, no Markdown, no explanation.",
    "Priority order: 1) Global status bar rule, 2) Current character status supplement rule, 3) previous status, 4) default safety rules.",
    "The Global status bar rule and Current character status supplement rule are HARD output contracts. If they define fields, labels, status names, limits, or wording style, you must follow them exactly.",
    "The status must match the latest plot and must not contradict the assistant reply.",
    "If the latest dialogue does not change a field, inherit the previous status instead of inventing changes.",
    "Do not invent a new location, relationship phase, clothing, posture, or emotion unless the dialogue supports it.",
    "If a value is numeric, use 0-100. If a value is text, keep it short.",
    "In multi-character cards, the user's word \"you\" means the user is speaking to the listed characters, not one character speaking to another.",
    multiRoleRule,
    `Backend/common agent:\n${clip(body.backendAgent?.systemPrompt || "", 900)}`,
    `Character name: ${clip(character.name || "character", 80)}`,
    `Character tags: ${clip((character.tags || []).join(", "), 180)}`,
    `Character profile: ${clip(character.profile, 500)}`,
    `Character personality: ${clip(character.personality, 420)}`,
    `Current scene: ${clip(character.scenario, 360)}`,
    `Character card body: ${clip(character.creatorNotes, 900)}`,
    `World book: ${clip(character.worldBook, 500)}`,
    `User persona: ${clip(body.userPersona || "", 360)}`,
    `Recent dialogue context:\n${clip(recentStatusMessages(body.messages), 1800)}`,
    `Previous status:\n${clip(JSON.stringify(body.previousStatus || {}), 1100)}`,
    `Long-term memory:\n${clip(body.memory || "", 650)}`,
    `Latest user message:\n${clip(body.userMessage || "", 700)}`,
    `Latest assistant reply:\n${clip(body.assistantReply || "", 1200)}`,
    "Return format:",
    statusNames.length
      ? `{"status_update":{${statusNames.map((name) => `"${name}":{${extractStatusFieldNames(globalStatusRule, characterStatusRule).map((field) => `"${field}":"..."`).join(",")}}`).join(",")}},"memory_update":""}`
      : `{"status_update":{${extractStatusFieldNames(globalStatusRule, characterStatusRule).map((field) => `"${field}":"..."`).join(",")}},"memory_update":""}`
  ].filter(Boolean).join("\n\n");
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
    return NextResponse.json({ statusUpdate: fallbackStatusV2(body), memoryUpdate: "" });
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
          max_tokens: 900,
          messages: [{ role: "user", content: buildStatusPromptV2(body) }]
        })
      },
      timeoutMs
    );

    if (!upstream.ok) {
      return NextResponse.json({ statusUpdate: fallbackStatusV2(body), memoryUpdate: "" });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content) as { status_update?: unknown; statusUpdate?: unknown; memory_update?: unknown; memoryUpdate?: unknown } | null;
    if (!parsed) {
      return NextResponse.json({ statusUpdate: fallbackStatusV2(body), memoryUpdate: "" });
    }
    const statusUpdate = shapeStatusUpdate(parsed.status_update || parsed.statusUpdate, body);

    return NextResponse.json({
      statusUpdate: Object.keys(statusUpdate).length ? statusUpdate : fallbackStatusV2(body),
      memoryUpdate: clip(parsed.memory_update || parsed.memoryUpdate || "", 500)
    });
  } catch {
    return NextResponse.json({ statusUpdate: fallbackStatusV2(body), memoryUpdate: "" });
  }
}
