import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useAuth } from '../contexts/AuthContext';


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

const WhatsAppContactList = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { session } = useAuth();
  const { socket, isConnected } = useSocketConnection('whatsapp');

  const fetchContacts = async () => {
    try {
      const response = await api.get('/api/whatsapp-entities/contacts');
      console.log('Fetched contacts:', response.data);

      if (response.data.status === 'error') {
        setError(response.data.message);
        setContacts([]);
        return;
      }

      // Handle nested data structure
      const contactsData = response.data.data?.data?.contacts || [];
      console.log('Parsed contacts:', contactsData);
      
      // Ensure we're setting an array
      setContacts(Array.isArray(contactsData) ? contactsData : []);
      setError(null);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast.error('Failed to fetch WhatsApp contacts');
      setContacts([]);
      setError('Failed to fetch contacts');
    } finally {
      setLoading(false);
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

  if (loading) {
    return <ShimmerContactList />;
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500 mb-2">{error}</p>
        <button 
          onClick={fetchContacts}
          className="text-primary hover:text-primary-dark transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Ensure contacts is always an array before mapping
  const contactsList = Array.isArray(contacts) ? contacts : [];

  return (
    <div className="divide-y divide-dark-lighter">
      {contactsList.length === 0 ? (
        <div className="p-4 text-center text-gray-400">
          No WhatsApp contacts yet
        </div>
      ) : (
        contactsList.map(contact => (
          <div 
            key={contact.whatsapp_id} 
            className="p-4 hover:bg-dark-lighter cursor-pointer flex items-center justify-between transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-dark-lighter rounded-full flex items-center justify-center">
                <span className="text-green-500 text-lg">
                  {contact.is_group ? '👥' : '👤'}
                </span>
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
              </div>
            </div>
            {contact.unread_count > 0 && (
              <div className="bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {contact.unread_count}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default WhatsAppContactList; 