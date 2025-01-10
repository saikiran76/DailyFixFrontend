import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useAuth } from '../contexts/AuthContext';

const WhatsAppContactList = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const { session } = useAuth();
  const { socket, isConnected } = useSocketConnection('whatsapp', {
    auth: {
      token: session?.access_token,
      userId: session?.user?.id
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000
  });

  useEffect(() => {
    // Only fetch contacts if we have a valid socket connection
    if (socket && isConnected) {
      fetchContacts();
    }
  }, [socket, isConnected]);

  const handleContactUpdate = useCallback((data) => {
    if (data.type === 'update' || data.type === 'new') {
      fetchContacts(); // Refresh the entire list for now
    }
  }, []);

  const handleSyncStatusUpdate = useCallback((data) => {
    setContacts(prevContacts => 
      prevContacts.map(contact => 
        contact.id === data.contactId
          ? { ...contact, sync_status: data.status }
          : contact
      )
    );
    
    if (data.status === 'approved') {
      toast.success('Room created! Check your Matrix client for the invite.');
    }
  }, []);

  const handleUnreadUpdate = useCallback((data) => {
    setContacts(prevContacts => 
      prevContacts.map(contact => 
        contact.id === data.contactId
          ? { ...contact, unread_count: data.unreadCount }
          : contact
      )
    );
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('whatsapp_contact_update', handleContactUpdate);
      socket.on('whatsapp_sync_status', handleSyncStatusUpdate);
      socket.on('whatsapp_unread_update', handleUnreadUpdate);
      
      return () => {
        socket.off('whatsapp_contact_update', handleContactUpdate);
        socket.off('whatsapp_sync_status', handleSyncStatusUpdate);
        socket.off('whatsapp_unread_update', handleUnreadUpdate);
      };
    }
  }, [socket, handleContactUpdate, handleSyncStatusUpdate, handleUnreadUpdate]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/whatsapp-entities/contacts');
      setContacts(response.data.data);
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to fetch contacts');
      toast.error('Failed to fetch WhatsApp contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncRequest = async (contactId) => {
    try {
      setSyncInProgress(true);
      await api.post(`/api/whatsapp-entities/contacts/${contactId}/sync`);
      toast.success('Sync request sent. Please wait for room invite in your Matrix client.');
      fetchContacts(); // Refresh list to update status
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to request sync');
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleSyncApproval = async (contactId, status) => {
    try {
      setSyncInProgress(true);
      await api.put(`/api/whatsapp-entities/contacts/${contactId}/sync`, { status });
      toast.success(`Sync ${status === 'approved' ? 'approved' : 'rejected'}`);
      if (status === 'approved') {
        toast.info('Please check your Matrix client for the room invite');
      }
      fetchContacts(); // Refresh list to update status
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update sync status');
    } finally {
      setSyncInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchContacts}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">WhatsApp Contacts</h2>
          <button
            onClick={fetchContacts}
            disabled={syncInProgress}
            className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
            title="Refresh contacts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          For each contact, you'll need to request sync and accept the room invite in your Matrix client to start receiving messages.
        </p>
      </div>
      
      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Name</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Type</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Last Message</th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm">
                  <div className="flex items-center">
                    {contact.profile_photo_url ? (
                      <img
                        src={contact.profile_photo_url}
                        alt=""
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-500">{contact.display_name?.[0]}</span>
                      </div>
                    )}
                    <div className="ml-4">
                      <div className="font-medium text-gray-900">{contact.display_name}</div>
                      <div className="text-gray-500">{contact.whatsapp_id}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {contact.is_group ? 'Group' : 'Contact'}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm">
                  <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                    contact.sync_status === 'approved' ? 'bg-green-100 text-green-800' :
                    contact.sync_status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {contact.sync_status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {contact.last_message_at ? new Date(contact.last_message_at).toLocaleString() : 'Never'}
                  {contact.unread_count > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {contact.unread_count}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-right space-x-2">
                  {contact.sync_status === 'pending' ? (
                    <>
                      <button
                        onClick={() => handleSyncApproval(contact.id, 'approved')}
                        disabled={syncInProgress}
                        className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleSyncApproval(contact.id, 'rejected')}
                        disabled={syncInProgress}
                        className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  ) : contact.sync_status === 'rejected' ? (
                    <button
                      onClick={() => handleSyncRequest(contact.id)}
                      disabled={syncInProgress}
                      className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      Request Sync
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WhatsAppContactList; 