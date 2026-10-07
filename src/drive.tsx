import { createContext, useContext } from 'react';

export interface DriveCtx {
  active: boolean;
  speed: number;
  start: () => void;
  stop: () => void;
}

export const DriveContext = createContext<DriveCtx>({ active: false, speed: 0, start: () => {}, stop: () => {} });
export const useDrive = () => useContext(DriveContext);
