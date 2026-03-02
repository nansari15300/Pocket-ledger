"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useDeviceLimit } from "@/hooks/useDeviceLimit";

type DeviceLimitContextType = {
  deviceLimitReached: boolean;
  deviceCount: number;
  maxDevices: number;
};

const DeviceLimitContext = createContext<DeviceLimitContextType>({
  deviceLimitReached: false,
  deviceCount: 0,
  maxDevices: 1,
});

export function DeviceLimitProvider({ children }: { children: ReactNode }) {
  const { deviceLimitReached, deviceCount, maxDevices } = useDeviceLimit();
  return (
    <DeviceLimitContext.Provider value={{ deviceLimitReached, deviceCount, maxDevices }}>
      {children}
    </DeviceLimitContext.Provider>
  );
}

export function useDeviceLimitContext() {
  return useContext(DeviceLimitContext);
}
