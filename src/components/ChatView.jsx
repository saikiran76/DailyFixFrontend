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

// Import environment variables
const API_URL = import.meta.env.VITE_API_URL;

const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Connection lost. Retrying...',
  AUTH_ERROR: 'Authentication failed. Please try logging in again.',
  RATE_LIMIT: 'Too many requests. Waiting before retry...',
  VALIDATION_ERROR: 'Invalid data received. Please refresh the page.',
  SYNC_ERROR: 'Error syncing messages. Retrying...',
  UNKNOWN_ERROR: 'An unexpected error occurred. Retrying...'
};

// Update sync states to match database constraints
const SYNC_STATES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const SYNC_STATUS_MESSAGES = {
  [SYNC_STATES.PENDING]: 'Waiting for sync approval...',
  [SYNC_STATES.APPROVED]: 'Sync in progress...',
  [SYNC_STATES.REJECTED]: 'Sync request rejected'
};

const INITIAL_SYNC_STATE = {
  state: SYNC_STATES.PENDING,
  progress: 0,
  details: SYNC_STATUS_MESSAGES[SYNC_STATES.PENDING],
  processedMessages: 0,
  totalMessages: 0,
  errors: []
};

const SyncProgressIndicator = ({ syncState }) => {
  if (syncState.state === SYNC_STATES.REJECTED) {
    return (
      <div className="absolute top-0 left-0 right-0 z-10">
        <div className="flex flex-col space-y-2 p-4 bg-[#24283b] rounded-lg shadow-lg m-4">
          <div className="text-sm text-red-400">
            {syncState.details || SYNC_STATUS_MESSAGES[SYNC_STATES.REJECTED]}
          </div>
          {syncState.errors.length > 0 && (
            <div className="text-xs text-gray-500">
              {syncState.errors[syncState.errors.length - 1].message}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (syncState.state !== SYNC_STATES.APPROVED) {
    return null;
  }

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      <div className="flex flex-col space-y-2 p-4 bg-[#24283b] rounded-lg shadow-lg m-4">
        <div className="flex justify-between text-sm text-gray-400">
          <span>{syncState.details || SYNC_STATUS_MESSAGES[syncState.state]}</span>
          <span>{syncState.progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#1e6853] transition-all duration-300 ease-out"
            style={{ width: `${syncState.progress}%` }}
          />
        </div>
        {syncState.processedMessages > 0 && (
          <div className="text-xs text-gray-500">
            {syncState.processedMessages} of {syncState.totalMessages} messages processed
          </div>
        )}
      </div>
    </div>
  );
};

const handleSyncError = (error, contactId) => {
  const errorMessage = error?.response?.data?.message || error?.message || 'An unknown error occurred';
  
  setSyncState(prev => ({
    ...prev,
    state: SYNC_STATES.REJECTED,
    errors: [...prev.errors, {
      message: errorMessage,
      timestamp: Date.now()
    }]
  }));

  setError(`Message sync failed: ${errorMessage}`);
  
  console.error('[ChatView] Sync error:', {
    contactId,
    error: errorMessage,
    timestamp: new Date().toISOString()
  });
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
  const [unreadMessageIds, setUnreadMessageIds] = useState(new Set());
  const [syncState, setSyncState] = useState(INITIAL_SYNC_STATE);
  const [syncRetryCount, setSyncRetryCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(new Set());

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageCache = useRef(new Map());
  const isMounted = useRef(true);
  const batchProcessorRef = useRef(null);
  const offlineTimeoutRef = useRef(null);
  const lastSyncRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  const { socket, isConnected } = useSocketConnection('whatsapp');

  const PAGE_SIZE = 30;
  const maxSyncRetries = 3;

  // Define scrollToBottom function
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // 1. First define updateSyncState
  const updateSyncState = useCallback((newState) => {
    setSyncState(prev => ({
      ...prev,
      ...newState,
      timestamp: Date.now()
    }));
  }, []);

  // 2. Then define markMessagesAsRead
  const markMessagesAsRead = useCallback(
    debounce(async (messageIds) => {
      if (!selectedContact?.id || messageIds.length === 0) return;

      try {
        await api.post(`/api/whatsapp-entities/contacts/${selectedContact.id}/messages/read`, {
          messageIds: Array.from(messageIds)
        });
        
        setUnreadMessageIds(new Set());
        
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

  // 3. Then define processMessageQueue
  const processMessageQueue = useCallback(async () => {
    if (!selectedContact?.id || !socket || !isConnected || messageQueue.length === 0) {
      return;
    }
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
        logger.error('[ChatView] Failed to send queued message:', error);
        setMessageQueue(prev => [...prev, queuedMessage]);
        toast.error('Some messages failed to send');
        break;
      }
    }
  }, [socket, isConnected, selectedContact, messageQueue]);

  // 4. Then define updateConnectionStatus
  const updateConnectionStatus = useCallback((status) => {
    setConnectionStatus(status);
    if (status === 'connected' && messageQueue.length > 0) {
      processMessageQueue();
    }
  }, [messageQueue, processMessageQueue]);

  // Update socket event handlers with token validation and refresh
  useEffect(() => {
    const handlers = {
      message: (message) => {
        if (!socket || !isOnline || !currentUser) {
          messageCache.current.set(message.message_id, message);
        return;
    }

        if (message.contact_id === selectedContact?.id) {
          batchProcessorRef.current?.addMessage(message);
          if (message.sender_id !== currentUser?.id) {
            try {
              markMessagesAsRead([message.message_id]);
            } catch (error) {
              logger.error('[ChatView] Error marking new message as read:', error);
            }
          }
        }
      },

      syncProgress: (data) => {
        if (!currentUser) return;
        
            if (data.contactId === selectedContact?.id) {
          logger.info('[ChatView] Sync progress:', data);
          
          // Validate progress data
          if (typeof data.progress !== 'number' || data.progress < 0 || data.progress > 100) {
            logger.warn('[ChatView] Invalid sync progress value:', data.progress);
            return;
          }
          
          // Add messages to batch processor if available
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            try {
              batchProcessorRef.current?.addMessage(...data.messages);
            } catch (error) {
              logger.error('[ChatView] Error processing sync messages:', error);
            }
          }
          
          // Update sync state with validated data
          updateSyncState({
            state: SYNC_STATES.APPROVED,
            progress: data.progress,
            details: data.details || SYNC_STATUS_MESSAGES[SYNC_STATES.APPROVED],
            processedMessages: data.processedMessages || 0,
            totalMessages: data.totalMessages || 0,
            lastUpdate: Date.now()
          });
        }
      },

      syncState: (data) => {
        if (!currentUser) return;
        
        if (data.contactId === selectedContact?.id) {
          logger.info('[ChatView] Sync state update:', data);
          
          // Validate state transition
          const validStates = ['pending', 'approved', 'rejected'];
          if (!validStates.includes(data.state)) {
            logger.warn('[ChatView] Invalid sync state:', data.state);
            return;
          }
          
          let newState;
          let stateDetails = '';
          
          switch (data.state) {
            case 'pending':
              newState = SYNC_STATES.PENDING;
              stateDetails = 'Waiting for sync to start...';
              break;
            case 'approved':
              newState = SYNC_STATES.APPROVED;
              stateDetails = 'Sync in progress...';
              break;
            case 'rejected':
              newState = SYNC_STATES.REJECTED;
              stateDetails = data.error || 'Sync failed';
              break;
            default:
              logger.warn('[ChatView] Unhandled sync state:', data.state);
              return;
          }
          
          // Update sync state with validation
          updateSyncState({
            state: newState,
            details: data.details || stateDetails,
            errors: data.error ? [
              ...syncState.errors,
              {
                message: data.error,
                timestamp: Date.now(),
                type: data.errorType || 'SYNC_ERROR'
              }
            ] : syncState.errors,
            lastStateChange: Date.now()
          });
          
          // Handle auth errors
          if (newState === SYNC_STATES.REJECTED && data.errorType === 'AUTH_ERROR') {
            toast.error('Authentication failed. Please log in again.');
            // Trigger token refresh
            supabase.auth.refreshSession().then(async ({ data: { session } }) => {
              if (session) {
                // Update socket auth
                if (socket) {
                  socket.auth.token = session.access_token;
                  socket.disconnect().connect();
                }
                // Update API token
                await api.getAuthState();
              }
            }).catch(error => {
              logger.error('[ChatView] Token refresh failed:', error);
              toast.error('Failed to refresh authentication. Please log in again.');
            });
          }
        }
      },

      error: (error) => {
        logger.error('[ChatView] Socket error:', error);
        if (error.type === 'UnauthorizedError' || error.message?.includes('unauthorized')) {
          // Trigger token refresh and reconnect
          supabase.auth.refreshSession().then(async ({ data: { session } }) => {
            if (session) {
              if (socket) {
                socket.auth.token = session.access_token;
                socket.disconnect().connect();
              }
              await api.getAuthState();
            }
          });
        }
        toast.error('Connection error. Messages might be delayed.');
      },

      connect: () => {
        updateConnectionStatus('connected');
      },

      disconnect: () => {
        updateConnectionStatus('disconnected');
      }
    };

    // Set initial connection status
    updateConnectionStatus(socket?.connected ? 'connected' : 'disconnected');

    // Register all event handlers if socket exists and user is authenticated
    if (socket && currentUser) {
      socket.on('whatsapp:message', handlers.message);
      socket.on('whatsapp:sync_progress', handlers.syncProgress);
      socket.on('whatsapp:sync_state', handlers.syncState);
      socket.on('error', handlers.error);
      socket.on('connect', handlers.connect);
      socket.on('disconnect', handlers.disconnect);
    }

    // Always return cleanup function
    return () => {
      if (socket) {
        socket.off('whatsapp:message', handlers.message);
        socket.off('whatsapp:sync_progress', handlers.syncProgress);
        socket.off('whatsapp:sync_state', handlers.syncState);
        socket.off('error', handlers.error);
        socket.off('connect', handlers.connect);
        socket.off('disconnect', handlers.disconnect);
      }
    };
  }, [
    socket,
    selectedContact,
    currentUser,
    markMessagesAsRead,
    isOnline,
    updateSyncState,
    syncState.errors,
    updateConnectionStatus
  ]);

  // Reset state when contact changes
  useEffect(() => {
    let mounted = true;

    if (selectedContact?.id) {
      // Reset states
      setMessages([]);
    setLoading(true);
    setError(null);
      setHasMoreMessages(true);
      setPage(0);
      
      // Reset sync state
      updateSyncState({
        state: SYNC_STATES.PENDING,
        progress: 0,
        details: SYNC_STATUS_MESSAGES[SYNC_STATES.PENDING]
      });

      // Initial data fetch
      fetchData(0);
    }

    return () => {
      mounted = false;
      // Cleanup
      if (socket) {
        socket.off('sync:progress');
        socket.off('sync:complete');
        socket.off('sync:error');
      }
    };
  }, [selectedContact?.id, updateSyncState]);

  // Handle sync errors
  const handleSyncError = useCallback((error) => {
    const errorMessage = error?.response?.data?.message || error?.message || 'An unknown error occurred';
    
    updateSyncState({
      state: SYNC_STATES.REJECTED,
      errors: [...syncState.errors, {
        message: errorMessage,
        timestamp: Date.now()
      }]
    });

    setError(`Message sync failed: ${errorMessage}`);
    
    console.error('[ChatView] Sync error:', {
      contactId: selectedContact?.id,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }, [selectedContact?.id, syncState.errors, updateSyncState]);

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
  }, [socket, isConnected, selectedContact, messageQueue, processMessageQueue]);

  // Update fetchData to use api utility
  const fetchData = async (page = 0) => {
    if (!selectedContact?.id) return;

    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get(`/api/whatsapp-entities/contacts/${selectedContact.id}/messages?page=${page}`);
      
      if (page === 0) {
        setMessages(response.data.messages);
      } else {
        setMessages(prev => [...prev, ...response.data.messages]);
      }
      
      setHasMoreMessages(response.data.hasMore);
      setPage(page);
    } catch (err) {
      if (err.response?.status === 404) {
        // Start sync process with correct state
        updateSyncState({
          state: SYNC_STATES.PENDING,
          progress: 0,
          details: SYNC_STATUS_MESSAGES[SYNC_STATES.PENDING]
        });
        
        try {
          await api.post(`/api/whatsapp-entities/contacts/${selectedContact.id}/sync`);
        } catch (syncErr) {
          handleSyncError(syncErr);
        }
      } else {
        handleSyncError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  // Early return component
  const renderEmptyState = () => {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1b26] text-gray-400">
        <p>Select a contact to start chatting</p>
      </div>
    );
  };

  // Handle online/offline events with memoized handlers
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (selectedContact && pendingSyncs.size > 0) {
        logger.info('[ChatView] Back online, retrying pending syncs:', Array.from(pendingSyncs));
        pendingSyncs.forEach(contactId => {
          if (contactId === selectedContact.id) {
            logger.info('[ChatView] Back online, retrying pending sync:', contactId);
            fetchData(0);
          }
        });
        setPendingSyncs(new Set());
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (offlineTimeoutRef.current) {
        clearTimeout(offlineTimeoutRef.current);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOffline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [selectedContact?.id]);

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
      logger.info('[ChatView] Initiating sync for contact:', selectedContact.id);
      const response = await api.post(`/api/whatsapp-entities/contacts/${selectedContact.id}/sync`);
      
      if (response.data?.data?.status === 'approved') {
        updateSyncState({
          state: SYNC_STATES.APPROVED,
          progress: 0,
          details: SYNC_STATUS_MESSAGES[SYNC_STATES.APPROVED]
        });
        
        toast.custom((t) => (
          <div className="bg-[#24283b] text-white px-4 py-2 rounded-lg shadow-lg">
            Starting message sync...
          </div>
        ), { duration: 3000 });
      } else if (response.data?.data?.status === 'pending') {
        updateSyncState({
          state: SYNC_STATES.PENDING,
          progress: 0,
          details: SYNC_STATUS_MESSAGES[SYNC_STATES.PENDING]
        });
      }
    } catch (error) {
      logger.error('[ChatView] Error initiating sync:', error);
      updateSyncState({
        state: SYNC_STATES.REJECTED,
        errors: [...syncState.errors, {
          message: error.response?.data?.message || 'Failed to start message sync',
          timestamp: Date.now()
        }]
      });
      toast.error('Failed to start message sync');
    }
  }, [selectedContact?.id, updateSyncState, syncState.errors]);

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

  // Handle scroll for infinite loading
  const handleScroll = useCallback(
    debounce((e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target;
      
      if (
        scrollHeight - scrollTop <= clientHeight * 1.5 &&
        hasMoreMessages &&
        !loading &&
        syncState.state !== SYNC_STATES.SYNCING
      ) {
        fetchData(page + 1);
      }
    }, 100),
    [hasMoreMessages, loading, page, syncState.state]
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

  // Update scroll position with memoized handler
  useEffect(() => {
    if (currentMessages.length > 0) {
      scrollToBottom();
    }
  }, [currentMessages, scrollToBottom]);

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

  // Render the component
  if (!selectedContact) {
    return renderEmptyState();
  }

  return (
    <div className="flex-1 bg-[#1a1b26] flex flex-col h-full relative">
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

      {/* Sync Progress Indicator */}
      <SyncProgressIndicator syncState={syncState} />

      {/* Messages Area - Scrollable */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1e6853]"></div>
            <div className="text-gray-400">
              {syncState.state === SYNC_STATES.SYNCING ? (
                <>
                  <div>Syncing messages from WhatsApp...</div>
                  <div className="text-sm mt-2">{syncState.details}</div>
                </>
              ) : (
                'Loading messages...'
              )}
            </div>
              </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="text-red-400 text-center">{error}</div>
              <button
                onClick={() => {
                setError(null);
                  fetchData(0);
                }}
              className="px-4 py-2 bg-[#1e6853] text-white rounded hover:bg-[#1e6853]/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="text-gray-400">No messages yet</div>
            <button
              onClick={() => fetchData(0)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Check for messages
            </button>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div key={message.id || index}>
                {renderMessageContent(message)}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
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