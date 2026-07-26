import { promises as fs } from "fs";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function hasSupabase() {
  return Boolean(supabaseUrl && supabaseKey);
}

async function supabaseRequest<T>(pathName: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${pathName}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

function localPath(name: string) {
  return path.join(process.cwd(), "data", `${name}.json`);
}

async function ensureSystemUser(username: string) {
  await supabaseRequest("app_users?on_conflict=username", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ username, password_hash: "system" })
  });
}

export async function readGlobalConfig<T>(name: string) {
  const username = `__global_${name}`;

  if (hasSupabase()) {
    const rows = await supabaseRequest<{ state: Record<string, T> }[]>(
      `user_states?username=eq.${encodeURIComponent(username)}&select=state`
    );
    return rows?.[0]?.state?.[name] || null;
  }

  try {
    return JSON.parse(await fs.readFile(localPath(name), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function saveGlobalConfig<T>(name: string, value: T) {
  const username = `__global_${name}`;

  if (hasSupabase()) {
    await ensureSystemUser(username);
    await supabaseRequest("user_states?on_conflict=username", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        username,
        state: { [name]: value },
        updated_at: new Date().toISOString()
      })
    });
    return value;
  }

  const file = localPath(name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  return value;
}

export function isAdminRequest(request: Request) {
  const expected = process.env.ADMIN_PASSWORD || "admin123";
  return request.headers.get("x-admin-code") === expected;
}
