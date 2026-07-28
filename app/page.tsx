"use client";

import {
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
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

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
  statusSnapshot?: StatusMap;
};

type StatusMap = Record<string, string | number>;

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
  name: "冰蓝",
  main: "#39a9e8"
};

const starterCharacters: CharacterCard[] = [
  {
    id: "jiang-yazhen",
    name: "江雅真",
    tags: ["成年人", "私密聊天", "慢热关系"],
    avatarUrl: "",
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
  color: "#edf8ff",
  imageUrl: "",
  opacity: 0.22
};

const defaultMaintenance: MaintenanceSettings = {
  enabled: false,
  message: "网站维护中，请稍后再来。"
};

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

function saveUserStateToServer(user: string, state: {
  messagesByCharacter: Record<string, ChatMessage[]>;
  statusByCharacter: Record<string, StatusMap>;
  memoryByCharacter: Record<string, string>;
  contextLimitByCharacter: Record<string, number>;
  userPersona: string;
  memoryLimit: number;
}, token: string) {
  if (!user.trim() || !token) return;
  void fetch("/api/user-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user, state })
  }).catch(() => undefined);
}

function compactCharacterForChat(character: CharacterCard) {
  const { avatarUrl, ...textOnlyCharacter } = character;
  return textOnlyCharacter;
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

export default function Home() {
  const [characters, setCharacters] = useState<CharacterCard[]>(starterCharacters);
  const [activeCharacterId, setActiveCharacterId] = useState(starterCharacters[0].id);
  const [director, setDirector] = useState<BackendAgent>(fixedDirector);
  const [messagesByCharacter, setMessagesByCharacter] = useState<Record<string, ChatMessage[]>>({});
  const [statusByCharacter, setStatusByCharacter] = useState<Record<string, StatusMap>>({});
  const [memoryByCharacter, setMemoryByCharacter] = useState<Record<string, string>>({});
  const [contextLimitByCharacter, setContextLimitByCharacter] = useState<Record<string, number>>({});
  const [memoryLimit, setMemoryLimit] = useState(7000);
  const [userPersona, setUserPersona] = useState("");
  const [background, setBackground] = useState<BackgroundSettings>(defaultBackground);
  const [draft, setDraft] = useState("");
  const [busyCharacterId, setBusyCharacterId] = useState("");
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminError, setAdminError] = useState("");
  const [maintenance, setMaintenance] = useState<MaintenanceSettings>(defaultMaintenance);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [panel, setPanel] = useState<"none" | "admin" | "persona" | "background" | "memory" | "character" | "agent" | "account" | "maintenance">("none");
  const [chatOpen, setChatOpen] = useState(false);
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [currentToken, setCurrentToken] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [accountMode, setAccountMode] = useState<"login" | "register">("login");
  const [accountError, setAccountError] = useState("");
  const [accountReady, setAccountReady] = useState(false);

  useEffect(() => {
    const savedCharacters = safeJsonParse<CharacterCard[] | null>(localStorage.getItem("characters"), null);
    const oldSingleCharacter = safeJsonParse<CharacterCard | null>(localStorage.getItem("fixedCharacter"), null);
    const nextCharacters = savedCharacters?.length ? savedCharacters : migrateOneCharacter(oldSingleCharacter);
    setCharacters(nextCharacters);
    setActiveCharacterId(localStorage.getItem("activeCharacterId") || nextCharacters[0].id);
    setDirector(safeJsonParse(localStorage.getItem("fixedDirector"), fixedDirector));
    setMessagesByCharacter(safeJsonParse(localStorage.getItem("messagesByCharacter"), {}));
    setStatusByCharacter(safeJsonParse(localStorage.getItem("statusByCharacter"), {}));
    setMemoryByCharacter(safeJsonParse(localStorage.getItem("memoryByCharacter"), {}));
    setContextLimitByCharacter(safeJsonParse(localStorage.getItem("contextLimitByCharacter"), {}));
    setMemoryLimit(Number(localStorage.getItem("memoryLimit") || "7000"));
    setUserPersona(localStorage.getItem("userPersona") || "");
    const savedUser = localStorage.getItem("currentUser") || "";
    const savedToken = localStorage.getItem("currentToken") || "";
    setCurrentUser(savedUser);
    setCurrentToken(savedToken);
    setLoginName(savedUser);
    setBackground(safeJsonParse(localStorage.getItem("chatBackground"), defaultBackground));
    const adminUnlocked = localStorage.getItem("adminUnlocked") === "yes";
    const savedAdminToken = localStorage.getItem("adminToken") || "";
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
        const serverCharacters = data.characters as CharacterCard[];
        const serverLooksDefault = serverCharacters.length === 1 && serverCharacters[0].id === starterCharacters[0].id;
        const localLooksCustom = JSON.stringify(nextCharacters) !== JSON.stringify(starterCharacters);
        if (adminUnlocked && serverLooksDefault && localLooksCustom) {
          if (savedAdminToken) saveCharactersToServer(nextCharacters, savedAdminToken);
          return;
        }
        setCharacters(serverCharacters);
        const savedActiveId = localStorage.getItem("activeCharacterId");
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
        if (adminUnlocked && savedAdminToken) saveAgentToServer(safeJsonParse(localStorage.getItem("fixedDirector"), fixedDirector), savedAdminToken);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => localStorage.setItem("characters", JSON.stringify(characters)), [characters]);
  useEffect(() => localStorage.setItem("activeCharacterId", activeCharacterId), [activeCharacterId]);
  useEffect(() => localStorage.setItem("fixedDirector", JSON.stringify(director)), [director]);
  useEffect(() => localStorage.setItem("messagesByCharacter", JSON.stringify(messagesByCharacter)), [messagesByCharacter]);
  useEffect(() => localStorage.setItem("statusByCharacter", JSON.stringify(statusByCharacter)), [statusByCharacter]);
  useEffect(() => localStorage.setItem("memoryByCharacter", JSON.stringify(memoryByCharacter)), [memoryByCharacter]);
  useEffect(() => localStorage.setItem("contextLimitByCharacter", JSON.stringify(contextLimitByCharacter)), [contextLimitByCharacter]);
  useEffect(() => localStorage.setItem("memoryLimit", String(memoryLimit)), [memoryLimit]);
  useEffect(() => localStorage.setItem("userPersona", userPersona), [userPersona]);
  useEffect(() => localStorage.setItem("chatBackground", JSON.stringify(background)), [background]);

  useEffect(() => {
    if (!currentUser || !currentToken) {
      setAccountReady(false);
      return;
    }
    localStorage.setItem("currentUser", currentUser);
    localStorage.setItem("currentToken", currentToken);
    setAccountReady(false);
    void fetch("/api/user-state", { headers: { Authorization: `Bearer ${currentToken}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const state = data?.state;
        if (state) {
          setMessagesByCharacter(state.messagesByCharacter || {});
          setStatusByCharacter(state.statusByCharacter || {});
          setMemoryByCharacter(state.memoryByCharacter || {});
          setContextLimitByCharacter(state.contextLimitByCharacter || {});
          setUserPersona(state.userPersona || "");
          setMemoryLimit(Number(state.memoryLimit || 7000));
        }
        setAccountReady(true);
      })
      .catch(() => setAccountReady(true));
  }, [currentUser, currentToken]);

  useEffect(() => {
    if (!currentUser || !currentToken || !accountReady) return;
    saveUserStateToServer(currentUser, { messagesByCharacter, statusByCharacter, memoryByCharacter, contextLimitByCharacter, userPersona, memoryLimit }, currentToken);
  }, [currentUser, currentToken, accountReady, messagesByCharacter, statusByCharacter, memoryByCharacter, contextLimitByCharacter, userPersona, memoryLimit]);

  const activeCharacter = useMemo(
    () => characters.find((item) => item.id === activeCharacterId) || characters[0],
    [characters, activeCharacterId]
  );
  const activeBackgroundImage = activeCharacter.avatarUrl || background.imageUrl;
  const messages = messagesByCharacter[activeCharacter.id] || [];
  const visibleStatus = { ...defaultStatus, ...(statusByCharacter[activeCharacter.id] || {}) };
  const memory = memoryByCharacter[activeCharacter.id] || "";
  const contextMessageLimit = contextLimitByCharacter[activeCharacter.id] || 8;
  const busy = busyCharacterId === activeCharacter.id;

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

  function setStatusForCharacter(characterId: string, next: StatusMap) {
    setStatusByCharacter((current) => ({ ...current, [characterId]: next }));
  }

  function setMemoryForCharacter(characterId: string, next: string) {
    setMemoryByCharacter((current) => ({ ...current, [characterId]: next }));
  }

  function setContextLimitForCharacter(characterId: string, next: number) {
    setContextLimitByCharacter((current) => ({ ...current, [characterId]: next }));
  }

  function cycleContextLimit() {
    const options = [4, 8, 16, 24];
    const index = options.indexOf(contextMessageLimit);
    const next = options[(index + 1) % options.length] || 8;
    setContextLimitForCharacter(activeCharacter.id, next);
  }

  function updateDirector(next: BackendAgent) {
    setDirector(next);
    saveAgentToServer(next, adminToken);
  }

  function createCharacter() {
    const character: CharacterCard = {
      id: uid("character"),
      name: "新角色",
      tags: ["成年人"],
      avatarUrl: "",
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
    localStorage.setItem("adminUnlocked", "yes");
    setAdminToken(adminCode);
    localStorage.setItem("adminToken", adminCode);
    if (characters.length) saveCharactersToServer(characters, adminCode);
    saveAgentToServer(fixedDirector, adminCode);
    setAdminCode("");
    setPanel("none");
  }

  function logoutAdmin() {
    setIsAdmin(false);
    setAdminToken("");
    localStorage.removeItem("adminUnlocked");
    localStorage.removeItem("adminToken");
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
    localStorage.removeItem("currentUser");
    localStorage.removeItem("currentToken");
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
          memory: args.memory
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) return;

      const statusUpdate = data.statusUpdate && Object.keys(data.statusUpdate).length ? data.statusUpdate : null;
      const nextStatus = statusUpdate ? { ...args.previousStatus, ...statusUpdate } : args.previousStatus;
      if (statusUpdate) {
        setStatusForCharacter(args.characterId, nextStatus);
        setMessagesByCharacter((current) => ({
          ...current,
          [args.characterId]: (current[args.characterId] || []).map((message) =>
            message.id === args.assistantMessageId ? { ...message, statusSnapshot: nextStatus } : message
          )
        }));
      }
      if (data.memoryUpdate) {
        setMemoryForCharacter(args.characterId, [args.memory, data.memoryUpdate].filter(Boolean).join("\n"));
      }
    } catch {
      // 状态栏是后台增强，失败时不影响已经返回的聊天内容。
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    await sendDraftMessage();
  }

  async function sendDraftMessage() {
    const text = draft.trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = { id: uid("message"), role: "user", content: text, createdAt: Date.now() };
    const nextMessages = [...messages, userMessage];
    const requestCharacter = activeCharacter;
    const requestCharacterId = requestCharacter.id;
    const requestMessages = messages;
    const requestStatus = visibleStatus;
    const requestMemory = memory;
    const requestUserPersona = userPersona;
    const requestContextMessageLimit = contextMessageLimit;
    setMessagesForCharacter(requestCharacterId, nextMessages);
    setDraft("");
    setBusyCharacterId(requestCharacterId);
    setError("");

    try {
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
              timing.serverTotalMs ? `服务器 ${Math.round(timing.serverTotalMs / 1000)} 秒` : "",
              timing.upstreamMs ? `上游 ${Math.round(timing.upstreamMs / 1000)} 秒` : "",
              timing.requestBytes ? `请求 ${Math.max(1, Math.round(timing.requestBytes / 1024))} KB` : "",
              timing.fallbackUsed ? "已尝试极速兜底" : ""
            ].filter(Boolean)
          : [];
        const timingText = timingParts.length ? `（${timingParts.join("，")}）` : "";
        throw new Error(`${data?.error || "请求失败"}${timingText}`);
      }

      const assistantMessage: ChatMessage = {
        id: uid("message"),
        role: "assistant",
        content: data.reply || "“我在。”",
        createdAt: Date.now(),
        statusSnapshot: requestStatus
      };
      setMessagesForCharacter(requestCharacterId, [...nextMessages, assistantMessage]);
      void updateStatusAfterReply({
        characterId: requestCharacterId,
        assistantMessageId: assistantMessage.id,
        character: requestCharacter,
        userPersona: requestUserPersona,
        userMessage: text,
        assistantReply: assistantMessage.content,
        previousStatus: requestStatus,
        memory: requestMemory
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
      setMessagesForCharacter(requestCharacterId, requestMessages);
    } finally {
      setBusyCharacterId((current) => (current === requestCharacterId ? "" : current));
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendDraftMessage();
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
        <nav className="xc-rail" aria-label="主导航">
          <button className="rail-avatar" type="button" title="首页" onClick={() => setChatOpen(false)}>
            <Sparkles size={18} />
          </button>
          <button type="button" title="角色列表" onClick={() => setChatOpen(false)}>
            <Bot size={18} />
          </button>
          <button type="button" title="我的设定" onClick={() => setPanel("persona")}>
            <Edit3 size={18} />
          </button>
          <button type="button" title="记忆设置" onClick={() => setPanel("memory")}>
            <BookOpen size={18} />
          </button>
          <button type="button" title={currentUser ? `账号：${currentUser}` : "账号登录"} onClick={() => setPanel("account")}>
            <UserCircle size={18} />
          </button>
          {isAdmin ? (
            <>
              <button type="button" title="新增角色卡" onClick={createCharacter}>
                <Plus size={18} />
              </button>
              <button type="button" title="通用智能体" onClick={() => setPanel("agent")}>
                <Bot size={18} />
              </button>
              <button type="button" title="修改当前角色卡" onClick={() => setPanel("character")}>
                <Settings size={18} />
              </button>
              <button type="button" title="退出管理员" onClick={logoutAdmin}>
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button type="button" title="管理员入口" onClick={() => setPanel("admin")}>
              <Lock size={18} />
            </button>
          )}
        </nav>
        <div className="xc-brand">
          <div className="xc-logo"><Sparkles size={18} /></div>
          <div>
            <strong>AI 角色聊天</strong>
            <span>{THEME.name}主题</span>
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
                <span>{character.tags.join(" · ")}</span>
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

        <div className="xc-chat-body">
          {messages.length === 0 ? (
            <div className="xc-empty">
              <MessageCircleIcon />
              <p>{activeCharacter.scenario}</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`xc-message ${message.role}`} key={message.id}>
                <span>{message.role === "user" ? "你" : activeCharacter.name}</span>
                <p>{renderMessageContent(message.content)}</p>
                {message.role === "assistant" && <RoleStatusCard characterName={activeCharacter.name} status={message.statusSnapshot || visibleStatus} />}
              </div>
            ))
          )}
          {busy && <div className="xc-message assistant thinking"><span>{activeCharacter.name}</span><p>正在回复...</p></div>}
        </div>

        {error && <div className="error-line">{error}</div>}

        <form className="xc-composer" onSubmit={sendMessage}>
          <button type="button" className="composer-memory-button" onClick={() => setPanel("memory")} title="记忆设置">
            <BookOpen size={18} />
          </button>
          <button type="button" className="composer-context-button" onClick={cycleContextLimit} title="上下文长度：点击切换 4 / 8 / 16 / 24 条">
            {contextMessageLimit}条
          </button>
          <textarea
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

function AgentEditor({ value, setValue, onDone }: { value: BackendAgent; setValue: (value: BackendAgent) => void; onDone: () => void }) {
  async function importAgentText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();

    try {
      const parsed = JSON.parse(text) as Partial<BackendAgent> & Record<string, unknown>;
      setValue({
        ...value,
        name: String(parsed.name || value.name || "通用智能体"),
        description: String(parsed.description || value.description || ""),
        systemPrompt: String(parsed.systemPrompt || parsed.prompt || parsed.system || text),
        replyStyle: String(parsed.replyStyle || parsed.reply_style || value.replyStyle || ""),
        statusRule: String(parsed.statusRule || parsed.status_rule || value.statusRule || ""),
        memoryRule: String(parsed.memoryRule || parsed.memory_rule || value.memoryRule || ""),
        photos: Array.isArray(parsed.photos) ? parsed.photos as BackendAgent["photos"] : value.photos
      });
    } catch {
      setValue({ ...value, name: value.name || "通用智能体", systemPrompt: text });
    }

    event.target.value = "";
  }

  async function uploadAgentPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const photo = {
      id: uid("agent_photo"),
      name: file.name,
      url: await fileToDataUrl(file),
      note: ""
    };
    setValue({ ...value, photos: [...(value.photos || []), photo] });
    event.target.value = "";
  }

  function updatePhotoNote(id: string, note: string) {
    setValue({
      ...value,
      photos: (value.photos || []).map((photo) => photo.id === id ? { ...photo, note } : photo)
    });
  }

  function removePhoto(id: string) {
    setValue({ ...value, photos: (value.photos || []).filter((photo) => photo.id !== id) });
  }

  return (
    <div className="modal-stack">
      <div className="editor-hint">通用智能体是全站后台规则：API 调用模型后，先套通用智能体，再套当前角色卡，最后生成用户看到的聊天回复。</div>
      <label className="upload-button"><BookOpen size={16} />上传 .txt / JSON 智能体<input type="file" accept=".txt,text/plain,application/json" onChange={importAgentText} /></label>
      <label>名称<input value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} /></label>
      <label>说明<input value={value.description} onChange={(event) => setValue({ ...value, description: event.target.value })} placeholder="例如：全站后台导演，控制回复格式、状态栏和记忆。" /></label>
      <label>总规则<textarea value={value.systemPrompt} onChange={(event) => setValue({ ...value, systemPrompt: event.target.value })} placeholder="写全站通用规则，所有角色都会先经过这里。" /></label>
      <label>回复风格<textarea value={value.replyStyle} onChange={(event) => setValue({ ...value, replyStyle: event.target.value })} placeholder="控制引号、动作括号、语言风格、沉浸感等。" /></label>
      <label>状态栏规则<textarea value={value.statusRule} onChange={(event) => setValue({ ...value, statusRule: event.target.value })} placeholder="控制每轮 status_update 生成哪些字段、数值如何变化。" /></label>
      <label>记忆规则<textarea value={value.memoryRule} onChange={(event) => setValue({ ...value, memoryRule: event.target.value })} placeholder="控制哪些内容写入长期记忆，如何摘要。" /></label>
      <label className="upload-button"><ImagePlus size={16} />上传智能体参考图<input type="file" accept="image/*" onChange={uploadAgentPhoto} /></label>
      {!!value.photos?.length && (
        <div className="agent-photo-list">
          {value.photos.map((photo) => (
            <div className="agent-photo-item" key={photo.id}>
              <img src={photo.url} alt="" />
              <input value={photo.note} onChange={(event) => updatePhotoNote(photo.id, event.target.value)} placeholder="图片说明" />
              <button className="danger-button" type="button" onClick={() => removePhoto(photo.id)}>删除</button>
            </div>
          ))}
        </div>
      )}
      <button className="primary" onClick={onDone}><Save size={16} />保存通用智能体</button>
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
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : value.tags,
        avatarUrl: String(parsed.avatarUrl || parsed.avatar || value.avatarUrl || ""),
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
        tags: value.tags.length ? value.tags : ["成年人"],
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
      <label>标签<input value={value.tags.join(", ")} onChange={(event) => setValue({ ...value, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
      <label>头像 URL<input value={value.avatarUrl || ""} onChange={(event) => setValue({ ...value, avatarUrl: event.target.value })} /></label>
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

function RoleStatusCard({ characterName, status }: { characterName: string; status: StatusMap }) {
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

function parsePercent(value: string | number) {
  if (typeof value === "number") return Math.max(0, Math.min(100, Math.round(value)));
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
