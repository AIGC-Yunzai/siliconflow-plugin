document.addEventListener('DOMContentLoaded', function() {
    const chatContainer = document.querySelector('.chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const modeToggle = document.getElementById('mode-toggle');

    // 初始化marked
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true
    });

    function addMessage(content, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'right' : 'left'}`;
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.style.backgroundColor = isUser ? '#e3f2fd' : '#ffb6c1';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const markdownContent = document.createElement('div');
        markdownContent.className = 'markdown-content';
        markdownContent.innerHTML = marked.parse(content);
        
        contentDiv.appendChild(markdownContent);
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        // 滚动到底部
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // 渲染数学公式
        if (window.MathJax) {
            MathJax.typesetPromise([markdownContent]);
        }
    }

    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;

        // 获取当前模式
        const mode = modeToggle.textContent.toLowerCase();
        
        // 添加用户消息
        addMessage(message, true);
        messageInput.value = '';
        
        try {
            // 发送到API并获取响应
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    mode
                })
            });
            
            const data = await response.json();
            
            // 添加AI响应
            addMessage(data.response);
        } catch (error) {
            console.error('Error:', error);
            addMessage('抱歉，发生了错误，请稍后重试。');
        }
    }

    // 事件监听
    sendButton.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});