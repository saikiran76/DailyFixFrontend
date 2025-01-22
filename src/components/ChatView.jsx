import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { FiVideo, FiPhone, FiSearch, FiFile, FiWifi, FiWifiOff, FiMoreVertical, FiX, FiFileText } from 'react-icons/fi';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { MessageBatchProcessor } from '../utils/MessageBatchProcessor';
import { debounce } from 'lodash';

const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Connection lost. Retrying...',
  AUTH_ERROR: 'Authentication failed. Please try logging in again.',
  RATE_LIMIT: 'Too many requests. Waiting before retry...',
  VALIDATION_ERROR: 'Invalid data received. Please refresh the page.',
  SYNC_ERROR: 'Error syncing messages. Retrying...',
  UNKNOWN_ERROR: 'An unexpected error occurred. Retrying...'
};

const ChatView = ({ selectedContact, onContactUpdate }) => {
  const navigate = useNavigate();
  const currentUser = useSelector(state => state.auth.session?.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [page, setPage] = useState(1);
  const [messageQueue, setMessageQueue] = useState([]);
  const [messages, setMessages] = useState([]);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [priority, setPriority] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [initializingPriority, setInitializingPriority] = useState(false);
  const [messagePages, setMessagePages] = useState(new Map());
  const [totalMessages, setTotalMessages] = useState(0);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const { socket, isConnected } = useSocketConnection('whatsapp');
  const messageCache = useRef(new Map());
  const isMounted = useRef(true);
  const PAGE_SIZE = 30;
  const [unreadMessageIds, setUnreadMessageIds] = useState(new Set());
  const batchProcessorRef = useRef(null);
  const [syncState, setSyncState] = useState({
    state: 'idle',
    progress: 0,
    details: '',
    errors: [],
    processedMessages: 0,
    totalMessages: 0
  });
  const [syncRetryCount, setSyncRetryCount] = useState(0);
  const maxSyncRetries = 3;
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(new Set());
  const offlineTimeoutRef = useRef(null);
  const lastSyncRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  useEffect(() => {
    if (!currentUser) {
      logger.warn('[ChatView] No user found, redirecting to login');
      navigate('/login');
      return;
    }

    const loadMessages = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Message loading logic here
        
        setLoading(false);
      } catch (err) {
        logger.info('[ChatView] Error loading messages:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadMessages();
  }, [currentUser, navigate]);

  // Process message queue - Define this before using it in useEffect
  const processMessageQueue = useCallback(async () => {
    if (!selectedContact?.id) {
      console.log('[ChatView] Skipping message queue - no contact selected');
      return;
    }

    if (!socket || !isConnected) {
      console.log('[ChatView] Skipping message queue - socket not ready:', {
        hasSocket: !!socket,
        isConnected
      });
      return;
    }

    if (messageQueue.length === 0) {
      console.log('[ChatView] Message queue is empty');
      return;
    }

    console.log('[ChatView] Processing message queue:', {
      contactId: selectedContact.id,
      queueLength: messageQueue.length
    });

    const queue = [...messageQueue];
    setMessageQueue([]);

    for (const queuedMessage of queue) {
      try {
        const response = await api.post(
          `/api/whatsapp-entities/send-message/${selectedContact.id}`,
          queuedMessage
        );
        if (response.data.status !== 'success') {
          throw new Error(response.data.message || 'Failed to send message');
        }
      } catch (error) {
        console.error('[ChatView] Failed to send queued message:', error);
        setMessageQueue(prev => [...prev, queuedMessage]);
        toast.error('Some messages failed to send');
        break;
      }
    }
  }, [socket, isConnected, selectedContact, messageQueue]);

  // Consolidated socket management
  useEffect(() => {
    if (!socket) {
        console.log('[ChatView] No socket connection');
        setConnectionStatus('disconnected');
        return;
    }

    console.log('[ChatView] Setting up socket connection');
    
    const handlers = {
        connect: () => {
            console.log('[ChatView] Socket connected');
            setConnectionStatus('connected');
            if (messageQueue.length > 0) {
                processMessageQueue();
            }
        },
        disconnect: () => {
            console.log('[ChatView] Socket disconnected');
            setConnectionStatus('disconnected');
        },
        connect_error: (error) => {
            console.error('[ChatView] Socket connection error:', error);
            setConnectionStatus('error');
        },
        'whatsapp:sync_completed': (data) => {
            if (data.contactId === selectedContact?.id) {
                console.log('[ChatView] Sync completed, refreshing messages');
                fetchData(0);
                toast.success('Messages synchronized successfully');
            }
        },
        'whatsapp:sync_failed': (data) => {
            if (data.contactId === selectedContact?.id) {
                console.error('[ChatView] Sync failed:', data.error);
                setSyncStatus('error');
                toast.error('Message sync failed: ' + data.error);
            }
        }
    };

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
        socket.on(event, handler);
    });

    // Set initial status
    setConnectionStatus(socket.connected ? 'connected' : 'disconnected');

    // Cleanup
    return () => {
        console.log('[ChatView] Cleaning up socket handlers');
        Object.entries(handlers).forEach(([event, handler]) => {
            socket.off(event, handler);
        });
    };
  }, [socket, selectedContact?.id]); // Minimal dependencies

  // Render messages from messagePages
  const currentMessages = useMemo(() => {
    const allMessages = [];
    const sortedPages = Array.from(messagePages.keys()).sort();
    
    for (const pageIndex of sortedPages) {
      const pageMessages = messagePages.get(pageIndex);
      if (pageMessages) {
        allMessages.push(...pageMessages);
      }
    }
    
    return allMessages;
  }, [messagePages]);

  // Update scroll position when messages change
  useEffect(() => {
    if (messagesEndRef.current && currentMessages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages]);

  // Separate sync initiation from message fetching
  const initiateSync = useCallback(async () => {
    if (!selectedContact?.id) return;

    try {
      console.log('[ChatView] Initiating sync for contact:', selectedContact.id);
      const response = await api.post(`/api/whatsapp-entities/contacts/${selectedContact.id}/sync`);
      
      if (response.data?.data?.status === 'syncing') {
        setSyncStatus('syncing');
        toast.custom((t) => (
          <div className="bg-[#24283b] text-white px-4 py-2 rounded-lg shadow-lg">
            Starting message sync...
          </div>
        ), { duration: 3000 });
      }
    } catch (error) {
      console.error('[ChatView] Error initiating sync:', error);
      toast.error('Failed to start message sync');
    }
  }, [selectedContact]);

  const fetchData = useCallback(async (pageIndex = 0) => {
    if (!selectedContact?.id) {
      console.log('[ChatView] No contact selected, skipping fetch');
      return;
    }

    // Only show loading indicator for initial load when no messages exist
    if (pageIndex === 0 && messages.length === 0) {
    setLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      // First check WhatsApp connection status
      console.log('[ChatView] Checking WhatsApp status before fetching messages');
      const statusResponse = await api.get('/matrix/whatsapp/status');
      console.log('[ChatView] WhatsApp status response:', statusResponse.data);

      if (!statusResponse.data?.status || statusResponse.data.status === 'error') {
        throw new Error('WhatsApp is not connected');
      }

      // Continue with message fetch if connection is ready
      console.log('[ChatView] Fetching messages:', {
        contactId: selectedContact.id,
        page: pageIndex,
        pageSize: PAGE_SIZE
      });

      const response = await api.get(`/api/whatsapp-entities/contacts/${selectedContact.id}/messages`, {
        params: {
          page: pageIndex,
          pageSize: PAGE_SIZE
        },
        timeout: 30000
      });

      if (!isMounted.current) return;

      console.log('[ChatView] Message response:', response.data);

      if (!response.data?.data) {
        throw new Error('Invalid response format from server');
      }

      const { messages: responseMessages, status, total, sync_info } = response.data.data;

      console.log('[ChatView] Processing message response:', {
        status,
        messageCount: responseMessages?.length,
        total,
        sync_info
      });

      // Handle different sync states
      switch (status) {
        case 'syncing':
          setSyncStatus('syncing');
          toast.loading('Syncing messages...', { id: 'sync-status' });
          // Keep existing messages while syncing
          break;

        case 'pending_user_join':
          setSyncStatus('pending_user_join');
          toast.error('Please join the WhatsApp room first');
          break;

        case 'error':
          setSyncStatus('error');
          throw new Error(sync_info?.error || 'Failed to fetch messages');

        case 'success':
        case 'idle':
          setSyncStatus(status);
          toast.dismiss('sync-status');
          
          if (Array.isArray(responseMessages)) {
            setMessagePages(prevPages => {
              const newPages = new Map(prevPages);
              newPages.set(pageIndex, responseMessages);
              return newPages;
            });
            setTotalMessages(total || responseMessages.length);
          }
          break;

        default:
          console.warn('[ChatView] Unknown sync status:', status);
          setSyncStatus('idle');
          // If no status but we have messages, still display them
          if (Array.isArray(responseMessages)) {
            setMessagePages(prevPages => {
              const newPages = new Map(prevPages);
              newPages.set(pageIndex, responseMessages);
              return newPages;
            });
            setTotalMessages(total || responseMessages.length);
          }
      }

      // If no messages and not already syncing, initiate sync
      if ((!responseMessages || responseMessages.length === 0) && status !== 'syncing') {
        console.log('[ChatView] No messages found, initiating sync');
        await initiateSync();
      }

    } catch (error) {
      console.error('[ChatView] Error in fetchData:', error);
      if (isMounted.current) {
        setError(error.message || 'Failed to load messages');
        setSyncStatus('error');
        toast.error(error.message || 'Failed to load messages');
      }
    } finally {
      if (isMounted.current) {
        if (pageIndex === 0) {
      setLoading(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    }
  }, [selectedContact, initiateSync, messages.length]);

  // Keep only this effect for handling contact selection and message fetching
  useEffect(() => {
    if (selectedContact?.id) {
      console.log('[ChatView] Selected contact changed:', {
        contactId: selectedContact.id,
        whatsappId: selectedContact.whatsapp_id
      });

      // Reset message-related state
      setMessagePages(new Map());
      setMessages([]);
      setPage(1);
      setHasMoreMessages(true);
      setError(null);
      setSyncStatus('loading');
      setPriority(selectedContact.priority || null);
      
      // Fetch initial messages
      fetchData(0).catch(error => {
        console.error('[ChatView] Error fetching initial messages:', error);
        if (isMounted.current) {
          setError('Failed to load messages');
          setSyncStatus('error');
        }
      });
    }
  }, [selectedContact, fetchData]);

  // Update messages whenever messagePages changes
  useEffect(() => {
    const allMessages = [];
    const sortedPages = Array.from(messagePages.keys()).sort();
    
    for (const pageIndex of sortedPages) {
      const pageMessages = messagePages.get(pageIndex);
      if (pageMessages) {
        allMessages.push(...pageMessages);
      }
    }
    
    console.log('[ChatView] Updating messages:', {
      pageCount: sortedPages.length,
      totalMessages: allMessages.length,
      syncStatus
    });
    
    setMessages(allMessages);
  }, [messagePages, syncStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[ChatView] Component unmounting');
      isMounted.current = false;
    };
  }, []);

  // Add infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || loading || !hasMoreMessages || isLoadingMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    
    // Load more when user scrolls to top (for older messages)
    if (scrollTop === 0) {
      console.log('[ChatView] Scrolled to top, loading more messages');
      setPage(prev => {
        const nextPage = prev + 1;
        fetchData(nextPage).catch(error => {
          console.error('[ChatView] Error loading more messages:', error);
        });
        return nextPage;
      });
    }
  }, [loading, hasMoreMessages, isLoadingMore, fetchData]);

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

  // Media preview handler
  const handleMediaPreview = (media) => {
    setPreviewMedia(media);
  };

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

  // Initialize batch processor
  useEffect(() => {
    batchProcessorRef.current = new MessageBatchProcessor({
      batchSize: 50,
      batchTimeout: 1000,
      onBatchProcess: async (messages) => {
        console.log('[ChatView] Processing message batch:', messages.length);
          setMessages(prev => {
          const newMessages = [...prev];
          messages.forEach(msg => {
            const index = newMessages.findIndex(m => m.message_id === msg.message_id);
            if (index === -1) {
              newMessages.push(msg);
            } else {
              newMessages[index] = msg;
            }
          });
          return newMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        });
      },
      onError: (error, failedMessages) => {
        console.error('[ChatView] Failed to process messages:', error);
        toast.error('Some messages failed to load');
      }
    });

    return () => {
      if (batchProcessorRef.current) {
        batchProcessorRef.current.clear();
      }
    };
  }, []);

  // Update socket event handlers to use batch processor
  useEffect(() => {
    if (socket) {
      const handleNewMessage = (message) => {
        console.log('[ChatView] New message received:', message);
        if (message.contact_id === selectedContact?.id) {
          batchProcessorRef.current.addMessage(message);
          
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

      const handleSyncProgress = (data) => {
        if (data.contactId === selectedContact?.id) {
          console.log('[ChatView] Sync progress:', data);
          if (data.messages && data.messages.length > 0) {
            batchProcessorRef.current.addMessage(...data.messages);
          }
          setSyncState(prev => ({
            ...prev,
            progress: data.progress,
            processedMessages: data.processedMessages || prev.processedMessages,
            errors: data.errors || prev.errors
          }));
        }
      };

      const handleSyncState = (data) => {
        if (data.contactId === selectedContact?.id) {
          console.log('[ChatView] Sync state update:', data);
          
          // Handle retry states
          if (data.state === 'RETRYING') {
            setSyncRetryCount(prev => prev + 1);
          } else if (data.state === 'COMPLETED' || data.state === 'ERROR') {
            setSyncRetryCount(0);
          }

          setSyncState(prev => ({
            ...prev,
            ...data,
            details: data.details || prev.details,
            errors: data.errors || prev.errors
          }));

          // Handle fatal errors
          if (data.state === 'ERROR' && data.errorType === 'AUTH_ERROR') {
            toast.error('Authentication failed. Please log in again.');
            // Trigger logout or auth refresh
            return;
          }
        }
      };

      socket.on('whatsapp:message', handleNewMessage);
      socket.on('whatsapp:sync_progress', handleSyncProgress);
      socket.on('whatsapp:sync_state', handleSyncState);
      socket.on('error', (error) => {
        console.error('[ChatView] Socket error:', error);
        toast.error('Connection error. Messages might be delayed.');
      });
      
      return () => {
        socket.off('whatsapp:message', handleNewMessage);
        socket.off('whatsapp:sync_progress', handleSyncProgress);
        socket.off('whatsapp:sync_state', handleSyncState);
        socket.off('error');
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

  // Priority initialization
  const initializePriority = useCallback(async () => {
    if (!selectedContact?.id || selectedContact.priority || initializingPriority) {
      return;
    }

    try {
      setInitializingPriority(true);
      console.log('[ChatView] Initializing priority for contact:', selectedContact.id);

      const response = await api.post(`/api/analysis/initialize/${selectedContact.id}`);
      console.log('[ChatView] Priority initialization response:', response.data);

      if (response.data?.data?.priority && typeof onContactUpdate === 'function') {
        const { priority, lastAnalysis } = response.data.data;
        onContactUpdate(selectedContact.id, {
          priority,
          last_analysis_at: lastAnalysis
        });
      }
    } catch (error) {
      console.error('[ChatView] Error initializing priority:', error);
      toast.error('Failed to analyze contact priority');
    } finally {
      setInitializingPriority(false);
    }
  }, [selectedContact, initializingPriority, onContactUpdate]);

  // Effect for priority initialization
  useEffect(() => {
    if (selectedContact?.id) {
      initializePriority();
    } else {
      setPriority(null);
    }
  }, [selectedContact, initializePriority]);

  // Summary handler
  const handleSummaryClick = async () => {
    if (!selectedContact?.id) {
      console.log('[ChatView] No contact selected for summary');
      return;
    }

    if (messages.length === 0) {
      console.log('[ChatView] No messages available for summary');
      toast.error('No messages available to summarize');
      return;
    }

    try {
      setIsSummarizing(true);
      console.log('[ChatView] Generating summary for contact:', {
        contactId: selectedContact.id,
        messageCount: messages.length
      });

      const response = await api.get(`/api/analysis/summary/${selectedContact.id}`);
      console.log('[ChatView] Raw summary response:', response.data);
      
      // Validate response structure
      if (!response.data || typeof response.data !== 'object') {
        console.error('[ChatView] Invalid summary response format:', response.data);
        throw new Error('Invalid summary response format');
      }
      
      // Log the actual response structure
      console.log('[ChatView] Response structure:', {
        summary: response.data.summary,
        messageCount: response.data.messageCount,
        timespan: response.data.timespan
      });
      
      // Set the summary and show the modal
      setSummary(response.data);
      setShowSummary(true);
      
    } catch (error) {
      console.error('[ChatView] Error generating summary:', error);
      toast.error('Failed to generate summary');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Update connection status when socket connects
  useEffect(() => {
    if (isConnected) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('connecting');
    }
  }, [isConnected]);

  // Separate message fetching from socket connection
  const fetchMessages = useCallback(async (pageIndex = 0) => {
    if (!selectedContact?.id) return;

    try {
      // Only show loading for initial fetch
      if (pageIndex === 0 && messages.length === 0) {
        setLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      // Check cache first for this page
      const cacheKey = `${selectedContact.id}-${pageIndex}`;
      const cachedData = messageCache.current.get(cacheKey);
      const now = Date.now();
      if (cachedData && now - cachedData.timestamp < 5 * 60 * 1000) { // 5 minute cache
        setMessages(prev => pageIndex === 0 ? cachedData.messages : [...prev, ...cachedData.messages]);
        setHasMoreMessages(cachedData.messages.length === PAGE_SIZE);
        
        // If cache is older than 1 minute, trigger background sync
        if (now - cachedData.timestamp > 60 * 1000) {
          backgroundSync();
        }
        return;
      }

      // If not in cache or cache expired, fetch from API
      const response = await api.get(`/api/whatsapp-entities/contacts/${selectedContact.id}/messages`, {
        params: {
          page: pageIndex,
          pageSize: PAGE_SIZE
        },
        timeout: 30000
      });

      if (!response.data?.data) {
        throw new Error('Invalid response format from server');
      }

      const { messages: responseMessages, status, total, sync_info } = response.data.data;

      // Handle different sync states
      switch (status) {
        case 'syncing':
          setSyncStatus('syncing');
          toast.loading('Syncing messages...', { id: 'sync-status' });
          break;

        case 'pending_user_join':
          setSyncStatus('pending_user_join');
          toast.error('Please join the WhatsApp room first');
          break;

        case 'error':
          setSyncStatus('error');
          throw new Error(sync_info?.error || 'Failed to fetch messages');

        case 'success':
        case 'idle':
          setSyncStatus(status);
          toast.dismiss('sync-status');
          
          if (Array.isArray(responseMessages)) {
            // Update cache
            messageCache.current.set(cacheKey, {
              messages: responseMessages,
              timestamp: now
            });

            setMessages(prev => pageIndex === 0 ? responseMessages : [...prev, ...responseMessages]);
            setHasMoreMessages(responseMessages.length === PAGE_SIZE);
            setTotalMessages(total || responseMessages.length);
          }
          break;

        default:
          console.warn('[ChatView] Unknown sync status:', status);
          setSyncStatus('idle');
          if (Array.isArray(responseMessages)) {
            messageCache.current.set(cacheKey, {
              messages: responseMessages,
              timestamp: now
            });
            setMessages(prev => pageIndex === 0 ? responseMessages : [...prev, ...responseMessages]);
            setHasMoreMessages(responseMessages.length === PAGE_SIZE);
          }
      }

      // If no messages and not syncing, trigger background sync
      if ((!responseMessages || responseMessages.length === 0) && status !== 'syncing') {
        backgroundSync();
      }

    } catch (error) {
      console.error('[ChatView] Error fetching messages:', error);
      setError(error.message);
      setSyncStatus('error');
      toast.error(error.message || 'Failed to load messages');
      
      // Queue for retry if network error
      if (!navigator.onLine || error.message.includes('network') || error.message.includes('timeout')) {
        setPendingSyncs(prev => new Set([...prev, selectedContact.id]));
        // Set a timeout to retry if we're offline for too long
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        syncTimeoutRef.current = setTimeout(() => {
          if (navigator.onLine) {
            fetchMessages(0);
          }
        }, 30000); // Retry after 30 seconds
      }
    } finally {
      if (pageIndex === 0) {
        setLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, [selectedContact?.id, messages.length, PAGE_SIZE]);

  const backgroundSync = async () => {
    if (syncStatus === 'syncing' || !selectedContact?.id) return;
    
    try {
      setSyncStatus('syncing');
      const syncResponse = await api.post('/api/matrix/whatsapp/sync', {
        contactId: selectedContact.id
      });
      
      // Wait for sync to complete (up to 10 seconds)
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const checkResponse = await api.get(`/api/whatsapp-entities/contacts/${selectedContact.id}/messages`, {
          params: { page: 0, pageSize: PAGE_SIZE }
        });
        
        const syncStatus = checkResponse.data?.data?.sync_info?.status;
        if (syncStatus === 'approved' || syncStatus === 'rejected') {
          // Clear cache to force fresh data
          messageCache.current.clear();
          // Refresh messages
          await fetchMessages(0);
          break;
        }
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Sync timed out');
      }
      
    } catch (error) {
      console.error('[ChatView] Background sync failed:', error);
      // Don't show error to user for background sync
    } finally {
      setSyncStatus('idle');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      messageCache.current.clear();
    };
  }, []);

  // Enhanced render function
  const renderContent = () => {
    if (loading && messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <div className="text-gray-400">
            {syncState.state === 'PROCESSING' ? (
              <>
                <div>Syncing messages from WhatsApp...</div>
                <div className="text-sm mt-2">{syncState.details}</div>
                <div className="w-64 h-2 bg-gray-200 rounded-full mt-2">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${syncState.progress}%` }}
                  ></div>
                </div>
                {syncState.processedMessages > 0 && (
                  <div className="text-sm mt-2">
                    {syncState.processedMessages} messages processed
                  </div>
                )}
              </>
            ) : syncState.state === 'RETRYING' ? (
              <>
                <div>{ERROR_MESSAGES[syncState.errors?.[0]?.type] || 'Retrying sync...'}</div>
                <div className="text-sm mt-2">Attempt {syncRetryCount + 1} of {maxSyncRetries}</div>
              </>
            ) : syncState.state === 'PREPARING' ? (
              'Preparing to sync messages...'
            ) : syncState.state === 'FETCHING' ? (
              'Fetching message history...'
            ) : (
              'Loading messages...'
            )}
          </div>
          {syncState.errors?.length > 0 && syncState.state !== 'RETRYING' && (
            <div className="text-red-400 text-sm mt-2">
              {ERROR_MESSAGES[syncState.errors[syncState.errors.length - 1].type] || 
               syncState.errors[syncState.errors.length - 1].error}
            </div>
          )}
          {syncState.state === 'ERROR' && syncRetryCount >= maxSyncRetries && (
            <button
              onClick={() => {
                setSyncRetryCount(0);
                fetchMessages(0);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors mt-4"
            >
              Try Again
            </button>
          )}
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="text-gray-400 text-center">{error}</div>
          <button
            onClick={() => fetchMessages(0)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    if (messages.length === 0) {
      if (syncState.state === 'PROCESSING') {
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <div className="text-gray-400">Syncing messages from WhatsApp...</div>
            <div className="text-sm text-gray-500">{syncState.details}</div>
            <div className="w-64 h-2 bg-gray-200 rounded-full">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${syncState.progress}%` }}
              ></div>
            </div>
            {syncState.processedMessages > 0 && (
              <div className="text-sm text-gray-500">
                {syncState.processedMessages} messages processed
              </div>
            )}
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="text-gray-400">No messages yet</div>
          <button
            onClick={() => fetchMessages(0)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Check for messages
          </button>
        </div>
      );
    }

    return (
      <>
        {messages.map((message, index) => (
          <div key={message.id || index}>
            {renderMessageContent(message)}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </>
    );
  };

  // Show empty state when no contact is selected
  if (!selectedContact) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1b26] text-gray-400">
        <p>Select a contact to start chatting</p>
      </div>
    );
  }

  // Render header connection status
  const renderConnectionStatus = () => {
    if (!isOnline) {
      return (
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-sm text-gray-400">Offline - Messages will sync when online</span>
        </div>
      );
    }
    return (
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 rounded-full bg-green-500"></div>
        <span className="text-sm text-gray-400">Connected</span>
      </div>
    );
  };

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Retry pending syncs
      if (pendingSyncs.size > 0) {
        console.log('[ChatView] Back online, retrying pending syncs:', Array.from(pendingSyncs));
        pendingSyncs.forEach(contactId => {
          fetchMessages(0);
        });
        setPendingSyncs(new Set());
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      // Clear any pending timeouts
      if (offlineTimeoutRef.current) {
        clearTimeout(offlineTimeoutRef.current);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (offlineTimeoutRef.current) {
        clearTimeout(offlineTimeoutRef.current);
      }
    };
  }, [pendingSyncs, fetchMessages]);

  // Update socket event handlers to handle offline state
  useEffect(() => {
    if (socket) {
      const handleNewMessage = (message) => {
        if (!isOnline) {
          // Store message in IndexedDB for offline access
          messageCache.current.set(message.message_id, message);
          return;
        }
        // ... existing message handling ...
      };

      // ... rest of socket event handlers ...
    }
  }, [socket, selectedContact, currentUser, markMessagesAsRead, isOnline]);

  return (
    <div className="flex-1 bg-[#1a1b26] flex flex-col h-full">
      {/* Chat Header - Fixed height */}
      <div className="px-4 py-3 bg-[#24283b] flex items-center justify-between border-b border-gray-700 flex-none">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-[#1e6853] flex items-center justify-center">
            {selectedContact.avatar_url ? (
              <img 
                src={selectedContact.avatar_url} 
                alt={selectedContact.display_name || 'Contact'}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white text-lg">
                {(selectedContact.display_name || '?')[0].toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-white font-medium">{selectedContact.display_name || 'Unknown Contact'}</h2>
            {renderConnectionStatus()}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {connectionStatus !== 'connected' && messageQueue.length > 0 && (
            <div className="text-sm text-yellow-500">
              {messageQueue.length} message{messageQueue.length > 1 ? 's' : ''} queued
            </div>
          )}
          <button 
            onClick={handleSummaryClick}
            disabled={messages.length === 0 || isSummarizing}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={messages.length === 0 ? 'No messages to summarize' : 'Generate conversation summary'}
          >
            <FiFileText className="w-5 h-5" />
          </button>
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

      {/* Messages Area - Scrollable */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        {renderContent()}
      </div>

      {/* Message Input - Fixed height */}
      <div className="px-4 py-3 bg-[#24283b] border-t border-gray-700 flex-none">
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