import React, { useEffect, useCallback, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import PropTypes from 'prop-types';
import { toast } from 'react-hot-toast';
import { fetchContacts, syncContact } from '../store/slices/contactSlice';
import logger from '../utils/logger';
import SyncProgressIndicator from './SyncProgressIndicator';
import { SYNC_STATES } from '../utils/syncUtils';
import { getSocket, initializeSocket } from '../utils/socket';

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
  // Generate unique key using both id and whatsapp_id
  const contactKey = `${contact.id}-${contact.whatsapp_id}`;

  return (
    <div 
      key={contactKey}
      onClick={() => onClick(contact)}
      className={`flex items-center p-3 cursor-pointer hover:bg-[#24283b] ${
        isSelected ? 'bg-[#24283b]' : ''
      }`}
    >
      <div className="flex items-center space-x-3">
        <div className="relative">
          <div className="w-10 h-10 bg-[#1e6853] rounded-full flex items-center justify-center">
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
        </div>
        <div>
          <h3 className="text-white font-medium">{contact.display_name}</h3>
          {contact.last_message && (
            <p className="text-sm text-gray-400 truncate max-w-[200px]">
              {contact.last_message}
            </p>
          )}
        </div>
      </div>
      {contact.unread_count > 0 && (
        <div className="bg-[#1e6853] text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
          {contact.unread_count}
        </div>
      )}
    </div>
  );
});

const WhatsAppContactList = ({ onContactSelect, selectedContactId }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const session = useSelector(state => state.auth.session);
  const contacts = useSelector((state) => state.contacts.items);
  const loading = useSelector((state) => state.contacts.loading);
  const error = useSelector((state) => state.contacts.error);
  // const syncStatus = useSelector((state) => state.contacts.syncStatus);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);

  const loadContactsWithRetry = useCallback(async (retryCount = 0) => {
    try {
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
      setSyncProgress(null);
      
      logger.info('[WhatsAppContactList] Refreshing contacts...');
      const result = await dispatch(fetchContacts()).unwrap();
      
      if (result?.inProgress) {
        logger.info('[WhatsAppContactList] Sync in progress during refresh');
        setSyncProgress({
          state: SYNC_STATES.SYNCING,
          message: 'Syncing contacts...'
        });
      } else {
        toast.success('Contacts refreshed successfully');
      }
    } catch (err) {
      logger.error('[WhatsAppContactList] Refresh error:', err);
      toast.error(err.response?.data?.message || 'Failed to refresh contacts');
      
      // Retry logic for refresh
      if (!err.response || err.response.status >= 500) {
        setTimeout(() => {
          loadContactsWithRetry(0);
        }, INITIAL_RETRY_DELAY);
      }
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
      switch (membership) {
        case 'invite':
          onContactSelect({ ...contact });
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
  }, [onContactSelect]);

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

  return (
    <div className="flex flex-col h-full">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-medium text-white">Contacts</h2>
        <button
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          className={`p-2 rounded-full transition-all duration-200 ${
            loading || isRefreshing 
              ? 'bg-gray-700 cursor-not-allowed' 
              : 'hover:bg-gray-700'
          }`}
          title="Refresh contacts"
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
        </button>
      </div>

      {/* Sync Progress */}
      {syncProgress && (
        <div className="p-4 bg-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">{syncProgress.message}</span>
            {syncProgress.progress && (
              <span className="text-sm text-gray-400">{syncProgress.progress}%</span>
            )}
          </div>
          {syncProgress.progress && (
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${syncProgress.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

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
        ) : !contacts?.length ? (
          <div className="flex flex-col items-center justify-center p-4">
            <p className="text-gray-500">
              {syncProgress ? 'Syncing contacts...' : 'No contacts found'}
            </p>
            {!syncProgress && (
              <button 
                onClick={handleRefresh}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Refresh
              </button>
            )}
          </div>
        ) : (
          <div className="contact-list divide-y divide-gray-700">
            {contacts.map(contact => (
              <ContactItem
                key={contact.id}
                contact={contact}
                isSelected={contact.id === selectedContactId}
                onClick={() => handleContactSelect(contact)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
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