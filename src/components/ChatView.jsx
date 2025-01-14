import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { FiVideo, FiPhone, FiSearch, FiFile, FiWifi, FiWifiOff, FiMoreVertical } from 'react-icons/fi';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { debounce } from 'lodash';

const ChatView = ({ selectedContact }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [page, setPage] = useState(1);
  const [messageQueue, setMessageQueue] = useState([]);
  const [previewMedia, setPreviewMedia] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const { socket, isConnected } = useSocketConnection('whatsapp');
  const { user: currentUser } = useAuth();
  const PAGE_SIZE = 30;
  const [unreadMessageIds, setUnreadMessageIds] = useState(new Set());

  // Connection status management
  useEffect(() => {
    if (!socket) {
      setConnectionStatus('disconnected');
      return;
    }

    const handleConnect = () => {
      setConnectionStatus('connected');
      // Process queued messages when connection is restored
      processMessageQueue();
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    const handleConnectError = () => {
      setConnectionStatus('error');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket]);

  // Process message queue
  const processMessageQueue = useCallback(async () => {
    if (!selectedContact?.id) {
      console.log('Skipping message queue - no contact selected');
      return;
    }

    if (!socket || !isConnected) {
      console.log('Skipping message queue - socket not ready');
      return;
    }

    if (messageQueue.length === 0) {
      console.log('Message queue is empty');
      return;
    }

    console.log('Processing message queue for contact:', selectedContact.id);
    const queue = [...messageQueue];
    setMessageQueue([]);

    for (const queuedMessage of queue) {
      try {
        const response = await api.post(
          `/api/whatsapp-entities/send-message/${selectedContact.id}`,
          queuedMessage
        );
        if (response.data.status !== 'success') {
          throw new Error(response.data.message);
        }
      } catch (error) {
        console.error('Failed to send queued message:', error);
        setMessageQueue(prev => [...prev, queuedMessage]);
        toast.error('Some messages failed to send');
        break;
      }
    }
  }, [socket, isConnected, selectedContact, messageQueue]);

  // Add this function to mark messages as read
  const markMessagesAsRead = useCallback(
    debounce(async (messageIds) => {
      if (!selectedContact?.id || messageIds.length === 0) return;

      try {
        await api.post(`/api/whatsapp-entities/contacts/${selectedContact.id}/messages/read`, {
          messageIds: Array.from(messageIds)
        });
        
        // Clear the unread messages set after successful marking
        setUnreadMessageIds(new Set());
        
        // Emit socket event to update contact list
        if (socket && isConnected) {
          socket.emit('whatsapp:messages_read', {
            contactId: selectedContact.whatsapp_id
          });
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    }, 1000),
    [selectedContact, socket, isConnected]
  );

  // Enhanced fetchMessages with pagination
  const fetchMessages = async (selectedContact, page = 1) => {
    console.log('[ChatView] Starting fetchMessages:', {
      contactId: selectedContact?.id,
      page,
      currentMessagesCount: messages.length
    });
    
    if (!selectedContact?.id) {
      console.error('[ChatView] No valid contact ID found:', selectedContact);
      return;
    }

    setLoading(true);
    try {
      // Calculate before timestamp based on page and existing messages
      const before = page > 1 && messages.length > 0 ? messages[0]?.timestamp : undefined;
      
      console.log('[ChatView] Fetching messages with params:', {
        contactId: selectedContact.id,
        limit: PAGE_SIZE,
        before,
        url: `/api/whatsapp-entities/contacts/${selectedContact.id}/messages`
      });

      const response = await api.get(
        `/api/whatsapp-entities/contacts/${selectedContact.id}/messages`,
        { 
          params: { 
            limit: PAGE_SIZE,
            before
          }
        }
      );

      if (!response.data || !Array.isArray(response.data.data)) {
        console.error('[ChatView] Invalid response format:', response.data);
        throw new Error('Invalid response format from server');
      }

      const newMessages = response.data.data;
      
      if (newMessages.length > 0) {
        console.log('[ChatView] Processed new messages:', {
          count: newMessages.length,
          firstMessageTime: newMessages[0]?.timestamp,
          lastMessageTime: newMessages[newMessages.length - 1]?.timestamp
        });
        
        // Collect unread message IDs
        const unreadIds = newMessages
          .filter(msg => msg && !msg.is_read && msg.sender_id !== currentUser?.id)
          .map(msg => msg.message_id)
          .filter(Boolean); // Filter out any undefined message_ids
        
        if (unreadIds.length > 0) {
          console.log('[ChatView] Found unread messages:', {
            count: unreadIds.length,
            messageIds: unreadIds
          });
          setUnreadMessageIds(prev => new Set([...prev, ...unreadIds]));
        }

        setMessages(prev => {
          const updated = page === 1 ? newMessages : [...newMessages, ...prev];
          console.log('[ChatView] Updated messages state:', {
            previousCount: prev.length,
            newCount: updated.length,
            addedCount: newMessages.length
          });
          return updated;
        });
      } else {
        console.log('[ChatView] No new messages received');
      }
      
      setHasMoreMessages(newMessages.length === PAGE_SIZE);
    } catch (error) {
      console.error('[ChatView] Error fetching messages:', {
        error,
        stack: error.stack,
        response: error.response?.data
      });
      setError('Failed to load messages');
      toast.error('Failed to load messages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || loading || !hasMoreMessages) return;

    if (container.scrollTop === 0) {
      setPage(prev => {
        const nextPage = prev + 1;
        fetchMessages(selectedContact, nextPage);
        return nextPage;
      });
    }
  }, [loading, hasMoreMessages, selectedContact]);

  // Media preview handler
  const handleMediaPreview = (media) => {
    setPreviewMedia(media);
  };

  useEffect(() => {
    if (selectedContact) {
      console.log('Selected contact changed:', selectedContact);
      fetchMessages(selectedContact);
    } else {
      setMessages([]);
      setError(null);
    }
  }, [selectedContact]);

  // Media URL conversion helper
  const convertMatrixMediaUrl = useCallback((mxcUrl) => {
    if (!mxcUrl || !mxcUrl.startsWith('mxc://')) {
      console.warn('[ChatView] Invalid mxc URL:', mxcUrl);
      return null;
    }
    
    try {
    // Extract server and media ID from mxc URL
      const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        console.warn('[ChatView] Failed to parse mxc URL:', mxcUrl);
        return null;
      }

      const [, serverName, mediaId] = match;
      if (!serverName || !mediaId) {
        console.warn('[ChatView] Missing server name or media ID:', { serverName, mediaId });
        return null;
      }

      // Convert to HTTP URL using environment variable
      const baseUrl = import.meta.env.VITE_MATRIX_MEDIA_HANDLER;
      if (!baseUrl) {
        console.error('[ChatView] Missing MATRIX_MEDIA_HANDLER environment variable');
        return null;
      }

      const mediaUrl = `${baseUrl}/media/r0/download/${serverName}/${mediaId}`;
      console.log('[ChatView] Converted media URL:', { 
        original: mxcUrl, 
        converted: mediaUrl 
      });
      return mediaUrl;
    } catch (error) {
      console.error('[ChatView] Error converting media URL:', error);
      return null;
    }
  }, []);

  // Message content renderer
  const renderMessageContent = useCallback((message) => {
    if (!message?.content) {
      console.warn('[ChatView] Empty message content');
      return null;
    }

    try {
      const content = typeof message.content === 'string' ? JSON.parse(message.content) : message.content;
      console.log('[ChatView] Rendering message:', { 
        type: content.msgtype,
        hasUrl: !!content.url,
        hasBody: !!content.body 
      });

      switch (content.msgtype) {
        case 'm.text':
          return <p className="text-gray-800 break-words">{content.body}</p>;
          
        case 'm.image':
          const imageUrl = convertMatrixMediaUrl(content.url);
          if (!imageUrl) return <p className="text-red-500">Failed to load image</p>;
          return (
            <img 
              src={imageUrl}
              alt={content.body || 'Image'}
              className="max-w-[300px] max-h-[300px] rounded cursor-pointer"
              onClick={() => handleMediaPreview({ type: 'image', url: imageUrl })}
              onError={(e) => {
                console.error('[ChatView] Image load error:', e);
                e.target.src = '/placeholder-image.png';
              }}
            />
          );
          
        case 'm.video':
          const videoUrl = convertMatrixMediaUrl(content.url);
          const thumbnailUrl = content.info?.thumbnail_url ? 
            convertMatrixMediaUrl(content.info.thumbnail_url) : null;
          
          if (!videoUrl) return <p className="text-red-500">Failed to load video</p>;
          
          return (
            <video 
              src={videoUrl}
              poster={thumbnailUrl}
              controls
              className="max-w-[300px] max-h-[300px] rounded"
              onError={(e) => {
                console.error('[ChatView] Video load error:', e);
                e.target.closest('.message').classList.add('media-error');
              }}
            >
              <source src={videoUrl} type={content.info?.mimetype || 'video/mp4'} />
              Your browser does not support the video tag.
            </video>
          );
        
        case 'm.audio':
          const audioUrl = convertMatrixMediaUrl(content.url);
          if (!audioUrl) return <p className="text-red-500">Failed to load audio</p>;
          return (
            <audio
              src={audioUrl}
              controls
              className="max-w-[300px]"
              onError={(e) => console.error('[ChatView] Audio load error:', e)}
            >
              <source src={audioUrl} type={content.info?.mimetype || 'audio/mpeg'} />
              Your browser does not support the audio tag.
            </audio>
          );
        
        case 'm.file':
          const fileUrl = convertMatrixMediaUrl(content.url);
          if (!fileUrl) return <p className="text-red-500">Failed to load file</p>;
        return (
          <a 
              href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
              className="flex items-center space-x-2 text-blue-500 hover:text-blue-700"
          >
              <FiFile className="w-5 h-5" />
              <span>{content.body || 'Download file'}</span>
          </a>
        );
      
      default:
          console.warn('[ChatView] Unsupported message type:', content.msgtype);
          return <p className="text-gray-500">Unsupported message type: {content.msgtype}</p>;
      }
    } catch (error) {
      console.error('[ChatView] Error rendering message content:', error);
      return <p className="text-red-500">Error displaying message</p>;
    }
  }, [convertMatrixMediaUrl, handleMediaPreview]);

  useEffect(() => {
    if (socket) {
      const handleNewMessage = (message) => {
        console.log('[ChatView] New message received:', message);
        if (message.contact_id === selectedContact?.id) {
          setMessages(prev => {
            // Check if message already exists
            if (prev.some(m => m.message_id === message.message_id)) {
              return prev;
            }
            const updated = [...prev, message].sort((a, b) => 
              new Date(b.timestamp) - new Date(a.timestamp)
            );
            return updated;
          });
          
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          
          // Mark new message as read if it's not from current user
          if (message.sender_id !== currentUser?.id) {
          try {
              markMessagesAsRead([message.message_id]);
          } catch (error) {
              console.error('[ChatView] Error marking new message as read:', error);
            }
          }
        }
      };

      const handleError = (error) => {
        console.error('[ChatView] Socket error:', error);
        toast.error('Connection error. Messages might be delayed.');
      };

      socket.on('whatsapp:message', handleNewMessage);
      socket.on('error', handleError);
      
      return () => {
        socket.off('whatsapp:message', handleNewMessage);
        socket.off('error', handleError);
      };
    }
  }, [socket, selectedContact, currentUser, markMessagesAsRead]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  // Add utility function for Matrix message type mapping
  const getMessageType = (message) => {
    const matrixType = message.metadata?.raw_event?.content?.msgtype;
    switch (matrixType) {
      case 'm.text':
        return 'text';
      case 'm.image':
        return 'image';
      case 'm.video':
        return 'video';
      case 'm.audio':
        return 'audio';
      case 'm.file':
        return 'document';
      default:
        // If message_type is already one of our allowed types, use it
        return ['text', 'image', 'video', 'audio', 'document'].includes(message.message_type) 
          ? message.message_type 
          : 'text';
    }
  };

  // Add utility function for media URL handling
  const getMediaUrl = (message) => {
    const mxcUrl = message.metadata?.raw_event?.content?.url;
    if (!mxcUrl) return message.content;
    
    // Convert mxc:// URL to HTTP URL
    // Format: mxc://example-mtbr.duckdns.org/LJjQUKsAyOAOSCxdTtZxoIwm
    const [, serverName, mediaId] = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    return `https://${serverName}/_matrix/media/r0/download/${serverName}/${mediaId}`;
  };

  // Message Content Component
  const MessageContent = ({ message }) => {
    const messageType = getMessageType(message);
    const mediaUrl = getMediaUrl(message);
    const info = message.metadata?.raw_event?.content?.info || {};

    switch (messageType) {
      case 'text':
        return <p className="text-white break-words">{message.content}</p>;
      
      case 'image':
        return (
          <div className="relative">
            <img 
              src={mediaUrl}
              alt={message.content}
              className="max-w-full rounded-lg"
              loading="lazy"
              style={info.w && info.h ? { aspectRatio: `${info.w}/${info.h}` } : undefined}
            />
            {message.content && (
              <span className="text-xs text-gray-400 mt-1 block">
                {message.content}
              </span>
            )}
          </div>
        );
      
      case 'video':
        return (
          <div className="relative">
            <video 
              src={mediaUrl}
              controls
              className="max-w-full rounded-lg"
              poster={info.thumbnail_url ? getMediaUrl({ metadata: { raw_event: { content: { url: info.thumbnail_url } } } }) : undefined}
            >
              <source src={mediaUrl} type={info.mimetype} />
            </video>
            <div className="text-xs text-gray-400 mt-1 flex items-center justify-between">
              <span>{message.content}</span>
              {info.duration && (
                <span>{Math.round(info.duration / 1000)}s</span>
              )}
            </div>
          </div>
        );
      
      case 'audio':
        return (
          <div className="relative">
            <audio 
              src={mediaUrl}
              controls
              className="max-w-full"
            >
              <source src={mediaUrl} type={info.mimetype} />
            </audio>
            <div className="text-xs text-gray-400 mt-1 flex items-center justify-between">
              <span>{message.content}</span>
              {info.duration && (
                <span>{Math.round(info.duration / 1000)}s</span>
              )}
            </div>
          </div>
        );
      
      case 'document':
        return (
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-gray-700 rounded">
              <FiFile className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <a 
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:underline break-words"
              >
                {message.content}
              </a>
              {info.size && (
                <span className="text-xs text-gray-400 block">
                  {(info.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </div>
          </div>
        );
      
      default:
        return <p className="text-white break-words">{message.content}</p>;
    }
  };

  // Process message queue only when we have a valid contact
  useEffect(() => {
    if (!socket || !isConnected) {
      console.log('Socket not ready for message queue', { hasSocket: !!socket, isConnected });
      return;
    }

    if (!selectedContact?.id) {
      console.log('No contact selected for message queue');
      return;
    }

    if (messageQueue.length === 0) {
      console.log('Message queue is empty');
      return;
    }

    console.log('Processing message queue:', {
      contactId: selectedContact.id,
      queueLength: messageQueue.length
    });
    processMessageQueue();
  }, [socket, isConnected, selectedContact, messageQueue]);

  // Add effect to mark messages as read when they become visible
  useEffect(() => {
    if (unreadMessageIds.size > 0) {
      markMessagesAsRead(Array.from(unreadMessageIds));
    }
  }, [unreadMessageIds, markMessagesAsRead]);

  // Show empty state when no contact is selected
  if (!selectedContact) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1b26] text-gray-400">
        <p>Select a contact to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#1a1b26] flex flex-col h-screen">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-[#24283b] flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-[#1e6853] flex items-center justify-center">
            {selectedContact.avatar_url ? (
              <img 
                src={selectedContact.avatar_url} 
                alt={selectedContact.display_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white text-lg">
                {selectedContact.display_name[0].toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h3 className="font-medium text-white">{selectedContact.display_name}</h3>
            <div className="flex items-center text-sm">
              <span className={`w-2 h-2 rounded-full mr-2 ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
              }`} />
              <span className="text-gray-400">
                {connectionStatus === 'connected' ? 'Online' :
                 connectionStatus === 'error' ? 'Connection Error' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {connectionStatus !== 'connected' && messageQueue.length > 0 && (
            <div className="text-sm text-yellow-500">
              {messageQueue.length} message{messageQueue.length > 1 ? 's' : ''} queued
            </div>
          )}
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <FiVideo className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <FiPhone className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <FiSearch className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {loading && !messages.length ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e6853]"></div>
          </div>
        ) : error && !messages.length ? (
          <div className="text-center text-red-400">
            {error}
            <button 
              onClick={() => fetchMessages(selectedContact, 1)}
              className="block mx-auto mt-2 text-sm text-[#1e6853] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400">
            No messages yet
          </div>
        ) : (
          <>
            {loading && (
              <div className="text-center text-gray-400 py-2">
                Loading more messages...
              </div>
            )}
            {messages.map((message, index) => {
              const showDate = index === 0 || 
                new Date(message.timestamp).toDateString() !== 
                new Date(messages[index - 1].timestamp).toDateString();

              const isOutgoing = currentUser && (
                message.sender_id === currentUser.id || 
                message.sender_id.includes(currentUser.matrix_id) ||
                message.sender_id === currentUser.whatsapp_id
              );

              return (
                <React.Fragment key={message.id}>
                  {showDate && (
                    <div className="flex justify-center my-4">
                      <span className="px-4 py-1 bg-[#24283b] rounded-full text-sm text-gray-400">
                        {new Date(message.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isOutgoing
                        ? 'bg-[#24283b] rounded-br-none'
                        : 'bg-[#1e6853] rounded-bl-none'
                    }`}>
                      <div onClick={() => {
                        const mediaTypes = ['image', 'video'];
                        const messageType = getMessageType(message);
                        if (mediaTypes.includes(messageType)) {
                          handleMediaPreview({
                            type: messageType,
                            url: getMediaUrl(message),
                            caption: message.content,
                            info: message.metadata?.raw_event?.content?.info
                          });
                        }
                      }}>
                        <MessageContent message={message} />
                      </div>
                      <div className="flex items-center justify-end mt-1 space-x-1">
                        <span className="text-xs text-gray-400">
                          {new Date(message.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                        {isOutgoing && (
                          <span className="text-xs text-gray-400">
                            {message.delivery_status === 'failed' ? '✕' :
                             message.delivery_status === 'sent' ? '✓' :
                             message.is_read ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Media Preview Modal */}
      {previewMedia && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setPreviewMedia(null)}
        >
          <div className="max-w-4xl w-full p-4">
            {previewMedia.type === 'image' ? (
              <img 
                src={previewMedia.url} 
                alt={previewMedia.caption}
                className="max-h-[80vh] w-auto mx-auto rounded-lg"
              />
            ) : previewMedia.type === 'video' ? (
              <video 
                src={previewMedia.url}
                controls
                className="max-h-[80vh] w-auto mx-auto rounded-lg"
              >
                <source src={previewMedia.url} type={previewMedia.info?.mimetype} />
              </video>
            ) : null}
            {previewMedia.caption && (
              <p className="text-white text-center mt-4">{previewMedia.caption}</p>
            )}
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="px-4 py-3 bg-[#24283b] border-t border-gray-700">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const input = e.target.elements.message;
            const content = input.value.trim();
            
            if (!content) return;
            
            const message = { content };
            
            if (connectionStatus !== 'connected') {
              setMessageQueue(prev => [...prev, message]);
              input.value = '';
              toast.success('Message queued for delivery');
              return;
            }
            
            try {
              const response = await api.post(
                `/api/whatsapp-entities/send-message/${selectedContact.id}`,
                message
              );
              
              if (response.data.status === 'success') {
                input.value = '';
              } else {
                throw new Error(response.data.message || 'Failed to send message');
              }
            } catch (error) {
              console.error('Error sending message:', error);
              toast.error(error.response?.data?.message || 'Failed to send message');
              // Queue message for retry
              setMessageQueue(prev => [...prev, message]);
            }
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            name="message"
            placeholder={connectionStatus !== 'connected' ? 'Messages will be queued...' : 'Type a message...'}
            className="flex-1 bg-[#1a1b26] text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-1 focus:ring-[#1e6853]"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-[#1e6853] text-white px-4 py-2 rounded-lg hover:bg-[#1e6853]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatView;