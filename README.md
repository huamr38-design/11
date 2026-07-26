# AI Companion MVP

这是一个私有版 AI 角色聊天网站骨架，包含：

- 角色卡管理
- 聊天窗口
- 状态栏
- 记忆/世界书
- 后端 API 转发，密钥不暴露给浏览器
- OpenAI 兼容接口，能接 OpenAI、xAI/Grok、OpenRouter 或其它兼容服务

## 启动

1. 复制 `.env.example` 为 `.env.local`
2. 在 `.env.local` 里填：

```env
AI_API_KEY=你的密钥
AI_BASE_URL=https://api.x.ai/v1
AI_MODEL=你的模型名
```

3. 安装并启动：

```bash
npm install
npm run dev
```

打开 `http://localhost:3001`。

## 怎么放你的智能体

进入页面左侧，点“导入”，可以粘贴 JSON 角色卡，也可以直接粘贴纯文本设定。  
如果是 JSON，推荐字段：

```json
{
  "name": "角色名",
  "nickname": "昵称",
  "tags": ["adult", "romance"],
  "profile": "角色身份与背景",
  "personality": "说话方式、性格、偏好",
  "scenario": "开场场景",
  "firstMessage": "第一句话",
  "creatorNotes": "更长的角色规则",
  "worldBook": "世界观、长期设定、重要人物"
}
```

## 下一步可加

- 登录账号
- 云数据库保存聊天
- 付费/点数系统
- 图片生成
- 语音
- 多模型路由
