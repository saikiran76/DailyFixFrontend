// src/components/platforms/TelegramMessageViewer.jsx
import React from 'react';

function TelegramMessageViewer({ messages, activeComponent }) {
  if (activeComponent === 'summary') {
    return <div>Telegram Summary of recent chats</div>;
  }

  if (activeComponent === 'details') {
    return <div>Telegram Contact/Group Details</div>;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Telegram Messages</h3>
      <div className="space-y-2">
        {messages.map(msg => (
          <div key={msg._id} className="p-2 bg-dark-lighter rounded">
            <div className="text-sm text-gray-300">{msg.senderName} ({msg.priority}):</div>
            <div>{msg.content}</div>
            <div className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TelegramMessageViewer;
