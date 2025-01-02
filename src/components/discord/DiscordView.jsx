import React from 'react';
import { Outlet } from 'react-router-dom';

const DiscordView = () => {
  return (
    <div className="h-full">
      <Outlet />
    </div>
  );
};

export default DiscordView; 