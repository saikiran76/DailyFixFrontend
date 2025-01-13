import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useAuth } from '../contexts/AuthContext';
import PropTypes from 'prop-types';


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

const WhatsAppContactList = ({ onContactSelect, selectedContactId }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const { session } = useAuth();
  const { socket, isConnected } = useSocketConnection('whatsapp');
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const MAX_RETRIES = 3;

  // Debug session changes
  useEffect(() => {
    console.log('Session state changed:', { session, isConnected });
  }, [session, isConnected]);

  // Validate onContactSelect prop
  useEffect(() => {
    if (typeof onContactSelect !== 'function') {
      console.error('WhatsAppContactList: onContactSelect prop must be a function');
    }
  }, [onContactSelect]);

  const fetchContacts = async (force = false) => {
    console.log('Fetching contacts, force:', force);
    try {
      const response = await api.get('/api/whatsapp-entities/contacts');
      console.log('Raw contacts response:', response);
      
      // Handle double-nested response structure
      if (response.data?.data?.data?.contacts) {
        const sortedContacts = [...response.data.data.data.contacts].sort((a, b) => 
          (a.display_name || '').localeCompare(b.display_name || '')
        );
        console.log('Found contacts:', sortedContacts.length);
        setContacts(sortedContacts);
        setError(null);
      } else {
        console.error('Invalid response structure:', {
          hasData1: !!response.data,
          hasData2: !!response.data?.data,
          hasData3: !!response.data?.data?.data,
          hasContacts: !!response.data?.data?.data?.contacts
        });
        setError('Failed to load contacts: Invalid response format');
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setError('Failed to load contacts: ' + (error.message || 'Unknown error'));
    }
  };

  // Debug state changes
  useEffect(() => {
    console.log('State updated:', {
      session,
      isConnected,
      hasSocket: !!socket,
      isInitialized,
      connectionAttempts
    });
  }, [session, isConnected, socket, isInitialized, connectionAttempts]);

  // Single source of truth for initialization
  useEffect(() => {
    const initialize = async () => {
      setError(null);

      if (!session?.access_token) {
        console.log('Waiting for valid session (no access token):', session);
        return;
      }

      if (!socket || !isConnected) {
        console.log('Waiting for socket connection...', { hasSocket: !!socket, isConnected });
        if (connectionAttempts < MAX_RETRIES) {
          setConnectionAttempts(prev => prev + 1);
          return;
        }
        setError('Failed to connect to WhatsApp. Please refresh.');
        return;
      }

      if (isInitialized) {
        console.log('Already initialized');
        return;
      }

      console.log('All conditions met, initializing WhatsApp contact list');
      setLoading(true);
      
      try {
        await fetchContacts(true);
        setIsInitialized(true);
        setConnectionAttempts(0);
        console.log('Successfully initialized contact list');
      } catch (error) {
        console.error('Failed to initialize:', error);
        setError('Failed to load contacts. Please refresh.');
        if (connectionAttempts < MAX_RETRIES) {
          setConnectionAttempts(prev => prev + 1);
        }
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [session, socket, isConnected, connectionAttempts]);

  // Reset state when session changes
  useEffect(() => {
    if (!session?.access_token) {
      console.log('No access token, resetting state');
      setContacts([]);
      setIsInitialized(false);
      setConnectionAttempts(0);
      setError(null);
    }
  }, [session]);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !isConnected || !isInitialized) {
      return;
    }

    console.log('Setting up socket event handlers');

    const handlers = {
      'whatsapp:contact_added': (newContact) => {
        if (!newContact?.whatsapp_id) {
          console.error('Invalid contact data received');
          return;
        }

        setContacts(prevContacts => {
          const existing = prevContacts.find(c => c.whatsapp_id === newContact.whatsapp_id);
          if (existing) {
            return prevContacts.map(c => 
              c.whatsapp_id === newContact.whatsapp_id 
                ? { ...c, ...newContact }
                : c
            );
          }
          return [...prevContacts, newContact].sort((a, b) => {
            if (a.is_group !== b.is_group) return b.is_group ? 1 : -1;
            return a.display_name.localeCompare(b.display_name);
          });
        });
      },

      'whatsapp:message': (data) => {
        if (!data?.contact_id || !data?.content) {
          console.error('Invalid message data received');
          return;
        }

        setContacts(prevContacts => {
          return prevContacts.map(contact => {
            if (contact.whatsapp_id === data.contact_id) {
              return {
                ...contact,
                last_message: data.content,
                last_message_at: data.timestamp || new Date().toISOString(),
                unread_count: (contact.unread_count || 0) + 1
              };
            }
            return contact;
          });
        });
      },

      'whatsapp:read_status': (data) => {
        if (!data?.contact_id) return;

        setContacts(prevContacts => {
          return prevContacts.map(contact => 
            contact.whatsapp_id === data.contact_id
              ? { ...contact, unread_count: 0 }
              : contact
          );
        });
      },

      'whatsapp:sync_status': (data) => {
        if (!data?.contact_id || !data?.status) return;

        setContacts(prevContacts => {
          return prevContacts.map(contact => 
            contact.whatsapp_id === data.contact_id
              ? { ...contact, sync_status: data.status }
              : contact
          );
        });
      }
    };

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    // Cleanup
    return () => {
      console.log('Cleaning up socket event handlers');
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [socket, isConnected, isInitialized]);

  // Prevent multiple rapid contact clicks
  const handleContactClick = async (contact) => {
    if (!contact?.whatsapp_id) {
      console.error('Invalid contact:', contact);
      return;
    }

    // Debounce contact clicks
    if (loading) {
      console.log('Still processing previous click');
      return;
    }

    setLoading(true);
    
    try {
      // Request sync if needed
      if (contact.sync_status !== 'approved') {
        const response = await api.post(`/api/whatsapp-entities/contacts/${contact.whatsapp_id}/sync`);
        if (response.data.status === 'success') {
          // Update contact sync status locally
          setContacts(prevContacts => 
            prevContacts.map(c => 
              c.whatsapp_id === contact.whatsapp_id 
                ? { ...c, sync_status: 'approved' }
                : c
            )
          );
        } else {
          throw new Error(response.data.message || 'Sync request failed');
        }
      }

      // Notify parent
      if (typeof onContactSelect === 'function') {
        onContactSelect(contact);
      }
    } catch (error) {
      console.error('Contact click error:', error);
      toast.error('Failed to process contact. Please try again.');
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="divide-y divide-dark-lighter">
      {loading ? (
        <ShimmerContactList />
      ) : error ? (
        <div className="p-4 text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <button 
            onClick={fetchContacts}
            className="text-[#1e6853] hover:text-[#1e6853]/80 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : contacts.length === 0 ? (
        <div className="p-4 text-center text-gray-400">
          <p>No WhatsApp contacts yet</p>
          <button
            onClick={fetchContacts}
            className="mt-2 text-sm text-[#1e6853] hover:text-[#1e6853]/80 transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : (
        <>
          {/* Groups Section */}
          {contacts.some(c => c.is_group) && (
            <div className="bg-[#1a1b26] px-4 py-2 text-sm text-gray-400">
              Groups
            </div>
          )}
          {contacts.filter(c => c.is_group).map(contact => (
            <ContactItem
              key={contact.whatsapp_id}
              contact={contact}
              isSelected={selectedContactId === contact.whatsapp_id}
              onClick={() => handleContactClick(contact)}
            />
          ))}

          {/* Contacts Section */}
          {contacts.some(c => !c.is_group) && (
            <div className="bg-[#1a1b26] px-4 py-2 text-sm text-gray-400">
              Contacts
            </div>
          )}
          {contacts.filter(c => !c.is_group).map(contact => (
            <ContactItem
              key={contact.whatsapp_id}
              contact={contact}
              isSelected={selectedContactId === contact.whatsapp_id}
              onClick={() => handleContactClick(contact)}
            />
          ))}
        </>
      )}
    </div>
  );
};

// Contact Item Component
const ContactItem = ({ contact, isSelected, onClick }) => {
  // Validate required props
  if (!contact || typeof contact !== 'object') {
    console.error('ContactItem: contact prop is required and must be an object');
    return null;
  }

  const handleClick = (e) => {
    e.preventDefault();
    if (typeof onClick === 'function') {
      onClick(contact);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`p-4 hover:bg-[#24283b] cursor-pointer flex items-center justify-between transition-colors ${
        isSelected ? 'bg-[#24283b]' : ''
      }`}
    >
      <div className="flex items-center space-x-3">
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
        <div>
          <h3 className="font-medium text-white">{contact.display_name}</h3>
          {contact.last_message && (
            <p className="text-sm text-gray-400 truncate max-w-[200px]">
              {contact.last_message}
            </p>
          )}
          {contact.last_message_at && (
            <p className="text-xs text-gray-500">
              {new Date(contact.last_message_at).toLocaleString()}
            </p>
          )}
          {contact.sync_status !== 'approved' && (
            <span className="text-xs text-yellow-500">
              ⚡ Click to sync messages
            </span>
          )}
        </div>
      </div>
      {contact.unread_count > 0 && (
        <div className="bg-[#1e6853] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {contact.unread_count}
        </div>
      )}
    </div>
  );
};

// Add prop types if available
if (typeof PropTypes !== 'undefined') {
  WhatsAppContactList.propTypes = {
    onContactSelect: PropTypes.func.isRequired,
    selectedContactId: PropTypes.string
  };

  ContactItem.propTypes = {
    contact: PropTypes.object.isRequired,
    isSelected: PropTypes.bool,
    onClick: PropTypes.func.isRequired
  };
}

export default WhatsAppContactList; 