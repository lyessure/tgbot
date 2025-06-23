[中文版本](#最方便最安全的-telegram-私聊机器人)

# The Most Convenient and Secure Telegram Private Chat Bot

A Telegram bot-based private message forwarding tool that supports both mobile Telegram forwarding and web-based chat management, providing a more intuitive and convenient chat experience. All information is self-hosted, does not pass through any third party, and no persistent storage is used, ensuring information security.

---

## Project Overview

While there are many private chat forwarding bots available (such as LivegramBot), they can only be operated within Telegram. Due to their underlying principles, they all use message reply forwarding, which is not intuitive. More frustratingly, all conversations are mixed in a single chat window with the bot, making messages difficult to find and read.

This bot, in addition to basic mobile Telegram message forwarding, provides a **web interface** similar to chat applications, supporting separate conversation windows for more convenient use.

### Key Advantages

- **Web operation interface**, similar to chat apps, messages are displayed by conversation, making it easy to find and manage.
- Direct access to your own server, no need for VPN, less likely to be blocked.
- Ultimate privacy: **All data is stored only in memory**, cleared when docker restarts, protecting privacy. Without setting `BOT_OWNER` or setting it to 0, messages are only kept on the web, not forwarded to mobile. Frontend and backend are separated, page cache does not include conversation content.

---

[Screenshots](#screenshots)

---

## Screenshots

As a backend developer, please excuse my basic frontend UI skills.

![Screenshot](https://blog.lostshit.com/usr/uploads/2025/06/3351330584.jpg)

---

## Quick Start

1. Create your bot through [@BotFather](https://t.me/BotFather) and get the Bot Token
2. Get your Telegram ID through [@userinfobot](https://t.me/userinfobot) (Optional)
3. Modify the example `docker-compose.yml` file, replace `BOT_TOKEN` and `BOT_OWNER`(Optional)
4. Start the container: `docker compose up -d`
5. In Telegram, send `/start` to your bot to enable two-way communication. Skip this step if forwarding is not needed.
6. Browser access: http://your-server-IP:8010, recommend using Cloudflare or Caddy for HTTPS reverse proxy (use HTTP for backend)

---

## Example docker-compose.yml

```yaml
version: '3.8'

services:
  tg_bot:
    image: yessure/tg_fwd_web_bot:latest
    container_name: tg_fwd_web_bot
    environment:
      - BOT_TOKEN=token from BotFather
#      - BOT_OWNER=ID from userinfobot, messages will be forwarded to this number. Comment out or set to 0 to disable forwarding.
    ports:
      - "8010:8010"
```

## Known Issues
1. tgs format stickers are not supported yet.
2. gif is not supported yet.

---


# 最方便最安全的 Telegram 私聊机器人

一个基于 Telegram 机器人的私聊消息转发工具，支持手机 Telegram 转发和网页端会话管理，带来更直观、方便的聊天体验。
所有信息自托管，不经由任何第三方，也不做任何持久化保存，信息安全的保证。

---

## 项目简介

市面上已经有很多私聊转发机器人（如 LivegramBot 等），但它们都只能在 Telegram 里进行操作。受原理限制，它们均使用回复转发消息的方式操作很不直观，更头疼的是所有会话均混在单一的与机器人的对话窗口里，消息难于找到及阅读。

本机器人除了基础的手机 Telegram 消息转发，还提供了 **web 界面**，界面类似聊天应用，支持单独的会话窗口，使用更便捷。

### 主要优势

- **Web 操作界面**，类似聊天 APP，消息分会话显示，方便查找和管理。
- 直接访问自己服务器，无需科学上网，不易被屏蔽。
- 极致隐私： **所有数据仅保存在内存中**，docker 重启即清空，保护隐私。不设置 `BOT_OWNER` 或者设为0，消息仅保留在 web，不转发到手机。web前后端分离，页面缓存不包含对话内容。

---

## 运行截图 {#screenshots}

我是后端技术，前端UI就只能凑合了，多多包涵。

![截图](https://blog.lostshit.com/usr/uploads/2025/06/3351330584.jpg)

---

## 快速开始

1. 通过 [@BotFather](https://t.me/BotFather) 创建自己的机器人，获取 Bot Token
2. 通过 [@userinfobot](https://t.me/userinfobot) 获取你的 Telegram ID  (可选)
3. 修改示例的 `docker-compose.yml` 文件，替换 `BOT_TOKEN` 和 `BOT_OWNER`(可选)
4. 启动容器：`docker compose up -d`
5. 在 Telegram 里，给你的机器人发送 `/start`，开启双向通信。如果不需转发，可不做此步。
6. 浏览器访问：http://你的服务器IP:8010 ，建议用 Cloudflare 或 Caddy 做 HTTPS 反向代理（回源用 HTTP）

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
#      - BOT_OWNER=在userinfobot获得的id，消息将同时转发到此号码。可注释掉本项，或者填0,即不转发。
    ports:
      - "8010:8010"
```

## 已知问题
1. 暂不支持tgs格式的sticker。
2. 暂不支持gif。

