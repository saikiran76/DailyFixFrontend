import React, { useEffect, useRef, useState } from 'react';
import { MessageBatchProcessor } from '../../utils/MessageBatchProcessor';
import { useSocket } from '../../hooks/useSocket';

export function WhatsAppChat({ contactId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { socket, isConnected } = useSocket();
  const batchProcessorRef = useRef(null);

  useEffect(() => {
    // Initialize message batch processor
    batchProcessorRef.current = new MessageBatchProcessor({
      batchSize: 50,
      batchTimeout: 1000,
      onBatchProcess: async (messages) => {
        setMessages(prev => {
          const newMessages = [...prev];
          messages.forEach(msg => {
            const index = newMessages.findIndex(m => m.id === msg.id);
            if (index === -1) {
              newMessages.push(msg);
            } else {
              newMessages[index] = msg;
            }
          });
          return newMessages.sort((a, b) => a.timestamp - b.timestamp);
        });
      },
      onError: (error, failedMessages) => {
        console.error('Failed to process messages:', error);
        // Implement retry logic or user notification
      }
    });

    // Load initial messages
    loadMessages();

    // Set up socket listeners
    if (socket && isConnected) {
      socket.on('whatsapp:message', handleNewMessage);
      socket.on('whatsapp:message_update', handleMessageUpdate);
    }

    return () => {
      if (batchProcessorRef.current) {
        batchProcessorRef.current.clear();
      }
      if (socket) {
        socket.off('whatsapp:message', handleNewMessage);
        socket.off('whatsapp:message_update', handleMessageUpdate);
      }
    };
  }, [socket, isConnected, contactId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/whatsapp/messages/${contactId}`);
      const data = await response.json();
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewMessage = (message) => {
    if (message.contactId === contactId) {
      batchProcessorRef.current.addMessage(message);
    }
  };

  const handleMessageUpdate = (update) => {
    if (update.contactId === contactId) {
      batchProcessorRef.current.addMessage(update);
    }
  };

  // Render messages
  return (
    <div className="whatsapp-chat">
      {loading ? (
        <div>Loading messages...</div>
      ) : (
        <div className="message-list">
          {messages.map(message => (
            <MessageItem 
              key={message.id} 
              message={message}
              isOwn={message.senderId === 'me'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageItem({ message, isOwn }) {
  return (
    <div className={`message-item ${isOwn ? 'own' : 'other'}`}>
      <div className="message-content">{message.content}</div>
      <div className="message-time">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
} 