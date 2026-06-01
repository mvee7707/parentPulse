class ChatbotApp {
    constructor() {
        this.messagesContainer = document.getElementById('chat-messages');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.studentIdInput = document.getElementById('studentId');
        this.darkToggle = document.getElementById('dark-mode-toggle');

        this.apiBaseUrl = window.location.origin;
        this.isTyping = false;

        this.init();
    }

    init() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Dark mode — restore saved preference
        const saved = localStorage.getItem('theme');
        if (saved === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            this.darkToggle.textContent = '☀️ Light';
        }
        this.darkToggle.addEventListener('click', () => this.toggleDarkMode());

        // Auto-focus input on mobile
        if ('ontouchstart' in window) {
            this.messageInput.focus();
        }

        this.handleViewportHeight();
    }

    toggleDarkMode() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
        this.darkToggle.textContent = isDark ? '🌙 Dark' : '☀️ Light';
        localStorage.setItem('theme', isDark ? '' : 'dark');
    }

    handleViewportHeight() {
        const setVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        setVH();
        window.addEventListener('resize', setVH);
        window.addEventListener('orientationchange', setVH);
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        const studentId = this.studentIdInput.value.trim();

        if (!message) return;
        if (!studentId) {
            this.showError('Please enter a Student ID');
            return;
        }

        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.setInputDisabled(true);
        this.showTypingIndicator();

        try {
            const response = await this.callChatAPI(message, studentId);
            this.hideTypingIndicator();
            this.addMessage(response, 'bot');
        } catch (error) {
            this.hideTypingIndicator();
            this.showError('Sorry, I encountered an error. Please try again.');
            console.error('Chat API error:', error);
        }

        this.setInputDisabled(false);
        this.messageInput.focus();
    }

    async callChatAPI(question, studentId) {
        const response = await fetch(`${this.apiBaseUrl}/api/chat/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: question,
                studentUserId: parseInt(studentId),
                courseId: null
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.response || data.answer || data.message || data.error || 'I received your message but couldn\'t generate a response.';
    }

    addMessage(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        if (this.isTyping) return;
        this.isTyping = true;

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot-message typing-indicator';
        typingDiv.id = 'typing-indicator';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const dots = document.createElement('div');
        dots.innerHTML = '<span></span><span></span><span></span>';
        contentDiv.appendChild(dots);

        typingDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) typingIndicator.remove();
        this.isTyping = false;
    }

    showError(message) {
        this.addMessage(message, 'bot');
        const lastMessage = this.messagesContainer.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('bot-message')) {
            lastMessage.classList.add('error-message');
        }
    }

    setInputDisabled(disabled) {
        this.messageInput.disabled = disabled;
        this.sendButton.disabled = disabled;
        this.sendButton.textContent = disabled ? 'Sending...' : 'Send';
    }

    scrollToBottom() {
        setTimeout(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 100);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatbotApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // navigator.serviceWorker.register('/sw.js');
    });
}