
// src/components/Chat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, orderBy, addDoc, onSnapshot } from 'firebase/firestore';
const API_URL = import.meta.env.VITE_DEEPSEEK_API_URL;
const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;
const Chat = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
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
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-r1:free",
          messages: [{ role: "user", content: input }]
        })
      });
  
      const text = await response.text();
      console.log("Raw Response Text:", text);
      
      const data = text ? JSON.parse(text) : null;
  
      if (!response.ok) {
        console.error("API Error:", data?.error?.message || "Unknown error");
        
        if (response.status === 429) {
          // Rate limit exceeded, wait before retrying
          const retryAfter = data?.error?.metadata?.raw?.match(/(\d+)/)?.[0] || 5;
          console.log(`Rate limit exceeded. Retrying in ${retryAfter} seconds...`);
          setTimeout(() => handleSend(), retryAfter * 1000);
        }
  
        throw new Error(data?.error?.message || "Invalid response from DeepSeek API.");
      }
  
      if (!data?.choices?.length) {
        throw new Error("Unexpected API response format.");
      }
  
      const botMessage = data.choices[0].message.content;
  
      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        text: input,
        sender: 'user',
        timestamp: new Date().toISOString()
      });
  
      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        text: botMessage,
        sender: 'bot',
        timestamp: new Date().toISOString()
      });
  
      setInput('');
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setLoading(false);
    }
  };
  
  
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  return (
    <div className="chat-container">
      <aside className={`sidebar ${showSidebar ? 'active' : ''}`}>
        <div className="chat-history">
          <h3>Chat History</h3>
          {/* Add your chat history list items here */}
        </div>
      </aside>

      <main className="main-chat">
        <header className="chat-header">
          <button onClick={toggleSidebar}>☰</button>
          <h2>Chat with AI</h2>
          <button onClick={handleLogout}>Logout</button>
        </header>

        <div className="messages-container">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.sender === 'user' ? 'user' : 'bot'}`}
            >
              {message.text}
            </div>
          ))}
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
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </main>
    </div>
  );
};

export default Chat;