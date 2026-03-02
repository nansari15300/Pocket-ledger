"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useDeviceLimit } from "@/hooks/useDeviceLimit";

type DeviceLimitContextType = {
  deviceLimitReached: boolean;
  singleDeviceOnly: boolean;
  replaceOffer: boolean;
  noPermissionNewDevice: boolean;
  wasKicked: boolean;
  deviceCount: number;
  maxDevices: number;
  refreshDeviceCheck: () => void;
  clearKickedAndRefresh: () => Promise<void>;
  performReplaceAndRefresh: () => Promise<void>;
};

const DeviceLimitContext = createContext<DeviceLimitContextType>({
  deviceLimitReached: false,
  singleDeviceOnly: false,
  replaceOffer: false,
  noPermissionNewDevice: false,
  wasKicked: false,
  deviceCount: 0,
  maxDevices: 1,
  refreshDeviceCheck: () => {},
  clearKickedAndRefresh: async () => {},
  performReplaceAndRefresh: async () => {},
});

export function DeviceLimitProvider({ children }: { children: ReactNode }) {
  const { deviceLimitReached, singleDeviceOnly, replaceOffer, noPermissionNewDevice, wasKicked, deviceCount, maxDevices, refreshDeviceCheck, clearKickedAndRefresh, performReplaceAndRefresh } = useDeviceLimit();
  return (
    <DeviceLimitContext.Provider value={{ deviceLimitReached, singleDeviceOnly, replaceOffer, noPermissionNewDevice, wasKicked, deviceCount, maxDevices, refreshDeviceCheck, clearKickedAndRefresh, performReplaceAndRefresh }}>
      {children}
    </DeviceLimitContext.Provider>
  );
}

export function useDeviceLimitContext() {
  return useContext(DeviceLimitContext);
}
