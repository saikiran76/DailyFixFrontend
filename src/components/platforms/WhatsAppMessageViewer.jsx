// src/components/platforms/WhatsAppMessageViewer.jsx
import React from 'react';

function WhatsAppMessageViewer({ messages, activeComponent }) {
  // If activeComponent is 'summary' or 'details', handle them. For now, show messages directly.
  
  if (activeComponent === 'summary') {
    return <div>WhatsApp Summary (AI-generated key topics and suggestions)</div>;
  }

  if (activeComponent === 'details') {
    return <div>WhatsApp Customer Details Panel</div>;
  }

  // Default 'messages' view
  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">WhatsApp Messages</h3>
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

export default WhatsAppMessageViewer;
