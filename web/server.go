package web

import (
	"bot/api"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许所有来源的WebSocket连接
	},
}

type Message struct {
	Type         string `json:"type"`
	ChatID       int64  `json:"chatId"`
	Name         string `json:"name"`
	Text         string `json:"text"`
	PhotoID      string `json:"photoId,omitempty"`      // 缩略图ID
	PhotoLargeID string `json:"photoLargeId,omitempty"` // 原图ID
	VideoID      string `json:"videoId,omitempty"`
	StickerID    string `json:"stickerId,omitempty"`
	MessageID    int    `json:"messageId"`
	ReplyID      int    `json:"replyId,omitempty"`
	File         string `json:"file,omitempty"`
	Timestamp    string `json:"timestamp"`
	IsFromMe     bool   `json:"isFromMe,omitempty"` // 标识是否是我们发送的消息
}

type Client struct {
	conn *websocket.Conn
	send chan []byte
}

type Server struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mutex      sync.Mutex
}

type MessageHistory struct {
	Messages []Message
	mutex    sync.RWMutex
}

var globalServer *Server
var messageHistory = &MessageHistory{
	Messages: make([]Message, 0),
}

func NewServer() *Server {
	return &Server{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (s *Server) Run() {
	for {
		select {
		case client := <-s.register:
			s.mutex.Lock()
			s.clients[client] = true
			s.mutex.Unlock()
		case client := <-s.unregister:
			s.mutex.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.send)
			}
			s.mutex.Unlock()
		case message := <-s.broadcast:
			s.mutex.Lock()
			for client := range s.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(s.clients, client)
				}
			}
			s.mutex.Unlock()
		}
	}
}

func (h *MessageHistory) AddMessage(msg Message) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	h.Messages = append(h.Messages, msg)
}

func (h *MessageHistory) GetMessages() []Message {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	return h.Messages
}

func (s *Server) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 256),
	}

	s.register <- client

	// 发送历史消息
	history := messageHistory.GetMessages()
	for _, msg := range history {
		data, err := json.Marshal(msg)
		if err != nil {
			log.Printf("Error marshaling history message: %v", err)
			continue
		}
		client.send <- data
	}

	go func() {
		defer func() {
			s.unregister <- client
			client.conn.Close()
		}()

		for {
			_, message, err := client.conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket error: %v", err)
				}
				break
			}

			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("Error unmarshaling message: %v", err)
				continue
			}

			// 处理消息
			if msg.Type == "send" {
				api.SendMsg(msg.ChatID, msg.Text)
				// 保存发送的消息到历史记录
				sentMsg := Message{
					Type:      "message",
					ChatID:    msg.ChatID,
					Name:      "我",
					Text:      msg.Text,
					MessageID: int(time.Now().UnixNano()),
					Timestamp: time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05"),
					IsFromMe:  true, // 标记为我们发送的消息
				}
				messageHistory.AddMessage(sentMsg)
				// 广播发送的消息
				data, _ := json.Marshal(sentMsg)
				s.broadcast <- data
			} else if msg.Type == "send_photo" {
				// 处理图片上传
				if msg.File != "" {
					// 从base64字符串中提取实际的图片数据
					fileData := msg.File
					if strings.HasPrefix(fileData, "data:image/") {
						fileData = strings.Split(fileData, ",")[1]
					}

					// 解码base64数据
					decodedData, err := base64.StdEncoding.DecodeString(fileData)
					if err != nil {
						log.Printf("Error decoding base64 data: %v", err)
						continue
					}

					// 发送图片到Telegram
					photoID, err := api.SendPhoto(msg.ChatID, decodedData)
					if err != nil {
						log.Printf("Error sending photo: %v", err)
						continue
					}

					// 保存发送的图片消息到历史记录
					sentMsg := Message{
						Type:      "message",
						ChatID:    msg.ChatID,
						Name:      "我",
						PhotoID:   photoID,
						MessageID: int(time.Now().UnixNano()),
						Timestamp: time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05"),
						IsFromMe:  true, // 标记为我们发送的消息
					}
					messageHistory.AddMessage(sentMsg)
					// 广播发送的图片消息
					data, _ := json.Marshal(sentMsg)
					s.broadcast <- data
				}
			} else if msg.Type == "send_video" && msg.VideoID != "" {
				api.SendExistingVideo(msg.ChatID, msg.VideoID)
				// 保存发送的视频消息到历史记录
				sentMsg := Message{
					Type:      "message",
					ChatID:    msg.ChatID,
					Name:      "我",
					VideoID:   msg.VideoID,
					MessageID: int(time.Now().UnixNano()),
					Timestamp: time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05"),
					IsFromMe:  true, // 标记为我们发送的消息
				}
				messageHistory.AddMessage(sentMsg)
				// 广播发送的视频消息
				data, _ := json.Marshal(sentMsg)
				s.broadcast <- data
			}
		}
	}()

	go func() {
		defer func() {
			client.conn.Close()
		}()

		for {
			select {
			case message, ok := <-client.send:
				if !ok {
					client.conn.WriteMessage(websocket.CloseMessage, []byte{})
					return
				}

				w, err := client.conn.NextWriter(websocket.TextMessage)
				if err != nil {
					return
				}
				w.Write(message)

				if err := w.Close(); err != nil {
					return
				}
			}
		}
	}()
}

// BroadcastMessage 广播消息到所有连接的客户端
func BroadcastMessage(msg Message) {
	log.Printf("broadcasting message: %+v", msg)
	if globalServer != nil {
		// 如果是我们发送的消息，不需要再次广播
		if msg.IsFromMe {
			return
		}
		// 设置消息接收时间
		msg.Timestamp = time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05")
		// 保存消息到历史记录
		messageHistory.AddMessage(msg)

		data, err := json.Marshal(msg)
		if err != nil {
			log.Printf("Error marshaling message: %v", err)
			return
		}
		globalServer.broadcast <- data
	}
}

func StartWebServer(port string) {
	r := gin.Default()
	r.Static("/static", "./web/static")
	r.LoadHTMLGlob("web/templates/*")

	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	r.GET("/ws", func(c *gin.Context) {
		globalServer.HandleWebSocket(c)
	})

	// 添加获取图片的路由
	r.GET("/api/photo/:photoId", func(c *gin.Context) {
		photoId := c.Param("photoId")
		file, err := api.GetFile(photoId)
		if err != nil {
			c.String(http.StatusNotFound, "Photo not found")
			return
		}
		c.DataFromReader(http.StatusOK, file.FileSize, "image/jpeg", file.Reader, nil)
	})

	// 添加获取视频的路由
	r.GET("/api/video/:videoId", func(c *gin.Context) {
		videoId := c.Param("videoId")
		file, err := api.GetFile(videoId)
		if err != nil {
			c.String(http.StatusNotFound, "Video not found")
			return
		}
		c.DataFromReader(http.StatusOK, file.FileSize, "video/mp4", file.Reader, nil)
	})

	// 添加获取贴纸的路由
	r.GET("/api/sticker/:stickerId", func(c *gin.Context) {
		stickerId, err := url.QueryUnescape(c.Param("stickerId"))
		if err != nil {
			log.Printf("Error decoding sticker ID: %v", err)
			c.String(http.StatusBadRequest, "Invalid sticker ID")
			return
		}
		log.Printf("Received request for sticker: %s", stickerId)
		file, err := api.GetFile(stickerId)
		if err != nil {
			log.Printf("Error getting sticker file: %v", err)
			c.String(http.StatusNotFound, "Sticker not found")
			return
		}
		log.Printf("Successfully got sticker file, size: %d", file.FileSize)
		c.DataFromReader(http.StatusOK, file.FileSize, "image/webp", file.Reader, nil)
	})

	// 添加获取用户头像的路由
	r.GET("/api/avatar/:userId", func(c *gin.Context) {
		userIdStr := c.Param("userId")
		var userId int64
		_, err := fmt.Sscanf(userIdStr, "%d", &userId)
		if err != nil {
			c.String(http.StatusBadRequest, "Invalid userId")
			return
		}
		fileId, err := api.GetUserAvatarFileID(userId)
		if err != nil || fileId == "" {
			// 返回默认头像
			c.File("web/static/default-avatar.png")
			return
		}
		file, err := api.GetFile(fileId)
		if err != nil {
			c.File("web/static/default-avatar.png")
			return
		}
		c.DataFromReader(http.StatusOK, file.FileSize, "image/jpeg", file.Reader, nil)
	})

	globalServer = NewServer()
	go globalServer.Run()

	r.Run(":" + port)
}
