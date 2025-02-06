import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { FiVideo, FiPhone, FiSearch, FiFile, FiWifi, FiWifiOff, FiMoreVertical, FiX, FiFileText } from 'react-icons/fi';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { MessageBatchProcessor } from '../utils/MessageBatchProcessor';
import { debounce } from 'lodash';
import { ErrorBoundary } from 'react-error-boundary';
import { useSocket } from '../hooks/useSocket';
import LoadingSpinner from './LoadingSpinner';
import InviteAcceptanceModal from './InviteAcceptanceModal';
import MessageItem from './MessageItem';
import {
  fetchMessages,
  sendMessage,
  markMessagesAsRead,
  clearMessages,
  addToMessageQueue,
  updateMessageStatus,
  selectMessages,
  selectMessageLoading,
  selectMessageError,
  selectHasMoreMessages,
  selectCurrentPage,
  selectMessageQueue,
  selectUnreadMessageIds
} from '../store/slices/messageSlice';
import { updateContactMembership } from '../store/slices/contactSlice';

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
  if (!syncState || syncState.state === SYNC_STATES.PENDING) return null;

  const getStatusColor = () => {
    switch (syncState.state) {
      case SYNC_STATES.APPROVED:
        return 'bg-[#1e6853]';
      case SYNC_STATES.REJECTED:
        return 'bg-red-500';
      default:
        return 'bg-yellow-500';
    }
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      <div className="flex flex-col space-y-2 p-4 bg-[#24283b] rounded-lg shadow-lg m-4">
        <div className="flex justify-between text-sm text-gray-400">
          <span>{syncState.details}</span>
          {syncState.state === SYNC_STATES.APPROVED && (
            <span>{syncState.processedMessages} / {syncState.totalMessages} messages</span>
          )}
        </div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ease-out ${getStatusColor()}`}
            style={{ 
              width: `${syncState.progress}%`,
              transition: 'width 0.3s ease-out'
            }}
          />
        </div>
        {syncState.state === SYNC_STATES.REJECTED && syncState.errors.length > 0 && (
          <div className="text-xs text-red-400 mt-1">
            {syncState.errors[syncState.errors.length - 1].message}
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

const ErrorFallback = ({ error }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <div className="text-red-500 mb-4">Error loading chat</div>
      <div className="text-sm text-gray-600">{error.message}</div>
    </div>
  );
};

// Constants at the top
const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting'
};

const ChatView = ({ selectedContact, onContactUpdate }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentUser = useSelector(state => state.auth.session?.user);
  const { socket, isConnected } = useSocketConnection('whatsapp');

  // Redux message selectors
  const messagesState = useSelector(state => state.messages);
  const messages = useSelector(state => selectMessages(state, selectedContact?.id) || []);
  const loading = useSelector(state => selectMessageLoading(state) || false);
  const error = useSelector(state => selectMessageError(state) || null);
  const hasMoreMessages = useSelector(state => selectHasMoreMessages(state) || false);
  const currentPage = useSelector(state => selectCurrentPage(state) || 0);
  const messageQueue = useSelector(state => selectMessageQueue(state) || []);
  const unreadMessageIds = useSelector(state => selectUnreadMessageIds(state) || []);

  // Local state
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [priorityRetries, setPriorityRetries] = useState(0);
  const [socketState, setSocketState] = useState({
    isConnecting: false,
    retries: 0,
    lastError: null
  });
  const [previewMedia, setPreviewMedia] = useState(null);
  const [priority, setPriority] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [initializingPriority, setInitializingPriority] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [syncState, setSyncState] = useState(INITIAL_SYNC_STATE);

  // Refs
  const syncAbortController = useRef(null);
  const lastSyncRequest = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageCache = useRef(new Map());
  const isMounted = useRef(true);
  const batchProcessorRef = useRef(null);
  const offlineTimeoutRef = useRef(null);
  const lastSyncRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // Constants
  const PAGE_SIZE = 30;
  const MAX_RETRIES = 3;
  const RETRY_COOLDOWN = 5000;

  // Callbacks
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleMessageSend = useCallback(async (content) => {
    if (!selectedContact?.id) return;

    const message = { content };
    
    if (!socketReady) {
      dispatch(addToMessageQueue(message));
      toast.success('Message queued for delivery');
      return;
    }

    try {
      await dispatch(sendMessage({ contactId: selectedContact.id, message })).unwrap();
      scrollToBottom();
      } catch (error) {
      logger.error('[ChatView] Error sending message:', error);
      dispatch(addToMessageQueue(message));
      toast.error('Failed to send message, queued for retry');
    }
  }, [dispatch, selectedContact?.id, socketReady, scrollToBottom]);

  const handleMarkAsRead = useCallback(
    debounce((messageIds) => {
      if (!selectedContact?.id || messageIds.length === 0 || !isMounted.current) return;
      dispatch(markMessagesAsRead({ contactId: selectedContact.id, messageIds }));
    }, 1000),
    [dispatch, selectedContact?.id]
  );

  const handleSummaryClick = async () => {
    if (!selectedContact?.id) {
      toast.error('No contact selected for summary');
      return;
    }

    if (messages.length === 0) {
      toast.error('No messages available to summarize');
      return;
    }

    try {
      setIsSummarizing(true);
      logger.info('[ChatView] Fetching summary for contact:', {
          contactId: selectedContact.id,
        messageCount: messages.length
      });
      
      const response = await api.get(`/api/analysis/summary/${selectedContact.id}`);

      if (!response.data?.summary) {
        toast.success('summary: ', response?.data);
        return;
    }

      logger.info('[ChatView] Summary received:', {
      contactId: selectedContact.id,
        summary: response.data
      });
      
      setSummaryData(response.data);
      setShowSummaryModal(true);

    } catch (error) {
      logger.error('[ChatView] Error fetching summary:', {
        error,
        contactId: selectedContact.id
      });
      toast.error('Failed to generate chat summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Add invite handling functions
  const handleAcceptInvite = useCallback(async () => {
    if (!selectedContact?.id) return;
  
    try {
      const response = await api.post(
        `/api/whatsapp-entities/contacts/${selectedContact.id}/accept`
      );
  
      // Check the server response
      if (response.data?.success) {
        // success = true
        if (response.data.joinedBefore) {
          // Case B: success but joinedBefore = true
          logger.warn('[ChatView] Contact already joined the room');
          toast.success('Already joined this room');
      } else {
          // Case A: success, joinedBefore = false
          toast.success('Invite accepted successfully');
        }
  
        // In both success cases (A or B), we want to re-fetch messages
        setShowInviteModal(false);
  
        // Update membership in Redux if needed
        // (assuming `updatedContact` is returned or we have membership data)
        const updatedContact = response.data.contact;
        dispatch(updateContactMembership({
          contactId: selectedContact.id,
          updatedContact
        }));
        onContactUpdate(updatedContact);
  
        // Now fetch the messages
        dispatch(clearMessages());
        dispatch(fetchMessages({ contactId: selectedContact.id, page: 0, limit: PAGE_SIZE }));
      } else {
        // success = false
        if (response.data?.joinedBefore) {
          // This is an unusual scenario, but if it occurs:
          logger.warn('[ChatView] Contact was joined before but success=false');
          toast.success('Already joined this room');
          
          // Might still want to fetch messages here
          setShowInviteModal(false);
          dispatch(clearMessages());
          dispatch(fetchMessages({ contactId: selectedContact.id, page: 0, limit: PAGE_SIZE }));
    } else {
          // Actually a failure
          const errorMsg = response.data?.message || 'Failed to accept invite';
          logger.error('[ChatView] Error accepting invite:', { error: errorMsg });
          toast.error(errorMsg);
        }
      }
    } catch (error) {
      logger.error('[ChatView] Error accepting invite:', {
        error,
        contactId: selectedContact.id
      });
      toast.error(error.message || 'Failed to accept invite. Please try again.');
    }
  }, [selectedContact, dispatch, onContactUpdate]);
  

  // const handleRejectInvite = useCallback(async () => {
  //   if (!selectedContact?.id) return;

  //   try {
  //     logger.info('[ChatView] Rejecting invite for contact:', {
  //       contactId: selectedContact.id,
  //       currentMembership: selectedContact.metadata?.membership
  //     });

  //     // Make API call to reject invite
  //     const response = await api.post(`/api/contacts/${selectedContact.id}/reject`);
      
  //     if (!response.data?.success) {
  //       throw new Error('Failed to reject invite');
  //     }

  //     // Update contact in Redux with new membership
  //     dispatch(updateContactMembership({
  //       contactId: selectedContact.id,
  //       updatedContact: {
  //         ...selectedContact,
  //         metadata: {
  //           ...selectedContact.metadata,
  //           membership: 'rejected'
  //         }
  //       }
  //     }));

  //     // Close modal
  //     setShowInviteModal(false);

  //     // Show success message
  //     toast.success('Invite rejected');

  //     // Update parent component
  //     onContactUpdate({
  //       ...selectedContact,
  //       metadata: {
  //         ...selectedContact.metadata,
  //         membership: 'rejected'
  //       }
  //     });

  //   } catch (error) {
  //     logger.error('[ChatView] Error rejecting invite:', error);
  //     toast.error('Failed to reject invite. Please try again.');
  //   }
  // }, [selectedContact, dispatch, onContactUpdate]);

  // Update invite modal effect to check original membership
  useEffect(() => {
    if (!selectedContact) return;

    const membership = selectedContact?.membership;
    logger.info('[ChatView] Checking contact membership:', {
      contactId: selectedContact.id,
      membership
    });

    if (membership === 'invite') {
      logger.info('[ChatView] Showing invite modal for contact:', {
        contactId: selectedContact.id,
        membership
      });
      setShowInviteModal(true);
    } else {
      setShowInviteModal(false);
    }
  }, [selectedContact?.id, selectedContact?.membership]);

  // Effects
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedContact?.id) return;

    // Only clear and fetch messages if membership is 'join'
    if (selectedContact?.membership === 'join') {
      // Clear existing messages when contact changes
      dispatch(clearMessages());
      
      // Fetch initial messages
      dispatch(fetchMessages({ contactId: selectedContact.id, page: 0, limit: PAGE_SIZE }));
    }
  }, [dispatch, selectedContact?.id, selectedContact?.metadata?.membership]);

  // Add membership change effect
  useEffect(() => {
    if (selectedContact?.membership === 'join') {
      logger.info('[ChatView] Contact membership changed to join, fetching messages:', {
        contactId: selectedContact.id
      });
      
      // Clear existing messages
      dispatch(clearMessages());
      
      // Fetch new messages
      dispatch(fetchMessages({ 
        contactId: selectedContact.id, 
        page: 0, 
        limit: PAGE_SIZE 
      }));
    }
  }, [selectedContact?.membership, dispatch, selectedContact?.id]);

  // Update socket event handlers
  useEffect(() => {
    if (!socket || !selectedContact?.id) return;

    const handleContactUpdate = (data) => {
      if (data.contactId === selectedContact.id) {
        logger.info('[ChatView] Received contact update:', data);
        // Update contact in parent component
        onContactUpdate(data.contact);
      }
    };

    const handleMembershipUpdate = (data) => {
      if (data.contactId === selectedContact.id) {
        logger.info('[ChatView] Received membership update:', data);
        // Update contact in parent component with new membership
        onContactUpdate({
          ...selectedContact,
          // metadata: {
          //   ...selectedContact.metadata,
          //   membership: data.membership
          // }
          membership: data.membership
        });
      }
    };

    socket.on('whatsapp:contact:update', handleContactUpdate);
    socket.on('whatsapp:membership:update', handleMembershipUpdate);

    return () => {
      socket.off('whatsapp:contact:update', handleContactUpdate);
      socket.off('whatsapp:membership:update', handleMembershipUpdate);
    };
  }, [socket, selectedContact?.id, onContactUpdate]);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !selectedContact?.id) return;

    const handleNewMessage = (message) => {
      if (message.contactId === selectedContact.id) {
        logger.info('[ChatView] Received new message:', message);
        dispatch(fetchMessages({ contactId: selectedContact.id, page: currentPage }));
      scrollToBottom();
    }
    };

    const handleMessageUpdate = (updatedMessage) => {
      if (updatedMessage.contactId === selectedContact.id) {
        logger.info('[ChatView] Message updated:', updatedMessage);
        dispatch(updateMessageStatus({
          contactId: selectedContact.id,
          messageId: updatedMessage.id,
          status: updatedMessage.status
        }));
      }
    };

    socket.on('whatsapp:message:new', handleNewMessage);
    socket.on('whatsapp:message:update', handleMessageUpdate);

    return () => {
      socket.off('whatsapp:message:new', handleNewMessage);
      socket.off('whatsapp:message:update', handleMessageUpdate);
    };
  }, [socket, selectedContact?.id, dispatch, currentPage, scrollToBottom]);

  // Socket connection effect
  useEffect(() => {
    if (!socket) {
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
      setSocketReady(false);
      return;
    }

    // Initial state
    setConnectionStatus(socket.connected ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.CONNECTING);
    setSocketReady(socket.connected);

    const handleConnect = () => {
      logger.info('[ChatView] Socket connected');
      setConnectionStatus(CONNECTION_STATUS.CONNECTED);
      setSocketReady(true);
    };

    const handleDisconnect = () => {
      logger.info('[ChatView] Socket disconnected');
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
      setSocketReady(false);
    };

    const handleConnecting = () => {
      logger.info('[ChatView] Socket connecting');
      setConnectionStatus(CONNECTION_STATUS.CONNECTING);
      setSocketReady(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connecting', handleConnecting);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connecting', handleConnecting);
    };
  }, [socket]);

  // Add sync state effects
  useEffect(() => {
    if (loading) {
      setSyncState(prev => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        details: SYNC_STATUS_MESSAGES[SYNC_STATES.APPROVED],
        progress: 50
      }));
    } else {
      setSyncState(prev => ({
        ...prev,
        state: SYNC_STATES.PENDING,
        details: SYNC_STATUS_MESSAGES[SYNC_STATES.PENDING],
        progress: 0
      }));
    }
  }, [loading]);

  useEffect(() => {
    if (messages.length > 0 && !loading) {
        setSyncState(prev => ({
          ...prev,
        processedMessages: messages.length,
        totalMessages: messages.length,
        progress: 100,
        state: SYNC_STATES.APPROVED,
        details: 'Messages loaded successfully'
        }));
      }
  }, [messages.length, loading]);

  useEffect(() => {
    if (error) {
        setSyncState(prev => ({
          ...prev,
        state: SYNC_STATES.REJECTED,
        details: `Error: ${error}`,
        errors: [...prev.errors, { message: error, timestamp: Date.now() }]
        }));
      }
  }, [error]);

  // Add effect to initialize priority when contact changes
  useEffect(() => {
    if (selectedContact) {
      setPriority(selectedContact.metadata?.priority || 'medium');
    }
  }, [selectedContact]);

  // Render functions
  const renderConnectionStatus = useCallback(() => {
    switch (connectionStatus) {
      case CONNECTION_STATUS.CONNECTED:
        return (
          <span className="text-sm text-green-500 flex items-center">
            <FiWifi className="w-4 h-4 mr-1" />
            Connected
          </span>
        );
      case CONNECTION_STATUS.DISCONNECTED:
        return (
          <span className="text-sm text-red-500 flex items-center">
            <FiWifiOff className="w-4 h-4 mr-1" />
            Disconnected
          </span>
        );
      case CONNECTION_STATUS.CONNECTING:
        return (
          <span className="text-sm text-yellow-500 flex items-center">
            <FiWifi className="w-4 h-4 mr-1 animate-pulse" />
            Connecting...
          </span>
        );
      default:
        return null;
    }
  }, [connectionStatus]);

  const renderMessages = useCallback(() => {
    if (!messages) return null;
    if (loading && !messages.length) return <LoadingSpinner />;
    if (error) return <div className="text-red-500 text-center">{error}</div>;
    if (!messages.length) return <div className="text-gray-400 text-center">No messages yet</div>;

    try {
      return messages.map((message) => (
        <MessageItem 
          key={message.id || message.message_id} 
          message={message}
          currentUser={currentUser}
        />
      ));
    } catch (err) {
      logger.error('[ChatView] Error rendering messages:', err);
      return <div className="text-red-500 text-center">Error displaying messages</div>;
    }
  }, [messages, loading, error, currentUser]);

  const handlePriorityChange = (priority) => {
    if (!selectedContact) return;

    // Update local state first
    setPriority(priority);

    const updatedContact = {
      ...selectedContact,
      metadata: {
        ...selectedContact.metadata,
        priority
      }
    };

    // Update parent component if callback exists
    if (typeof onContactUpdate === 'function') {
      onContactUpdate(updatedContact);
    } else {
      logger.warn('[ChatView] onContactUpdate is not provided or not a function');
    }
  };

  if (!selectedContact) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1b26] text-gray-400">
        <p>Select a contact to start chatting</p>
      </div>
    );
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
            <div className="flex items-center space-x-2">
              {renderConnectionStatus()}
              <div className="relative inline-block text-left ml-2">
                <select
                  value={priority || selectedContact.metadata?.priority || 'medium'}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="bg-[#1e2132] text-sm rounded-md border border-gray-700 px-2 py-1 appearance-none cursor-pointer hover:bg-[#252a3f] focus:outline-none focus:ring-1 focus:ring-[#1e6853]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: 'right 0.5rem center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '1.5em 1.5em',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="low" className="text-gray-300 bg-[#1e2132]">Low Priority</option>
                  <option value="medium" className="text-yellow-500 bg-[#1e2132]">Medium Priority</option>
                  <option value="high" className="text-red-500 bg-[#1e2132]">High Priority</option>
                </select>
              </div>
            </div>
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
          {/* <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <FiVideo className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <FiPhone className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <FiSearch className="w-5 h-5" />
          </button> */}
        </div>
      </div>

      {/* Sync Progress Indicator - Only show when loading or on error */}
      {(loading || error) && <SyncProgressIndicator syncState={syncState} />}

      {/* Messages Area - Scrollable */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={async (e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.target;
          if (scrollTop === 0 && hasMoreMessages && !loading) {
            const nextPage = currentPage + 1;
            await dispatch(fetchMessages({
              contactId: selectedContact.id,
              page: nextPage,
              limit: PAGE_SIZE
            }));
          }
        }}
      >
        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input - Fixed height */}
      {/* <div className="px-4 py-3 bg-[#24283b] border-t border-gray-700 flex-none">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const input = e.target.elements.message;
            const content = input.value.trim();
            if (!content) return;
            await handleMessageSend(content);
              input.value = '';
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
      </div> */}

      {/* Render InviteAcceptanceModal */}
      {showInviteModal && selectedContact && (
        <InviteAcceptanceModal
          contact={selectedContact}
          onAccept={handleAcceptInvite}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Summary Modal */}
      {showSummaryModal && summaryData && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="bg-[#24283b] rounded-lg p-6 max-w-2xl w-full mx-4 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-medium text-white">Chat Summary</h3>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <FiX className="w-5 h-5" />
              </button>
      </div>
            
            {/* Main Points */}
            <div className="space-y-4">
              <div>
                <h4 className="text-white font-medium mb-2">Main Points</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-1">
                  {summaryData.summary.mainPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </div>

              {/* Action Items */}
              {summaryData.summary.actionItems.length > 0 && (
                <div>
                  <h4 className="text-white font-medium mb-2">Action Items</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1">
                    {summaryData.summary.actionItems.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key Decisions */}
              {summaryData.summary.keyDecisions.length > 0 && (
                <div>
                  <h4 className="text-white font-medium mb-2">Key Decisions</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-1">
                    {summaryData.summary.keyDecisions.map((decision, index) => (
                      <li key={index}>{decision}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Summary Info */}
              <div className="text-sm text-gray-400 pt-4 border-t border-gray-700">
                <p>Analyzed {summaryData.messageCount} messages</p>
                <p>From: {new Date(summaryData.timespan.start).toLocaleString()}</p>
                <p>To: {new Date(summaryData.timespan.end).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Wrap ChatView with ErrorBoundary
export const ChatViewWithErrorBoundary = (props) => (
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <ChatView {...props} />
  </ErrorBoundary>
);

export default ChatViewWithErrorBoundary;
