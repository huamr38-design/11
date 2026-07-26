import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

type CharacterCard = {
  id: string;
  name: string;
  tags: string[];
  avatarUrl?: string;
  profile: string;
  personality: string;
  scenario: string;
  creatorNotes: string;
  worldBook: string;
};

const storePath = path.join(process.cwd(), "data", "characters.json");

async function readCharacters() {
  try {
    const text = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(text) as CharacterCard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanCharacter(value: Partial<CharacterCard> & Record<string, unknown>): CharacterCard | null {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "").trim();
  const name = String(value.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    tags: Array.isArray(value.tags) ? value.tags.map(String).filter(Boolean) : [],
    avatarUrl: String(value.avatarUrl || ""),
    profile: String(value.profile || ""),
    personality: String(value.personality || ""),
    scenario: String(value.scenario || ""),
    creatorNotes: String(value.creatorNotes || ""),
    worldBook: String(value.worldBook || "")
  };
}

export async function GET() {
  return NextResponse.json({ characters: await readCharacters() });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const incoming = Array.isArray(body?.characters) ? body.characters : [];
  const characters = incoming.map(cleanCharacter).filter(Boolean) as CharacterCard[];

  if (!characters.length) {
    return NextResponse.json({ error: "characters is empty" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(characters, null, 2), "utf8");
  return NextResponse.json({ ok: true, characters });
}
