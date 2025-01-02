import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/axios';
import { subscribeToDiscordMessages, unsubscribeFromDiscordMessages } from '../utils/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { toast } from 'react-hot-toast';

const DiscordMessages = () => {
  const { channelId } = useParams();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const { socket, isConnected, connect } = useSocketConnection('discord');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!isConnected) {
          await connect();
        }

        const response = await api.get(`/discord/channels/${channelId}/messages`);
        if (!response.data || !Array.isArray(response.data.messages)) {
          throw new Error('Invalid response format');
        }

        setMessages(response.data.messages);
      } catch (err) {
        console.error('Error fetching Discord messages:', err);
        setError('Failed to load messages. Please try again.');
        toast.error('Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [channelId, isConnected, connect]);

  useEffect(() => {
    if (isConnected) {
      // Subscribe to Discord messages
      const handleNewMessage = (message) => {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
      };

      subscribeToDiscordMessages(channelId, handleNewMessage);

      return () => {
        unsubscribeFromDiscordMessages();
      };
    }
  }, [channelId, isConnected]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-error text-center">
          <p className="text-xl font-semibold mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-dark p-4">
      <div className="flex-1 overflow-y-auto space-y-4">
        {messages.map(message => (
          <div key={message.id} className="flex items-start gap-3">
            {message.author?.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`}
                alt={message.author.username}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                {message.author?.username?.charAt(0) || '?'}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">
                  {message.author?.username || 'Unknown User'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(message.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-gray-300">{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default DiscordMessages; 