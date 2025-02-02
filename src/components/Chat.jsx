import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, orderBy, addDoc, onSnapshot, where } from 'firebase/firestore';
import { Loader2, MessageSquare, ChevronDown, Brain, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const API_URLS = {
  deepseek: import.meta.env.VITE_DEEPSEEK_API_URL,
  gemini: import.meta.env.VITE_GEMINI_API_URL,
  meta: import.meta.env.VITE_META_API_URL,
  rogue: import.meta.env.VITE_ROGUE_API_URL
};

const API_KEYS = {
  deepseek: import.meta.env.VITE_DEEPSEEK_API_KEY,
  gemini: import.meta.env.VITE_GEMINI_API_KEY,
  meta: import.meta.env.VITE_META_API_KEY,
  rogue: import.meta.env.VITE_ROGUE_API_KEY
};

const models = {
  deepseek: 'DeepSeek Chat',
  rogue: 'Rogue Rose',
  meta: 'Llama 3.2',
  gemini: 'Gemini Pro'
};

const Chat = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedApi, setSelectedApi] = useState('deepseek');
  const [responseTime, setResponseTime] = useState(0);
  const [selectedChat, setSelectedChat] = useState(null);
  const messagesEndRef = useRef(null);
  const db = getFirestore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    let q;
    if (selectedChat) {
      q = query(
        collection(db, `chats/${user.uid}/messages`),
        where('chatId', '==', selectedChat),
        orderBy('timestamp', 'asc')
      );
    } else {
      q = query(
        collection(db, `chats/${user.uid}/messages`),
        orderBy('timestamp', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Group messages by chat session for history
      const conversations = newMessages.reduce((acc, msg) => {
        const date = new Date(msg.timestamp).toLocaleDateString();
        if (!acc[date]) acc[date] = { messages: [], preview: '' };
        acc[date].messages.push(msg);
        if (msg.sender === 'user') acc[date].preview = msg.text;
        return acc;
      }, {});
      
      setChatHistory(Object.entries(conversations));
      setMessages(selectedChat ? newMessages : []);
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [user.uid, db, selectedChat]);

  const handleChatSelect = (date, messages) => {
    setSelectedChat(date);
    setMessages(messages);
  };
  
  const handleLogout = async ()=>{
    logout(async function logout() {
        try {
          await signOut(auth);
          setUser(null);
          setError('');
        } catch (err) {
          setError('Failed to logout.');
          throw err;
        }
      })
  }
  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setThinking(true);
    const startTime = Date.now();
    const chatId = selectedChat || new Date().toISOString();

    try {
      const apiUrl = API_URLS[selectedApi];
      const apiKey = API_KEYS[selectedApi];
      const model = models[selectedApi];

      // Add user message immediately with thinking indicator
      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        text: input,
        sender: 'user',
        timestamp: new Date().toISOString(),
        model: selectedApi,
        chatId
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: input }]
        })
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      const endTime = Date.now();
      setResponseTime((endTime - startTime) / 1000);

      if (!response.ok) {
        throw new Error(data?.error?.message || "Invalid response from API.");
      }

      const botMessage = data.choices[0].message.content;
      
      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        text: botMessage,
        sender: 'bot',
        timestamp: new Date().toISOString(),
        model: selectedApi,
        chatId
      });
      
      setInput('');
      setSelectedChat(chatId);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setLoading(false);
      setThinking(false);
    }
  };

  return (
    <div className="chat-container">
      <aside className={`sidebar ${showSidebar ? 'active' : ''}`}>
        <div className="chat-history-container">
          <h3 className="history-title">
            <MessageSquare className="history-icon" />
            Chat History
          </h3>
          {chatHistory.map(([date, { messages, preview }]) => (
            <div 
              key={date} 
              className={`history-date-group ${selectedChat === date ? 'selected' : ''}`}
              onClick={() => handleChatSelect(date, messages)}
            >
              <div className="history-date-header">
                <h4 className="history-date">{date}</h4>
                <ChevronDown className="history-arrow" />
              </div>
              <div className="history-preview">
                {preview.substring(0, 50)}...
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main-chat">
        <header className="chat-header">
          <button onClick={() => setShowSidebar(!showSidebar)} className="menu-button">
            ☰
          </button>
          <div className="header-center">
            <h2>PETRONAS AI Assistant</h2>
            <div className="model-selector">
              <Bot className="model-icon" />
              <select 
                value={selectedApi} 
                onChange={(e) => setSelectedApi(e.target.value)}
                className="model-select"
              >
                {Object.entries(models).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </header>

        <div className="messages-container">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.sender === 'user' ? 'user' : 'bot'}`}
            >
              <div className="message-header">
                <span className="sender-name">
                  {message.sender === 'user' ? 'You' : models[message.model]}
                </span>
                <span className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">
                {message.sender === 'bot' ? (
                  <ReactMarkdown 
                    components={{
                      h1: ({node, ...props}) => <h1 className="markdown-h1" {...props} />,
                      h2: ({node, ...props}) => <h2 className="markdown-h2" {...props} />,
                      h3: ({node, ...props}) => <h3 className="markdown-h3" {...props} />,
                      ul: ({node, ...props}) => <ul className="markdown-ul" {...props} />,
                      ol: ({node, ...props}) => <ol className="markdown-ol" {...props} />,
                      li: ({node, ...props}) => <li className="markdown-li" {...props} />,
                      code: ({node, ...props}) => <code className="markdown-code" {...props} />
                    }}
                  >
                    {message.text}
                  </ReactMarkdown>
                ) : (
                  message.text
                )}
              </div>
              {message.sender === 'bot' && (
                <div className="message-footer">
                  <span className="model-tag">
                    <Bot className="model-icon-small" />
                    {models[message.model]}
                  </span>
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="thinking-indicator">
              <Brain className="thinking-icon animate-pulse" />
              <div className="thinking-dots">
                <span>.</span><span>.</span><span>.</span>
              </div>
            </div>
          )}
          {loading && (
            <div className="loading-indicator">
              <Loader2 className="animate-spin" />
              <span>Generating response... ({responseTime.toFixed(1)}s)</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="message-input"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="send-button"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              'Send'
            )}
          </button>
        </div>
      </main>
    </div>
  );
};

export default Chat;