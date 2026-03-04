"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useDeviceLimit } from "@/hooks/useDeviceLimit";

type DeviceLimitContextType = {
  deviceLimitReached: boolean;
  singleDeviceOnly: boolean;
  replaceOffer: boolean;
  noPermissionNewDevice: boolean;
  deviceCount: number;
  maxDevices: number;
  refreshDeviceCheck: () => void;
  performReplaceAndRefresh: () => Promise<void>;
};

const DeviceLimitContext = createContext<DeviceLimitContextType>({
  deviceLimitReached: false,
  singleDeviceOnly: false,
  replaceOffer: false,
  noPermissionNewDevice: false,
  deviceCount: 0,
  maxDevices: 1,
  refreshDeviceCheck: () => {},
  performReplaceAndRefresh: async () => {},
});

export function DeviceLimitProvider({ children }: { children: ReactNode }) {
  const { deviceLimitReached, singleDeviceOnly, replaceOffer, noPermissionNewDevice, deviceCount, maxDevices, refreshDeviceCheck, performReplaceAndRefresh } = useDeviceLimit();
  return (
    <DeviceLimitContext.Provider value={{ deviceLimitReached, singleDeviceOnly, replaceOffer, noPermissionNewDevice, deviceCount, maxDevices, refreshDeviceCheck, performReplaceAndRefresh }}>
      {children}
    </DeviceLimitContext.Provider>
  );
}

export function useDeviceLimitContext() {
  return useContext(DeviceLimitContext);
}
