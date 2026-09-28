import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { ChatRoomId } from '../types';

interface RoomContextType {
  currentRoomId: ChatRoomId;
  setCurrentRoomId: (roomId: ChatRoomId) => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const RoomProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRoomId, setCurrentRoomIdState] = useState<ChatRoomId>('inner-circle');

  const setCurrentRoomId = useCallback((roomId: ChatRoomId) => {
    setCurrentRoomIdState(roomId);
  }, []);

  // Memoized so consumers don't re-render on every provider render.
  const value = useMemo(
    () => ({ currentRoomId, setCurrentRoomId }),
    [currentRoomId, setCurrentRoomId]
  );

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = (): RoomContextType => {
  const context = useContext(RoomContext);
  if (context === undefined) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};
