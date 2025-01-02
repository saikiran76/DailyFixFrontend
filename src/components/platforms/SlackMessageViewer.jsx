// src/components/platforms/SlackMessageViewer.jsx
import React from 'react';

function SlackMessageViewer({ messages, activeComponent }) {
  if (activeComponent === 'summary') {
    return <div>Slack Summary of recent channels</div>;
  }

  if (activeComponent === 'details') {
    return <div>Slack Channel/Member Details</div>;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Slack Messages</h3>
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

export default SlackMessageViewer;
