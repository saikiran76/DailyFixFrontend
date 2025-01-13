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
  const { session } = useAuth();
  const { socket, isConnected } = useSocketConnection('whatsapp');

  // Validate onContactSelect prop
  useEffect(() => {
    if (typeof onContactSelect !== 'function') {
      console.error('WhatsAppContactList: onContactSelect prop must be a function');
    }
  }, [onContactSelect]);

  const fetchContacts = async () => {
    try {
      const response = await api.get('/api/whatsapp-entities/contacts');
      console.log('Raw API response:', response.data);

      if (response.data.status === 'error') {
        setError(response.data.message);
        setContacts([]);
        return;
      }

      // Extract contacts from the correct nested path
      const contactsData = response.data.data?.data?.contacts || [];
      console.log('Extracted contacts:', contactsData);
      
      if (!Array.isArray(contactsData)) {
        console.error('Contacts data is not an array:', contactsData);
        setError('Invalid contacts data format');
        setContacts([]);
        return;
      }

      // Sort contacts: groups first, then by display name
      const sortedContacts = [...contactsData].sort((a, b) => {
        if (a.is_group !== b.is_group) {
          return b.is_group ? 1 : -1;
        }
        return a.display_name.localeCompare(b.display_name);
      });

      setContacts(sortedContacts);
      setError(null);

      // Log success metrics
      console.log(`Loaded ${sortedContacts.length} contacts (${sortedContacts.filter(c => c.is_group).length} groups)`);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast.error('Failed to fetch WhatsApp contacts');
      setContacts([]);
      setError('Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleContactClick = async (contact) => {
    try {
      // Request sync if not already synced
      if (contact.sync_status !== 'approved') {
        await api.post(`/api/whatsapp-entities/sync/${contact.whatsapp_id}`);
        toast.info('Syncing messages...');
      }
      
      // Safely call onContactSelect if it exists
      if (typeof onContactSelect === 'function') {
        onContactSelect(contact);
      } else {
        console.error('onContactSelect is not a function');
        toast.error('Unable to select contact. Please try again.');
      }
    } catch (error) {
      console.error('Error syncing contact:', error);
      toast.error('Failed to sync messages');
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