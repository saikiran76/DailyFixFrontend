import React, { useState, useEffect } from 'react';
import axios from '../utils/axios';
import { FiUser, FiMail, FiClock, FiCalendar } from 'react-icons/fi';

const Settings = ({ user }) => {
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    role: '',
    lastLogin: '',
    createdAt: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get('/admin/profile');
      setProfile(response.data);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h2 className="text-2xl font-semibold">Admin Settings</h2>
      
      <div className="card space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-2xl font-semibold">
            {profile.name?.charAt(0) || 'A'}
          </div>
          <div>
            <h3 className="text-xl font-medium">{profile.name || 'Admin User'}</h3>
            <span className="px-2 py-1 bg-primary/20 text-primary rounded-full text-sm">
              {profile.role}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-gray-400">
              <FiMail className="text-lg" />
              Email
            </label>
            <div className="font-medium">{profile.email}</div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-gray-400">
              <FiUser className="text-lg" />
              Role
            </label>
            <div className="font-medium">{profile.role}</div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-gray-400">
              <FiClock className="text-lg" />
              Last Login
            </label>
            <div className="font-medium">
              {new Date(profile.lastLogin).toLocaleString()}
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-gray-400">
              <FiCalendar className="text-lg" />
              Account Created
            </label>
            <div className="font-medium">
              {new Date(profile.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="text-xl font-semibold">Matrix Connection</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-gray-400">User ID</label>
            <div className="font-medium font-mono bg-dark p-2 rounded">
              {process.env.MATRIX_USER_ID}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-gray-400">Room ID</label>
            <div className="font-medium font-mono bg-dark p-2 rounded">
              {process.env.MATRIX_ROOM_ID}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;