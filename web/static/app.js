let ws;
let currentChatId = null;
let chats = new Map();
let previewModal;
let pendingImageData = null;
let heartbeatInterval;  // 添加心跳间隔变量

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        // 连接成功后，如果当前有选中的聊天，重新显示其消息
        if (currentChatId) {
            const chat = chats.get(currentChatId);
            if (chat) {
                const messageList = document.getElementById('messageList');
                if (messageList) {
                    messageList.innerHTML = '';
                    chat.messages.forEach(msg => {
                        renderMessage(msg);
                    });
                }
            }
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 1000);
    };
    
    ws.onmessage = (event) => {
        console.log('Raw WebSocket data received:', event.data);
        try {
            const message = JSON.parse(event.data);
            console.log('Parsed message:', message);
            handleMessage(message);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error, 'Raw data:', event.data);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// 启动心跳
function startHeartbeat() {
    // 每30秒发送一次心跳
    heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
}

// 停止心跳
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function handleMessage(message) {
    console.log('Received message:', message);
    if (!chats.has(message.chatId)) {
        console.log('New chat detected:', message.chatId);
        addChat(message.chatId, message.name);
        if (currentChatId === null) {
            console.log('Auto-selecting first chat:', message.chatId);
            selectChat(message.chatId);
        }
    }
    
    // 检查消息是否已存在
    const chat = chats.get(message.chatId);
    if (chat) {
        const messageExists = chat.messages.some(m => 
            m.messageId === message.messageId && 
            m.chatId === message.chatId
        );
        
        if (!messageExists) {
            // 保存新消息
            addMessage(message);
            
            // 如果当前没有选中的聊天，或者收到的是当前选中聊天的消息，则显示消息
            if (currentChatId === null || message.chatId === currentChatId) {
                renderMessage(message);
            } else {
                // 如果收到的是其他聊天的消息，自动切换到该聊天
                selectChat(message.chatId);
            }
        }
    }
    
    updateChatList();
}

function addChat(chatId, name) {
    chats.set(chatId, {
        id: chatId,
        name: name,
        messages: []
    });
}

function addMessage(message) {
    console.log('Adding message to chat:', message);
    const chat = chats.get(message.chatId);
    if (chat) {
        chat.messages.push(message);
        console.log('Current messages in chat:', chat.messages);
    } else {
        console.error('Chat not found for message:', message);
    }
}

function renderMessage(message) {
    console.log('Rendering message:', message);
    const messageList = document.getElementById('messageList');
    if (!messageList) {
        console.error('Message list element not found!');
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.chatId === currentChatId ? 'sent' : 'received'}`;
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'message-info';
    infoDiv.textContent = message.name;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (message.text) {
        contentDiv.textContent = message.text;
    }
    
    if (message.photoId) {
        console.log('Rendering photo with ID:', message.photoId);
        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = `/api/photo/${message.photoId}`;
        img.onload = function() {
            console.log('Image loaded successfully:', message.photoId);
        };
        img.onerror = function() {
            console.error('Failed to load image:', message.photoId);
            this.style.display = 'none';
            // 添加错误提示
            const errorDiv = document.createElement('div');
            errorDiv.className = 'image-error';
            errorDiv.textContent = '图片加载失败';
            contentDiv.appendChild(errorDiv);
        };
        contentDiv.appendChild(img);
    }
    
    if (message.stickerId) {
        console.log('Rendering sticker with ID:', message.stickerId);
        const stickerUrl = `/api/sticker/${encodeURIComponent(message.stickerId)}`;
        // 先尝试用 <img> 加载
        const img = document.createElement('img');
        img.className = 'message-sticker';
        img.src = stickerUrl;
        let stickerHandled = false;
        img.onload = function() {
            if (!stickerHandled) {
                console.log('Sticker loaded as image:', message.stickerId);
                stickerHandled = true;
            }
        };
        img.onerror = function() {
            if (stickerHandled) return;
            stickerHandled = true;
            // 如果 img 加载失败，尝试用 <video> 加载
            console.log('Sticker is not webp, try as video/webm:', message.stickerId);
            img.remove();
            const video = document.createElement('video');
            video.className = 'message-sticker';
            video.src = stickerUrl;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.onloadeddata = function() {
                console.log('Sticker loaded as video:', message.stickerId);
            };
            video.onerror = function() {
                console.error('Failed to load sticker as video:', message.stickerId);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'image-error';
                errorDiv.textContent = '贴纸加载失败';
                contentDiv.appendChild(errorDiv);
            };
            contentDiv.appendChild(video);
        };
        contentDiv.appendChild(img);
    }
    
    if (message.videoId) {
        console.log('Rendering video with ID:', message.videoId);
        const video = document.createElement('video');
        video.className = 'message-video';
        video.controls = true;
        video.src = `/api/video/${message.videoId}`;
        video.onerror = function() {
            console.error('Failed to load video:', message.videoId);
            this.style.display = 'none';
            // 添加错误提示
            const errorDiv = document.createElement('div');
            errorDiv.className = 'video-error';
            errorDiv.textContent = '视频加载失败';
            contentDiv.appendChild(errorDiv);
        };
        contentDiv.appendChild(video);
    }
    
    messageDiv.appendChild(infoDiv);
    messageDiv.appendChild(contentDiv);
    messageList.appendChild(messageDiv);
    messageList.scrollTop = messageList.scrollHeight;
    console.log('Message rendered successfully');
}

function updateChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';
    
    chats.forEach((chat) => {
        const chatDiv = document.createElement('div');
        chatDiv.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        chatDiv.textContent = chat.name;
        chatDiv.onclick = () => selectChat(chat.id);
        chatList.appendChild(chatDiv);
    });
}

function selectChat(chatId) {
    console.log('Selecting chat:', chatId);
    currentChatId = chatId;
    const chat = chats.get(chatId);
    if (chat) {
        console.log('Found chat, messages count:', chat.messages.length);
        document.getElementById('currentChatName').textContent = chat.name;
        const messageList = document.getElementById('messageList');
        messageList.innerHTML = '';
        chat.messages.forEach(msg => {
            console.log('Rendering message from history:', msg);
            renderMessage(msg);
        });
    } else {
        console.error('Chat not found:', chatId);
    }
    updateChatList();
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && currentChatId) {
        const message = {
            type: 'send',
            chatId: currentChatId,
            text: text
        };
        
        ws.send(JSON.stringify(message));
        input.value = '';
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentChatId) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        showImagePreview(e.target.result);
    };
    
    reader.readAsDataURL(file);
}

function showImagePreview(dataUrl) {
    const previewImage = document.getElementById('previewImage');
    previewImage.src = dataUrl;
    pendingImageData = dataUrl;
    previewModal.show();
}

// 事件监听器
document.getElementById('sendButton').onclick = sendMessage;
document.getElementById('messageInput').onkeypress = (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
};

// Add paste event handler for images
document.getElementById('messageInput').addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = (e) => {
                showImagePreview(e.target.result);
            };
            reader.readAsDataURL(blob);
            e.preventDefault();
            break;
        }
    }
});

document.getElementById('uploadButton').onclick = () => {
    document.getElementById('fileInput').click();
};
document.getElementById('fileInput').onchange = handleFileUpload;

// 初始化预览模态框
document.addEventListener('DOMContentLoaded', () => {
    previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
    
    // 确认发送按钮事件
    document.getElementById('confirmSend').addEventListener('click', () => {
        if (pendingImageData && currentChatId) {
            const message = {
                type: 'send_photo',
                chatId: currentChatId,
                file: pendingImageData
            };
            ws.send(JSON.stringify(message));
            previewModal.hide();
            pendingImageData = null;
        }
    });
});

// 初始化WebSocket连接
connectWebSocket(); 