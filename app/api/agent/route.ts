import { NextResponse } from "next/server";
import { isAdminRequest, readGlobalConfig, saveGlobalConfig } from "../../lib/globalConfigStore";

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

async function readAgent() {
  const parsed = await readGlobalConfig<BackendAgent>("agent");
  return parsed?.id ? parsed : null;
}

function cleanAgent(value: Partial<BackendAgent> & Record<string, unknown>): BackendAgent | null {
  if (!value || typeof value !== "object") return null;

  return {
    id: String(value.id || "global-agent"),
    name: String(value.name || "Global Agent"),
    description: String(value.description || ""),
    systemPrompt: String(value.systemPrompt || ""),
    replyStyle: String(value.replyStyle || ""),
    statusRule: String(value.statusRule || ""),
    memoryRule: String(value.memoryRule || ""),
    photos: Array.isArray(value.photos)
      ? value.photos
          .map((photo, index) => {
            const item = photo as Partial<AgentPhoto>;
            return {
              id: String(item.id || `photo_${index}`),
              name: String(item.name || `Photo ${index + 1}`),
              url: String(item.url || ""),
              note: String(item.note || "")
            };
          })
          .filter((photo) => photo.url)
      : []
  };
}

export async function GET() {
  return NextResponse.json({ agent: await readAgent() });
}

export async function PUT(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "admin password is invalid" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const agent = cleanAgent(body?.agent || body);

  if (!agent) {
    return NextResponse.json({ error: "agent is invalid" }, { status: 400 });
  }

  await saveGlobalConfig("agent", agent);
  return NextResponse.json({ ok: true, agent });
}
