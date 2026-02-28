export type Report = {
  id: string;
  name: string;
  description: string;
};

export const reports: Report[] = [
  {
    id: "accounts-statement",
    name: "Account Summary",
    description: "View all accounts and account groups in a tree structure.",
  },
  {
    id: "group-statement",
    name: "Group Summary",
    description: "View the transaction history for a specific group.",
  },
];