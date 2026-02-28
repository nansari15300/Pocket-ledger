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

export function useAnimationSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AnimationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setSettings(defaultSettings);
      setLoading(false);
      return;
    }

    const userDocRef = doc(firestore, "users", user.uid);
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
  }, [user?.uid]);

  return { settings, loading };
}
