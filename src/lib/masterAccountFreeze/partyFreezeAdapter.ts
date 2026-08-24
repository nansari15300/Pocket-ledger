import type { Party } from "@/components/party/types";
import type { MasterAccountFreezeFields } from "@/lib/masterAccountFreeze/types";
import {
  masterAccountFreezePatchFromSave,
  PARTY_FREEZE_COLLECTION,
} from "@/lib/masterAccountFreeze/freezeAdapter";

export { PARTY_FREEZE_COLLECTION };
export type PartyFreezePatch = Partial<Party> & MasterAccountFreezeFields;

export function partyFreezePatchFromSave(input: {
  isFrozen: boolean;
  freezeMessage?: string | null;
}): PartyFreezePatch {
  return masterAccountFreezePatchFromSave(input);
}
