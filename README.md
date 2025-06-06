# 最方便最安全的 Telegram 私聊机器人

一个基于 Telegram 机器人的私聊消息转发工具，支持手机 Telegram 转发和网页端会话管理，带来更直观、分离的聊天体验。

---

## 项目简介

市面上很多私聊转发机器人（如 LivegramBot 等）都只能在 Telegram 里操作，回复转发消息不直观，所有会话混在一个单一窗口里，消息难找。

本机器人除了基础的手机 Telegram 消息转发，还提供了一个 **web 界面**，界面类似聊天应用，支持单独分开的会话窗口，使用更便捷。

### 主要优势

- **Web 操作界面**，类似聊天 APP，消息分会话显示，方便查找和管理
- 直接访问自己服务器，无需科学上网，不易被屏蔽
- **所有数据仅保存在内存中**，docker 重启即清空，保护隐私
- 支持极致隐私模式：将 `BOT_OWNER` 不设置或者设为0，消息仅保留在 web，不转发到手机

---

## 快速开始

1. 通过 [@BotFather](https://t.me/BotFather) 创建自己的机器人，获取 Bot Token
2. 通过 [@userinfobot](https://t.me/userinfobot) 获取你的 Telegram ID
3. 修改下面示例的 `docker-compose.yml` 文件，替换 `BOT_TOKEN` 和 `BOT_OWNER`
4. 启动容器：`docker compose up -d`
5. 在 Telegram 里，给你的机器人发送 `/start`，开启双向通信。如果不需转发，可不做此步。
6. 浏览器访问：http://你的服务器IP:8010 ，建议用 Cloudflare 或 Caddy 做 HTTPS 代理（回源用 HTTP）

---

## 示例 docker-compose.yml

```yaml
version: '3.8'

services:
  tg_bot:
    image: yessure/tg_fwd_web_bot:latest
    container_name: tg_fwd_web_bot
    environment:
      - BOT_TOKEN=在BotFather获得的token
      - BOT_OWNER=在userinfobot获得的id。可不设本项。
    ports:
      - "8010:8010"
```

## 已知问题
1. 暂不支持tgs的sticker。
2. 暂不支持gif。

