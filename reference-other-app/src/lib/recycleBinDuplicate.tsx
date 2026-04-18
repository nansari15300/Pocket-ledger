"use client";

import * as React from "react";
import { createRoot } from "react-dom/client";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DuplicateDecision = "active_exists" | "restored" | "create_new";

type ResolveDuplicateParams = {
  companyId: string;
  collectionName: string;
  name: string;
  entityLabel: string;
  fieldName?: string;
};

async function askRestoreChoiceInApp(entityLabel: string, name: string): Promise<boolean> {
  // Render a temporary in-app modal so we avoid browser-native confirm dialogs.
  return await new Promise<boolean>((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    let resolved = false;

    const cleanup = () => {
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };

    const finish = (choice: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(choice);
      cleanup();
    };

    function RestoreChoiceDialog() {
      const [open, setOpen] = React.useState(true);
      return (
        <AlertDialogPrimitive.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) finish(false);
          }}
        >
          <AlertDialogPrimitive.Portal>
            <AlertDialogPrimitive.Overlay
              className={cn(
                // Keep this duplicate-choice modal above all existing dialogs and blur whole page behind.
                "fixed inset-0 z-[2147483646] bg-black/45 backdrop-blur-sm"
              )}
            />
            <AlertDialogPrimitive.Content
              className={cn(
                "fixed left-1/2 top-1/2 z-[2147483647] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-2xl"
              )}
            >
              <AlertDialogPrimitive.Title className="text-lg font-semibold">
                {entityLabel} Found in Recycle Bin
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
                {entityLabel} "{name}" is in Recycle Bin. What would you like to do?
              </AlertDialogPrimitive.Description>
              <div className="mt-5 flex justify-end gap-2">
                <AlertDialogPrimitive.Cancel asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      finish(false);
                    }}
                  >
                    Create New
                  </Button>
                </AlertDialogPrimitive.Cancel>
                <AlertDialogPrimitive.Action asChild>
                  <Button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      finish(true);
                    }}
                  >
                    Restore
                  </Button>
                </AlertDialogPrimitive.Action>
              </div>
            </AlertDialogPrimitive.Content>
          </AlertDialogPrimitive.Portal>
        </AlertDialogPrimitive.Root>
      );
    }

    root.render(<RestoreChoiceDialog />);
  });
}

/**
 * Shared create-flow guard:
 * - Active duplicate => block creation
 * - Recycle-bin duplicate => ask user: Restore or Create New
 */
export async function resolveRecycleBinDuplicate({
  companyId,
  collectionName,
  name,
  entityLabel,
  fieldName = "name",
}: ResolveDuplicateParams): Promise<{ decision: DuplicateDecision; restoredId?: string }> {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) return { decision: "create_new" };

  const q = query(
    collection(firestore, `companies/${companyId}/${collectionName}`),
    where(fieldName, "==", trimmedName)
  );
  const snap = await getDocs(q);
  const docs = snap.docs;

  const active = docs.find((d) => (d.data() as any)?.isDeleted !== true);
  if (active) return { decision: "active_exists" };

  const recycled = docs.find((d) => (d.data() as any)?.isDeleted === true);
  if (!recycled) return { decision: "create_new" };

  // Ask choice in app dialog instead of browser alert.
  const shouldRestore = await askRestoreChoiceInApp(entityLabel, trimmedName);

  if (!shouldRestore) return { decision: "create_new" };

  await updateDoc(doc(firestore, `companies/${companyId}/${collectionName}`, recycled.id), {
    isDeleted: false,
    deletedAt: null,
    restoredAt: serverTimestamp(),
  });

  return { decision: "restored", restoredId: recycled.id };
}

