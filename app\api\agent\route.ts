import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

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

const storePath = path.join(process.cwd(), "data", "agent.json");

async function readAgent() {
  try {
    const text = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(text) as BackendAgent;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function cleanAgent(value: Partial<BackendAgent> & Record<string, unknown>): BackendAgent | null {
  if (!value || typeof value !== "object") return null;

  return {
    id: String(value.id || "global-agent"),
    name: String(value.name || "通用智能体"),
    description: String(value.description || ""),
    systemPrompt: String(value.systemPrompt || ""),
    replyStyle: String(value.replyStyle || ""),
    statusRule: String(value.statusRule || ""),
    memoryRule: String(value.memoryRule || ""),
    photos: Array.isArray(value.photos)
      ? value.photos.map((photo, index) => {
          const item = photo as Partial<AgentPhoto>;
          return {
            id: String(item.id || `photo_${index}`),
            name: String(item.name || `照片 ${index + 1}`),
            url: String(item.url || ""),
            note: String(item.note || "")
          };
        }).filter((photo) => photo.url)
      : []
  };
}

export async function GET() {
  return NextResponse.json({ agent: await readAgent() });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const agent = cleanAgent(body?.agent || body);

  if (!agent) {
    return NextResponse.json({ error: "agent is invalid" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(agent, null, 2), "utf8");
  return NextResponse.json({ ok: true, agent });
}
