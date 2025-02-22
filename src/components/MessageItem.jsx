import React from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import logger from '../utils/logger';

const MessageItem = ({ message, currentUser }) => {
  const isOwnMessage = message.sender_id === currentUser?.id;
  const messageTime = message.timestamp ? format(new Date(message.timestamp), 'HH:mm') : '';
  
  // Ensure we have a valid message ID
  if (!message.message_id && !message.id) {
    logger.error('[MessageItem] Message without ID:', message);
    return null;
  }

  // Extract the actual content from the message
  const getMessageContent = (content) => {
    if (!content) return '';
    
    // If content is a string that looks like JSON, try to parse it
    if (typeof content === 'string' && content.startsWith('{')) {
      try {
        const parsed = JSON.parse(content);
        return parsed.body || parsed.content || content;
      } catch (e) {
        return content;
      }
    }
    
    // If content is an object with body property
    if (typeof content === 'object' && content.body) {
      return content.body;
    }
    
    // Otherwise return the content as is
    return content;
  };

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-2 ${
          isOwnMessage 
            ? 'bg-[#1e6853] text-white' 
            : 'bg-[#24283b] text-gray-200'
        }`}
      >
        {!isOwnMessage && (
          <div className="text-xs text-gray-400 mb-1">{message.sender_name}</div>
        )}
        <div className="break-words">{getMessageContent(message.content)}</div>
        <div className={`text-xs mt-1 ${isOwnMessage ? 'text-gray-300' : 'text-gray-400'}`}>
          {messageTime}
        </div>
      </div>
    </div>
  );
};

MessageItem.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.string,
    message_id: PropTypes.string,
    content: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.object
    ]).isRequired,
    sender_id: PropTypes.string.isRequired,
    sender_name: PropTypes.string,
    timestamp: PropTypes.string.isRequired,
    message_type: PropTypes.string.isRequired
  }).isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired
  })
};

export default MessageItem; 