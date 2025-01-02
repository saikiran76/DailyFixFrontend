import React, { useState, useEffect } from 'react';
// import { format } from 'date-fns';
// import axios from '../utils/axios';
// import { FiRefreshCw } from 'react-icons/fi';

const ChatList = ({ rooms, onSelectRoom }) => {
  if (!rooms || rooms.length === 0) {
    return <div className="p-6 text-center text-gray-400">No rooms found.</div>;
  }
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Conversations</h2>
      </div>
      <div className="overflow-y-auto overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-lighter">
              <th className="text-left py-4 px-6 text-gray-400 font-medium">Name</th>
              <th className="text-left py-4 px-6 text-gray-400 font-medium">Members</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(chat => (
              <tr
                key={chat.id}
                onClick={() => onSelectRoom(chat.id)}
                className="border-b border-dark-lighter hover:bg-dark-lighter cursor-pointer"
              >
                <td className="py-4 px-6 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-success"></div>
                  <span>{chat.name}</span>
                </td>
                <td className="py-4 px-6 text-gray-400">{chat.memberCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ChatList;

