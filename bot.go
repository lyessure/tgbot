package main

import (
	"bot/api"
	"bot/web"
	"fmt"
	"log"
	"os"
	"runtime/debug"
	"strconv"
	"sync"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

var (
	token       string
	owner       int64
	webPort     string
	lastreplyid int
	msgToChatID = make(map[int]int64)
	msgMutex    sync.RWMutex
)

func main() {
	// 从环境变量获取配置
	token = os.Getenv("BOT_TOKEN")
	if token == "" {
		panic("BOT_TOKEN environment variable is required")
	}

	ownerStr := os.Getenv("BOT_OWNER")
	if ownerStr == "" {
		ownerStr = "0"
		//panic("BOT_OWNER environment variable is required")
	}
	var err error
	owner, err = strconv.ParseInt(ownerStr, 10, 64)
	if err != nil {
		panic("Invalid BOT_OWNER value: " + err.Error())
	}

	webPort = os.Getenv("WEB_PORT")
	if webPort == "" {
		webPort = "8010" // 默认端口
	}

	go api.InitBot(token, handleUpdate)
	go web.StartWebServer(webPort)

	// 使用 select{} 来保持程序运行
	select {}
}

func deliverIncomingMsg(msg api.SimpleMsg) {
	fmt.Printf("(%d)%s: %s\n", msg.ChatId, msg.Name, msg.Text)
	lastreplyid = int(msg.ChatId)

	if owner != 0 {
		msgid := api.ForwardMsg(owner, msg.ChatId, msg.MessageID)
		if msgid == 0 {
			log.Println("ForwardMsg failed but skip")
		}

		msgMutex.Lock()
		msgToChatID[msgid] = msg.ChatId
		msgMutex.Unlock()
	}

	// 通过WebSocket广播消息
	web.BroadcastMessage(web.Message{
		Type:      "message",
		ChatID:    msg.FromID,
		Name:      msg.Name,
		Text:      msg.Text,
		PhotoID:   msg.PhotoID,
		VideoID:   msg.VideoID,
		StickerID: msg.StickerID,
		MessageID: msg.MessageID,
	})
}

func deliverOutgoingMsg(msg api.SimpleMsg) {
	if msg.Text != "" && msg.Text[0] == '*' {
		directmsg(msg)
		return
	}

	var storechatid int64
	msgMutex.RLock()
	storechatid = msgToChatID[msg.ReplyID]
	msgMutex.RUnlock()

	if storechatid == 0 || storechatid == msg.ChatId {
		api.SendMsg(msg.ChatId, "reply to forward ...")
	} else {
		if msg.Text != "" {
			fmt.Printf("(%d)%s\n", storechatid, msg.Text)
			api.SendMsg(storechatid, msg.Text)
			// 广播发送的消息到Web界面
			web.BroadcastMessage(web.Message{
				Type:      "message",
				ChatID:    storechatid,
				Name:      "我",
				Text:      msg.Text,
				MessageID: msg.MessageID,
			})
		} else if msg.PhotoID != "" {
			api.SendExistingPhoto(storechatid, msg.PhotoID)
			// 广播发送的图片消息到Web界面
			web.BroadcastMessage(web.Message{
				Type:      "message",
				ChatID:    storechatid,
				Name:      "我",
				PhotoID:   msg.PhotoID,
				MessageID: msg.MessageID,
			})
		} else if msg.VideoID != "" {
			api.SendExistingVideo(storechatid, msg.VideoID)
			// 广播发送的视频消息到Web界面
			web.BroadcastMessage(web.Message{
				Type:      "message",
				ChatID:    storechatid,
				Name:      "我",
				VideoID:   msg.VideoID,
				MessageID: msg.MessageID,
			})
		} else if msg.StickerID != "" {
			api.SendExistingSticker(storechatid, msg.StickerID)
			// 广播发送的贴纸消息到Web界面
			web.BroadcastMessage(web.Message{
				Type:      "message",
				ChatID:    storechatid,
				Name:      "我",
				StickerID: msg.StickerID,
				MessageID: msg.MessageID,
			})
		}
	}
}

func directmsg(msg api.SimpleMsg) {
	chatid := int64(0)
	for i := 1; i < len(msg.Text); i++ {
		if msg.Text[i] == ' ' {
			chatid, _ = strconv.ParseInt(msg.Text[1:i], 10, 64)
			msg.Text = msg.Text[i+1:]
			break
		}
	}
	if chatid == 0 {
		api.SendMsg(msg.ChatId, "format invaild")
		return
	}
	if msg.Text != "" {
		api.SendMsg(chatid, msg.Text)
	}
}

func handleUpdate(update tgbotapi.Update) {
	defer func() {
		if r := recover(); r != nil {
			if owner != 0 {
				api.SendMsg(owner, "Panic in handleUpdate! Check the log for details.")
			}
			debug.PrintStack()
		}
	}()

	msg := api.FormatMsg(update)
	if msg.Text != "" {
		if msg.Text[0] == '/' {
			if msg.FromID == owner {
				commander(msg)
			}
			return
		}
	}

	// 处理所有消息，无论是来自谁
	if msg.FromID != owner {
		deliverIncomingMsg(msg)
	} else {
		deliverOutgoingMsg(msg)
	}
}

func commander(msg api.SimpleMsg) {
}
