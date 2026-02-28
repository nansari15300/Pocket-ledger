"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useDeviceLimit } from "@/hooks/useDeviceLimit";

type DeviceLimitContextType = {
  deviceLimitReached: boolean;
  singleDeviceOnly: boolean;
  deviceCount: number;
  maxDevices: number;
};

const DeviceLimitContext = createContext<DeviceLimitContextType>({
  deviceLimitReached: false,
  singleDeviceOnly: false,
  deviceCount: 0,
  maxDevices: 1,
});

export function DeviceLimitProvider({ children }: { children: ReactNode }) {
  const { deviceLimitReached, singleDeviceOnly, deviceCount, maxDevices } = useDeviceLimit();
  return (
    <DeviceLimitContext.Provider value={{ deviceLimitReached, singleDeviceOnly, deviceCount, maxDevices }}>
      {children}
    </DeviceLimitContext.Provider>
  );
}

export function useDeviceLimitContext() {
  return useContext(DeviceLimitContext);
}
