import React, { useEffect, useCallback, useState, memo, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import PropTypes from 'prop-types';
import { toast } from 'react-hot-toast';
import { fetchContacts, syncContact, selectContactPriority, updateContactMembership, freshSyncContacts, addContact, hideContact, updateContactDisplayName } from '../store/slices/contactSlice';
import logger from '../utils/logger';
import SyncProgressIndicator from './SyncProgressIndicator';
import { SYNC_STATES } from '../utils/syncUtils';
import { getSocket, initializeSocket } from '../utils/socket';
import { format } from 'date-fns';
import PriorityBubble from './PriorityBubble';
import ChatView from './ChatView';
import api from '../utils/api';

const AcknowledgmentModal = ({ isOpen, onClose }) => {
  const modalRef = React.useRef();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div 
        ref={modalRef}
        className="bg-[#24283b] rounded-lg p-6 max-w-md w-full mx-4"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-medium text-white">WhatsApp Sync Started</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className='flex justify-center mt-2 mb-2'>
          <img className='size-10' src="https://media0.giphy.com/media/jU9PVpqUvR0aNc3nvX/giphy.gif?cid=6c09b952prsvlhpto7g95cgdkxbeyvjja133739m5398bj2o&ep=v1_stickers_search&rid=giphy.gif&ct=s" alt="whatsappLoad"/>
        </div>
        <p className="text-gray-300">
          Application started syncing your WhatsApp contacts. If there is a new message for any contact, it will be fetched automatically here.
        </p>
      </div>
    </div>
  );
};

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

const ShimmerContactList = () => (
  <div className="space-y-4 p-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
          <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const ContactItem = memo(({ contact, onClick, isSelected }) => {
  const dispatch = useDispatch();
  const priority = useSelector(state => selectContactPriority(state, contact.id));
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(contact.display_name);
  const [showTooltip, setShowTooltip] = useState(false);
  const editInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isEditing && editInputRef.current && !editInputRef.current.contains(e.target)) {
        setIsEditing(false);
        setEditedName(contact.display_name);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, contact.display_name]);

  const handleEdit = (e) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    dispatch(hideContact(contact.id));
  };

  const handleNameSubmit = (e) => {
    if (e.key === 'Enter' && editedName.trim()) {
      dispatch(updateContactDisplayName({ contactId: contact.id, displayName: editedName.trim() }));
      setIsEditing(false);
    }
  };
  
  return (
    <div
      className={`relative flex items-center px-4 py-3 cursor-pointer hover:bg-[#24283b] ${
        isSelected ? 'bg-[#24283b]' : ''
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <PriorityBubble priority={priority} />
      
      {showTooltip && (
        <div className="absolute right-2 top-2 flex gap-2 bg-[#1a1b26] p-1 rounded shadow-lg z-10">
          <button
            onClick={handleEdit}
            className="text-gray-400 hover:text-white p-1"
            title="Edit contact name"
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-white p-1"
            title="Hide contact"
          >
            🗑️
          </button>
        </div>
      )}
      
      <div className="w-10 h-10 rounded-full bg-[#1e6853] flex items-center justify-center flex-shrink-0">
        {contact.profile_photo_url ? (
          <img
            src={contact.profile_photo_url}
            alt={contact.display_name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="text-white text-lg">
            {contact.is_group ? '👥' : contact.display_name[0].toUpperCase()}
          </span>
        )}
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex justify-between items-start">
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleNameSubmit}
              className="bg-[#1a1b26] text-white px-2 py-1 rounded w-full"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <h3 className="text-white font-medium truncate">
              {contact.display_name}
            </h3>
          )}
          {contact.last_message_at && !isEditing && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {format(new Date(contact.last_message_at), 'HH:mm')}
            </span>
          )}
        </div>
        {contact.last_message && !isEditing && (
          <p className="text-sm text-gray-400 truncate">
            {contact.last_message}
          </p>
        )}
      </div>
    </div>
  );
});

const WhatsAppContactList = ({ onContactSelect, selectedContactId }) => {
  const contacts = useSelector((state) => state.contacts.items);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const session = useSelector(state => state.auth.session);
  const loading = useSelector((state) => state.contacts.loading);
  const error = useSelector((state) => state.contacts.error);
  // const syncStatus = useSelector((state) => state.contacts.syncStatus);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastManualRefreshTime, setLastManualRefreshTime] = useState(0);
  const [syncProgress, setSyncProgress] = useState(null);
  const [showAcknowledgment, setShowAcknowledgment] = useState(false);
  const [hasShownAcknowledgment, setHasShownAcknowledgment] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add a function to check if refresh is allowed
  // const isRefreshAllowed = () => {
  //   const now = Date.now();
  //   return now - lastManualRefreshTime >= 10000;
  // };

  const loadContactsWithRetry = useCallback(async (retryCount = 0) => {
    try {
      // setLastManualRefreshTime(Date.now());
      logger.info('[WhatsAppContactList] Fetching contacts...');
      const result = await dispatch(fetchContacts()).unwrap();
      logger.info('[Contacts fetch log from component] result: ', result);

      if (result?.inProgress) {
        logger.info('[WhatsAppContactList] Sync in progress, showing sync state');
        setSyncProgress({
          state: SYNC_STATES.SYNCING,
          message: 'Syncing contacts...'
        });
        return;
      }

      if (result?.contacts?.length === 0 && !syncProgress) {
        logger.info('[WhatsAppContactList] No contacts found, initiating sync');
        await dispatch(syncContact()).unwrap();
      }

    } catch (err) {
      logger.error('[WhatsAppContactList] Error fetching contacts:', err);
      
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        logger.info(`[WhatsAppContactList] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        setTimeout(() => {
          loadContactsWithRetry(retryCount + 1);
        }, delay);
      } else {
        toast.error('Failed to load contacts after multiple attempts');
      }
    }
  }, [dispatch, syncProgress]);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setSyncProgress({
        state: SYNC_STATES.SYNCING,
        message: 'Starting fresh sync...',
        progress: 0
      });
  
      // Trigger fresh sync
      const result = await dispatch(freshSyncContacts()).unwrap();
  
      setSyncProgress({
        state: SYNC_STATES.COMPLETED,
        message: 'Sync completed successfully',
        progress: 100
      });
  
      toast.success(result?.message || 'Contacts refreshed successfully');
    } catch (error) {
      // Safely extract error message
      const errorMsg = error?.message || String(error);
      let errorMessage = 'Failed to refresh contacts.';
  
      // Check if error indicates a timeout
      if (errorMsg.toLowerCase().includes('timeout')) {
        errorMessage = 'Fresh syncing stopped due to timeout';
      } else if (errorMsg.toLowerCase().includes('failed')) {
        errorMessage = errorMsg;
      }
      // Show error toast
      toast.success('Fresh sync stopped');
      setSyncProgress({
        state: SYNC_STATES.ERROR,
        message: errorMessage,
        progress: 0
      });
    } finally {
      setIsRefreshing(false);
    }
  };


  const handleContactSelect = useCallback(async (contact) => {
    try {
      logger.info('[WhatsAppContactList] Handling contact selection:', {
        contactId: contact.id,           
        membership: contact?.membership,
        contact: contact
      });

      // Clear any existing tooltips
      const tooltips = document.querySelectorAll('.tooltip');
      tooltips.forEach(t => t.remove());

      // Handle different membership states
      const membership = contact?.membership;
      
      // Enhanced membership handling
      switch (membership) {
        case 'invite':
          try {
            logger.info('[WhatsAppContactList] Auto-accepting invite for contact:', contact.id);
            const response = await api.post(
              `/api/whatsapp-entities/contacts/${contact.id}/accept`
            );
            
            if (response.data?.success) {
              logger.info('[WhatsAppContactList] Invite accepted successfully:', {
                contactId: contact.id,
                response: response.data
              });
              
              // Update membership in Redux
              const updatedContact = response.data.contact || {
                ...contact,
                membership: 'join'
              };
              
              dispatch(updateContactMembership({
                contactId: contact.id,
                updatedContact
              }));
              
              // Pass the updated contact to parent
              onContactSelect(updatedContact);
            } else if (response.data?.joinedBefore) {
              logger.info('[WhatsAppContactList] Contact was already joined:', contact.id);
              onContactSelect({ ...contact, membership: 'join' });
            } else {
              // If acceptance fails, still allow selection but don't update membership
              logger.warn('[WhatsAppContactList] Invite acceptance failed:', {
                contactId: contact.id,
                error: response.data?.message
              });
              onContactSelect({ ...contact });
            }
          } catch (error) {
            logger.error('[WhatsAppContactList] Error accepting invite:', {
              contactId: contact.id,
              error: error.message
            });
            // Still allow selection even if acceptance fails
            onContactSelect({ ...contact });
          }
          break;
        case 'leave':
          toast.error('You have left this chat');
          return;
        case 'ban':
          toast.error('You are banned from this chat');
          return;
        case 'join':
          onContactSelect({ ...contact });
          break;
        case undefined:
          logger.warn('[WhatsAppContactList] Contact has no membership state:', contact);
          onContactSelect({ ...contact });
          break;
        default:
          logger.warn('[WhatsAppContactList] Unknown membership state:', membership);
          toast.error('Invalid membership status');
          return;
      }
    } catch (err) {
      logger.error('[WhatsAppContactList] Error handling contact selection:', err);
      toast.error('Failed to select contact');
    }
  }, [onContactSelect, dispatch]);

  const handleContactUpdate = useCallback((updatedContact) => {
    // Dispatch update to Redux if needed
    dispatch(updateContactMembership({ 
      contactId: updatedContact.id, 
      updatedContact 
    }));
  }, [dispatch]);

  useEffect(() => {
    const socket = getSocket();
  
    const handleNewContact = (data) => {
      logger.info('[WhatsAppContactList] New contact received:', {
        contactId: data.id,
        displayName: data.display_name
      });
      
      dispatch(addContact(data));
      toast.success(`New contact: ${data.display_name}`);
    };
  
    if (socket) {
      socket.on('whatsapp:new_contact', handleNewContact);
  
      return () => {
        socket.off('whatsapp:new_contact', handleNewContact);
      };
    }
  }, [dispatch]);

  useEffect(() => {
    if (!session) {
      logger.warn('[WhatsAppContactList] No session found, redirecting to login');
      navigate('/login');
      return;
    }

    loadContactsWithRetry();
  }, [session, navigate, loadContactsWithRetry]);

  useEffect(() => {
    const initSocket = async () => {
      try {
        await initializeSocket();
        const socket = getSocket();
        if (!socket || !session?.user?.id) return;

        const handleSyncProgress = (data) => {
          if (data.userId === session.user.id) {
            setSyncProgress({
              state: SYNC_STATES.SYNCING,
              progress: data.progress,
              message: data.details || 'Syncing contacts...'
            });
          }
        };

        const handleSyncComplete = (data) => {
          if (data.userId === session.user.id) {
            setSyncProgress(null);
            loadContactsWithRetry();
          }
        };

        const handleSyncError = (data) => {
          if (data.userId === session.user.id) {
            setSyncProgress({
              state: SYNC_STATES.ERROR,
              message: data.error || 'Sync failed'
            });
            toast.error('Contact sync failed: ' + (data.error || 'Unknown error'));
          }
        };

        socket.on('whatsapp:sync_progress', handleSyncProgress);
        socket.on('whatsapp:sync_complete', handleSyncComplete);
        socket.on('whatsapp:sync_error', handleSyncError);

        return () => {
          socket.off('whatsapp:sync_progress', handleSyncProgress);
          socket.off('whatsapp:sync_complete', handleSyncComplete);
          socket.off('whatsapp:sync_error', handleSyncError);
        };
      } catch (error) {
        logger.error('[WhatsAppContactList] Socket initialization error:', error);
      }
    };

    initSocket();
  }, [session, loadContactsWithRetry]);

  useEffect(() => {
    const isInitialSync = !hasShownAcknowledgment && contacts.length === 1 && 
      contacts[0]?.display_name?.toLowerCase().includes('whatsapp bridge bot');

    if (isInitialSync) {
      setShowAcknowledgment(true);
      setHasShownAcknowledgment(true);
    }
  }, [hasShownAcknowledgment, contacts]);

  // Filter out duplicates and bridge bot/status broadcasts
  const filteredContacts = useMemo(() => {
    const displayNameMap = new Map();
    return contacts.filter(contact => {
      const displayName = contact.display_name?.toLowerCase() || '';
      
      // Skip bridge bot and status broadcasts
      const isBridgeBot = displayName === 'whatsapp bridge bot';
      const isStatusBroadcast = displayName.includes('whatsapp status') || 
                               displayName.includes('broadcast');
      
      if (isBridgeBot || isStatusBroadcast) return false;

      // Handle duplicates - keep the most recently active one
      if (displayNameMap.has(displayName)) {
        const existing = displayNameMap.get(displayName);
        const existingTime = new Date(existing.last_message_at || 0).getTime();
        const currentTime = new Date(contact.last_message_at || 0).getTime();
        
        if (currentTime > existingTime) {
          displayNameMap.set(displayName, contact);
          return true;
        }
        return false;
      }
      
      displayNameMap.set(displayName, contact);
      return true;
    });
  }, [contacts]);

  // Add memoized filtered contacts
  const searchedContacts = useMemo(() => {
    if (!searchQuery.trim()) return filteredContacts;
    
    return filteredContacts.filter(contact => 
      contact.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [filteredContacts, searchQuery]);

  return (
    <>
      <AcknowledgmentModal 
        isOpen={showAcknowledgment} 
        onClose={() => setShowAcknowledgment(false)} 
      />
      
      <div className="flex flex-col h-full w-[100%]">
        {/* Header with refresh button and search */}
        <div className="flex flex-col p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handleRefresh}
              disabled={loading || isRefreshing}
              className={`p-2 flex justify-between rounded-full transition-all duration-200 text-center ${
                loading || isRefreshing 
                  ? 'bg-gray-700 cursor-not-allowed opacity-50'
                  : 'hover:bg-gray-700'
              }`}
              title='Refresh contacts'
            >
              <svg
                className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <p>Refresh contacts</p>
            </button>
          </div>
          
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full bg-[#1e2132] text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1e6853] placeholder-gray-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute w-auto right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <svg className="w-auto h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <ShimmerContactList />
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-4">
              <p className="text-red-500 mb-2">Failed to load contacts: {error}</p>
              <button 
                onClick={() => loadContactsWithRetry()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : !searchedContacts?.length ? (
            <div className="flex flex-col items-center justify-center p-4">
              <p className="text-gray-500">
                {searchQuery 
                  ? `No contacts found matching "${searchQuery}"`
                  : syncProgress 
                    ? 'Syncing contacts...' 
                    : 'Application syncs new contacts with new messages 🔃'
                }
              </p>
            </div>
          ) : (
            <div className="contact-list divide-y divide-gray-700">
              {searchedContacts.map(contact => (
                <ContactItem
                  key={contact.id}
                  contact={contact}
                  isSelected={contact.id === selectedContactId}
                  onClick={() => handleContactSelect(contact)}
                  onContactUpdate={handleContactUpdate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

ContactItem.propTypes = {
  contact: PropTypes.shape({
    id: PropTypes.number.isRequired,
    whatsapp_id: PropTypes.string.isRequired,
    display_name: PropTypes.string.isRequired,
    // profile_photo_url: PropTypes.string,
    is_group: PropTypes.bool,
    last_message: PropTypes.string,
    // unread_count: PropTypes.number,
    sync_status: PropTypes.string,
    membership: PropTypes.string,
    // last_sync_at: PropTypes.string,
    // bridge_room_id: PropTypes.string,
    // metadata: PropTypes.shape({
    //   membership: PropTypes.string,
    //   room_id: PropTypes.string,
    //   member_count: PropTypes.number,
    //   // last_sync_check: PropTypes.string,
    //   // bridge_bot_status: PropTypes.string
    // })
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired
};

WhatsAppContactList.propTypes = {
  onContactSelect: PropTypes.func.isRequired,
  selectedContactId: PropTypes.number
};

export default WhatsAppContactList; 