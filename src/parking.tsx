import { createContext, useContext } from 'react';

export const EndParkingContext = createContext<() => void>(() => {});
export const useEndParking = () => useContext(EndParkingContext);
