export type Role =
  | 'SuperAdmin'
  | 'CompanyAdmin'
  | 'User'
  | 'Viewer'
  | 'data-entry'
  | 'accountant'
  | 'editor'
  | 'manager'
  | 'owner'
  | 'Distributor';
export const ROLES: Role[] = [
  'SuperAdmin',
  'CompanyAdmin',
  'User',
  'Viewer',
  'data-entry',
  'accountant',
  'editor',
  'manager',
  'owner',
  'Distributor',
];

export const canAccess = (userRole: Role | undefined, allowed: Role[]) => {
  if (!userRole) return false;
  if (userRole === 'SuperAdmin') return true;
  return allowed.includes(userRole);
};
