package api

import (
	"fmt"
	"io"
	"net/http"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

var (
	bot *tgbotapi.BotAPI
)

type SimpleMsg struct {
	Type         string
	FromID       int64
	MessageID    int
	ReplyID      int
	Text         string
	PhotoID      string // 缩略图ID
	PhotoLargeID string // 原图ID
	VideoID      string
	StickerID    string
	ChatId       int64
	Name         string
	Username     string // Add username field
}

type BotHandler func(update tgbotapi.Update)

type emptyLogger struct{}

func (l *emptyLogger) Printf(format string, args ...interface{}) {}
func (l *emptyLogger) Println(args ...interface{})               {}

func InitBot(token string, handler BotHandler) {
	tgbotapi.SetLogger(&emptyLogger{})
	var err error
	bot, err = tgbotapi.NewBotAPI(token)
	if err != nil {
		panic("init tg fail: " + err.Error())
	}
	bot.Debug = true
	wh, _ := tgbotapi.NewWebhook("")
	bot.Request(wh)
	updateConfig := tgbotapi.NewUpdate(0)
	updateConfig.Timeout = 60
	updates := bot.GetUpdatesChan(updateConfig)
	for update := range updates {
		go handler(update)
	}
}

func FormatMsg(update tgbotapi.Update) SimpleMsg {
	msg := SimpleMsg{}
	if update.Message == nil {
		return msg
	}
	if update.Message.Chat != nil {
		msg.Type = update.Message.Chat.Type
		msg.ChatId = update.Message.Chat.ID
	}
	if update.Message.From != nil {
		msg.FromID = update.Message.From.ID
		msg.Username = update.Message.From.UserName // Add username
	}
	msg.MessageID = update.Message.MessageID
	msg.Text = update.Message.Text
	msg.Name = fmt.Sprintf("%s %s", update.Message.From.FirstName, update.Message.From.LastName)
	if update.Message.ReplyToMessage != nil {
		msg.ReplyID = update.Message.ReplyToMessage.MessageID
	}
	if update.Message.Photo != nil {
		if len(update.Message.Photo) > 0 {
			// 保存缩略图ID（用于聊天窗口显示）
			msg.PhotoID = update.Message.Photo[0].FileID
			// 保存原图ID（用于点击放大后显示）
			msg.PhotoLargeID = update.Message.Photo[len(update.Message.Photo)-1].FileID
		}
	}
	if update.Message.Video != nil {
		msg.VideoID = update.Message.Video.FileID
	}
	if update.Message.Sticker != nil {
		msg.StickerID = update.Message.Sticker.FileID
	}
	return msg
}

func SendMsg(chatID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	bot.Send(msg)
}

func ReplyMsg(chatID int64, text string, replyTo int) {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ReplyToMessageID = replyTo
	bot.Send(msg)
}

func SendExistingPhoto(chatID int64, photoID string) {
	msg := tgbotapi.NewPhoto(chatID, tgbotapi.FileID(photoID))
	bot.Send(msg)
}

func SendExistingVideo(chatID int64, videoID string) {
	msg := tgbotapi.NewVideo(chatID, tgbotapi.FileID(videoID))
	bot.Send(msg)
}

func SendExistingSticker(chatID int64, stickerID string) {
	msg := tgbotapi.NewSticker(chatID, tgbotapi.FileID(stickerID))
	bot.Send(msg)
}

func ForwardMsg(chatID int64, fromChatID int64, messageID int) int {
	msg := tgbotapi.NewForward(chatID, fromChatID, messageID)
	returinfo, err := bot.Send(msg)
	if err != nil {
		return 0
	}
	return returinfo.MessageID
}

func SendPhoto(chatID int64, photoData []byte) (string, error) {
	file := tgbotapi.FileBytes{
		Name:  "photo.jpg",
		Bytes: photoData,
	}
	msg := tgbotapi.NewPhoto(chatID, file)
	result, err := bot.Send(msg)
	if err != nil {
		return "", err
	}
	if len(result.Photo) > 0 {
		return result.Photo[0].FileID, nil
	}
	return "", fmt.Errorf("no photo ID returned")
}

type FileData struct {
	Reader   io.Reader
	FileSize int64
}

func GetFile(fileID string) (*FileData, error) {
	fmt.Printf("Getting file with ID: %s\n", fileID)
	file, err := bot.GetFile(tgbotapi.FileConfig{FileID: fileID})
	if err != nil {
		fmt.Printf("Error getting file info: %v\n", err)
		return nil, err
	}

	fileURL := file.Link(bot.Token)
	fmt.Printf("File URL: %s\n", fileURL)

	resp, err := http.Get(fileURL)
	if err != nil {
		fmt.Printf("Error downloading file: %v\n", err)
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Error response status: %d\n", resp.StatusCode)
		resp.Body.Close()
		return nil, fmt.Errorf("bad status: %s", resp.Status)
	}

	return &FileData{
		Reader:   resp.Body,
		FileSize: resp.ContentLength,
	}, nil
}

// 获取用户头像FileID（最小尺寸）
func GetUserAvatarFileID(userID int64) (string, error) {
	photos, err := bot.GetUserProfilePhotos(tgbotapi.UserProfilePhotosConfig{
		UserID: userID,
		Limit:  1,
	})
	if err != nil {
		return "", err
	}
	if photos.TotalCount == 0 || len(photos.Photos) == 0 || len(photos.Photos[0]) == 0 {
		return "", fmt.Errorf("no avatar found")
	}
	return photos.Photos[0][0].FileID, nil
}
