"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGate } from "@/contexts/GateContext";
import { gateTypeLabel } from "@/lib/gates/gateStore";
import { isLocalServerGate } from "@/lib/gates/gateRuntime";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { appNavHref } from "@/lib/appNavHref";
import {
  Check,
  ChevronDown,
  Cloud,
  DoorOpen,
  Loader2,
  Server,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

function gateIcon(type: GateRecord["type"]) {
  switch (type) {
    case "device":
      return Smartphone;
    case "online":
      return Cloud;
    case "local_server":
      return Server;
    default:
      return DoorOpen;
  }
}

export function CompanyPickerGateBar() {
  const router = useRouter();
  const {
    gates,
    activeGateId,
    activeGate,
    activeGateCreateHintText,
    setActiveGateId,
    testLocalServerGate,
  } = useGate();
  const [switching, setSwitching] = useState(false);

  const handlePickGate = async (gate: GateRecord) => {
    if (gate.id === activeGateId) return;
    setActiveGateId(gate.id);
    if (isLocalServerGate(gate)) {
      setSwitching(true);
      try {
        const test = await testLocalServerGate(gate.id);
        if (!test.ok) {
          toast({
            variant: "destructive",
            title: "Cannot load server companies",
            description: test.message,
          });
          return;
        }
        toast({
          title: "Gate changed",
          description: test.message,
        });
      } finally {
        setSwitching(false);
      }
      return;
    }
    toast({
      title: "Gate changed",
      description: `Showing companies from ${gate.label}.`,
    });
  };

  const ActiveIcon = gateIcon(activeGate.type);

  return (
    <div className="rounded-lg border border-dashed bg-muted/25 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">Active gate</Label>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs"
          onClick={() => router.push(appNavHref("/gate"))}
        >
          Manage gates
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-between gap-2 px-3 font-normal"
            disabled={switching}
            aria-label="Change active gate"
          >
            <span className="flex min-w-0 items-center gap-2">
              {switching ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <ActiveIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-left">
                <span className="font-medium">{activeGate.label}</span>
                <span className="text-muted-foreground"> · {gateTypeLabel(activeGate.type)}</span>
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {gates.map((gate) => {
            const Icon = gateIcon(gate.type);
            const isActive = gate.id === activeGateId;
            return (
              <DropdownMenuItem
                key={gate.id}
                className="flex items-center gap-2"
                onSelect={() => void handlePickGate(gate)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {gate.label}
                  <span className="text-muted-foreground"> · {gateTypeLabel(gate.type)}</span>
                </span>
                {isActive ? <Check className={cn("h-4 w-4 shrink-0 text-primary")} /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-[11px] leading-snug text-muted-foreground">{activeGateCreateHintText}</p>
    </div>
  );
}
