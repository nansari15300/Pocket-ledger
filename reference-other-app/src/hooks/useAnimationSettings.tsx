"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "./useAuth";

type AnimationSettings = {
  numbers: {
    enabled: boolean;
    duration: number;
  };
  rows: {
    enabled: boolean;
    duration: number;
  };
};

const defaultSettings: AnimationSettings = {
  numbers: { enabled: true, duration: 2.5 },
  rows: { enabled: true, duration: 2.5 },
};

const ANIMATION_SETTINGS_CHANNEL = "pocket-ledger-animation-settings";

export function useAnimationSettings() {
  const { user, customUser } = useAuth();
  const userDocId = customUser?.userDocId || user?.uid;
  const [settings, setSettings] = useState<AnimationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userDocId) {
      setSettings(defaultSettings);
      setLoading(false);
      return;
    }

    const userDocRef = doc(firestore, "users", userDocId);
    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          const userSettings = userData.animationSettings;
          if (userSettings) {
            setSettings({
              numbers: { ...defaultSettings.numbers, ...userSettings.numbers },
              rows: { ...defaultSettings.rows, ...userSettings.rows },
            });
          } else {
            setSettings(defaultSettings);
          }
        } else {
          setSettings(defaultSettings);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error loading user animation settings:", error);
        setSettings(defaultSettings);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userDocId]);

  // Live update across tabs: when another tab saves animation settings, apply here immediately
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(ANIMATION_SETTINGS_CHANNEL);
    const handler = (e: MessageEvent) => {
      const payload = e?.data;
      if (payload && typeof payload.numbers === "object" && typeof payload.rows === "object") {
        setSettings({
          numbers: { ...defaultSettings.numbers, ...payload.numbers },
          rows: { ...defaultSettings.rows, ...payload.rows },
        });
      }
    };
    channel.addEventListener("message", handler);
    return () => {
      channel.removeEventListener("message", handler);
      channel.close();
    };
  }, []);

  return { settings, loading };
}
