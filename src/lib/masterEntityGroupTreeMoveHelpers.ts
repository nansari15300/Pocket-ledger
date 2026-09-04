import {
  BANK_ENTITY_GROUP_PRESET,
  EXPENSE_ENTITY_GROUP_PRESET,
  ITEM_ENTITY_GROUP_PRESET,
  PARTY_ENTITY_GROUP_PRESET,
  STAFF_ENTITY_GROUP_PRESET,
  TAX_ENTITY_GROUP_PRESET,
} from "@/lib/masterEntityGroupFormPresets";
import { createMasterEntityGroupTreeMoveHelpers } from "@/lib/masterEntityGroupTreeMove";

export const partyGroupTreeMove = createMasterEntityGroupTreeMoveHelpers(PARTY_ENTITY_GROUP_PRESET);
export const bankGroupTreeMove = createMasterEntityGroupTreeMoveHelpers(BANK_ENTITY_GROUP_PRESET);
export const staffGroupTreeMove = createMasterEntityGroupTreeMoveHelpers(STAFF_ENTITY_GROUP_PRESET);
export const taxGroupTreeMove = createMasterEntityGroupTreeMoveHelpers(TAX_ENTITY_GROUP_PRESET);
export const itemGroupTreeMove = createMasterEntityGroupTreeMoveHelpers(ITEM_ENTITY_GROUP_PRESET);
export const expenseGroupTreeMove = createMasterEntityGroupTreeMoveHelpers(EXPENSE_ENTITY_GROUP_PRESET);
