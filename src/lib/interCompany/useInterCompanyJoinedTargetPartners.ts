"use client";

/**
 * Target company dropdown — my / shared / local (allCompanies) + system joined remotes.
 * Code / A/c / PAN resolve via Firebase (global); local-only mode uses device registry.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company } from "@/hooks/useCompany";
import { subscribeInterCompanyJoinSettings, loadInterCompanyJoinSettings } from "@/lib/interCompany/interCompanyJoinSettingsSync";
import {
  fetchInterCompanyPublicCompanyProfiles,
  type InterCompanyPublicProfileView,
} from "@/lib/interCompany/interCompanyPublicCompanyProfile";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import {
  buildInterCompanyPartnerDirectoryFromRows,
  mapCompanyToPartnerRow,
  type InterCompanyPartnerRow,
} from "@/lib/interCompany/useInterCompanyPartnerDirectory";
import {
  resolveInterCompanyGroupOwnerUid,
  subscribeInterCompanyGroups,
  type InterCompanyGroupDoc,
} from "@/lib/interCompany/interCompanyGroups";
import { subscribeLinkedPublicInterCompanySystems } from "@/lib/interCompany/interCompanyPublicSystemLinks";
import {
  subscribeAcceptedSystemJoinsForCompany,
  type AcceptedSystemJoinLink,
} from "@/lib/interCompany/interCompanySystemJoinRequest";
import {
  collectSystemJoinedTargetEntries,
} from "@/lib/interCompany/interCompanyTargetPartnersFromSystems";
import {
  lookupInterCompaniesByPanFirebase,
  lookupInterCompanyByAcNoFirebase,
  lookupInterCompanyByCompanyCodeFirebase,
} from "@/lib/interCompany/interCompanyFirebaseCompanyLookup";
import { isPureLocalInterCompanyCompanyFromShape } from "@/lib/interCompany/localInterCompanyPolicy";

/** Public profile → partner row (Inter Co. A/c company doc par hai — yahan sirf code/PAN/phone) */
function partnerRowFromPublicProfile(
  companyId: string,
  profile: InterCompanyPublicProfileView,
  systemNames: string[] = []
): InterCompanyPartnerRow {
  const pan =
    profile.pan && profile.pan !== "—"
      ? String(profile.pan)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
      : "";
  const mobile =
    profile.phone && profile.phone !== "—" ? normalizeInterCompanyPhone(profile.phone) : "";
  const companyCode =
    profile.companyCode && profile.companyCode !== "—" ? String(profile.companyCode).trim() : "";

  return {
    id: companyId,
    name: String(profile.name || companyId).trim(),
    acNo: "",
    companyCode,
    pan,
    mobile,
    isShared: true,
    systemNames: systemNames.length ? systemNames : undefined,
  };
}

function mergeJoinedIds(settings: { joinedCompanyIds: string[]; permanentJoinedCompanyIds: string[] }): string[] {
  return [...new Set([...settings.joinedCompanyIds, ...settings.permanentJoinedCompanyIds].filter(Boolean))];
}

function partnerKindLabel(c: Company): string[] | undefined {
  if (c.isOwned === false) return ["Shared"];
  if (isPureLocalInterCompanyCompanyFromShape(c)) return ["Local"];
  return ["My company"];
}

export function useInterCompanyJoinedTargetPartners(
  allCompanies: Company[] | undefined,
  sourceCompanyId: string | null | undefined,
  userId: string | null | undefined
) {
  const [sourceJoinedCompanyIds, setSourceJoinedCompanyIds] = useState<string[]>([]);
  const [joinedIdsByCompanyId, setJoinedIdsByCompanyId] = useState<Map<string, string[]>>(new Map());
  const [ownedGroups, setOwnedGroups] = useState<InterCompanyGroupDoc[]>([]);
  const [linkedPublicSystems, setLinkedPublicSystems] = useState<InterCompanyGroupDoc[]>([]);
  const [acceptedLinksForSource, setAcceptedLinksForSource] = useState<AcceptedSystemJoinLink[]>([]);
  const [profileRows, setProfileRows] = useState<InterCompanyPartnerRow[]>([]);
  const [firebaseExtraRows, setFirebaseExtraRows] = useState<InterCompanyPartnerRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const groupOwnerUid = useMemo(() => resolveInterCompanyGroupOwnerUid(userId), [userId]);

  const allSystems = useMemo(() => {
    const byId = new Map<string, InterCompanyGroupDoc>();
    for (const g of [...ownedGroups, ...linkedPublicSystems]) {
      if (g?.id) byId.set(g.id, g);
    }
    return [...byId.values()];
  }, [ownedGroups, linkedPublicSystems]);

  useEffect(() => {
    if (!sourceCompanyId) {
      setSourceJoinedCompanyIds([]);
      return;
    }
    return subscribeInterCompanyJoinSettings(
      sourceCompanyId,
      ({ settings }) => {
        setSourceJoinedCompanyIds(mergeJoinedIds(settings));
        setJoinedIdsByCompanyId((prev) => {
          const next = new Map(prev);
          next.set(sourceCompanyId, mergeJoinedIds(settings));
          return next;
        });
      },
      (err) => console.warn("[IC voucher] join settings subscribe:", err)
    );
  }, [sourceCompanyId]);

  useEffect(() => {
    if (!groupOwnerUid) {
      setOwnedGroups([]);
      return;
    }
    return subscribeInterCompanyGroups(groupOwnerUid, setOwnedGroups);
  }, [groupOwnerUid]);

  useEffect(() => {
    if (!groupOwnerUid) {
      setLinkedPublicSystems([]);
      return;
    }
    return subscribeLinkedPublicInterCompanySystems(groupOwnerUid, setLinkedPublicSystems);
  }, [groupOwnerUid]);

  useEffect(() => {
    if (!sourceCompanyId) {
      setAcceptedLinksForSource([]);
      return;
    }
    return subscribeAcceptedSystemJoinsForCompany(sourceCompanyId, setAcceptedLinksForSource);
  }, [sourceCompanyId]);

  useEffect(() => {
    const ownedIds = (allCompanies || [])
      .filter((c) => c?.id && c.isOwned !== false)
      .map((c) => c.id!);
    if (!ownedIds.length) {
      setJoinedIdsByCompanyId(new Map());
      return;
    }

    let cancelled = false;
    void Promise.all(
      ownedIds.map(async (id) => {
        const { settings } = await loadInterCompanyJoinSettings(id);
        return [id, mergeJoinedIds(settings)] as const;
      })
    ).then((rows) => {
      if (cancelled) return;
      setJoinedIdsByCompanyId(new Map(rows));
    });

    return () => {
      cancelled = true;
    };
  }, [allCompanies, sourceJoinedCompanyIds.join("|")]);

  const systemTargetEntries = useMemo(
    () =>
      sourceCompanyId
        ? collectSystemJoinedTargetEntries({
            sourceCompanyId,
            allCompanies,
            systems: allSystems,
            joinedIdsByCompanyId,
            acceptedLinksForSource,
          })
        : [],
    [sourceCompanyId, allCompanies, allSystems, joinedIdsByCompanyId, acceptedLinksForSource]
  );

  const systemPartnerIds = useMemo(
    () => systemTargetEntries.map((e) => e.partnerCompanyId),
    [systemTargetEntries]
  );

  useEffect(() => {
    if (!sourceCompanyId) {
      setProfileRows([]);
      return;
    }

    const localIds = new Set((allCompanies || []).map((c) => c?.id).filter(Boolean) as string[]);
    const missingIds = systemPartnerIds.filter((id) => id && id !== sourceCompanyId && !localIds.has(id));
    if (missingIds.length === 0) {
      setProfileRows([]);
      return;
    }

    const systemNamesByPartner = new Map(
      systemTargetEntries.map((e) => [e.partnerCompanyId, e.systemNames])
    );

    let cancelled = false;
    setProfilesLoading(true);
    void fetchInterCompanyPublicCompanyProfiles(missingIds).then((map) => {
      if (cancelled) return;
      const rows = missingIds
        .map((id) => {
          const profile = map.get(id);
          if (!profile) return null;
          return partnerRowFromPublicProfile(id, profile, systemNamesByPartner.get(id) || []);
        })
        .filter((r): r is InterCompanyPartnerRow => r != null);
      setProfileRows(rows);
      setProfilesLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [allCompanies, systemPartnerIds.join("|"), sourceCompanyId, systemTargetEntries]);

  const rememberFirebaseHit = useCallback((hit: InterCompanyPartnerRow) => {
    if (!hit?.id) return;
    setFirebaseExtraRows((prev) => {
      if (prev.some((r) => r.id === hit.id)) {
        return prev.map((r) => (r.id === hit.id ? { ...r, ...hit } : r));
      }
      return [...prev, hit];
    });
  }, []);

  const mergedAllRows = useMemo(() => {
    const byId = new Map<string, InterCompanyPartnerRow>();
    for (const c of allCompanies || []) {
      if (!c?.id) continue;
      const row = mapCompanyToPartnerRow(c);
      byId.set(row.id, {
        ...row,
        systemNames: partnerKindLabel(c),
      });
    }
    for (const row of profileRows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    for (const row of firebaseExtraRows) {
      const prev = byId.get(row.id);
      byId.set(row.id, prev ? { ...prev, ...row } : row);
    }
    return [...byId.values()];
  }, [allCompanies, profileRows, firebaseExtraRows]);

  /** Dropdown: my + shared + local + remote joined; source exclude; local↔online allowed */
  const joinedPartners = useMemo(() => {
    const systemNamesByPartner = new Map(
      systemTargetEntries.map((e) => [e.partnerCompanyId, e.systemNames])
    );
    const byId = new Map<string, InterCompanyPartnerRow>();

    for (const row of mergedAllRows) {
      if (!row.id || row.id === sourceCompanyId) continue;
      const systemNames = systemNamesByPartner.get(row.id);
      byId.set(row.id, {
        ...row,
        isShared: row.isShared || row.id !== sourceCompanyId,
        systemNames: systemNames?.length ? systemNames : row.systemNames,
      });
    }

    for (const partnerId of systemPartnerIds) {
      if (!partnerId || partnerId === sourceCompanyId || byId.has(partnerId)) continue;
      const accepted = acceptedLinksForSource.find((l) => l.partnerCompanyId === partnerId);
      if (accepted?.partnerCompanyName) {
        byId.set(partnerId, {
          id: partnerId,
          name: accepted.partnerCompanyName,
          acNo: "",
          companyCode: "",
          pan: "",
          mobile: "",
          isShared: true,
          systemNames: systemNamesByPartner.get(partnerId)?.length
            ? systemNamesByPartner.get(partnerId)!
            : [accepted.systemName],
        });
      }
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [
    mergedAllRows,
    systemPartnerIds,
    systemTargetEntries,
    acceptedLinksForSource,
    sourceCompanyId,
  ]);

  const directory = useMemo(
    () => buildInterCompanyPartnerDirectoryFromRows(mergedAllRows, joinedPartners),
    [mergedAllRows, joinedPartners]
  );

  const partnerRowById = useMemo(() => {
    const map = new Map<string, InterCompanyPartnerRow>();
    for (const row of mergedAllRows) map.set(row.id, row);
    for (const row of joinedPartners) map.set(row.id, row);
    return map;
  }, [mergedAllRows, joinedPartners]);

  const optionLabel = useCallback((p: InterCompanyPartnerRow) => {
    if (p.systemNames?.length) return `${p.name} (${p.systemNames[0]})`;
    return p.name;
  }, []);

  const comboboxOptions = useMemo(
    () => joinedPartners.map((p) => ({ value: p.id, label: optionLabel(p) })),
    [joinedPartners, optionLabel]
  );

  const comboboxOptionsIncluding = useCallback(
    (extraCompanyIds: string[]) => {
      const opts = [...comboboxOptions];
      const seen = new Set(opts.map((o) => o.value));
      for (const id of extraCompanyIds) {
        if (!id || seen.has(id)) continue;
        const row = mergedAllRows.find((p) => p.id === id) || partnerRowById.get(id);
        if (!row) continue;
        opts.unshift({ value: row.id, label: optionLabel(row) });
        seen.add(id);
      }
      return opts;
    },
    [comboboxOptions, mergedAllRows, partnerRowById, optionLabel]
  );

  const resolveCompanyIdByCompanyCodeAsync = useCallback(
    async (typed: string): Promise<string | null> => {
      const hit = await lookupInterCompanyByCompanyCodeFirebase(typed);
      if (hit && hit.id !== sourceCompanyId) {
        rememberFirebaseHit(hit);
        return hit.id;
      }
      // Local / shared already on device — Firebase miss par dropdown list se
      return directory.resolveCompanyIdByCompanyCode(typed);
    },
    [directory, rememberFirebaseHit, sourceCompanyId]
  );

  const resolveCompanyIdByAcNoAsync = useCallback(
    async (typed: string): Promise<string | null> => {
      const hit = await lookupInterCompanyByAcNoFirebase(typed);
      if (hit && hit.id !== sourceCompanyId) {
        rememberFirebaseHit(hit);
        return hit.id;
      }
      return directory.resolveCompanyIdByAcNo(typed);
    },
    [directory, rememberFirebaseHit, sourceCompanyId]
  );

  const resolveCompaniesByPanAsync = useCallback(
    async (typed: string): Promise<InterCompanyPartnerRow[]> => {
      const hits = (await lookupInterCompaniesByPanFirebase(typed)).filter(
        (h) => h.id && h.id !== sourceCompanyId
      );
      for (const hit of hits) rememberFirebaseHit(hit);
      if (hits.length) return hits;
      return directory.resolveCompaniesByPan(typed).filter((h) => h.id !== sourceCompanyId);
    },
    [directory, rememberFirebaseHit, sourceCompanyId]
  );

  return {
    ...directory,
    comboboxOptions,
    comboboxOptionsIncluding,
    resolveCompanyIdByCompanyCodeAsync,
    resolveCompanyIdByAcNoAsync,
    resolveCompaniesByPanAsync,
    joinedCompanyIds: joinedPartners.map((p) => p.id),
    joinedPartners,
    profilesLoading,
    partnerRowById,
  };
}
