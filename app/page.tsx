"use client";

import {
  AtSign,
  BookOpen,
  Bot,
  ChevronLeft,
  Edit3,
  ImagePlus,
  Lock,
  LogOut,
  Palette,
  Plus,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCircle,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type CharacterCard = {
  id: string;
  name: string;
  tags: string[];
  avatarUrl?: string;
  statusPrompt?: string;
  statusNames?: string[];
  openingMessage?: string;
  profile: string;
  personality: string;
  scenario: string;
  creatorNotes: string;
  worldBook: string;
};

type BackendAgent = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  replyStyle: string;
  statusRule: string;
  memoryRule: string;
  photos: { id: string; name: string; url: string; note: string }[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  pendingReply?: boolean;
  failedReply?: boolean;
  retryText?: string;
  statusSnapshot?: StatusMap;
  statusPreviousSnapshot?: StatusMap;
  statusPending?: boolean;
  statusError?: boolean;
};

type FlatStatusMap = Record<string, string | number>;
type StatusMap = Record<string, string | number | FlatStatusMap>;

type BackgroundSettings = {
  color: string;
  imageUrl: string;
  opacity: number;
};

type MaintenanceSettings = {
  enabled: boolean;
  message: string;
};

const THEME = {
  name: "\u591c\u84dd",
  main: "#0ea5e9"
};

const starterCharacters: CharacterCard[] = [
  {
    id: "jiang-yazhen",
    name: "江雅真",
    tags: ["成年人", "私密聊天", "慢热关系"],
    avatarUrl: "",
    statusPrompt: "",
    statusNames: [],
    openingMessage: "",
    profile: "25 岁，独立设计师。外表清冷、礼貌，熟悉后会露出柔软和调皮的一面。所有设定均为成年人私密角色扮演。",
    personality: "说话自然，有情绪起伏。对话内容用中文引号，动作和心理描写用括号。保持沉浸，但不要像客服，也不要机械总结。",
    scenario: "夜晚的客厅，窗外有城市灯光。她刚洗完手坐下，像是在等你开口。",
    creatorNotes: "保持角色一致，重视前后文、情绪变化和关系推进。拒绝未成年人、非自愿、胁迫、违法或伤害内容。",
    worldBook: "她住在一间浅色公寓里，喜欢蓝色灯光、低声聊天、长时间的眼神交流。"
  }
];

const fixedDirector: BackendAgent = {
  id: "fixed-director-agent",
  name: "后台导演智能体",
  description: "",
  systemPrompt: "",
  replyStyle: "",
  statusRule: "",
  memoryRule: "",
  photos: []
};

const fixedStatusAgent: BackendAgent = {
  id: "fixed-status-agent",
  name: "状态栏智能体",
  description: "",
  systemPrompt: "",
  replyStyle: "",
  statusRule: "",
  memoryRule: "",
  photos: []
};

const defaultStatus: StatusMap = {
  当前阶段: "初次相识",
  调戏兴致: 35,
  脸红度: 20,
  身体燥热: 10,
  隐秘湿润: 5,
  禁忌感: 15,
  涵湿状态: "房间内/不在场",
  衣衫完整度: 95,
  当前位置: "客厅",
  心理状态: "好奇，等待选择",
  语气: "温和低声",
  眼神: "专注，带着笑意",
  当前穿着: "浅色居家服",
  身体反应: "呼吸平稳"
};

const defaultBackground: BackgroundSettings = {
  color: "#050914",
  imageUrl: "",
  opacity: 0.22
};

const defaultMaintenance: MaintenanceSettings = {
  enabled: false,
  message: "网站维护中，请稍后再来。"
};

const APP_DATA_VERSION = "2026-07-30.2";
const APP_STORAGE_KEYS = [
  "characters",
  "fixedCharacter",
  "activeCharacterId",
  "fixedDirector",
  "statusAgent",
  "messagesByCharacter",
  "statusByCharacter",
  "memoryByCharacter",
  "contextLimitByCharacter",
  "memoryLimit",
  "userPersona",
  "chatBackground"
];

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeLocalGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can fail in private mode or when old image data fills quota.
  }
}

function safeLocalRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

function safeLocalJson<T>(key: string, fallback: T): T {
  return safeJsonParse<T>(safeLocalGet(key), fallback);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function migrateOneCharacter(value: unknown) {
  if (!value || typeof value !== "object") return starterCharacters;
  const maybe = value as CharacterCard;
  if (!maybe.id || !maybe.name) return starterCharacters;
  return [maybe];
}

function saveCharactersToServer(characters: CharacterCard[], adminToken = "") {
  void fetch("/api/characters", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-code": adminToken },
    body: JSON.stringify({ characters })
  }).catch(() => undefined);
}

function saveAgentToServer(agent: BackendAgent, adminToken = "") {
  void fetch("/api/agent", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-code": adminToken },
    body: JSON.stringify({ agent })
  }).catch(() => undefined);
}

function saveStatusAgentToServer(agent: BackendAgent, adminToken = "") {
  void fetch("/api/status-agent", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-code": adminToken },
    body: JSON.stringify({ agent })
  }).catch(() => undefined);
}

function saveUserStateToServer(user: string, state: {
  messagesByCharacter: Record<string, ChatMessage[]>;
  statusByCharacter: Record<string, StatusMap>;
  memoryByCharacter: Record<string, string>;
  contextLimitByCharacter: Record<string, number>;
  userPersona: string;
  memoryLimit: number;
}, token: string) {
  if (!user.trim() || !token) return Promise.resolve();
  return fetch("/api/user-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user, state })
  }).then(() => undefined).catch(() => undefined);
}

function compactCharacterForChat(character: CharacterCard) {
  const { avatarUrl, ...textOnlyCharacter } = character;
  return { ...textOnlyCharacter, statusNames: effectiveStatusNames(character) };
}

function compactDirectorForChat(agent: BackendAgent) {
  return {
    ...agent,
    photos: (agent.photos || []).map((photo) => ({
      ...photo,
      url: photo.url?.startsWith("data:") ? "" : photo.url
    }))
  };
}

function cleanStatusNames(value: unknown) {
  const source = Array.isArray(value) ? value.join("\n") : String(value || "");
  return source
    .split(/[\n,+&/|;:，、；：]/)
    .map((item) => item.trim().replace(/^\s*(?:\d+|[一二三四五六七八九十]+)[\.、\)\）:\uff1a-]\s*/, ""))
    .filter(Boolean)
    .slice(0, 12);
}

function effectiveStatusNames(character: CharacterCard) {
  const explicitNames = cleanStatusNames(character.statusNames || []);
  if (explicitNames.length) return explicitNames;
  const inferredNames = cleanStatusNames(character.name);
  return inferredNames.length > 1 ? inferredNames : [];
}

function cleanTags(value: unknown) {
  const source = Array.isArray(value) ? value.join("\n") : String(value || "");
  return source
    .split(/[\n,+&/|;:，、；：]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function statusContextMessages(messages: ChatMessage[]) {
  return messages.slice(-8).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 700)
  }));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value : String(value || "");
}

function normalizeCharacter(character: unknown): CharacterCard {
  const raw = safeObjectRecord<unknown>(character);
  return {
    id: cleanText(raw.id || uid("character")),
    name: cleanText(raw.name || "未命名角色"),
    tags: cleanTags(raw.tags),
    avatarUrl: cleanText(raw.avatarUrl),
    statusPrompt: cleanText(raw.statusPrompt),
    statusNames: cleanStatusNames(raw.statusNames || []),
    openingMessage: cleanText(raw.openingMessage),
    profile: cleanText(raw.profile),
    personality: cleanText(raw.personality),
    scenario: cleanText(raw.scenario),
    creatorNotes: cleanText(raw.creatorNotes),
    worldBook: cleanText(raw.worldBook)
  };
}

function isFlatStatusMap(value: unknown): value is FlatStatusMap {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "string" || typeof entry === "number"));
}

function isGroupedStatusMap(value: unknown): value is Record<string, FlatStatusMap> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.values(value as Record<string, unknown>).length > 0 && Object.values(value as Record<string, unknown>).every((entry) => isFlatStatusMap(entry)));
}

function safeObjectRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, T> : {};
}

function normalizeStatusValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "是" : "否";
  return undefined;
}

function normalizeFlatStatusMap(value: unknown): FlatStatusMap {
  const raw = safeObjectRecord<unknown>(value);
  const entries: Array<[string, string | number]> = [];
  Object.entries(raw).forEach(([key, entry]) => {
    const next = normalizeStatusValue(entry);
    if (next !== undefined) entries.push([String(key), next]);
  });
  return Object.fromEntries(entries);
}

function normalizeStatusMap(value: unknown): StatusMap {
  const raw = safeObjectRecord<unknown>(value);
  const flatEntries: Array<[string, string | number]> = [];
  const groupedEntries: Array<[string, FlatStatusMap]> = [];

  Object.entries(raw).forEach(([key, entry]) => {
    const simpleValue = normalizeStatusValue(entry);
    if (simpleValue !== undefined) {
      flatEntries.push([String(key), simpleValue]);
      return;
    }
    const group = normalizeFlatStatusMap(entry);
    if (Object.keys(group).length) groupedEntries.push([String(key), group]);
  });

  if (groupedEntries.length && !flatEntries.length) return Object.fromEntries(groupedEntries);
  return Object.fromEntries(flatEntries);
}

function normalizeMessage(message: unknown): ChatMessage | null {
  if (!message || typeof message !== "object") return null;
  const raw = message as Partial<ChatMessage>;
  if (raw.role !== "user" && raw.role !== "assistant") return null;
  const statusSnapshot = normalizeStatusMap(raw.statusSnapshot);
  const statusPreviousSnapshot = normalizeStatusMap(raw.statusPreviousSnapshot);
  return {
    id: String(raw.id || uid("message")),
    role: raw.role,
    content: String(raw.content || ""),
    createdAt: Number(raw.createdAt || Date.now()),
    statusSnapshot: Object.keys(statusSnapshot).length ? statusSnapshot : undefined,
    statusPreviousSnapshot: Object.keys(statusPreviousSnapshot).length ? statusPreviousSnapshot : undefined,
    statusPending: Boolean(raw.statusPending),
    statusError: Boolean(raw.statusError)
  };
}

function normalizeMessagesByCharacter(value: unknown) {
  const raw = safeObjectRecord<unknown>(value);
  return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [
    key,
    Array.isArray(entry) ? entry.map(normalizeMessage).filter(Boolean) as ChatMessage[] : []
  ]));
}

function normalizeStatusByCharacter(value: unknown) {
  const raw = safeObjectRecord<unknown>(value);
  return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, normalizeStatusMap(entry)]));
}

function normalizeStringRecord(value: unknown) {
  const raw = safeObjectRecord<unknown>(value);
  return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, String(entry || "")]));
}

function normalizeNumberRecord(value: unknown) {
  const raw = safeObjectRecord<unknown>(value);
  return Object.fromEntries(Object.entries(raw).map(([key, entry]) => {
    const next = Number(entry);
    return [key, Number.isFinite(next) ? next : 8];
  }));
}

function migrateLocalAppData() {
  const version = safeLocalGet("appDataVersion");
  if (version === APP_DATA_VERSION) return;

  try {
    const savedCharacters = safeLocalJson<CharacterCard[] | null>("characters", null);
    const oldSingleCharacter = safeLocalJson<CharacterCard | null>("fixedCharacter", null);
    const nextCharacters = (savedCharacters?.length ? savedCharacters : migrateOneCharacter(oldSingleCharacter)).map(normalizeCharacter);
    safeLocalSet("characters", JSON.stringify(nextCharacters.length ? nextCharacters : starterCharacters));
    safeLocalRemove("fixedCharacter");
    safeLocalSet("messagesByCharacter", JSON.stringify(normalizeMessagesByCharacter(safeLocalJson("messagesByCharacter", {}))));
    safeLocalSet("statusByCharacter", JSON.stringify(normalizeStatusByCharacter(safeLocalJson("statusByCharacter", {}))));
    safeLocalSet("memoryByCharacter", JSON.stringify(normalizeStringRecord(safeLocalJson("memoryByCharacter", {}))));
    safeLocalSet("contextLimitByCharacter", JSON.stringify(normalizeNumberRecord(safeLocalJson("contextLimitByCharacter", {}))));
    safeLocalSet("memoryLimit", String(Math.max(1000, Math.min(50000, Number(safeLocalGet("memoryLimit") || 7000)))));
    safeLocalSet("appDataVersion", APP_DATA_VERSION);
  } catch {
    for (const key of APP_STORAGE_KEYS) safeLocalRemove(key);
    safeLocalSet("appDataVersion", APP_DATA_VERSION);
  }
}

export default function Home() {
  const [characters, setCharacters] = useState<CharacterCard[]>(starterCharacters);
  const [activeCharacterId, setActiveCharacterId] = useState(starterCharacters[0].id);
  const [director, setDirector] = useState<BackendAgent>(fixedDirector);
  const [statusAgent, setStatusAgent] = useState<BackendAgent>(fixedStatusAgent);
  const [messagesByCharacter, setMessagesByCharacter] = useState<Record<string, ChatMessage[]>>({});
  const [statusByCharacter, setStatusByCharacter] = useState<Record<string, StatusMap>>({});
  const [memoryByCharacter, setMemoryByCharacter] = useState<Record<string, string>>({});
  const [contextLimitByCharacter, setContextLimitByCharacter] = useState<Record<string, number>>({});
  const [memoryLimit, setMemoryLimit] = useState(7000);
  const [userPersona, setUserPersona] = useState("");
  const [background, setBackground] = useState<BackgroundSettings>(defaultBackground);
  const [draft, setDraft] = useState("");
  const [busyByCharacter, setBusyByCharacter] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminError, setAdminError] = useState("");
  const [maintenance, setMaintenance] = useState<MaintenanceSettings>(defaultMaintenance);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [panel, setPanel] = useState<"none" | "admin" | "persona" | "background" | "memory" | "character" | "agent" | "statusAgent" | "account" | "maintenance">("none");
  const [chatOpen, setChatOpen] = useState(false);
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const userStateSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const chatRequestQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [currentUser, setCurrentUser] = useState("");
  const [currentToken, setCurrentToken] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [accountMode, setAccountMode] = useState<"login" | "register">("login");
  const [accountError, setAccountError] = useState("");
  const [accountReady, setAccountReady] = useState(false);

  useEffect(() => {
    migrateLocalAppData();
    const savedCharacters = safeLocalJson<CharacterCard[] | null>("characters", null);
    const oldSingleCharacter = safeLocalJson<CharacterCard | null>("fixedCharacter", null);
    const nextCharacters = (savedCharacters?.length ? savedCharacters : migrateOneCharacter(oldSingleCharacter)).map(normalizeCharacter);
    setCharacters(nextCharacters);
    setActiveCharacterId(safeLocalGet("activeCharacterId") || nextCharacters[0].id);
    setDirector(safeLocalJson("fixedDirector", fixedDirector));
    setStatusAgent(safeLocalJson("statusAgent", fixedStatusAgent));
    setMessagesByCharacter(normalizeMessagesByCharacter(safeLocalJson("messagesByCharacter", {})));
    setStatusByCharacter(normalizeStatusByCharacter(safeLocalJson("statusByCharacter", {})));
    setMemoryByCharacter(normalizeStringRecord(safeLocalJson("memoryByCharacter", {})));
    setContextLimitByCharacter(normalizeNumberRecord(safeLocalJson("contextLimitByCharacter", {})));
    setMemoryLimit(Number(safeLocalGet("memoryLimit") || "7000"));
    setUserPersona(safeLocalGet("userPersona") || "");
    const savedUser = safeLocalGet("currentUser") || "";
    const savedToken = safeLocalGet("currentToken") || "";
    setCurrentUser(savedUser);
    setCurrentToken(savedToken);
    setLoginName(savedUser);
    setBackground(safeLocalJson("chatBackground", defaultBackground));
    const adminUnlocked = safeLocalGet("adminUnlocked") === "yes";
    const savedAdminToken = safeLocalGet("adminToken") || "";
    setIsAdmin(adminUnlocked);
    setAdminToken(savedAdminToken);
    void fetch("/api/maintenance")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.maintenance) setMaintenance(data.maintenance);
      })
      .catch(() => undefined);
    void fetch("/api/characters")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.characters?.length) {
          if (adminUnlocked && savedAdminToken) saveCharactersToServer(nextCharacters, savedAdminToken);
          return;
        }
        const serverCharacters = (data.characters as CharacterCard[]).map(normalizeCharacter);
        const serverLooksDefault = serverCharacters.length === 1 && serverCharacters[0].id === starterCharacters[0].id;
        const localLooksCustom = JSON.stringify(nextCharacters) !== JSON.stringify(starterCharacters);
        if (adminUnlocked && serverLooksDefault && localLooksCustom) {
          if (savedAdminToken) saveCharactersToServer(nextCharacters, savedAdminToken);
          return;
        }
        setCharacters(serverCharacters);
        const savedActiveId = safeLocalGet("activeCharacterId");
        const hasSavedActive = serverCharacters.some((item: CharacterCard) => item.id === savedActiveId);
        setActiveCharacterId(hasSavedActive ? String(savedActiveId) : serverCharacters[0].id);
      })
      .catch(() => undefined);
    void fetch("/api/agent")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.agent?.id) {
          setDirector(data.agent);
          return;
        }
        if (adminUnlocked && savedAdminToken) saveAgentToServer(safeLocalJson("fixedDirector", fixedDirector), savedAdminToken);
      })
      .catch(() => undefined);
    void fetch("/api/status-agent")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.agent?.id) {
          setStatusAgent(data.agent);
          return;
        }
        if (adminUnlocked && savedAdminToken) saveStatusAgentToServer(safeLocalJson("statusAgent", fixedStatusAgent), savedAdminToken);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => safeLocalSet("characters", JSON.stringify(characters.map(normalizeCharacter))), [characters]);
  useEffect(() => safeLocalSet("activeCharacterId", activeCharacterId), [activeCharacterId]);
  useEffect(() => safeLocalSet("fixedDirector", JSON.stringify(director)), [director]);
  useEffect(() => safeLocalSet("statusAgent", JSON.stringify(statusAgent)), [statusAgent]);
  useEffect(() => safeLocalSet("messagesByCharacter", JSON.stringify(normalizeMessagesByCharacter(messagesByCharacter))), [messagesByCharacter]);
  useEffect(() => safeLocalSet("statusByCharacter", JSON.stringify(normalizeStatusByCharacter(statusByCharacter))), [statusByCharacter]);
  useEffect(() => safeLocalSet("memoryByCharacter", JSON.stringify(normalizeStringRecord(memoryByCharacter))), [memoryByCharacter]);
  useEffect(() => safeLocalSet("contextLimitByCharacter", JSON.stringify(normalizeNumberRecord(contextLimitByCharacter))), [contextLimitByCharacter]);
  useEffect(() => safeLocalSet("memoryLimit", String(memoryLimit)), [memoryLimit]);
  useEffect(() => safeLocalSet("userPersona", userPersona), [userPersona]);
  useEffect(() => safeLocalSet("chatBackground", JSON.stringify(background)), [background]);

  useEffect(() => {
    if (!currentUser || !currentToken) {
      setAccountReady(false);
      return;
    }
    safeLocalSet("currentUser", currentUser);
    safeLocalSet("currentToken", currentToken);
    setAccountReady(false);
    void fetch("/api/user-state", { headers: { Authorization: `Bearer ${currentToken}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const state = data?.state;
        if (state) {
          setMessagesByCharacter(normalizeMessagesByCharacter(state.messagesByCharacter));
          setStatusByCharacter(normalizeStatusByCharacter(state.statusByCharacter));
          setMemoryByCharacter(normalizeStringRecord(state.memoryByCharacter));
          setContextLimitByCharacter(normalizeNumberRecord(state.contextLimitByCharacter));
          setUserPersona(state.userPersona || "");
          setMemoryLimit(Number(state.memoryLimit || 7000));
        }
        setAccountReady(true);
      })
      .catch(() => setAccountReady(true));
  }, [currentUser, currentToken]);

  useEffect(() => {
    if (!currentUser || !currentToken || !accountReady) return;
    const state = { messagesByCharacter, statusByCharacter, memoryByCharacter, contextLimitByCharacter, userPersona, memoryLimit };
    userStateSaveQueueRef.current = userStateSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveUserStateToServer(currentUser, state, currentToken));
  }, [currentUser, currentToken, accountReady, messagesByCharacter, statusByCharacter, memoryByCharacter, contextLimitByCharacter, userPersona, memoryLimit]);

  const activeCharacter = useMemo(
    () => normalizeCharacter(characters.find((item) => item.id === activeCharacterId) || characters[0] || starterCharacters[0]),
    [characters, activeCharacterId]
  );
  const activeBackgroundImage = activeCharacter.avatarUrl || background.imageUrl;
  const messages = Array.isArray(messagesByCharacter[activeCharacter.id]) ? messagesByCharacter[activeCharacter.id] : [];
  const activeHasStatusGroups = Boolean(activeCharacter.statusNames?.length);
  const visibleStatus = activeHasStatusGroups ? (statusByCharacter[activeCharacter.id] || {}) : { ...defaultStatus, ...(statusByCharacter[activeCharacter.id] || {}) };
  const memory = memoryByCharacter[activeCharacter.id] || "";
  const contextMessageLimit = contextLimitByCharacter[activeCharacter.id] || 8;
  const mentionNames = effectiveStatusNames(activeCharacter).length ? effectiveStatusNames(activeCharacter) : [activeCharacter.name].filter(Boolean);
  const busy = Boolean(busyByCharacter[activeCharacter.id]);

  useEffect(() => {
    if (!chatOpen) return;
    const chatBody = chatBodyRef.current;
    if (!chatBody) return;
    window.requestAnimationFrame(() => {
      chatBody.scrollTop = chatBody.scrollHeight;
    });
  }, [activeCharacterId, chatOpen, messages.length, busy]);

  useEffect(() => {
    if (!chatOpen) return;
    if (currentUser && !accountReady) return;
    const openingMessage = String(activeCharacter.openingMessage || "").trim();
    if (!openingMessage || messages.length) return;
    appendMessageForCharacter(activeCharacter.id, {
      id: uid("opening"),
      role: "assistant",
      content: openingMessage,
      createdAt: Date.now(),
      statusPending: false
    });
  }, [activeCharacter.id, activeCharacter.openingMessage, chatOpen, messages.length, currentUser, accountReady]);

  function setActiveMessages(next: ChatMessage[]) {
    setMessagesByCharacter((current) => ({ ...current, [activeCharacter.id]: next }));
  }

  function setActiveStatus(next: StatusMap) {
    setStatusByCharacter((current) => ({ ...current, [activeCharacter.id]: next }));
  }

  function setActiveMemory(next: string) {
    setMemoryByCharacter((current) => ({ ...current, [activeCharacter.id]: next }));
  }

  function setMessagesForCharacter(characterId: string, next: ChatMessage[]) {
    setMessagesByCharacter((current) => ({ ...current, [characterId]: next }));
  }

  function appendMessageForCharacter(characterId: string, message: ChatMessage) {
    setMessagesByCharacter((current) => {
      const currentMessages = current[characterId] || [];
      if (currentMessages.some((item) => item.id === message.id)) return current;
      return { ...current, [characterId]: [...currentMessages, message] };
    });
  }

  function updateMessageForCharacter(characterId: string, messageId: string, updater: (message: ChatMessage) => ChatMessage) {
    setMessagesByCharacter((current) => ({
      ...current,
      [characterId]: (current[characterId] || []).map((message) => (message.id === messageId ? updater(message) : message))
    }));
  }

  function setStatusForCharacter(characterId: string, next: StatusMap) {
    setStatusByCharacter((current) => ({ ...current, [characterId]: next }));
  }

  function setMemoryForCharacter(characterId: string, next: string) {
    setMemoryByCharacter((current) => ({ ...current, [characterId]: next }));
  }

  function setContextLimitForCharacter(characterId: string, next: number) {
    setContextLimitByCharacter((current) => ({ ...current, [characterId]: next }));
  }

  function setBusyForCharacter(characterId: string, next: boolean) {
    setBusyByCharacter((current) => {
      const copy = { ...current };
      if (next) copy[characterId] = true;
      else delete copy[characterId];
      return copy;
    });
  }

  function cycleContextLimit() {
    const options = [4, 8, 16, 24];
    const index = options.indexOf(contextMessageLimit);
    const next = options[(index + 1) % options.length] || 8;
    setContextLimitForCharacter(activeCharacter.id, next);
  }

  function insertComposerTemplate(left: string, right: string) {
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      setDraft((current) => `${current}${left}${right}`);
      return;
    }

    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? start;
    const selectedText = draft.slice(start, end);
    const nextDraft = `${draft.slice(0, start)}${left}${selectedText}${right}${draft.slice(end)}`;
    const nextCursor = start + left.length + selectedText.length;

    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function insertMention(name: string) {
    const mention = `@${name} `;
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      setDraft((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${mention}`);
      return;
    }

    const sourceDraft = textarea.value || draft;
    const start = textarea.selectionStart ?? sourceDraft.length;
    const end = textarea.selectionEnd ?? start;
    const needsSpaceBefore = start > 0 && sourceDraft[start - 1] !== " ";
    const insertText = `${needsSpaceBefore ? " " : ""}${mention}`;
    const nextDraft = `${sourceDraft.slice(0, start)}${insertText}${sourceDraft.slice(end)}`;
    const nextCursor = start + insertText.length;
    textarea.value = nextDraft;
    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function updateDirector(next: BackendAgent) {
    setDirector(next);
    saveAgentToServer(next, adminToken);
  }

  function updateStatusAgent(next: BackendAgent) {
    setStatusAgent(next);
    saveStatusAgentToServer(next, adminToken);
  }

  function createCharacter() {
    const character: CharacterCard = {
      id: uid("character"),
      name: "新角色",
      tags: ["成年人"],
      avatarUrl: "",
      statusPrompt: "",
      statusNames: [],
      openingMessage: "",
      profile: "从管理员新增的角色卡。",
      personality: "",
      scenario: "私人聊天",
      creatorNotes: "",
      worldBook: ""
    };
    setCharacters((current) => {
      const next = [character, ...current];
      saveCharactersToServer(next, adminToken);
      return next;
    });
    setActiveCharacterId(character.id);
    setChatOpen(false);
    setPanel("character");
  }

  function updateCharacter(next: CharacterCard) {
    setCharacters((current) => {
      const nextCharacters = current.map((item) => (item.id === next.id ? next : item));
      saveCharactersToServer(nextCharacters, adminToken);
      return nextCharacters;
    });
  }

  function deleteActiveCharacter() {
    if (characters.length <= 1) return;
    const nextCharacters = characters.filter((item) => item.id !== activeCharacter.id);
    saveCharactersToServer(nextCharacters, adminToken);
    setCharacters(nextCharacters);
    setActiveCharacterId(nextCharacters[0].id);
    setPanel("none");
  }

  async function verifyAdmin(event: FormEvent) {
    event.preventDefault();
    setAdminError("");
    const response = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: adminCode })
    });
    if (!response.ok) {
      setAdminError("管理员密码不对");
      return;
    }
    setIsAdmin(true);
    safeLocalSet("adminUnlocked", "yes");
    setAdminToken(adminCode);
    safeLocalSet("adminToken", adminCode);
    if (characters.length) saveCharactersToServer(characters, adminCode);
    saveAgentToServer(director, adminCode);
    saveStatusAgentToServer(statusAgent, adminCode);
    setAdminCode("");
    setPanel("none");
  }

  function logoutAdmin() {
    setIsAdmin(false);
    setAdminToken("");
    safeLocalRemove("adminUnlocked");
    safeLocalRemove("adminToken");
  }

  async function updateMaintenance(next: MaintenanceSettings) {
    setMaintenanceError("");
    if (!adminToken) {
      setMaintenanceError("请先重新输入管理员密码。");
      setPanel("admin");
      return;
    }
    const response = await fetch("/api/maintenance", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-code": adminToken },
      body: JSON.stringify({ maintenance: next })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMaintenanceError(data?.error || "维护模式保存失败");
      return;
    }
    setMaintenance(data.maintenance);
  }

  async function loginAccount(event: FormEvent) {
    event.preventDefault();
    const name = loginName.trim();
    if (!name || !loginPassword) return;
    setAccountError("");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: accountMode, username: name, password: loginPassword })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setAccountError(data?.error || "账号处理失败");
      return;
    }
    setCurrentUser(data.user);
    setCurrentToken(data.token);
    setLoginPassword("");
    setPanel("none");
  }

  function logoutAccount() {
    setCurrentUser("");
    setCurrentToken("");
    setLoginName("");
    setLoginPassword("");
    setAccountError("");
    setAccountReady(false);
    setMessagesByCharacter({});
    setStatusByCharacter({});
    setMemoryByCharacter({});
    setContextLimitByCharacter({});
    setUserPersona("");
    safeLocalRemove("currentUser");
    safeLocalRemove("currentToken");
  }

  async function updateStatusAfterReply(args: {
    characterId: string;
    assistantMessageId: string;
    character: CharacterCard;
    userPersona: string;
    userMessage: string;
    assistantReply: string;
    previousStatus: StatusMap;
    memory: string;
    recentMessages: ChatMessage[];
  }) {
    try {
      const response = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: compactCharacterForChat(args.character),
          userPersona: args.userPersona,
          userMessage: args.userMessage,
          assistantReply: args.assistantReply,
          previousStatus: args.previousStatus,
          memory: args.memory,
          messages: statusContextMessages(args.recentMessages),
          backendAgent: compactDirectorForChat(director),
          statusAgent: compactDirectorForChat(statusAgent)
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error("status update failed");

      const statusUpdate = data.statusUpdate && Object.keys(data.statusUpdate).length ? data.statusUpdate : null;
      if (!statusUpdate) throw new Error("status update empty");

      const nextStatus = isGroupedStatusMap(statusUpdate)
        ? Object.fromEntries(Object.entries(statusUpdate).map(([name, groupStatus]) => {
            const previousGroup = isFlatStatusMap(args.previousStatus[name]) ? args.previousStatus[name] as FlatStatusMap : {};
            return [name, { ...previousGroup, ...groupStatus }];
          }))
        : { ...args.previousStatus, ...statusUpdate };
      setStatusForCharacter(args.characterId, nextStatus);
      updateMessageForCharacter(args.characterId, args.assistantMessageId, (message) => ({
        ...message,
        statusSnapshot: nextStatus,
        statusPreviousSnapshot: args.previousStatus,
        statusPending: false,
        statusError: false
      }));
      if (data.memoryUpdate) {
        setMemoryForCharacter(args.characterId, [args.memory, data.memoryUpdate].filter(Boolean).join("\n"));
      }
    } catch {
      updateMessageForCharacter(args.characterId, args.assistantMessageId, (message) => ({
        ...message,
        statusPending: false,
        statusError: true
      }));
    }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    sendDraftMessage();
  }

  function sendDraftMessage(textOverride?: string) {
    const text = (textOverride ?? composerTextareaRef.current?.value ?? draft).trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = { id: uid("message"), role: "user", content: text, createdAt: Date.now() };
    const assistantMessageId = uid("message");
    const pendingAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "正在回复...",
      createdAt: Date.now(),
      pendingReply: true,
      retryText: text
    };
    const requestCharacter = activeCharacter;
    const requestCharacterId = requestCharacter.id;
    const requestMessages = messages;
    const requestStatus = visibleStatus;
    const requestMemory = memory;
    const requestUserPersona = userPersona;
    const requestContextMessageLimit = contextMessageLimit;

    appendMessageForCharacter(requestCharacterId, userMessage);
    appendMessageForCharacter(requestCharacterId, pendingAssistantMessage);
    setDraft("");
    setBusyForCharacter(requestCharacterId, true);
    setError("");

    const runChatRequest = async () => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: compactCharacterForChat(requestCharacter),
          backendAgent: compactDirectorForChat(director),
          userPersona: requestUserPersona,
          messages: requestMessages,
          status: requestStatus,
          memory: requestMemory,
          memoryLimit,
          contextMessageLimit: requestContextMessageLimit,
          userMessage: text
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const timing = data?.timing;
        const timingParts = timing
          ? [
              timing.serverTotalMs ? `server ${Math.round(timing.serverTotalMs / 1000)}s` : "",
              timing.upstreamMs ? `upstream ${Math.round(timing.upstreamMs / 1000)}s` : "",
              timing.requestBytes ? `request ${Math.max(1, Math.round(timing.requestBytes / 1024))} KB` : "",
              timing.fallbackUsed ? "fallback used" : ""
            ].filter(Boolean)
          : [];
        const timingText = timingParts.length ? ` (${timingParts.join(", ")})` : "";
        throw new Error(`${data?.error || "\u8bf7\u6c42\u5931\u8d25"}${timingText}`);
      }

      const assistantReply = data.reply || "我在。";
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: assistantReply,
        createdAt: pendingAssistantMessage.createdAt,
        pendingReply: false,
        failedReply: false,
        retryText: text,
        statusPending: true
      };
      updateMessageForCharacter(requestCharacterId, assistantMessageId, () => assistantMessage);
      await updateStatusAfterReply({
        characterId: requestCharacterId,
        assistantMessageId: assistantMessage.id,
        character: requestCharacter,
        userPersona: requestUserPersona,
        userMessage: text,
        assistantReply: assistantMessage.content,
        previousStatus: requestStatus,
        memory: requestMemory,
        recentMessages: [...requestMessages, userMessage, assistantMessage]
      });
    };

    chatRequestQueueRef.current = chatRequestQueueRef.current
      .catch(() => undefined)
      .then(runChatRequest)
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : "发送失败";
        updateMessageForCharacter(requestCharacterId, assistantMessageId, (message) => ({
          ...message,
          content: "这条消息模型没有成功返回。你可以点下方重试。",
          pendingReply: false,
          failedReply: true,
          retryText: text,
          statusPending: false,
          statusError: false
        }));
        setError(errorMessage);
      })
      .finally(() => {
        setBusyForCharacter(requestCharacterId, false);
      });
  }

  function retryAssistantMessage(text?: string) {
    const retryText = String(text || "").trim();
    if (!retryText || busy) return;
    sendDraftMessage(retryText);
  }


  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendDraftMessage();
  }

  if (maintenance.enabled && !isAdmin) {
    return (
      <main className="maintenance-page">
        <section className="maintenance-card">
          <div className="xc-logo"><Sparkles size={22} /></div>
          <h1>网站维护中</h1>
          <p>{maintenance.message}</p>
          <button type="button" onClick={() => setPanel("admin")}><Lock size={16} />管理员入口</button>
        </section>
        {panel === "admin" && (
          <EditorModal title="管理员登录" onClose={() => setPanel("none")}>
            <form onSubmit={verifyAdmin} className="modal-stack">
              <label>管理员密码<input type="password" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label>
              {adminError && <div className="mini-error">{adminError}</div>}
              <button className="primary"><Lock size={16} />进入管理员模式</button>
            </form>
          </EditorModal>
        )}
      </main>
    );
  }

  return (
    <main
      className={`xiangcao-shell ${chatOpen ? "chat-open" : "home-open"}`}
      style={{
        ["--theme-main" as string]: THEME.main,
        ["--chat-bg-image" as string]: activeBackgroundImage ? `url("${activeBackgroundImage}")` : "none",
        ["--chat-bg-opacity" as string]: String(background.opacity),
        backgroundColor: background.color
      }}
    >
      <aside className="xc-sidebar">
        <nav className="xc-rail" aria-label="main navigation">
          <button className="rail-avatar" type="button" title={"\u8d5b\u535a\u5973\u53cb"} onClick={() => setChatOpen(false)}>
            <img className="rail-brand-image" src="/cyber-heart.png" alt="" />
            <span className="rail-label">{"\u8d5b\u535a\u5973\u53cb"}</span>
          </button>
          <button type="button" title={"\u89d2\u8272"} onClick={() => setChatOpen(false)}><Bot size={18} /><span className="rail-label">{"\u89d2\u8272"}</span></button>
          <button type="button" title={"\u6211\u7684\u8bbe\u5b9a"} onClick={() => setPanel("persona")}><Edit3 size={18} /><span className="rail-label">{"\u6211\u7684\u8bbe\u5b9a"}</span></button>
          <button type="button" title={"\u8bb0\u5fc6"} onClick={() => setPanel("memory")}><BookOpen size={18} /><span className="rail-label">{"\u8bb0\u5fc6"}</span></button>
          <button type="button" title={currentUser ? `\u8d26\u53f7\uff1a${currentUser}` : "\u8d26\u53f7"} onClick={() => setPanel("account")}><UserCircle size={18} /><span className="rail-label">{"\u8d26\u53f7"}</span></button>
          {isAdmin ? (
            <>
              <button type="button" title={"\u65b0\u589e\u89d2\u8272"} onClick={createCharacter}><Plus size={18} /><span className="rail-label">{"\u65b0\u589e\u89d2\u8272"}</span></button>
              <button type="button" title={"\u901a\u7528\u667a\u80fd\u4f53"} onClick={() => setPanel("agent")}><Bot size={18} /><span className="rail-label">{"\u901a\u7528\u667a\u80fd\u4f53"}</span></button>
              <button type="button" title={"\u72b6\u6001\u680f\u667a\u80fd\u4f53"} onClick={() => setPanel("statusAgent")}><ShieldCheck size={18} /><span className="rail-label">{"\u72b6\u6001\u680f"}</span></button>
              <button type="button" title={"\u4fee\u6539\u89d2\u8272\u5361"} onClick={() => setPanel("character")}><Settings size={18} /><span className="rail-label">{"\u89d2\u8272\u5361"}</span></button>
              <button type="button" title={"\u7ef4\u62a4\u6a21\u5f0f"} onClick={() => setPanel("maintenance")}><ShieldCheck size={18} /><span className="rail-label">{"\u7ef4\u62a4"}</span></button>
              <button type="button" title={"\u9000\u51fa\u7ba1\u7406\u5458"} onClick={logoutAdmin}><LogOut size={18} /><span className="rail-label">{"\u9000\u51fa"}</span></button>
            </>
          ) : (
            <button type="button" title={"\u7ba1\u7406\u5458\u5165\u53e3"} onClick={() => setPanel("admin")}><Lock size={18} /><span className="rail-label">{"\u7ba1\u7406\u5458"}</span></button>
          )}
        </nav>
        <div className="xc-brand">
          <div className="xc-logo"><img className="brand-logo-image" src="/cyber-heart.png" alt="" /></div>
          <div>
            <strong>{"\u8d5b\u535a\u5973\u53cb"}</strong>
            <span>{THEME.name}{"\u4e3b\u9898"}</span>
          </div>
        </div>

        <div className="home-menu">
          <button className="home-menu-button" onClick={() => setHomeMenuOpen((value) => !value)} title="设置">
            <Settings size={17} />
          </button>
          {homeMenuOpen && (
            <div className="home-menu-panel">
              <button onClick={() => { setPanel("account"); setHomeMenuOpen(false); }}><UserCircle size={16} />{currentUser ? `账号：${currentUser}` : "账号登录"}</button>
              <button onClick={() => { setPanel("persona"); setHomeMenuOpen(false); }}><Bot size={16} />我的设定</button>
              <button onClick={() => { setPanel("background"); setHomeMenuOpen(false); }}><Palette size={16} />聊天背景</button>
              {isAdmin ? (
                <>
                  <button onClick={() => { createCharacter(); setHomeMenuOpen(false); }}><Plus size={16} />新增角色卡</button>
                  <button onClick={() => { setPanel("agent"); setHomeMenuOpen(false); }}><Bot size={16} />{"\u901a\u7528\u667a\u80fd\u4f53"}</button>
                  <button onClick={() => { setPanel("statusAgent"); setHomeMenuOpen(false); }}><ShieldCheck size={16} />{"\u72b6\u6001\u680f\u667a\u80fd\u4f53"}</button>
                  <button onClick={() => { setPanel("character"); setHomeMenuOpen(false); }}><Edit3 size={16} />修改当前角色卡</button>
                  <button onClick={() => { logoutAdmin(); setHomeMenuOpen(false); }}><LogOut size={16} />退出管理员</button>
                </>
              ) : (
                <button onClick={() => { setPanel("admin"); setHomeMenuOpen(false); }}><Lock size={16} />管理员入口</button>
              )}
            </div>
          )}
        </div>

        <div className="role-admin-shortcuts">
          {isAdmin ? (
            <>
              <button type="button" onClick={createCharacter}><Plus size={16} />新增角色卡</button>
              <button type="button" onClick={() => setPanel("agent")}><Bot size={16} />通用智能体</button>
              <button className="role-admin-shortcuts-status-agent" type="button" onClick={() => setPanel("statusAgent")}><ShieldCheck size={16} />{"\u72b6\u6001\u680f\u667a\u80fd\u4f53"}</button>
              <button type="button" onClick={() => setPanel("character")}><Edit3 size={16} />修改当前角色卡</button>
            </>
          ) : (
            <button type="button" onClick={() => setPanel("admin")}><Lock size={16} />管理员入口</button>
          )}
        </div>

        {isAdmin && (
          <div className="maintenance-shortcut">
            <button type="button" onClick={() => setPanel("maintenance")}>
              <ShieldCheck size={16} />
              维护模式：{maintenance.enabled ? "开启" : "关闭"}
            </button>
          </div>
        )}

        <div className="role-card-list">
          {characters.map((character) => (
            <button
              className={`xc-card ${character.id === activeCharacter.id ? "active" : ""}`}
              key={character.id}
              onClick={() => {
                setActiveCharacterId(character.id);
                setChatOpen(true);
              }}
            >
              <div className="xc-avatar">{character.avatarUrl ? <img src={character.avatarUrl} alt="" /> : character.name[0]}</div>
              <div>
                <strong>{character.name}</strong>
                <span className="xc-tag-row">{cleanTags(character.tags).map((tag) => <b className="xc-tag-pill" key={tag}>{tag}</b>)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="xc-tools">
          <button onClick={() => setPanel("persona")}><Bot size={16} />我的角色设定</button>
          <button onClick={() => setPanel("background")}><Palette size={16} />聊天背景</button>
          {isAdmin ? (
            <>
              <button onClick={createCharacter}><Plus size={16} />新增角色卡</button>
              <button className="xc-tools-agent" onClick={() => setPanel("agent")}><Bot size={16} />{"\u901a\u7528\u667a\u80fd\u4f53"}</button>
              <button className="xc-tools-status-agent" onClick={() => setPanel("statusAgent")}><ShieldCheck size={16} />{"\u72b6\u6001\u680f\u667a\u80fd\u4f53"}</button>
              <button onClick={() => setPanel("character")}><Edit3 size={16} />修改当前角色卡</button>
              <button onClick={logoutAdmin}><LogOut size={16} />退出管理员</button>
            </>
          ) : (
            <button onClick={() => setPanel("admin")}><Lock size={16} />管理员修改</button>
          )}
        </div>

        <div className="xc-note">
          <ShieldCheck size={15} />
          普通访客只可以查看和切换角色卡，不能新增或修改。
        </div>
      </aside>

      <section className="xc-chat">
        <header className="xc-chat-head">
          <button className="chat-back-button" onClick={() => setChatOpen(false)} title="返回">
            <ChevronLeft size={20} />
          </button>
          <div className="xc-profile">
            <div className="xc-avatar large">{activeCharacter.avatarUrl ? <img src={activeCharacter.avatarUrl} alt="" /> : activeCharacter.name[0]}</div>
            <div>
              <h1>{activeCharacter.name}</h1>
              <p>{activeCharacter.profile}</p>
            </div>
          </div>
          <div className="xc-lock">{isAdmin ? "管理员模式" : "普通用户"}</div>
        </header>

        <div className="xc-chat-body" ref={chatBodyRef}>
          {messages.length === 0 ? (
            <div className="xc-empty">
              <MessageCircleIcon />
              <p>{activeCharacter.scenario}</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`xc-message ${message.role}${message.pendingReply ? " pending-reply" : ""}${message.failedReply ? " failed-reply" : ""}`} key={message.id}>
                <span>{message.role === "user" ? "你" : activeCharacter.name}</span>
                <p>{renderMessageContent(message.content)}</p>
                {message.failedReply && <button type="button" className="message-retry-button" disabled={busy} onClick={() => retryAssistantMessage(message.retryText)}>{"\u91cd\u8bd5\u8fd9\u6761"}</button>}
                {message.role === "assistant" && !message.pendingReply && !message.failedReply && (
                  message.statusPending ? (
                    <RoleStatusNotice text="状态栏生成中..." />
                  ) : message.statusError ? (
                    <RoleStatusNotice text="状态栏更新失败，聊天内容已保存。" />
                  ) : (
                    <RoleStatusCardV2 characterName={activeCharacter.name} status={message.statusSnapshot || visibleStatus} previousStatus={message.statusPreviousSnapshot} />
                  )
                )}
              </div>
            ))
          )}
        </div>

        {error && <div className="error-line">{error}</div>}

        <form className="xc-composer" onSubmit={sendMessage}>
          <div className="composer-quick-row">
            <button type="button" onClick={() => insertComposerTemplate("“", "”")}>说话 “...”</button>
            <button type="button" onClick={() => insertComposerTemplate("（", "）")}>行动 （...）</button>
            {mentionNames.map((name) => (
              <button className="composer-mention-direct" type="button" key={name} onClick={() => insertMention(name)}><AtSign size={13} />{name}</button>
            ))}
          </div>
          <div className="composer-settings-wrap">
            <button type="button" className="composer-settings-button" onClick={() => setComposerMenuOpen((value) => !value)} title="模型设定">
              <Settings size={18} />
            </button>
            {composerMenuOpen && (
              <div className="composer-settings-menu">
                <button type="button" onClick={() => { setPanel("memory"); setComposerMenuOpen(false); }}><BookOpen size={15} />记忆设置</button>
                <button type="button" onClick={cycleContextLimit}>{contextMessageLimit}条上下文</button>
              </div>
            )}
          </div>
          <textarea
            ref={composerTextareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="输入你要说的话..."
            rows={2}
          />
          <button disabled={busy || !draft.trim()} title="发送"><Send size={18} /></button>
        </form>
      </section>

      <aside className="xc-status">
        <section>
          <h2><Bot size={16} />记忆</h2>
          <button className="memory-open-button" onClick={() => setPanel("memory")}>
            <BookOpen size={16} />
            记忆设置
            <span>{memoryLimit} 字</span>
          </button>
        </section>
      </aside>

      {panel !== "none" && (
        <EditorModal title={panelTitle(panel)} onClose={() => setPanel("none")}>
          {panel === "admin" && (
            <form onSubmit={verifyAdmin} className="modal-stack">
              <label>管理员密码<input type="password" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label>
              {adminError && <div className="mini-error">{adminError}</div>}
              <button className="primary"><Lock size={16} />进入管理员模式</button>
            </form>
          )}
          {panel === "account" && (
            <AccountEditorV2
              currentUser={currentUser}
              loginName={loginName}
              setLoginName={setLoginName}
              loginPassword={loginPassword}
              setLoginPassword={setLoginPassword}
              accountMode={accountMode}
              setAccountMode={setAccountMode}
              accountError={accountError}
              onLogin={loginAccount}
              onLogout={logoutAccount}
            />
          )}
          {panel === "persona" && <PersonaEditor value={userPersona} setValue={setUserPersona} onDone={() => setPanel("none")} />}
          {panel === "background" && <BackgroundEditor background={background} setBackground={setBackground} onDone={() => setPanel("none")} />}
          {panel === "memory" && <MemoryEditor value={memory} setValue={setActiveMemory} limit={memoryLimit} setLimit={setMemoryLimit} onDone={() => setPanel("none")} />}
          {panel === "maintenance" && isAdmin && (
            <MaintenanceEditor
              value={maintenance}
              error={maintenanceError}
              onSave={updateMaintenance}
              onDone={() => setPanel("none")}
            />
          )}
          {panel === "agent" && isAdmin && (
            <AgentEditor
              value={director}
              setValue={updateDirector}
              onDone={() => setPanel("none")}
            />
          )}
          {panel === "statusAgent" && isAdmin && (
            <AgentEditor
              value={statusAgent}
              setValue={updateStatusAgent}
              onDone={() => setPanel("none")}
              uploadLabel={"\u4e0a\u4f20 .txt / JSON \u72b6\u6001\u680f\u667a\u80fd\u4f53"}
              saveLabel={"\u4fdd\u5b58\u72b6\u6001\u680f\u667a\u80fd\u4f53"}
              placeholder={"\u5199\u72b6\u6001\u680f\u4e13\u7528\u89c4\u5219\uff1a\u5b57\u6bb5\u540d\u79f0\u3001\u6570\u503c\u53d8\u5316\u65b9\u5f0f\u3001\u54ea\u4e9b\u5185\u5bb9\u5199\u5165\u8bb0\u5fc6\u3002\u8fd9\u91cc\u53ea\u5f71\u54cd\u6bcf\u8f6e\u5bf9\u8bdd\u4e0b\u65b9\u7684\u72b6\u6001\u680f\u3002"}
              sideNote={
                <div className="agent-side-note">
                  <strong>多角色状态写法</strong>
                  <p>如果一张角色卡里有多个角色，状态栏必须按角色分组输出。</p>
                  <pre>{`唐玉状态
❤️ 好感度 ・ 6
💛 堕落度 ・ 2
👀 眼神 ・ 不敢对视

王小小状态
❤️ 好感度 ・ 6
💛 堕落度 ・ 1
📍 位置 ・ 客厅`}</pre>
                  <p>不要把多个角色混成一张总状态栏；每轮只更新本轮出现或变化的角色。</p>
                </div>
              }
            />
          )}
          {panel === "character" && isAdmin && (
            <CharacterEditor
              value={activeCharacter}
              setValue={updateCharacter}
              onDelete={deleteActiveCharacter}
              canDelete={characters.length > 1}
              onDone={() => setPanel("none")}
            />
          )}
        </EditorModal>
      )}
    </main>
  );
}

function panelTitle(panel: string) {
  if (panel === "agent") return "通用智能体";
  if (panel === "statusAgent") return "\u72b6\u6001\u680f\u667a\u80fd\u4f53";
  if (panel === "account") return "账号登录";
  const map: Record<string, string> = {
    admin: "管理员登录",
    persona: "我的角色设定",
    background: "聊天背景",
    memory: "记忆设置",
    character: "角色卡管理"
  };
  return map[panel] || "设置";
}

function EditorModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal editor-modal">
        <div className="modal-title">
          <h2>{title}</h2>
          <button onClick={onClose} title="关闭"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MaintenanceEditor({
  value,
  error,
  onSave,
  onDone
}: {
  value: MaintenanceSettings;
  error: string;
  onSave: (value: MaintenanceSettings) => Promise<void>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<MaintenanceSettings>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(draft);
  }

  return (
    <form className="modal-stack" onSubmit={submit}>
      <div className="editor-hint">
        开启后，普通用户只能看到维护页，不能进入聊天。管理员仍可进入后台关闭维护模式。
      </div>
      <label className="switch-row">
        <span>
          <strong>维护模式</strong>
          <small>{draft.enabled ? "当前开启，用户不可聊天" : "当前关闭，用户可正常访问"}</small>
        </span>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
        />
      </label>
      <label>维护提示<textarea value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label>
      {error && <div className="mini-error">{error}</div>}
      <div className="modal-actions-row">
        <button className="primary" type="submit"><Save size={16} />保存开关</button>
        <button type="button" onClick={onDone}>完成</button>
      </div>
    </form>
  );
}

function AccountEditorV2({
  currentUser,
  loginName,
  setLoginName,
  loginPassword,
  setLoginPassword,
  accountMode,
  setAccountMode,
  accountError,
  onLogin,
  onLogout
}: {
  currentUser: string;
  loginName: string;
  setLoginName: (value: string) => void;
  loginPassword: string;
  setLoginPassword: (value: string) => void;
  accountMode: "login" | "register";
  setAccountMode: (value: "login" | "register") => void;
  accountError: string;
  onLogin: (event: FormEvent) => void;
  onLogout: () => void;
}) {
  return (
    <form className="modal-stack" onSubmit={onLogin}>
      <div className="editor-hint">
        先注册账号，再登录使用。同一个账号在不同设备登录后，会读取同一份聊天记录、记忆和我的设定。
      </div>
      {currentUser && <div className="account-badge">当前账号：{currentUser}</div>}
      <div className="mode-switch">
        <button type="button" className={accountMode === "login" ? "active" : ""} onClick={() => setAccountMode("login")}>登录</button>
        <button type="button" className={accountMode === "register" ? "active" : ""} onClick={() => setAccountMode("register")}>注册</button>
      </div>
      <label>账号名<input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="例如：test01 或你的昵称" /></label>
      <label>密码<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="至少 4 位" /></label>
      {accountError && <div className="mini-error">{accountError}</div>}
      <div className="modal-actions-row">
        <button className="primary" type="submit"><UserCircle size={16} />{accountMode === "login" ? "登录" : "注册并登录"}</button>
        <button className="danger-button" type="button" disabled={!currentUser} onClick={onLogout}>退出账号</button>
      </div>
    </form>
  );
}

function AccountEditor({ currentUser, loginName, setLoginName, onLogin, onLogout }: { currentUser: string; loginName: string; setLoginName: (value: string) => void; onLogin: (event: FormEvent) => void; onLogout: () => void }) {
  return (
    <form className="modal-stack" onSubmit={onLogin}>
      <div className="editor-hint">
        测试阶段账号只用来区分聊天记录，不需要密码。同一个账号名在电脑和手机登录后，会读取同一份聊天记录、记忆和我的设定。
      </div>
      {currentUser && <div className="account-badge">当前账号：{currentUser}</div>}
      <label>账号名<input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="例如：test01 或你的昵称" /></label>
      <div className="modal-actions-row">
        <button className="primary" type="submit"><UserCircle size={16} />登录 / 切换</button>
        <button className="danger-button" type="button" disabled={!currentUser} onClick={onLogout}>退出账号</button>
      </div>
    </form>
  );
}

function PersonaEditor({ value, setValue, onDone }: { value: string; setValue: (value: string) => void; onDone: () => void }) {
  return (
    <div className="modal-stack">
      <label>我的设定<textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="填写你是谁、你和角色的关系、你的说话风格。" /></label>
      <button className="primary" onClick={onDone}><Save size={16} />保存</button>
    </div>
  );
}

function MemoryEditor({ value, setValue, limit, setLimit, onDone }: { value: string; setValue: (value: string) => void; limit: number; setLimit: (value: number) => void; onDone: () => void }) {
  return (
    <div className="modal-stack">
      <label>记忆长度<input type="number" min="1000" max="50000" step="500" value={limit} onChange={(event) => setLimit(Number(event.target.value || 7000))} /></label>
      <label>长期记忆<textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="长期记忆会保存在这里。" /></label>
      <button className="primary" onClick={onDone}><Save size={16} />保存</button>
    </div>
  );
}

function AgentEditor({
  value,
  setValue,
  onDone,
  uploadLabel = "\u4e0a\u4f20 .txt / JSON \u667a\u80fd\u4f53",
  saveLabel = "\u4fdd\u5b58\u901a\u7528\u667a\u80fd\u4f53",
  placeholder = "\u5199\u5168\u7ad9\u901a\u7528\u603b\u89c4\u5219\u3002API \u4f1a\u5148\u5957\u901a\u7528\u667a\u80fd\u4f53\uff0c\u518d\u5957\u5f53\u524d\u89d2\u8272\u5361\uff0c\u6700\u540e\u751f\u6210\u7528\u6237\u770b\u5230\u7684\u804a\u5929\u56de\u590d\u3002"
  ,
  sideNote
}: {
  value: BackendAgent;
  setValue: (value: BackendAgent) => void;
  onDone: () => void;
  uploadLabel?: string;
  saveLabel?: string;
  placeholder?: string;
  sideNote?: React.ReactNode;
}) {
  async function importAgentText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();

    try {
      const parsed = JSON.parse(text) as Partial<BackendAgent> & Record<string, unknown>;
      setValue({
        ...value,
        description: "",
        systemPrompt: String(parsed.systemPrompt || parsed.prompt || parsed.system || text),
        replyStyle: "",
        statusRule: "",
        memoryRule: "",
        photos: []
      });
    } catch {
      setValue({ ...value, systemPrompt: text, description: "", replyStyle: "", statusRule: "", memoryRule: "", photos: [] });
    }

    event.target.value = "";
  }

  return (
    <div className="modal-stack">
      <label className="upload-button"><BookOpen size={16} />{uploadLabel}<input type="file" accept=".txt,text/plain,application/json" onChange={importAgentText} /></label>
      <div className={sideNote ? "agent-rule-grid" : ""}>
        <label>{"\u603b\u89c4\u5219"}<textarea value={value.systemPrompt} onChange={(event) => setValue({ ...value, systemPrompt: event.target.value, description: "", replyStyle: "", statusRule: "", memoryRule: "", photos: [] })} placeholder={placeholder} /></label>
        {sideNote}
      </div>
      <button className="primary" onClick={onDone}><Save size={16} />{saveLabel}</button>
    </div>
  );
}

function CharacterEditor({ value, setValue, onDelete, canDelete, onDone }: { value: CharacterCard; setValue: (value: CharacterCard) => void; onDelete: () => void; canDelete: boolean; onDone: () => void }) {
  async function uploadCharacterImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setValue({ ...value, avatarUrl: await fileToDataUrl(file) });
    event.target.value = "";
  }

  async function uploadStatusPrompt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setValue({ ...value, statusPrompt: await file.text() });
    event.target.value = "";
  }

  async function importCharacterText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const fileName = file.name.replace(/\.txt$/i, "");

    try {
      const parsed = JSON.parse(text) as Partial<CharacterCard> & Record<string, unknown>;
      setValue({
        ...value,
        name: String(parsed.name || parsed.title || value.name || fileName),
        tags: cleanTags(parsed.tags || parsed["\u6807\u7b7e"] || value.tags),
        avatarUrl: String(parsed.avatarUrl || parsed.avatar || value.avatarUrl || ""),
        statusPrompt: String(parsed.statusPrompt || parsed.status_prompt || parsed.statusAgent || parsed.status_agent || parsed.status || value.statusPrompt || ""),
        statusNames: cleanStatusNames(parsed.statusNames || parsed.status_names || parsed.statusCharacters || parsed.status_characters || parsed["\u72b6\u6001\u680f\u89d2\u8272\u540d\u5355"] || value.statusNames || []),
        openingMessage: String(parsed.openingMessage || parsed.opening_message || parsed.firstMessage || parsed.first_message || parsed.greeting || parsed["\u7b2c\u4e00\u53e5\u8bdd"] || value.openingMessage || ""),
        profile: String(parsed.profile || parsed.description || parsed.background || value.profile || ""),
        personality: String(parsed.personality || parsed.persona || parsed.speaking_style || value.personality || ""),
        scenario: String(parsed.scenario || parsed.opening_scene || value.scenario || ""),
        creatorNotes: String(parsed.creatorNotes || parsed.creator_notes || parsed.prompt || parsed.system || text),
        worldBook: String(parsed.worldBook || parsed.world_book || parsed.lorebook || parsed.knowledge || value.worldBook || "")
      });
    } catch {
      setValue({
        ...value,
        name: value.name || fileName,
        tags: cleanTags(value.tags).length ? cleanTags(value.tags) : ["成年人"],
        statusPrompt: value.statusPrompt || "",
        statusNames: value.statusNames || [],
        openingMessage: value.openingMessage || "",
        creatorNotes: text,
        profile: value.profile || "从 txt 文件导入的角色卡。",
        personality: value.personality || "沿用导入文本中的角色性格和说话方式。",
        scenario: value.scenario || "私人聊天"
      });
    }

    event.target.value = "";
  }

  return (
    <div className="modal-stack">
      <label className="upload-button"><BookOpen size={16} />上传 .txt 角色卡<input type="file" accept=".txt,text/plain,application/json" onChange={importCharacterText} /></label>
      <label>角色名<input value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} /></label>
      <label>{"\u89d2\u8272\u6807\u7b7e"}<textarea value={cleanTags(value.tags).join("\n")} onChange={(event) => setValue({ ...value, tags: cleanTags(event.target.value) })} placeholder={"\u6bcf\u884c\u4e00\u4e2a\uff0c\u6216\u7528\u9017\u53f7\u5206\u9694\u3002\u4f8b\u5982\uff1a\u51b7\u6de1\u3001\u6162\u70ed\u3001\u591a\u89d2\u8272"} /></label>
      <label>头像 URL<input value={value.avatarUrl || ""} onChange={(event) => setValue({ ...value, avatarUrl: event.target.value })} /></label>
      <label>第一句话<textarea value={value.openingMessage || ""} onChange={(event) => setValue({ ...value, openingMessage: event.target.value })} placeholder="用户第一次打开这个角色卡时，会自动作为角色的第一条消息发出。" /></label>
      <label className="upload-button"><BookOpen size={16} />{"\u4e0a\u4f20 .txt \u89d2\u8272\u5361\u72b6\u6001\u680f\u89c4\u5219"}<input type="file" accept=".txt,text/plain" onChange={uploadStatusPrompt} /></label>
      <label>{"\u72b6\u6001\u680f\u667a\u80fd\u4f53"}<textarea value={value.statusPrompt || ""} onChange={(event) => setValue({ ...value, statusPrompt: event.target.value })} placeholder={"\u8fd9\u5f20\u89d2\u8272\u5361\u4e13\u5c5e\u7684\u72b6\u6001\u680f\u8865\u5145\u89c4\u5219\u3002\u4f1a\u548c\u5916\u90e8\u901a\u7528\u72b6\u6001\u680f\u667a\u80fd\u4f53\u4e00\u8d77\u53d1\u7ed9 API\u3002"} /></label>
      <label>{"\u72b6\u6001\u680f\u89d2\u8272\u540d\u5355"}<textarea value={(value.statusNames || []).join("\n")} onChange={(event) => setValue({ ...value, statusNames: cleanStatusNames(event.target.value) })} placeholder={"\u6bcf\u884c\u4e00\u4e2a\u89d2\u8272\u540d\u3002\u586b\u4e86\u4ee5\u540e\uff0c\u72b6\u6001\u680f\u4f1a\u6309\u8fd9\u4e9b\u540d\u5b57\u5206\u522b\u751f\u6210\u3002"} /></label>
      <label>角色简介<textarea value={value.profile} onChange={(event) => setValue({ ...value, profile: event.target.value })} /></label>
      <label>角色卡内容<textarea value={value.creatorNotes} onChange={(event) => setValue({ ...value, creatorNotes: event.target.value })} placeholder="上传 .txt 后会自动填入这里。" /></label>
      <div className="character-image-row">
        <div className="character-image-preview">
          {value.avatarUrl ? <img src={value.avatarUrl} alt="" /> : <span>{value.name[0]}</span>}
        </div>
        <label className="upload-button"><ImagePlus size={16} />上传角色图像<input type="file" accept="image/*" onChange={uploadCharacterImage} /></label>
      </div>
      <div className="modal-actions-row">
        <button className="primary" onClick={onDone}><Save size={16} />保存</button>
        <button className="danger-button" disabled={!canDelete} onClick={onDelete}><Trash2 size={16} />删除角色卡</button>
      </div>
    </div>
  );
}

function BackgroundEditor({ background, setBackground, onDone }: { background: BackgroundSettings; setBackground: (value: BackgroundSettings) => void; onDone: () => void }) {
  async function uploadBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackground({ ...background, imageUrl: await fileToDataUrl(file) });
  }

  return (
    <div className="modal-stack">
      <label>背景色<input type="color" value={background.color} onChange={(event) => setBackground({ ...background, color: event.target.value })} /></label>
      <label>图片 URL<input value={background.imageUrl} onChange={(event) => setBackground({ ...background, imageUrl: event.target.value })} /></label>
      <label>透明度<input type="range" min="0" max="0.8" step="0.05" value={background.opacity} onChange={(event) => setBackground({ ...background, opacity: Number(event.target.value) })} /></label>
      <label className="upload-button"><ImagePlus size={16} />上传背景图<input type="file" accept="image/*" onChange={uploadBackground} /></label>
      <button className="primary" onClick={onDone}><Save size={16} />保存</button>
    </div>
  );
}

function RoleStatusNotice({ text }: { text: string }) {
  return (
    <div className="role-status-card role-status-notice">
      <div className="role-status-head">
        <strong>{text}</strong>
        <span>STATUS</span>
      </div>
    </div>
  );
}

function RoleStatusCardV2({ characterName, status, previousStatus }: { characterName: string; status: StatusMap; previousStatus?: StatusMap }) {
  const orderedKeys = ["\u5f53\u524d\u9636\u6bb5", "\u5fc3\u60c5", "\u4f4d\u7f6e", "\u52a8\u4f5c", "\u5bf9\u7528\u6237\u6001\u5ea6", "\u8bed\u6c14", "\u773c\u795e", "\u7a7f\u7740", "\u8eab\u4f53\u53cd\u5e94"];
  const safeStatus = normalizeStatusMap(status);
  const safePreviousStatus = normalizeStatusMap(previousStatus);
  const groupedEntries = Object.entries(safeStatus).filter(([, value]) => isFlatStatusMap(value)) as Array<[string, FlatStatusMap]>;
  const hasGroups = groupedEntries.length > 0 && groupedEntries.length === Object.keys(safeStatus).length;
  const groups = hasGroups ? groupedEntries : [[characterName, normalizeFlatStatusMap(safeStatus)] as [string, FlatStatusMap]];

  function rowsFor(groupStatus: FlatStatusMap) {
    const extraKeys = Object.keys(groupStatus).filter((key) => !orderedKeys.includes(key));
    return [...orderedKeys, ...extraKeys]
      .filter((key) => groupStatus[key] !== undefined && groupStatus[key] !== "")
      .map((key) => ({ key, value: groupStatus[key] }));
  }

  return (
    <div className="role-status-card">
      <div className="role-status-head">
        <strong>{characterName}</strong>
        <span>STATUS</span>
      </div>
      <div className="role-status-groups">
        {groups.map(([groupName, groupStatus]) => (
          <div className="role-status-group" key={groupName}>
            {hasGroups && <div className="role-status-group-title">{groupName}</div>}
            <div className="role-status-list">
              {rowsFor(groupStatus).map(({ key, value }) => {
                const percent = parsePercent(value);
                const previousGroup = hasGroups && isFlatStatusMap(safePreviousStatus[groupName]) ? safePreviousStatus[groupName] as FlatStatusMap : !hasGroups && isFlatStatusMap(safePreviousStatus) ? safePreviousStatus as FlatStatusMap : {};
                const previousPercent = parsePercent(previousGroup[key]);
                const trend = percent !== null && previousPercent !== null ? Math.sign(percent - previousPercent) : 0;
                return (
                  <div className="role-status-row" key={`${groupName}-${key}`}>
                    <span className="status-label">{key}</span>
                    <span className="status-dot">-</span>
                    {percent === null ? <StatusValuePills value={value} /> : <div className="status-meter"><i style={{ width: `${percent}%` }} /><b>{percent}%</b>{trend > 0 && <em className="status-trend up">↑</em>}{trend < 0 && <em className="status-trend down">↓</em>}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleStatusCard({ characterName, status }: { characterName: string; status: FlatStatusMap }) {
  const orderedKeys = ["当前阶段", "调戏兴致", "脸红度", "身体燥热", "隐秘湿润", "禁忌感", "涵湿状态", "衣衫完整度", "当前位置", "心理状态", "语气", "眼神", "当前穿着", "身体反应"];
  const iconMap: Record<string, string> = {
    当前阶段: "🎭",
    调戏兴致: "😏",
    脸红度: "😳",
    身体燥热: "🌡",
    隐秘湿润: "💧",
    禁忌感: "⛔",
    涵湿状态: "🎯",
    衣衫完整度: "👗",
    当前位置: "📍",
    心理状态: "☁",
    语气: "🎙",
    眼神: "👀",
    当前穿着: "🧥",
    身体反应: "💃"
  };
  const extraKeys = Object.keys(status).filter((key) => !orderedKeys.includes(key));
  const rows = [...orderedKeys, ...extraKeys].filter((key) => status[key] !== undefined && status[key] !== "").map((key) => ({ key, value: status[key] }));

  return (
    <div className="role-status-card">
      <div className="role-status-head">
        <strong>✦ {characterName}</strong>
        <span>♡ STATUS</span>
      </div>
      <div className="role-status-list">
        {rows.map(({ key, value }) => {
          const percent = parsePercent(value);
          return (
            <div className="role-status-row" key={key}>
              <span className="status-label">{iconMap[key] || "•"} {key}</span>
              <span className="status-dot">•</span>
              {percent === null ? <strong className="status-text">{String(value)}</strong> : <div className="status-meter"><i style={{ width: `${percent}%` }} /><b>{percent}%</b></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusValuePills({ value }: { value: unknown }) {
  const text = String(value || "").trim();
  const parts = text
    .split(/[，、,;；|/]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const tokens = parts.length > 1 && parts.every((item) => item.length <= 12) ? parts.slice(0, 8) : [text];
  return (
    <strong className="status-pill-wrap">
      {tokens.map((token) => <span className="status-value-pill" key={token}>{token}</span>)}
    </strong>
  );
}

function parsePercent(value: unknown) {
  if (typeof value === "number") return Math.max(0, Math.min(100, Math.round(value)));
  if (typeof value !== "string") return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const numberValue = Number(match[0]);
  if (!Number.isFinite(numberValue)) return null;
  if (!value.includes("%") && numberValue > 100) return null;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function renderMessageContent(content: string) {
  const parts = content.split(/(“[^”]*”|（[^）]*）|\([^)]*\))/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("“") && part.endsWith("”")) return <span className="dialogue-text" key={`${part}-${index}`}>{part}</span>;
    if ((part.startsWith("（") && part.endsWith("）")) || (part.startsWith("(") && part.endsWith(")"))) return <span className="action-text" key={`${part}-${index}`}>{part}</span>;
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function MessageCircleIcon() {
  return <div className="message-orb"><Bot size={28} /></div>;
}
