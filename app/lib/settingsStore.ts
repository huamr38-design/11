import { promises as fs } from "fs";
import path from "path";

export type MaintenanceSettings = {
  enabled: boolean;
  message: string;
};

const defaultMaintenance: MaintenanceSettings = {
  enabled: false,
  message: "网站维护中，请稍后再来。"
};

const settingsUsername = "__app_settings";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function hasSupabase() {
  return Boolean(supabaseUrl && supabaseKey);
}

function settingsFile() {
  return path.join(process.cwd(), "data", "settings.json");
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

function cleanMaintenance(value: Partial<MaintenanceSettings> | null | undefined): MaintenanceSettings {
  return {
    enabled: Boolean(value?.enabled),
    message: String(value?.message || defaultMaintenance.message).slice(0, 160)
  };
}

export async function readMaintenance() {
  if (hasSupabase()) {
    try {
      const rows = await supabaseRequest<{ state: { maintenance?: MaintenanceSettings } }[]>(
        `user_states?username=eq.${settingsUsername}&select=state`
      );
      return cleanMaintenance(rows?.[0]?.state?.maintenance);
    } catch {
      return defaultMaintenance;
    }
  }

  try {
    const json = JSON.parse(await fs.readFile(settingsFile(), "utf8")) as { maintenance?: MaintenanceSettings };
    return cleanMaintenance(json.maintenance);
  } catch {
    return defaultMaintenance;
  }
}

export async function saveMaintenance(settings: Partial<MaintenanceSettings>) {
  const next = cleanMaintenance(settings);

  if (hasSupabase()) {
    await supabaseRequest("app_users?on_conflict=username", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ username: settingsUsername, password_hash: "system" })
    });
    await supabaseRequest("user_states?on_conflict=username", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        username: settingsUsername,
        state: { maintenance: next },
        updated_at: new Date().toISOString()
      })
    });
    return next;
  }

  const file = settingsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ maintenance: next }, null, 2), "utf8");
  return next;
}
