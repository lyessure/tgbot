let ws;
let currentChatId = null;
let chats = new Map();
let previewModal;
let pendingImageData = null;
let stickerCache = new Map();  // 添加 sticker 缓存
let heartbeatInterval;  // 添加心跳间隔变量
let lastChatSnapshot = null; // 新增：记录上次聊天快照

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        // 连接成功后，如果当前有选中的聊天，记录快照，不立即 selectChat
        if (currentChatId && chats.has(currentChatId)) {
            lastChatSnapshot = JSON.stringify(chats.get(currentChatId).messages);
        }
        // 不立即 selectChat(currentChatId);
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

function formatTimestamp(ts) {
    // 只保留 MM-DD HH:mm:ss
    if (!ts) return '';
    // 支持 "YYYY-MM-DD HH:mm:ss" 或 "MM-DD HH:mm:ss"
    const match = ts.match(/(\d{2,4}-)?(\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (match) return match[2];
    return ts;
}

function handleMessage(message) {
    console.log('Received message:', message);
    if (!chats.has(message.chatId)) {
        console.log('New chat detected:', message.chatId);
        addChat(message.chatId, message.name, message.username);
        if (currentChatId === null) {
            console.log('Auto-selecting first chat:', message.chatId);
            selectChat(message.chatId);
        }
    }
    
    const chat = chats.get(message.chatId);
    if (chat) {
        // Update username if it's not set
        if (!chat.username && message.username) {
            chat.username = message.username;
            if (message.chatId === currentChatId) {
                selectChat(message.chatId); // Refresh display to show username
            }
        }
        
        const messageExists = chat.messages.some(m => 
            m.messageId === message.messageId && 
            m.chatId === message.chatId
        );
        
        if (!messageExists) {
            addMessage(message);
            
            if (currentChatId === null || message.chatId === currentChatId) {
                renderMessage(message);
            } else {
                selectChat(message.chatId);
            }
        }
    }
    
    updateChatList();
    // 新增：重连后只在内容变化时刷新 selectChat
    if (currentChatId && chats.has(currentChatId)) {
        const now = JSON.stringify(chats.get(currentChatId).messages);
        if (lastChatSnapshot !== null && lastChatSnapshot !== now) {
            selectChat(currentChatId);
            lastChatSnapshot = now;
        }
    }
}

function addChat(chatId, name, username) {
    console.log('Adding chat:', { chatId, name, username });  // Debug log
    if (!chats.has(chatId)) {
        chats.set(chatId, {
            id: chatId,
            name: name,
            username: username,
            messages: []
        });
        console.log('Chat added:', chats.get(chatId));  // Debug log
        updateChatList();
    }
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
    // 判断消息是自己发的还是收到的
    const isSent = message.name === '我';
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'message-info';
    // 确保时间戳存在，如果不存在则创建一个
    const timestamp = formatTimestamp(message.timestamp || new Date().toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/\//g, '-'));
    infoDiv.textContent = `${message.name} · ${timestamp}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (message.text) {
        contentDiv.textContent = message.text;
    }
    
    if (message.photoId) {
        console.log('Rendering photo with ID:', message.photoId);
        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = `/api/photo/${message.photoId}`; // 使用缩略图
        img.dataset.largeId = message.photoLargeId; // 保存原图ID
        img.onload = function() {
            console.log('Image loaded successfully:', message.photoId);
            messageList.scrollTop = messageList.scrollHeight;
        };
        img.onerror = function() {
            console.error('Failed to load image:', message.photoId);
            this.style.display = 'none';
            // 添加错误提示
            const errorDiv = document.createElement('div');
            errorDiv.className = 'image-error';
            errorDiv.textContent = '图片加载失败';
            contentDiv.appendChild(errorDiv);
            messageList.scrollTop = messageList.scrollHeight;
        };
        contentDiv.appendChild(img);
    }
    
    if (message.stickerId) {
        console.log('Rendering sticker with ID:', message.stickerId);
        const stickerUrl = `/api/sticker/${encodeURIComponent(message.stickerId)}`;
        // 只缓存URL
        if (stickerCache.has(message.stickerId)) {
            // 直接新建元素，src用缓存的URL
            const cachedUrl = stickerCache.get(message.stickerId);
            const img = document.createElement('img');
            img.className = 'message-sticker';
            img.src = cachedUrl;
            img.onload = function() {
                messageList.scrollTop = messageList.scrollHeight;
            };
            img.onerror = function() {
                // 如果img加载失败，尝试用<video>
                const video = document.createElement('video');
                video.className = 'message-sticker';
                video.src = cachedUrl;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.onloadeddata = function() {
                    messageList.scrollTop = messageList.scrollHeight;
                };
                contentDiv.appendChild(video);
                img.remove();
                messageList.scrollTop = messageList.scrollHeight;
            };
            contentDiv.appendChild(img);
        } else {
            // 新建元素并缓存URL
            const img = document.createElement('img');
            img.className = 'message-sticker';
            img.src = stickerUrl;
            img.onload = function() {
                stickerCache.set(message.stickerId, stickerUrl);
                messageList.scrollTop = messageList.scrollHeight;
            };
            img.onerror = function() {
                // 如果img加载失败，尝试用<video>
                const video = document.createElement('video');
                video.className = 'message-sticker';
                video.src = stickerUrl;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.onloadeddata = function() {
                    stickerCache.set(message.stickerId, stickerUrl);
                    messageList.scrollTop = messageList.scrollHeight;
                };
                contentDiv.appendChild(video);
                img.remove();
                messageList.scrollTop = messageList.scrollHeight;
            };
            contentDiv.appendChild(img);
        }
    }
    
    if (message.videoId) {
        console.log('Rendering video with ID:', message.videoId);
        const video = document.createElement('video');
        video.className = 'message-video';
        video.controls = true;
        video.src = `/api/video/${message.videoId}`;
        video.onloadeddata = function() {
            messageList.scrollTop = messageList.scrollHeight;
        };
        video.onerror = function() {
            console.error('Failed to load video:', message.videoId);
            this.style.display = 'none';
            // 添加错误提示
            const errorDiv = document.createElement('div');
            errorDiv.className = 'video-error';
            errorDiv.textContent = '视频加载失败';
            contentDiv.appendChild(errorDiv);
            messageList.scrollTop = messageList.scrollHeight;
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
    
    chats.forEach((chat, chatId) => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chatId;
        if (chatId === currentChatId) {
            chatItem.classList.add('active');
        }
        // 头像
        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar';
        avatar.src = `/api/avatar/${chat.id}`;
        avatar.onerror = function() {
            this.src = '/static/default-avatar.png';
        };
        chatItem.appendChild(avatar);
        // 名字
        const nameSpan = document.createElement('span');
        nameSpan.textContent = chat.name;
        nameSpan.style.marginLeft = '12px';
        chatItem.appendChild(nameSpan);
        chatItem.onclick = () => selectChat(chatId);
        chatList.appendChild(chatItem);
    });
}

function selectChat(chatId) {
    console.log('Selecting chat:', chatId);
    currentChatId = chatId;
    const chat = chats.get(chatId);
    console.log('Chat data:', chat);  // Debug log
    
    if (chat) {
        const messageList = document.getElementById('messageList');
        messageList.innerHTML = '';
        
        // Always add user info header
        const userInfoHeader = document.createElement('div');
        userInfoHeader.className = 'user-info-header';
        userInfoHeader.textContent = `对方用户名: @${chat.username || '无'} ID: ${chat.id}`;
        messageList.appendChild(userInfoHeader);
        console.log('Added user info header:', userInfoHeader.textContent);  // Debug log
        
        // 只追踪photoId图片的加载
        const imageLoadPromises = [];
        
        chat.messages.forEach(msg => {
            renderMessage(msg);
            // 只追踪photoId图片
            if (msg.photoId) {
                const images = messageList.getElementsByTagName('img');
                const lastImage = images[images.length - 1];
                if (lastImage) {
                    const promise = new Promise((resolve) => {
                        lastImage.onload = resolve;
                        lastImage.onerror = resolve;
                    });
                    imageLoadPromises.push(promise);
                }
            }
        });
        
        // Update active state in chat list
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.chatId === String(chatId)) {
                item.classList.add('active');
            }
        });
        
        // 等待所有图片加载完成后再滚动到底部
        Promise.all(imageLoadPromises).then(() => {
            messageList.scrollTop = messageList.scrollHeight;
        });
        // 立即滚动到底部一次（不等待图片）
        messageList.scrollTop = messageList.scrollHeight;
        // 渲染后用setTimeout再滚动一次，确保异步渲染后能到最底部
        setTimeout(() => {
            messageList.scrollTop = messageList.scrollHeight;
        }, 100);
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && currentChatId) {
        const timestamp = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/\//g, '-');

        const message = {
            type: 'send',
            chatId: currentChatId,
            text: text,
            timestamp: timestamp
        };
        
        // 只通过WebSocket发送，不做本地立即渲染
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
                file: pendingImageData,
                timestamp: new Date().toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }).replace(/\//g, '-')
            };
            ws.send(JSON.stringify(message));
            previewModal.hide();
            pendingImageData = null;
        }
    });
    enableImageZoom();
});

// 添加清理缓存的函数
function clearStickerCache() {
    stickerCache.clear();
}

// 在页面卸载前清理缓存
window.addEventListener('beforeunload', () => {
    clearStickerCache();
    if (ws) {
        ws.close();
    }
});

// 初始化WebSocket连接
connectWebSocket();

// 在页面图片上添加点击放大预览功能
function enableImageZoom() {
    document.getElementById('messageList').addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('message-image')) {
            const previewImage = document.getElementById('previewImage');
            const largeImageId = e.target.dataset.largeId;
            if (!largeImageId) {
                console.error('No large image ID found');
                return;
            }
            const largeImageUrl = `/api/photo/${largeImageId}`;

            // 先清空
            previewImage.src = '';
            previewImage.style.cssText = '';
            previewImage.alt = '预览图片';
            // 移除上次的错误提示
            if (previewImage.parentNode.querySelector('.image-error')) {
                previewImage.parentNode.querySelector('.image-error').remove();
            }

            // 错误提示
            previewImage.onerror = function() {
                previewImage.style.cssText = 'width: 240px; height: 120px; object-fit: contain; display: block; margin: 0 auto; color: #888;';
                previewImage.alt = '图片加载失败';
                previewImage.src = '';
                // 显示错误提示
                if (!previewImage.parentNode.querySelector('.image-error')) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'image-error';
                    errorDiv.style = 'color:#888;font-size:18px;padding:40px 0;';
                    errorDiv.textContent = '图片加载失败';
                    previewImage.parentNode.appendChild(errorDiv);
                }
            };

            // 用于获取原始尺寸
            const tempImg = new Image();
            tempImg.onload = function() {
                const naturalWidth = tempImg.naturalWidth;
                const naturalHeight = tempImg.naturalHeight;
                const windowWidth = window.innerWidth * 0.9;
                const windowHeight = window.innerHeight * 0.8;
                let scale = 1;
                if (naturalWidth > windowWidth || naturalHeight > windowHeight) {
                    const scaleX = windowWidth / naturalWidth;
                    const scaleY = windowHeight / naturalHeight;
                    scale = Math.min(scaleX, scaleY);
                }
                const scaledWidth = naturalWidth * scale;
                const scaledHeight = naturalHeight * scale;
                previewImage.style.cssText = `
                    width: ${scaledWidth}px !important;
                    height: ${scaledHeight}px !important;
                    object-fit: contain !important;
                    display: block !important;
                    margin: 0 auto !important;
                    border: none !important;
                    outline: none !important;
                    transition: width 0.3s, height 0.3s !important;
                `;
            };
            tempImg.src = largeImageUrl;

            // 设置图片源为原图
            previewImage.src = largeImageUrl;

            // 隐藏发送按钮
            document.getElementById('confirmSend').style.display = 'none';
            previewModal.show();
        }
    });

    // 关闭模态框时重置
    document.getElementById('previewModal').addEventListener('hidden.bs.modal', function() {
        const previewImage = document.getElementById('previewImage');
        previewImage.style.cssText = '';
        previewImage.src = '';
        previewImage.alt = '预览图片';
        // 移除错误提示
        if (previewImage.parentNode.querySelector('.image-error')) {
            previewImage.parentNode.querySelector('.image-error').remove();
        }
        document.getElementById('confirmSend').style.display = '';
    });
} 