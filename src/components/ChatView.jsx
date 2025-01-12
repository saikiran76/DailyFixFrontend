import React, { useState, useEffect, useRef } from 'react';
import { useSocketConnection } from '../hooks/useSocketConnection';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

const ChatView = ({ selectedContact }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const { socket } = useSocketConnection('whatsapp');

  const fetchMessages = async () => {
    if (!selectedContact?.bridge_room_id) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/api/whatsapp-entities/messages/${selectedContact.bridge_room_id}`);
      setMessages(response.data.data || []);
      
      // Mark messages as read
      if (selectedContact.unread_count > 0) {
        await api.post(`/api/whatsapp-entities/mark-read/${selectedContact.bridge_room_id}`);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedContact) {
      fetchMessages();
    }
  }, [selectedContact]);

  useEffect(() => {
    if (socket) {
      const handleNewMessage = (message) => {
        if (message.bridge_room_id === selectedContact?.bridge_room_id) {
          setMessages(prev => [...prev, message]);
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      };

      socket.on('whatsapp:message', handleNewMessage);
      return () => socket.off('whatsapp:message', handleNewMessage);
    }
  }, [socket, selectedContact]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  if (!selectedContact) {
    return (
      <div className="flex-1 bg-dark-lighter rounded-lg p-4">
        <div className="h-full flex items-center justify-center text-gray-400">
          Select a contact to start chatting
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-dark-lighter rounded-lg flex flex-col">
      {/* Chat Header */}
      <div className="p-4 border-b border-dark-lighter flex items-center">
        <div className="w-10 h-10 bg-dark rounded-full flex items-center justify-center mr-3">
          <span className="text-green-500 text-lg">
            {selectedContact.is_group ? '👥' : '👤'}
          </span>
        </div>
        <div>
          <h3 className="font-medium text-white">{selectedContact.display_name}</h3>
          <p className="text-sm text-gray-400">
            {selectedContact.status || 'WhatsApp Contact'}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400">
            No messages yet
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.is_from_me ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  message.is_from_me
                    ? 'bg-primary text-white'
                    : 'bg-dark text-white'
                }`}
              >
                <p className="break-words">{message.content}</p>
                <p className="text-xs mt-1 opacity-70">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-dark-lighter">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const input = e.target.elements.message;
            const content = input.value.trim();
            
            if (!content) return;
            
            try {
              await api.post(`/api/whatsapp-entities/send-message/${selectedContact.bridge_room_id}`, {
                content
              });
              input.value = '';
            } catch (error) {
              console.error('Error sending message:', error);
              toast.error('Failed to send message');
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            name="message"
            placeholder="Type a message..."
            className="flex-1 bg-dark rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/80 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatView;