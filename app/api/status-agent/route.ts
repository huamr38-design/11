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
  const parsed = await readGlobalConfig<BackendAgent>("statusAgent");
  return parsed?.id ? parsed : null;
}

function cleanAgent(value: Partial<BackendAgent> & Record<string, unknown>): BackendAgent | null {
  if (!value || typeof value !== "object") return null;

  return {
    id: String(value.id || "fixed-status-agent"),
    name: String(value.name || "Status Agent"),
    description: "",
    systemPrompt: String(value.systemPrompt || value.prompt || value.system || ""),
    replyStyle: "",
    statusRule: "",
    memoryRule: "",
    photos: []
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

  await saveGlobalConfig("statusAgent", agent);
  return NextResponse.json({ ok: true, agent });
}
