import React from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';

const MessageItem = ({ message, currentUser }) => {
  const isOwnMessage = message.sender_id === currentUser?.id;
  const messageTime = message.created_at ? format(new Date(message.created_at), 'HH:mm') : '';

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-2 ${
          isOwnMessage 
            ? 'bg-[#1e6853] text-white' 
            : 'bg-[#24283b] text-gray-200'
        }`}
      >
        <div className="break-words">{message.content}</div>
        <div className={`text-xs mt-1 ${isOwnMessage ? 'text-gray-300' : 'text-gray-400'}`}>
          {messageTime}
        </div>
      </div>
    </div>
  );
};

MessageItem.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    content: PropTypes.string.isRequired,
    sender_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    created_at: PropTypes.string,
    status: PropTypes.string
  }).isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired
  })
};

export default MessageItem; 