import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useAuth } from '../contexts/AuthContext';

const WhatsAppInvites = () => {
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();
  const { socket, isConnected } = useSocketConnection('whatsapp', {
    auth: {
      token: session?.access_token,
      userId: session?.user?.id
    }
  });

  // Fetch pending invites
  const fetchPendingInvites = async () => {
    try {
      const response = await api.get('/matrix/whatsapp/invites');
      setPendingInvites(response.data.data);
    } catch (error) {
      console.error('Error fetching invites:', error);
      toast.error('Failed to fetch room invites');
    } finally {
      setLoading(false);
    }
  };

  // Handle invite acceptance
  const handleAcceptInvite = async (roomId) => {
    try {
      await api.post('/matrix/whatsapp/accept-invite', { roomId });
      toast.success('Room invite accepted');
      // Remove from pending invites
      setPendingInvites(prev => prev.filter(invite => invite.roomId !== roomId));
    } catch (error) {
      console.error('Error accepting invite:', error);
      toast.error('Failed to accept room invite');
    }
  };

  // Listen for new invites
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNewInvite = (data) => {
      console.log('Received new room invite:', data);
      setPendingInvites(prev => [...prev, data]);
      toast.success(`New WhatsApp chat invite: ${data.roomName}`);
    };

    const handleRoomUpdate = (data) => {
      console.log('Room status updated:', data);
      if (data.status === 'accepted') {
        setPendingInvites(prev => prev.filter(invite => invite.roomId !== data.roomId));
      }
    };

    socket.on('whatsapp_room_invite', handleNewInvite);
    socket.on('whatsapp_room_update', handleRoomUpdate);

    return () => {
      socket.off('whatsapp_room_invite', handleNewInvite);
      socket.off('whatsapp_room_update', handleRoomUpdate);
    };
  }, [socket, isConnected]);

  // Initial fetch
  useEffect(() => {
    fetchPendingInvites();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (pendingInvites.length === 0) {
    return (
      <div className="text-center p-4 text-gray-500">
        No pending chat invites
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Pending WhatsApp Chat Invites</h3>
      <div className="grid gap-4">
        {pendingInvites.map((invite) => (
          <div
            key={invite.roomId}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200"
          >
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-medium">{invite.roomName}</h4>
                {invite.roomTopic && (
                  <p className="text-sm text-gray-500">{invite.roomTopic}</p>
                )}
                <p className="text-xs text-gray-400">
                  Received: {new Date(invite.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleAcceptInvite(invite.roomId)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WhatsAppInvites; 