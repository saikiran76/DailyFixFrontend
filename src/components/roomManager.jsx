import React, { useState, useEffect } from 'react';
import axios from '../utils/axios';
import { FiUsers } from 'react-icons/fi';

const RoomManager = ({ onSelectRoom }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/rooms');
      setRooms(response.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-error text-center p-4">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rooms.map(room => (
        <div 
          key={room.id}
          onClick={() => onSelectRoom(room.id)}
          className="card hover:bg-dark cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${room.isActive ? 'bg-success' : 'bg-error'}`} />
              <span className="font-medium">{room.name}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <FiUsers className="text-lg" />
              <span>{room.memberCount}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RoomManager;