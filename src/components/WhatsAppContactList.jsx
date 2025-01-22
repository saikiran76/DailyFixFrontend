import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import PropTypes from 'prop-types';
import { fetchContacts, syncContact } from '../store/slices/contactSlice';
import logger from '../utils/logger';

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

const getPriorityColor = (priority) => {
  if (!priority) return 'bg-gray-400'; // Default color for NULL priority
  switch(priority.toUpperCase()) {
    case 'HIGH': return 'bg-red-500';
    case 'MEDIUM': return 'bg-yellow-500';
    case 'LOW': return 'bg-green-500';
    default: return 'bg-gray-400';
  }
};

const getPriorityText = (priority) => {
  if (!priority) return 'Priority not set - click to initialize';
  switch(priority.toUpperCase()) {
    case 'HIGH': return 'High Priority Contact';
    case 'MEDIUM': return 'Medium Priority Contact';
    case 'LOW': return 'Low Priority Contact';
    default: return 'Unknown Priority';
  }
};

const ContactItem = ({ contact, onClick, isSelected, initializingPriority }) => {
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
          {/* Priority indicator with tooltip */}
          <div className="absolute -top-1 -right-1 group">
            <div 
              className={`w-3 h-3 rounded-full ${
                initializingPriority
                  ? 'bg-gray-500 animate-pulse' 
                  : getPriorityColor(contact.priority)
              }`}
              aria-label={
                initializingPriority
                  ? 'Initializing priority...' 
                  : getPriorityText(contact.priority)
              }
            />
            {/* Tooltip */}
            <div className="absolute hidden group-hover:block w-48 px-2 py-1 bg-gray-900 text-white text-xs rounded-md -top-8 left-[90%] transform -translate-x-[20%] z-10 pointer-events-none">
              {initializingPriority
                ? 'Initializing priority...' 
                : getPriorityText(contact.priority)
              }
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
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
};

const WhatsAppContactList = ({ onContactSelect, selectedContactId }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const session = useSelector(state => state.auth.session);
  const contacts = useSelector((state) => state.contacts.items);
  const loading = useSelector((state) => state.contacts.loading);
  const error = useSelector((state) => state.contacts.error);
  const syncStatus = useSelector((state) => state.contacts.syncStatus);

  const loadContactsWithRetry = useCallback(async (retryCount = 0) => {
    try {
      logger.info('[WhatsAppContactList] Fetching contacts...');
      await dispatch(fetchContacts()).unwrap();
    } catch (err) {
      logger.error('[WhatsAppContactList] Error fetching contacts:', err);
      
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        logger.info(`[WhatsAppContactList] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        setTimeout(() => {
          loadContactsWithRetry(retryCount + 1);
        }, delay);
      }
    }
  }, [dispatch]);

  const handleContactSelect = useCallback(async (contact) => {
    try {
      // If contact needs sync, sync it first
      if (contact.sync_status !== 'approved' || !contact.last_sync_at || Date.now() - new Date(contact.last_sync_at).getTime() > 300000) {
        logger.info('[WhatsAppContactList] Syncing contact before selection:', contact.id);
        await dispatch(syncContact(contact.id)).unwrap();
      }
      
      onContactSelect(contact);
    } catch (err) {
      logger.error('[WhatsAppContactList] Error handling contact selection:', err);
    }
  }, [dispatch, onContactSelect]);

  useEffect(() => {
    if (!session) {
      logger.warn('[WhatsAppContactList] No session found, redirecting to login');
      navigate('/login');
      return;
    }

    loadContactsWithRetry();
  }, [session, navigate, loadContactsWithRetry]);

  if (loading) {
    return <ShimmerContactList />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-4">
        <p className="text-red-500 mb-2">Failed to load contacts: {error}</p>
        <button 
          onClick={() => loadContactsWithRetry()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!contacts?.length) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-gray-500">No contacts found</p>
      </div>
    );
  }

  return (
    <div className="contact-list divide-y divide-gray-200">
      {contacts.map(contact => (
        <ContactItem
          key={contact.id}
          contact={contact}
          isSelected={contact.id === selectedContactId}
          onClick={() => handleContactSelect(contact)}
          initializingPriority={syncStatus[contact.id] === 'syncing'}
        />
      ))}
    </div>
  );
};

ContactItem.propTypes = {
  contact: PropTypes.shape({
    id: PropTypes.number.isRequired,
    whatsapp_id: PropTypes.string.isRequired,
    display_name: PropTypes.string.isRequired,
    profile_photo_url: PropTypes.string,
    is_group: PropTypes.bool,
    last_message: PropTypes.string,
    unread_count: PropTypes.number,
    priority: PropTypes.string,
    last_analysis_at: PropTypes.string,
    sync_status: PropTypes.string,
    last_sync_at: PropTypes.string,
    bridge_room_id: PropTypes.string
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  initializingPriority: PropTypes.bool
};

WhatsAppContactList.propTypes = {
  onContactSelect: PropTypes.func.isRequired,
  selectedContactId: PropTypes.number
};

export default WhatsAppContactList; 