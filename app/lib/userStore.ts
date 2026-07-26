import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type UserState = {
  messagesByCharacter?: Record<string, unknown[]>;
  statusByCharacter?: Record<string, Record<string, string | number>>;
  memoryByCharacter?: Record<string, string>;
  userPersona?: string;
  memoryLimit?: number;
};

type StoredUser = {
  username: string;
  passwordHash: string;
  createdAt: string;
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function hasSupabase() {
  return Boolean(supabaseUrl && supabaseKey);
}

function needsRemoteDatabase() {
  return Boolean(process.env.VERCEL);
}

export function cleanUsername(user: string) {
  return user.trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]/gi, "_").slice(0, 40);
}

function usersDir() {
  return path.join(process.cwd(), "data", "users");
}

function userFile(username: string) {
  return path.join(usersDir(), `${username}.json`);
}

function localAuthFile(username: string) {
  return path.join(usersDir(), `${username}.auth.json`);
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = hashPassword(password, salt).split(":")[1];
  const left = Buffer.from(next, "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function cleanState(state: UserState): UserState {
  return {
    messagesByCharacter: state.messagesByCharacter || {},
    statusByCharacter: state.statusByCharacter || {},
    memoryByCharacter: state.memoryByCharacter || {},
    userPersona: String(state.userPersona || ""),
    memoryLimit: Math.max(1000, Math.min(50000, Number(state.memoryLimit || 7000)))
  };
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
  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

async function findRemoteUser(username: string) {
  const rows = await supabaseRequest<StoredUser[]>(
    `app_users?username=eq.${encodeURIComponent(username)}&select=username,passwordHash:password_hash,createdAt:created_at`
  );
  return rows[0] || null;
}

export async function registerUser(rawUsername: string, password: string) {
  const username = cleanUsername(rawUsername);
  if (!username || password.length < 4) return { ok: false, error: "账号名或密码太短" };
  if (!hasSupabase() && needsRemoteDatabase()) return { ok: false, error: "线上注册需要先配置 Supabase 数据库" };

  if (hasSupabase()) {
    const existing = await findRemoteUser(username);
    if (existing) return { ok: false, error: "账号已经存在" };
    await supabaseRequest("app_users", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ username, password_hash: hashPassword(password) })
    });
    return { ok: true, username };
  }

  await fs.mkdir(usersDir(), { recursive: true });
  try {
    await fs.readFile(localAuthFile(username), "utf8");
    return { ok: false, error: "账号已经存在" };
  } catch {
    const user: StoredUser = { username, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    await fs.writeFile(localAuthFile(username), JSON.stringify(user, null, 2), "utf8");
    return { ok: true, username };
  }
}

export async function loginUser(rawUsername: string, password: string) {
  const username = cleanUsername(rawUsername);
  if (!username || !password) return { ok: false, error: "请输入账号和密码" };
  if (!hasSupabase() && needsRemoteDatabase()) return { ok: false, error: "线上登录需要先配置 Supabase 数据库" };

  if (hasSupabase()) {
    const user = await findRemoteUser(username);
    if (!user || !verifyPassword(password, user.passwordHash)) return { ok: false, error: "账号或密码不正确" };
    return { ok: true, username };
  }

  try {
    const user = JSON.parse(await fs.readFile(localAuthFile(username), "utf8")) as StoredUser;
    if (!verifyPassword(password, user.passwordHash)) return { ok: false, error: "账号或密码不正确" };
    return { ok: true, username };
  } catch {
    return { ok: false, error: "账号不存在，请先注册" };
  }
}

export async function readUserState(username: string) {
  const safe = cleanUsername(username);
  if (!safe) return null;

  if (hasSupabase()) {
    const rows = await supabaseRequest<{ state: UserState }[]>(
      `user_states?username=eq.${encodeURIComponent(safe)}&select=state`
    );
    return rows[0]?.state || null;
  }

  try {
    return JSON.parse(await fs.readFile(userFile(safe), "utf8")) as UserState;
  } catch {
    return null;
  }
}

export async function saveUserState(username: string, state: UserState) {
  const safe = cleanUsername(username);
  if (!safe) throw new Error("user is required");
  if (!hasSupabase() && needsRemoteDatabase()) throw new Error("remote database is required");
  const nextState = cleanState(state);

  if (hasSupabase()) {
    await supabaseRequest("user_states?on_conflict=username", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ username: safe, state: nextState, updated_at: new Date().toISOString() })
    });
    return nextState;
  }

  await fs.mkdir(usersDir(), { recursive: true });
  await fs.writeFile(userFile(safe), JSON.stringify(nextState, null, 2), "utf8");
  return nextState;
}
