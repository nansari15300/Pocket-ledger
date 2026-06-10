"use client";

/**
 * Target company dropdown — saare system cards ke joined partners + public profile resolve.
 * Label: Company Name (System Name).
 */
import { useEffect, useMemo, useState } from "react";
import type { Company } from "@/hooks/useCompany";
import { subscribeInterCompanyJoinSettings, loadInterCompanyJoinSettings } from "@/lib/interCompany/interCompanyJoinSettingsSync";
import {
  fetchInterCompanyPublicCompanyProfiles,
  type InterCompanyPublicProfileView,
} from "@/lib/interCompany/interCompanyPublicCompanyProfile";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import {
  buildInterCompanyPartnerDirectoryFromRows,
  interCompanyPartnerRowFromCompanies,
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
  const [profilesLoading, setProfilesLoading] = useState(false);

  const groupOwnerUid = useMemo(() => resolveInterCompanyGroupOwnerUid(userId), [userId]);

  const sourceIsPureLocal = useMemo(() => {
    if (!sourceCompanyId) return false;
    const row = (allCompanies || []).find((c) => c?.id === sourceCompanyId);
    return row ? isPureLocalInterCompanyCompanyFromShape(row) : false;
  }, [allCompanies, sourceCompanyId]);

  const allSystems = useMemo(() => {
    const byId = new Map<string, InterCompanyGroupDoc>();
    for (const g of [...ownedGroups, ...linkedPublicSystems]) {
      if (g?.id) byId.set(g.id, g);
    }
    return [...byId.values()];
  }, [ownedGroups, linkedPublicSystems]);

  // Source company join settings — realtime refresh
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

  // User ke system cards — owned + linked public
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

  // Accepted joins — system name label ke liye
  useEffect(() => {
    if (!sourceCompanyId) {
      setAcceptedLinksForSource([]);
      return;
    }
    return subscribeAcceptedSystemJoinsForCompany(sourceCompanyId, setAcceptedLinksForSource);
  }, [sourceCompanyId]);

  // Har owned company ke joined ids — har system card se partners collect karne ke liye
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

  const targetPartnerIds = useMemo(
    () => systemTargetEntries.map((e) => e.partnerCompanyId),
    [systemTargetEntries]
  );

  // Joined ids jo local registry me nahi — public profile se naam/code load
  useEffect(() => {
    if (!sourceCompanyId) {
      setProfileRows([]);
      return;
    }

    const localIds = new Set((allCompanies || []).map((c) => c?.id).filter(Boolean) as string[]);
    const missingIds = targetPartnerIds.filter((id) => id && id !== sourceCompanyId && !localIds.has(id));
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
  }, [allCompanies, targetPartnerIds.join("|"), sourceCompanyId, systemTargetEntries]);

  const mergedAllRows = useMemo(() => {
    const byId = new Map<string, InterCompanyPartnerRow>();
    for (const c of allCompanies || []) {
      if (!c?.id) continue;
      const row = interCompanyPartnerRowFromCompanies(allCompanies, c.id);
      if (row) byId.set(row.id, row);
    }
    for (const row of profileRows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    return [...byId.values()];
  }, [allCompanies, profileRows]);

  const joinedPartners = useMemo(() => {
    const systemNamesByPartner = new Map(
      systemTargetEntries.map((e) => [e.partnerCompanyId, e.systemNames])
    );

    return targetPartnerIds
      .map((partnerId) => {
        if (sourceIsPureLocal) {
          const shape = (allCompanies || []).find((c) => c?.id === partnerId);
          if (!shape || !isPureLocalInterCompanyCompanyFromShape(shape)) return null;
        }
        const local = mergedAllRows.find((r) => r.id === partnerId);
        const systemNames = systemNamesByPartner.get(partnerId) || [];
        if (local) {
          return {
            ...local,
            isShared: local.isShared || partnerId !== sourceCompanyId,
            systemNames: systemNames.length ? systemNames : local.systemNames,
          };
        }
        const accepted = acceptedLinksForSource.find((l) => l.partnerCompanyId === partnerId);
        if (accepted?.partnerCompanyName) {
          const row: InterCompanyPartnerRow = {
            id: partnerId,
            name: accepted.partnerCompanyName,
            acNo: "",
            companyCode: "",
            pan: "",
            mobile: "",
            isShared: true,
            systemNames: systemNames.length ? systemNames : [accepted.systemName],
          };
          return row;
        }
        return null;
      })
      .filter((r): r is InterCompanyPartnerRow => r != null);
  }, [
    targetPartnerIds,
    mergedAllRows,
    systemTargetEntries,
    acceptedLinksForSource,
    sourceCompanyId,
    sourceIsPureLocal,
    allCompanies,
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

  return {
    ...directory,
    joinedCompanyIds: targetPartnerIds,
    joinedPartners,
    profilesLoading,
    partnerRowById,
  };
}
