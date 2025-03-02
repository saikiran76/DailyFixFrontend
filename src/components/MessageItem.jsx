import React from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import logger from '../utils/logger';

const MessageItem = ({ message, currentUser }) => {
  // Check if sender is the current user (Matrix user)
  const isMatrixUser = message.sender_id?.includes('matrix') || message.sender_id === currentUser?.id;
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
    <div className={`flex ${isMatrixUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-2 ${
          isMatrixUser 
            ? 'bg-[#1e6853] text-white rounded-tr-none' // Dark green for user's messages
            : 'bg-[#24283b] text-gray-200 rounded-tl-none' // Gray for contact's messages
        }`}
      >
        <div className="text-xs text-gray-400 mb-1">
          {isMatrixUser ? 'You' : message.sender_name || 'Contact'}
        </div>
        <div className="break-words">{getMessageContent(message.content)}</div>
        <div className={`text-xs mt-1 ${isMatrixUser ? 'text-gray-300' : 'text-gray-400'}`}>
          {messageTime}
        </div>
      </div>
    </div>
  );
};

MessageItem.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    message_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    content: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    sender_id: PropTypes.string,
    sender_name: PropTypes.string,
    timestamp: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    status: PropTypes.string
  }).isRequired,
  currentUser: PropTypes.object.isRequired
};

export default MessageItem; 