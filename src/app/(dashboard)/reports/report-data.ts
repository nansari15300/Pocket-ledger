export type Report = {
  id: string;
  name: string;
  description: string;
};

export const reports: Report[] = [
  {
    id: "group-statement",
    name: "Group Summary",
    description: "View the transaction history for a specific group.",
  },
];