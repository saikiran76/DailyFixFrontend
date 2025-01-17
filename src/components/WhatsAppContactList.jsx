import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useAuth } from '../contexts/AuthContext';
import PropTypes from 'prop-types';
import { FiRefreshCw } from 'react-icons/fi';


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

const ContactItem = ({ contact, isSelected, onClick, initializingPriority }) => {
  const handleClick = (e) => {
    e.preventDefault();
    onClick(contact);
  };

  return (
    <div 
      onClick={handleClick}
      className={`p-4 hover:bg-[#24283b] cursor-pointer flex items-center justify-between transition-colors ${
        isSelected ? 'bg-[#24283b]' : ''
      }`}
    >
      <div className="flex items-center space-x-3">
        <div className="relative">
          <div className="w-10 h-10 bg-[#1e6853] rounded-full flex items-center justify-center">
            {contact.avatar_url ? (
              <img 
                src={contact.avatar_url} 
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
                initializingPriority === contact.id || initializingPriority === true
                  ? 'bg-gray-500 animate-pulse' 
                  : getPriorityColor(contact.priority)
              }`}
              aria-label={
                initializingPriority === contact.id || initializingPriority === true
                  ? 'Initializing priority...' 
                  : getPriorityText(contact.priority)
              }
            />
            {/* Tooltip - Updated positioning */}
            <div className="absolute hidden group-hover:block w-48 px-2 py-1 bg-gray-900 text-white text-xs rounded-md -top-8 left-[90%] transform -translate-x-[20%] z-10 pointer-events-none">
              {initializingPriority === contact.id || initializingPriority === true
                ? 'Initializing priority...' 
                : getPriorityText(contact.priority)
              }
              {/* Add a small arrow/triangle pointing to the priority dot */}
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

ContactItem.propTypes = {
  contact: PropTypes.shape({
    id: PropTypes.number.isRequired,
    whatsapp_id: PropTypes.string.isRequired,
    display_name: PropTypes.string.isRequired,
    avatar_url: PropTypes.string,
    is_group: PropTypes.bool,
    last_message: PropTypes.string,
    unread_count: PropTypes.number,
    priority: PropTypes.string,
    last_analysis_at: PropTypes.string
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  initializingPriority: PropTypes.number
};

const WhatsAppContactList = ({ onContactSelect, selectedContactId }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initializingPriority, setInitializingPriority] = useState(null);
  const { session } = useAuth();
  const { socket, isConnected } = useSocketConnection('whatsapp');

  // Validate onContactSelect prop
  useEffect(() => {
    if (typeof onContactSelect !== 'function') {
      console.error('WhatsAppContactList: onContactSelect prop must be a function');
    }
  }, [onContactSelect]);

  const fetchContacts = useCallback(async (forceSync = false) => {
    try {
      setLoading(true);
      setError(null);

      console.log('[WhatsApp Contacts] Fetching contacts:', { forceSync });
      
      const response = await api.get('/api/whatsapp-entities/contacts', {
        params: { force: forceSync }
      });

      if (!response.data?.data) {
        throw new Error('Invalid response format');
      }

      const contacts = response.data.data;
      console.log(`[WhatsApp Contacts] Retrieved ${contacts.length} contacts`);
      
      setContacts(contacts);
      setError(null);
    } catch (error) {
      console.error('[WhatsApp Contacts] Error fetching contacts:', error);
      setError('Failed to load contacts');
      toast.error('Failed to load contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchContacts(false); // Don't force sync on initial load
  }, [fetchContacts]);

  // Handle manual sync button click
  const handleSyncClick = useCallback(() => {
    fetchContacts(true); // Force sync when manually requested
  }, [fetchContacts]);

  const handleContactClick = async (contact) => {
    console.log('[Priority] Contact clicked:', { 
      contactId: contact.id, 
      currentPriority: contact.priority,
      hasExistingPriority: !!contact.priority,
      lastAnalysis: contact.last_analysis_at 
    });
    
    // Check if priority needs initialization
    const needsInitialization = !contact.priority;
    
    if (needsInitialization) {
      console.log('[Priority] Initializing priority for contact:', contact.id);
      try {
        setInitializingPriority(contact.id);
        console.log('[Priority] Making API call to /api/analysis/initialize/' + contact.id);
        
        const response = await api.post(`/api/analysis/initialize/${contact.id}`);
        console.log('[Priority] Initialization response:', response.data);
        
        // Check if response has the expected structure and data
        if (response.data?.data?.priority) {
          const { priority, lastAnalysis } = response.data.data;
          
          setContacts(prevContacts => {
            const updatedContacts = prevContacts.map(c => 
              c.id === contact.id 
                ? { 
                    ...c, 
                    priority,
                    last_analysis_at: lastAnalysis 
                  } 
                : c
            );
            console.log('[Priority] Updated contacts state:', {
              contactId: contact.id,
              oldPriority: contact.priority,
              newPriority: priority,
              totalContacts: updatedContacts.length
            });
            return updatedContacts;
          });
        } else {
          console.warn('[Priority] No priority data in response:', response.data);
          toast.error('Failed to initialize contact priority: No priority data');
        }
      } catch (error) {
        console.error('[Priority] Initialization error:', error);
        toast.error('Failed to initialize contact priority');
      } finally {
        setInitializingPriority(null);
        console.log('[Priority] Initialization completed for contact:', contact.id);
      }
    } else {
      console.log('[Priority] Contact already has valid priority:', {
        contactId: contact.id,
        priority: contact.priority,
        lastAnalysis: contact.last_analysis_at
      });
    }
    
    if (typeof onContactSelect === 'function') {
      onContactSelect(contact);
    }
  };

  useEffect(() => {
    if (session) {
      fetchContacts();
    }
  }, [session]);

  useEffect(() => {
    if (socket && isConnected) {
      console.log('Socket connected, setting up listeners');

      // Listen for new contacts
      socket.on('whatsapp:contact_added', (newContact) => {
        console.log('New contact added:', newContact);
        setContacts(prevContacts => {
          const contacts = Array.isArray(prevContacts) ? prevContacts : [];
          const exists = contacts.some(c => c.whatsapp_id === newContact.whatsapp_id);
          if (!exists) {
            toast.success(`New contact added: ${newContact.display_name}`);
            return [...contacts, newContact];
          }
          return contacts;
        });
      });

      // Listen for messages
      socket.on('whatsapp:message', (message) => {
        console.log('New message received:', message);
        setContacts(prevContacts => {
          if (!Array.isArray(prevContacts)) return [];
          return prevContacts.map(contact => {
            if (contact.whatsapp_id === message.contactId) {
              const newUnreadCount = (contact.unread_count || 0) + 1;
              console.log(`Updating contact ${contact.display_name} with unread count: ${newUnreadCount}`);
              return {
                ...contact,
                last_message: message.content,
                last_message_at: message.timestamp,
                unread_count: newUnreadCount
              };
            }
            return contact;
          });
        });
      });

      // Listen for read status updates
      socket.on('whatsapp:read_status', ({ contactId }) => {
        console.log('Read status update for contact:', contactId);
        setContacts(prevContacts => {
          if (!Array.isArray(prevContacts)) return [];
          return prevContacts.map(contact => {
            if (contact.whatsapp_id === contactId) {
              return {
                ...contact,
                unread_count: 0
              };
            }
            return contact;
          });
        });
      });

      // Add sync status listener
      socket.on('whatsapp:sync_started', () => {
        console.log('WhatsApp contact sync started');
        setLoading(true);
        toast.info('Syncing WhatsApp contacts...', {
          duration: 3000
        });
      });

      // Refresh contacts periodically while connected
      const refreshInterval = setInterval(fetchContacts, 30000);

      return () => {
        console.log('Cleaning up socket listeners');
        socket.off('whatsapp:contact_added');
        socket.off('whatsapp:message');
        socket.off('whatsapp:read_status');
        socket.off('whatsapp:sync_started');
        clearInterval(refreshInterval);
      };
    }
  }, [socket, isConnected]);

  return (
    <div className="flex flex-col h-full bg-[#1a1b26]">
      {/* Header */}
      <div className="p-4 flex justify-between items-center border-b border-gray-700">
        <h2 className="text-lg font-medium text-white">Contacts</h2>
        <button
          onClick={handleSyncClick}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          title="Sync contacts"
        >
          <FiRefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {loading && !contacts.length ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e6853]"></div>
          </div>
        ) : error ? (
          <div className="text-center p-4 text-red-400">
            {error}
            <button
              onClick={() => fetchContacts(true)}
              className="block mx-auto mt-2 text-sm text-[#1e6853] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center p-4 text-gray-400">
            No contacts found
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {contacts.map(contact => (
              <ContactItem
                key={contact.id}
                contact={contact}
                isSelected={Boolean(selectedContactId && contact.id === Number(selectedContactId))}
                onClick={handleContactClick}
                initializingPriority={initializingPriority}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Add prop types if available
if (typeof PropTypes !== 'undefined') {
  WhatsAppContactList.propTypes = {
    onContactSelect: PropTypes.func.isRequired,
    selectedContactId: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number
    ])
  };

  ContactItem.propTypes = {
    contact: PropTypes.shape({
      id: PropTypes.number.isRequired,
      whatsapp_id: PropTypes.string.isRequired,
      display_name: PropTypes.string.isRequired,
      avatar_url: PropTypes.string,
      is_group: PropTypes.bool,
      last_message: PropTypes.string,
      unread_count: PropTypes.number,
      priority: PropTypes.string,
      last_analysis_at: PropTypes.string
    }).isRequired,
    isSelected: PropTypes.bool.isRequired,
    onClick: PropTypes.func.isRequired,
    initializingPriority: PropTypes.number
  };
}

export default WhatsAppContactList; 