/**
 * Target account — A/c No / mobile se linked companies mein entity dhundho.
 * Sirf per-company reads (rules-safe) — collectionGroup global scan permission error deta hai.
 */
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { fetchInterCompanyEntitiesForCompany } from "@/lib/interCompany/fetchInterCompanyEntities";
import {
  filterInterCompanyEntitiesByBankAcNo,
  filterInterCompanyEntitiesByInterCoAcNo,
  filterInterCompanyEntitiesByPhone,
} from "@/lib/interCompany/interCompanyEntityLookup";
import {
  interCompanyAcNoPrefix,
  isValidInterCompanyAcNo,
  normalizeInterCompanyAcNo,
} from "@/lib/interCompany/interCompanyAccountNo";
import type { InterCompanyPartnerRow } from "@/lib/interCompany/useInterCompanyPartnerDirectory";

export type InterCompanyEntityHit = {
  companyId: string;
  companyName: string;
  entity: InterCompanyEntityDetail;
};

const entityCache = new Map<string, { ts: number; rows: InterCompanyEntityDetail[] }>();
const CACHE_MS = 90_000;

async function entitiesForPartner(partnerId: string): Promise<InterCompanyEntityDetail[]> {
  const hit = entityCache.get(partnerId);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.rows;
  const rows = await fetchInterCompanyEntitiesForCompany(partnerId);
  entityCache.set(partnerId, { ts: Date.now(), rows });
  return rows;
}

/** Prefixed entity A/c (P/B/S/T/E) — har allowed company ke masters scan (rules-safe) */
export async function findEntityHitByInterCoAcNo(
  rawAc: string,
  partners: InterCompanyPartnerRow[]
): Promise<InterCompanyEntityHit | null> {
  const norm = normalizeInterCompanyAcNo(rawAc);
  if (!isValidInterCompanyAcNo(norm)) return null;
  const prefix = interCompanyAcNoPrefix(norm);
  if (!prefix || prefix === "C") return null;

  let multiHit: InterCompanyEntityHit | null = null;
  for (const p of partners) {
    const rows = await entitiesForPartner(p.id);
    const hits = filterInterCompanyEntitiesByInterCoAcNo(rows, norm);
    if (hits.length === 1) {
      return { companyId: p.id, companyName: p.name, entity: hits[0]! };
    }
    if (hits.length > 1) {
      multiHit = { companyId: p.id, companyName: p.name, entity: hits[0]! };
    }
  }
  return multiHit;
}

/** Mobile — har linked company ke accounts scan */
export async function searchEntityHitsByMobile(
  mobileDigits: string,
  partners: InterCompanyPartnerRow[]
): Promise<InterCompanyEntityHit[]> {
  const out: InterCompanyEntityHit[] = [];
  await Promise.all(
    partners.map(async (p) => {
      const rows = await entitiesForPartner(p.id);
      for (const e of filterInterCompanyEntitiesByPhone(rows, mobileDigits)) {
        out.push({ companyId: p.id, companyName: p.name, entity: e });
      }
    })
  );
  return out;
}

/** Bank ledger A/c — linked companies par scan */
export async function searchEntityHitsByBankAcNo(
  raw: string,
  partners: InterCompanyPartnerRow[]
): Promise<InterCompanyEntityHit[]> {
  const out: InterCompanyEntityHit[] = [];
  await Promise.all(
    partners.map(async (p) => {
      const rows = await entitiesForPartner(p.id);
      for (const e of filterInterCompanyEntitiesByBankAcNo(rows, raw)) {
        out.push({ companyId: p.id, companyName: p.name, entity: e });
      }
    })
  );
  return out;
}

export function groupHitsByCompany(
  hits: InterCompanyEntityHit[]
): Map<string, InterCompanyEntityHit[]> {
  const map = new Map<string, InterCompanyEntityHit[]>();
  for (const h of hits) {
    const list = map.get(h.companyId) ?? [];
    list.push(h);
    map.set(h.companyId, list);
  }
  return map;
}
