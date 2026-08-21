import { DEMO_FORK_META } from "@/lib/demoCompany/constants";

export type DemoCompanyDocSeed = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
};

export type DemoCompanyTemplateSeed = {
  companyRoot: Record<string, unknown>;
  docs: DemoCompanyDocSeed[];
};

/** Code-bound demo template — copied into each user's local SQLite fork. */
export function getDemoCompanyTemplateSeed(): DemoCompanyTemplateSeed {
  return {
    companyRoot: {
      id: "demo_template",
      name: "Demo Trading Co.",
      ownerId: "demo_owner",
      localOnly: true,
      localPersistence: "sqlite",
      firestoreSyncDisabled: true,
      storageOption: "local",
      syncPolicy: "offline",
      [DEMO_FORK_META.fork]: true,
      [DEMO_FORK_META.committed]: false,
    },
    docs: [
      {
        collection: "parties",
        id: "demo_party_a",
        data: {
          id: "demo_party_a",
          name: "Demo Party A",
          groupId: "sundry_debtors",
          balance: 125000,
        },
      },
      {
        collection: "parties",
        id: "demo_party_b",
        data: {
          id: "demo_party_b",
          name: "Demo Party B",
          groupId: "sundry_creditors",
          balance: -45000,
        },
      },
      {
        collection: "bank_accounts",
        id: "demo_bank_main",
        data: {
          id: "demo_bank_main",
          name: "Demo Bank",
          balance: 354300,
        },
      },
    ],
  };
}

export function remapDemoSeedForUserFork(
  template: DemoCompanyTemplateSeed,
  forkCompanyId: string,
  userId: string,
  userEmail?: string | null
): DemoCompanyTemplateSeed {
  const suffix = forkCompanyId.replace(/^demo_fork_/, "") || "user";

  const remapId = (seedId: string): string => {
    const base = seedId.replace(/^demo_/, "");
    return `demo_${suffix}_${base}`;
  };

  return {
    companyRoot: {
      ...template.companyRoot,
      id: forkCompanyId,
      name: "Demo Trading Co.",
      ownerId: userId,
      ownerEmail: userEmail ?? null,
      [DEMO_FORK_META.fork]: true,
      [DEMO_FORK_META.committed]: false,
    },
    docs: template.docs.map((docSeed) => {
      const id = remapId(docSeed.id);
      return {
        collection: docSeed.collection,
        id,
        data: {
          ...docSeed.data,
          id,
          companyId: forkCompanyId,
        },
      };
    }),
  };
}
