"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const GROUP_LIST_ACCOUNT_MOVE_HOLD_MS = 2000;

export const GROUP_LIST_ACCOUNT_MOVE_HOLD_HINT = `Click & hold for ${GROUP_LIST_ACCOUNT_MOVE_HOLD_MS / 1000} sec to move in another group.`;

export type GroupListMoveDropTarget = {
  groupId: string;
  hasChildGroups: boolean;
};

export type GroupListAccountMoveHint =
  | "hover-hold"
  | "drop-here"
  | "cancel"
  | null;

export type GroupListMemberMoveProps = {
  moveHoverHint?: string;
  moveHoldingHint?: string;
  moveActive?: boolean;
  onPointerDownCapture?: (e: React.PointerEvent) => void;
  onPointerMoveCapture?: (e: React.PointerEvent) => void;
  onPointerUpCapture?: (e: React.PointerEvent) => void;
  onPointerCancelCapture?: (e: React.PointerEvent) => void;
  onClickCapture?: (e: React.MouseEvent) => void;
};

type GroupListMoveItem<TAccount extends { id: string }> =
  | { kind: "account"; account: TAccount }
  | { kind: "group"; groupId: string };

const MOVE_CANCEL_PX = 14;

function findMoveDropTarget(el: Element | null): GroupListMoveDropTarget | null {
  if (!el) return null;
  const row = el.closest("[data-pl-group-move-drop-allowed='true']");
  if (!row) return null;
  const groupId = row.getAttribute("data-pl-group-move-target");
  if (!groupId) return null;
  return {
    groupId,
    hasChildGroups: row.getAttribute("data-pl-group-move-has-children") === "true",
  };
}

function clearDocumentSelection() {
  if (typeof window === "undefined") return;
  const sel = window.getSelection?.();
  if (sel && sel.rangeCount > 0) sel.removeAllRanges();
}

export function useGroupListAccountMove<TAccount extends { id: string }>(opts: {
  disabled?: boolean;
  holdMs?: number;
  collectMoveExpandIds?: (groupId: string) => Iterable<string>;
  isMoveTreeAncestorOf?: (ancestorId: string, descendantId: string) => boolean;
  isInvalidGroupDropTarget?: (sourceGroupId: string, targetGroupId: string) => boolean;
  canMoveAccount?: (account: TAccount) => boolean;
  canMoveGroup?: (groupId: string) => boolean;
  onMoveAccount: (account: TAccount, targetGroupId: string) => void | Promise<void>;
  onMoveGroup?: (sourceGroupId: string, targetGroupId: string) => void | Promise<void>;
  onAutoExpandGroup?: (groupId: string) => void;
  onAutoCollapseGroup?: (groupId: string) => void;
}) {
  const {
    disabled = false,
    holdMs = GROUP_LIST_ACCOUNT_MOVE_HOLD_MS,
    collectMoveExpandIds,
    isMoveTreeAncestorOf,
    isInvalidGroupDropTarget,
    canMoveAccount,
    canMoveGroup,
    onMoveAccount,
    onMoveGroup,
    onAutoExpandGroup,
    onAutoCollapseGroup,
  } = opts;

  const [movingItem, setMovingItem] = useState<GroupListMoveItem<TAccount> | null>(null);
  const [holdingItemKey, setHoldingItemKey] = useState<string | null>(null);
  const [moveHint, setMoveHint] = useState<GroupListAccountMoveHint>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<{
    x: number;
    y: number;
    item: GroupListMoveItem<TAccount>;
    pointerType: string;
  } | null>(null);
  const holdFiredRef = useRef(false);
  const suppressClickRef = useRef(false);
  const movingItemRef = useRef<GroupListMoveItem<TAccount> | null>(null);
  const lastHoverGroupRef = useRef<string | null>(null);

  const moveEnabled = !disabled && (Boolean(onMoveAccount) || Boolean(onMoveGroup));

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearHoldState = useCallback(() => {
    clearHoldTimer();
    holdStartRef.current = null;
    setHoldingItemKey(null);
  }, [clearHoldTimer]);

  const collapseHoverGroup = useCallback(
    (groupId: string | null) => {
      if (!groupId || !onAutoCollapseGroup) return;
      onAutoCollapseGroup(groupId);
    },
    [onAutoCollapseGroup]
  );

  const endMove = useCallback(() => {
    lastHoverGroupRef.current = null;
    movingItemRef.current = null;
    setMovingItem(null);
    setMoveHint(null);
    document.body.classList.remove("pl-group-account-move-active");
    document.body.style.cursor = "";
    clearDocumentSelection();
  }, []);

  const applyMoveHoverGroup = useCallback(
    (groupId: string | null) => {
      const prev = lastHoverGroupRef.current;
      if (prev === groupId) return;

      if (prev && groupId && isMoveTreeAncestorOf) {
        const prevIsAncestor = isMoveTreeAncestorOf(prev, groupId);
        const nextIsAncestor = isMoveTreeAncestorOf(groupId, prev);
        if (!prevIsAncestor && !nextIsAncestor) {
          collapseHoverGroup(prev);
        }
      } else if (prev && !groupId) {
        collapseHoverGroup(prev);
      }

      if (groupId && onAutoExpandGroup) {
        if (collectMoveExpandIds) {
          for (const ancestorId of collectMoveExpandIds(groupId)) {
            onAutoExpandGroup(ancestorId);
          }
        }
        onAutoExpandGroup(groupId);
      }

      lastHoverGroupRef.current = groupId;
    },
    [collectMoveExpandIds, collapseHoverGroup, isMoveTreeAncestorOf, onAutoExpandGroup]
  );

  const isDropTargetAllowed = useCallback(
    (targetGroupId: string) => {
      const item = movingItemRef.current;
      if (!item) return moveEnabled;
      if (item.kind === "account") return true;
      if (isInvalidGroupDropTarget) {
        return !isInvalidGroupDropTarget(item.groupId, targetGroupId);
      }
      if (item.groupId === targetGroupId) return false;
      if (isMoveTreeAncestorOf?.(item.groupId, targetGroupId)) return false;
      return true;
    },
    [isInvalidGroupDropTarget, isMoveTreeAncestorOf, moveEnabled]
  );

  const startMove = useCallback((item: GroupListMoveItem<TAccount>, x: number, y: number) => {
    setHoldingItemKey(null);
    lastHoverGroupRef.current = null;
    movingItemRef.current = item;
    setMovingItem(item);
    setCursor({ x, y });
    setMoveHint("cancel");
    document.body.classList.add("pl-group-account-move-active");
    document.body.style.cursor = "grabbing";
    clearDocumentSelection();
    updatePointerTargetRef.current(x, y);
  }, []);

  const updatePointerTarget = useCallback(
    (clientX: number, clientY: number) => {
      setCursor({ x: clientX, y: clientY });
      const target = findMoveDropTarget(document.elementFromPoint(clientX, clientY));
      if (!target || !isDropTargetAllowed(target.groupId)) {
        applyMoveHoverGroup(null);
        setMoveHint("cancel");
        return;
      }
      applyMoveHoverGroup(target.groupId);
      setMoveHint("drop-here");
    },
    [applyMoveHoverGroup, isDropTargetAllowed]
  );

  const updatePointerTargetRef = useRef(updatePointerTarget);
  updatePointerTargetRef.current = updatePointerTarget;

  useEffect(() => {
    if (!movingItem) return;

    const preventSelect = (e: Event) => {
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      clearDocumentSelection();
      updatePointerTarget(e.clientX, e.clientY);
    };

    const onPointerUp = async (e: PointerEvent) => {
      const item = movingItemRef.current;
      const target = findMoveDropTarget(document.elementFromPoint(e.clientX, e.clientY));
      const allowed = Boolean(item && target && isDropTargetAllowed(target.groupId));
      endMove();
      suppressClickRef.current = true;
      if (allowed && item && target) {
        try {
          if (item.kind === "account") {
            await onMoveAccount(item.account, target.groupId);
          } else {
            await onMoveGroup?.(item.groupId, target.groupId);
          }
        } catch (err) {
          console.error("group list move", err);
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") endMove();
    };

    document.addEventListener("selectstart", preventSelect);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("selectstart", preventSelect);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [movingItem, endMove, onMoveAccount, onMoveGroup, updatePointerTarget, isDropTargetAllowed]);

  const createHoldHandlers = useCallback(
    (item: GroupListMoveItem<TAccount>, moveAllowed: boolean, itemKey: string) => {
      if (!moveAllowed) return {};
      const isMovingThis =
        item.kind === "account"
          ? movingItem?.kind === "account" && movingItem.account.id === item.account.id
          : movingItem?.kind === "group" && movingItem.groupId === item.groupId;
      const isHoldingThis = holdingItemKey === itemKey;

      return {
        moveHoverHint: GROUP_LIST_ACCOUNT_MOVE_HOLD_HINT,
        moveHoldingHint: isHoldingThis ? "Keep holding…" : undefined,
        moveActive: Boolean(isMovingThis),
        onPointerDownCapture: (e: React.PointerEvent) => {
          if (movingItemRef.current) return;
          if (e.button !== 0) return;
          holdFiredRef.current = false;
          setHoldingItemKey(itemKey);
          holdStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            item,
            pointerType: e.pointerType,
          };
          clearHoldTimer();
          holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null;
            holdFiredRef.current = true;
            const start = holdStartRef.current;
            holdStartRef.current = null;
            if (!start) return;
            startMove(start.item, start.x, start.y);
          }, holdMs);
        },
        onPointerMoveCapture: (e: React.PointerEvent) => {
          if (movingItemRef.current) return;
          if (!holdStartRef.current || holdTimerRef.current === null) return;
          const isTouch =
            holdStartRef.current.pointerType === "touch" || e.pointerType === "touch";
          const cancelPx = isTouch ? 36 : MOVE_CANCEL_PX;
          const dx = e.clientX - holdStartRef.current.x;
          const dy = e.clientY - holdStartRef.current.y;
          if (dx * dx + dy * dy > cancelPx * cancelPx) {
            clearHoldState();
          }
        },
        onPointerUpCapture: () => {
          if (!holdFiredRef.current) clearHoldState();
          else holdStartRef.current = null;
        },
        onPointerCancelCapture: () => {
          if (!holdFiredRef.current) clearHoldState();
          else holdStartRef.current = null;
        },
        onClickCapture: (e: React.MouseEvent) => {
          if (suppressClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClickRef.current = false;
          }
        },
      } satisfies GroupListMemberMoveProps;
    },
    [movingItem, holdingItemKey, holdMs, clearHoldTimer, clearHoldState, startMove]
  );

  const getMemberRowProps = useCallback(
    (account: TAccount) => {
      const moveAllowed = moveEnabled && (canMoveAccount ? canMoveAccount(account) : true);
      return createHoldHandlers({ kind: "account", account }, moveAllowed, `account:${account.id}`);
    },
    [moveEnabled, canMoveAccount, createHoldHandlers]
  );

  const getGroupRowMoveProps = useCallback(
    (groupId: string) => {
      const moveAllowed = moveEnabled && Boolean(onMoveGroup) && (canMoveGroup ? canMoveGroup(groupId) : true);
      return createHoldHandlers({ kind: "group", groupId }, moveAllowed, `group:${groupId}`);
    },
    [moveEnabled, onMoveGroup, canMoveGroup, createHoldHandlers]
  );

  const getGroupRowDataAttrs = useCallback(
    (groupId: string, hasChildGroups: boolean, dropAllowedWhenIdle = false) => {
      const dropAllowed = movingItemRef.current
        ? isDropTargetAllowed(groupId)
        : dropAllowedWhenIdle;
      return {
        "data-pl-group-move-target": groupId,
        "data-pl-group-move-has-children": hasChildGroups ? "true" : "false",
        "data-pl-group-move-drop-allowed": dropAllowed ? "true" : "false",
      };
    },
    [isDropTargetAllowed]
  );

  const movingAccount =
    movingItem?.kind === "account" ? movingItem.account : null;

  return {
    movingAccount,
    movingItem,
    moveHint,
    cursor,
    getMemberRowProps,
    getGroupRowMoveProps,
    getGroupRowDataAttrs,
    isMoveMode: Boolean(movingItem),
  };
}
