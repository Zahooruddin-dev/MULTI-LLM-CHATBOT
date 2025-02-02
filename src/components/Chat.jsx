import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, orderBy, addDoc, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
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
  deepseek: 'deepseek/deepseek-r1:free',
  rogue: 'sophosympatheia/rogue-rose-103b-v0.2:free',
  meta: 'meta-llama/llama-3.2-90b-vision-instruct:free',
  gemini: 'google/gemini-exp-1114:free'
};

const Chat = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedApi, setSelectedApi] = useState('deepseek');
  const [responseTime, setResponseTime] = useState(0);
  const messagesEndRef = useRef(null);
  const db = getFirestore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const q = query(
      collection(db, `chats/${user.uid}/messages`),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(newMessages);
      
      // Group messages by conversation for chat history
      const conversations = newMessages.reduce((acc, msg) => {
        const date = new Date(msg.timestamp).toLocaleDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(msg);
        return acc;
      }, {});
      
      setChatHistory(Object.entries(conversations));
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [user.uid, db]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const startTime = Date.now();

    try {
      const apiUrl = API_URLS[selectedApi];
      const apiKey = API_KEYS[selectedApi];
      const model = models[selectedApi];

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
        text: input,
        sender: 'user',
        timestamp: new Date().toISOString(),
        model: selectedApi
      });
      
      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        text: botMessage,
        sender: 'bot',
        timestamp: new Date().toISOString(),
        model: selectedApi
      });
      
      setInput('');
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <aside className={`sidebar ${showSidebar ? 'active' : ''}`}>
        <div className="chat-history-container">
          <h3 className="history-title">Chat History</h3>
          {chatHistory.map(([date, msgs]) => (
            <div key={date} className="history-date-group">
              <h4 className="history-date">{date}</h4>
              <div className="history-messages">
                {msgs.slice(0, 2).map((msg, idx) => (
                  <div key={idx} className="history-message-preview">
                    {msg.text.substring(0, 50)}...
                  </div>
                ))}
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
              <select 
                value={selectedApi} 
                onChange={(e) => setSelectedApi(e.target.value)}
                className="model-select"
              >
                {Object.entries(models).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.split('/')[1]}
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
                  {message.sender === 'user' ? 'You' : message.model}
                </span>
                <span className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">
                {message.sender === 'bot' ? (
                  <ReactMarkdown>{message.text}</ReactMarkdown>
                ) : (
                  message.text
                )}
              </div>
            </div>
          ))}
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