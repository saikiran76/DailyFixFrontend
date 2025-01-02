// src/components/platforms/TelegramChatList.jsx
import React from 'react';

function TelegramChatList({ messages, onSelectRoom }) {
  const tgMessages = messages.filter(m => m.platform === 'telegram');
  const roomsMap = {};
  for (const msg of tgMessages) {
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
      <h2 className="text-lg font-semibold mb-4">Telegram Chats</h2>
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

export default TelegramChatList;
