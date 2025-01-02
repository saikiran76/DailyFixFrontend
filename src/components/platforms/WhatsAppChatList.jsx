// src/components/platforms/WhatsAppChatList.jsx
import React from 'react';

function WhatsAppChatList({ messages, onSelectRoom }) {
  const waMessages = messages.filter(m => m.platform === 'whatsapp');
  const roomsMap = {};
  for (const msg of waMessages) {
    if (!roomsMap[msg.roomId]) {
      roomsMap[msg.roomId] = { id: msg.roomId, lastMessage: msg };
    } else {
      if (msg.timestamp > roomsMap[msg.roomId].lastMessage.timestamp) {
        roomsMap[msg.roomId].lastMessage = msg;
      }
    }
  }
  const rooms = Object.values(roomsMap).sort((a,b) => b.lastMessage.timestamp - a.lastMessage.timestamp);

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">WhatsApp Chats</h2>
      <ul>
        {rooms.map(r => (
          <li key={r.id} className="mb-2 cursor-pointer hover:bg-dark-lighter p-2 rounded" onClick={() => onSelectRoom(r.id)}>
            <div className="font-medium">{r.id}</div>
            <div className="text-sm text-gray-400">{r.lastMessage.senderName}: {r.lastMessage.content}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default WhatsAppChatList;
