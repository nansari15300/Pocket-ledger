
'use client'

import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";

export function useFeatureAccess(featureKey: string) {
  const { company } = useCompany();
  const { customUser } = useAuth();
  
  if (customUser?.role === 'SuperAdmin') return true;

  if (!company) return false;

  // Safely get the expiry date, whether it's a Firestore Timestamp or a JS Date object
  const rawExpiry = (company as any).planExpiry;
  const expiry = rawExpiry 
    ? (typeof rawExpiry.toDate === 'function' 
        ? rawExpiry.toDate() 
        : (rawExpiry.seconds 
            ? new Date(rawExpiry.seconds * 1000) 
            : new Date(rawExpiry)))
    : new Date("1970-01-01");

  const now = new Date();
  if (now > expiry) {
    return false; // Plan has expired
  }

  const settings = (company as any).settings || {};
  
  // Default to true if the feature key is not explicitly set to false
  return settings[featureKey] !== false;
}
