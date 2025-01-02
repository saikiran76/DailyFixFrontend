import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { toast } from 'react-hot-toast';

export default function RoomMapper({ platform, onMappingComplete }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadChannels();
  }, [platform]);

  const loadChannels = async () => {
    try {
      const response = await api.get(`/matrix/${platform}/channels`);
      setChannels(response.data.channels);
    } catch (error) {
      toast.error('Failed to load channels');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/matrix/rooms/map', {
        platform,
        channelId: selectedChannel,
        roomName: roomName || `${platform}-${selectedChannel}`
      });

      toast.success('Room mapped successfully');
      onMappingComplete?.();
    } catch (error) {
      toast.error('Failed to map room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Select Channel
        </label>
        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          required
        >
          <option value="">Select a channel</option>
          {channels.map(channel => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Matrix Room Name (optional)
        </label>
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          placeholder={`${platform}-channel`}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !selectedChannel}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Matrix Room'}
      </button>
    </form>
  );
} 