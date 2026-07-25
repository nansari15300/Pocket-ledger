"use client";

import { useEffect } from "react";
import { LOCAL_AUTH_CHANGED_EVENT } from "@/lib/localApiClient";
import { PL_GATE_CHANGED_EVENT } from "@/lib/gates/gateTypes";
import { PL_SERVER_ACCESS_CONTEXT_EVENT } from "@/lib/plServerAccessContext";
import {
  coldStartPlServerAuthoritativeReplayManager,
  drainPlServerAuthoritativePendingQueue,
  schedulePlServerAuthoritativeReplayDrain,
} from "@/lib/plServerAuthoritativeReplay";
import { PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED } from "@/lib/plServerAuthoritativePendingTypes";
import { authoritativePendingQueueNeedsReplayDrain } from "@/lib/plServerAuthoritativePendingQueue";

const REPLAY_POLL_MS = 30_000;

/** LAN client: drain authoritative pending queue when online / gate reconnects. */
export function PlServerAuthoritativeReplayManager() {
  useEffect(() => {
    void coldStartPlServerAuthoritativeReplayManager();

    const onOnline = () => schedulePlServerAuthoritativeReplayDrain("network_online");
    const onGate = () => schedulePlServerAuthoritativeReplayDrain("gate_changed");
    const onQueue = () => schedulePlServerAuthoritativeReplayDrain("queue_changed");

    window.addEventListener("online", onOnline);
    window.addEventListener(PL_GATE_CHANGED_EVENT, onGate);
    window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, onGate);
    window.addEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onGate);
    window.addEventListener(PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED, onQueue);

    const poll = window.setInterval(() => {
      void (async () => {
        if (!(await authoritativePendingQueueNeedsReplayDrain())) return;
        await drainPlServerAuthoritativePendingQueue("poll");
      })();
    }, REPLAY_POLL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener(PL_GATE_CHANGED_EVENT, onGate);
      window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, onGate);
      window.removeEventListener(PL_SERVER_ACCESS_CONTEXT_EVENT, onGate);
      window.removeEventListener(PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED, onQueue);
      window.clearInterval(poll);
    };
  }, []);

  return null;
}
