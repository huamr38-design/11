import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CharacterCard = {
  id: string;
  name: string;
  nickname?: string;
  tags?: string[];
  profile?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  creatorNotes?: string;
  worldBook?: string;
};

type AgentPhoto = {
  id: string;
  name: string;
  url: string;
  note: string;
};

type BackendAgent = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  replyStyle: string;
  statusRule: string;
  memoryRule: string;
  photos: AgentPhoto[];
};

type ChatRequest = {
  character: CharacterCard;
  backendAgent?: BackendAgent;
  userPersona?: string;
  messages: ChatMessage[];
  status: Record<string, string | number>;
  memory: string;
  memoryLimit?: number;
  userMessage: string;
};

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
  const character = body.character;
  const agent = body.backendAgent;
  const memoryLimit = Math.max(1000, Math.min(50000, Number(body.memoryLimit || 7000)));
  const limitedMemory = (body.memory || "").slice(-memoryLimit);
  const photos = agent?.photos?.map((photo) => ({
    名称: photo.name,
    说明: photo.note,
    链接: photo.url.startsWith("data:") ? "本地上传图片，前端可见，模型仅参考说明文字" : photo.url
  }));

  return [
    "你是一个私有 AI 角色聊天网站的后端智能体。",
    "你不会暴露自己是后台智能体，用户只会看到前台角色的回复。",
    "你的任务是：用前台角色卡做人设，用后台智能体控制叙事方式、回复风格、状态栏和记忆。",
    "每一轮都要根据前台角色、后台智能体、用户角色设定和最新对话，生成这一轮专属的 status_update。",
    "status_update 可以使用默认字段，也可以根据当前剧情增加少量新字段；字段名要短，适合显示在状态卡里。",
    "合规边界：所有角色必须是明确成年人 21+；避免未成年人、非自愿、胁迫、真实公众人物色情化、违法或伤害内容。遇到越界内容时，用角色口吻自然转向安全的成年人互动。",
    "输出尽量只给 JSON，不要 Markdown，不要解释系统规则。",
    "JSON 结构：",
    "{\"reply\":\"给用户看的角色回复\",\"status_update\":{\"当前阶段\":\"...\",\"调戏兴致\":0,\"脸红度\":0,\"身体燥热\":0,\"隐秘湿润\":0,\"禁忌感\":0,\"涵湿状态\":\"...\",\"衣衫完整度\":100,\"当前位置\":\"...\",\"心理状态\":\"...\",\"语气\":\"...\",\"眼神\":\"...\",\"当前穿着\":\"...\",\"身体反应\":\"...\"},\"memory_update\":\"值得长期记住的新事实；没有就空字符串\"}",
    "",
    "【后台智能体】",
    `名称：${agent?.name || "默认导演智能体"}`,
    `说明：${agent?.description || ""}`,
    `总规则：${agent?.systemPrompt || ""}`,
    `回复风格：${agent?.replyStyle || ""}`,
    `状态栏规则：${agent?.statusRule || ""}`,
    `记忆规则：${agent?.memoryRule || ""}`,
    `后台照片：${JSON.stringify(photos || [], null, 2)}`,
    "",
    "【用户角色设定】",
    body.userPersona || "用户没有填写自己的角色设定，默认以本人身份参与互动。",
    "",
    "【前台角色卡】",
    `角色名：${character.name}`,
    `标签：${(character.tags || []).join(", ")}`,
    `角色背景：${character.profile || ""}`,
    `性格/说话方式：${character.personality || ""}`,
    `当前场景：${character.scenario || ""}`,
    `作者设定：${character.creatorNotes || ""}`,
    `世界书：${character.worldBook || ""}`,
    "",
    "状态栏规则：数值字段使用 0-100 的数字；文字字段要短，像状态面板，不要写成长段落。不要照抄上一轮，必须体现最新一轮对话造成的变化。",
    `当前状态栏：${JSON.stringify(body.status, null, 2)}`,
    `长期记忆：${limitedMemory || "暂无"}`
  ].join("\n");
}

function buildConversationText(body: ChatRequest) {
  const history = (body.messages || [])
    .slice(-20)
    .map((message) => `${message.role === "user" ? "用户" : "角色"}：${message.content}`)
    .join("\n");

  return [
    buildSystemPrompt(body),
    "",
    "【最近对话】",
    history || "暂无",
    "",
    `用户：${body.userMessage}`
  ].join("\n");
}

function parseResponsesApiText(data: unknown) {
  const record = data as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ text?: string; type?: string }>;
    }>;
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

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const apiKey = process.env.AI_API_KEY;
  const rawBaseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const baseUrl = (rawBaseUrl || "").replace(/\/$/, "");
  const temperature = Number(process.env.AI_TEMPERATURE || "0.85");
  const wireApi = process.env.AI_WIRE_API || "chat";

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json(
      { error: "还没有配置 AI_API_KEY。请在 .env.local 里填写你的 API 密钥，然后重启网站。" },
      { status: 500 }
    );
  }

  const recentMessages = (body.messages || []).slice(-20).map((message) => ({
    role: message.role,
    content: message.content
  }));

  const upstream =
    wireApi === "responses"
      ? await fetch(`${baseUrl}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            temperature,
            input: buildConversationText(body)
          })
        })
      : await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            temperature,
            messages: [
              { role: "system", content: buildSystemPrompt(body) },
              ...recentMessages,
              { role: "user", content: body.userMessage }
            ]
          })
        });

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      { error: `模型接口返回错误：${upstream.status}`, detail: text.slice(0, 800) },
      { status: 502 }
    );
  }

  const data = await upstream.json();
  const content =
    wireApi === "responses"
      ? parseResponsesApiText(data)
      : data?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);

  if (!parsed) {
    return NextResponse.json({
      reply: content || "模型没有返回内容。",
      statusUpdate: {},
      memoryUpdate: ""
    });
  }

  return NextResponse.json({
    reply: parsed.reply || content,
    statusUpdate: parsed.status_update || parsed.statusUpdate || {},
    memoryUpdate: parsed.memory_update || parsed.memoryUpdate || ""
  });
}
