import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { toast } from 'react-hot-toast';

const MatrixMappings = ({ platform }) => {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matrixRooms, setMatrixRooms] = useState([]);
  const [platformChannels, setPlatformChannels] = useState([]);
  const [selectedMapping, setSelectedMapping] = useState({
    sourceChannel: '',
    targetRoom: ''
  });

  useEffect(() => {
    loadMappings();
    loadAvailableChannels();
  }, [platform]);

  const loadMappings = async () => {
    try {
      const response = await api.get(`/mappings/matrix/${platform}`);
      setMappings(response.data.mappings);
    } catch (error) {
      console.error('Error loading mappings:', error);
      toast.error('Failed to load channel mappings');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableChannels = async () => {
    try {
      // Load Matrix rooms
      const matrixResponse = await api.get('/matrix/rooms');
      setMatrixRooms(matrixResponse.data.rooms);

      // Load platform-specific channels
      const channelsResponse = await api.get(`/${platform}/channels`);
      setPlatformChannels(channelsResponse.data.channels);
    } catch (error) {
      console.error('Error loading channels:', error);
      toast.error('Failed to load available channels');
    }
  };

  const handleCreateMapping = async () => {
    try {
      const sourceChannel = platformChannels.find(
        ch => ch.id === selectedMapping.sourceChannel
      );
      const targetRoom = matrixRooms.find(
        room => room.id === selectedMapping.targetRoom
      );

      if (!sourceChannel || !targetRoom) {
        toast.error('Please select both source and target channels');
        return;
      }

      await api.post('/mappings/matrix', {
        sourceData: {
          platform,
          channelId: sourceChannel.id,
          name: sourceChannel.name
        },
        targetData: {
          roomId: targetRoom.id,
          name: targetRoom.name
        }
      });

      toast.success('Channel mapping created successfully');
      loadMappings();
      setSelectedMapping({ sourceChannel: '', targetRoom: '' });
    } catch (error) {
      console.error('Error creating mapping:', error);
      toast.error('Failed to create channel mapping');
    }
  };

  const handleDeleteMapping = async (mappingId) => {
    try {
      await api.delete(`/mappings/matrix/${mappingId}`);
      toast.success('Channel mapping deleted');
      loadMappings();
    } catch (error) {
      console.error('Error deleting mapping:', error);
      toast.error('Failed to delete channel mapping');
    }
  };

  if (loading) {
    return <div className="text-center">Loading mappings...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Channel Mappings</h2>
      
      {/* Create new mapping */}
      <div className="bg-dark-lighter p-4 rounded-lg space-y-4">
        <h3 className="text-lg">Create New Mapping</h3>
        <div className="grid grid-cols-2 gap-4">
          <select
            value={selectedMapping.sourceChannel}
            onChange={(e) => setSelectedMapping(prev => ({
              ...prev,
              sourceChannel: e.target.value
            }))}
            className="bg-dark border border-gray-700 rounded p-2"
          >
            <option value="">Select {platform} channel</option>
            {platformChannels.map(channel => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
          
          <select
            value={selectedMapping.targetRoom}
            onChange={(e) => setSelectedMapping(prev => ({
              ...prev,
              targetRoom: e.target.value
            }))}
            className="bg-dark border border-gray-700 rounded p-2"
          >
            <option value="">Select Matrix room</option>
            {matrixRooms.map(room => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleCreateMapping}
          className="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark"
        >
          Create Mapping
        </button>
      </div>

      {/* Existing mappings */}
      <div className="space-y-4">
        <h3 className="text-lg">Existing Mappings</h3>
        {mappings.length === 0 ? (
          <p className="text-gray-400">No mappings created yet</p>
        ) : (
          <div className="space-y-2">
            {mappings.map(mapping => (
              <div key={mapping._id} className="flex items-center justify-between bg-dark-lighter p-3 rounded">
                <div>
                  <span className="text-gray-400">{mapping.sourceName}</span>
                  <span className="mx-2">→</span>
                  <span className="text-gray-400">{mapping.targetName}</span>
                </div>
                <button
                  onClick={() => handleDeleteMapping(mapping._id)}
                  className="text-red-500 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatrixMappings; 