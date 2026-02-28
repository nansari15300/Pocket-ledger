export type Invoice = {
  id: string;
  customer: string;
  email: string;
  date: string;
  dueDate: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
};

export const invoices: Invoice[] = [
  { id: 'INV-005', customer: 'Nexus Innovations', email: 'contact@nexus.com', date: '2024-07-20', dueDate: '2024-08-19', amount: 3000, status: 'Pending' },
  { id: 'INV-004', customer: 'Quantum Solutions', email: 'accounts@quantum.dev', date: '2024-07-15', dueDate: '2024-08-14', amount: 7500, status: 'Paid' },
  { id: 'INV-003', customer: 'Stellar Corp', email: 'finance@stellarcorp.net', date: '2024-06-10', dueDate: '2024-07-10', amount: 1200, status: 'Overdue' },
  { id: 'INV-002', customer: 'Apex Industries', email: 'billing@apex.io', date: '2024-06-05', dueDate: '2024-07-05', amount: 4500, status: 'Paid' },
  { id: 'INV-001', customer: 'Global Dynamics', email: 'pay@globaldynamics.com', date: '2024-05-25', dueDate: '2024-06-24', amount: 6000, status: 'Paid' },
];

export type Expense = {
  id: string;
  vendor: string;
  category: string;
  date: string;
  amount: number;
  status: 'Paid' | 'Unpaid';
};

export const expenses: Expense[] = [
  { id: 'EXP-005', vendor: 'Cloudflare', category: 'Software', date: '2024-07-22', amount: 200, status: 'Paid' },
  { id: 'EXP-004', vendor: 'WeWork', category: 'Office Rent', date: '2024-07-01', amount: 2500, status: 'Paid' },
  { id: 'EXP-003', vendor: 'Figma', category: 'Software', date: '2024-06-18', amount: 150, status: 'Paid' },
  { id: 'EXP-002', vendor: 'Amazon Web Services', category: 'Hosting', date: '2024-06-15', amount: 800, status: 'Paid' },
  { id: 'EXP-001', vendor: 'Staples', category: 'Office Supplies', date: '2024-05-30', amount: 120, status: 'Paid' },
];

export const chartData = [
  { month: 'Jan', revenue: 4000, expenses: 2400 },
  { month: 'Feb', revenue: 3000, expenses: 1398 },
  { month: 'Mar', revenue: 5000, expenses: 2800 },
  { month: 'Apr', revenue: 4780, expenses: 3908 },
  { month: 'May', revenue: 6890, expenses: 4800 },
  { month: 'Jun', revenue: 5390, expenses: 3800 },
  { month: 'Jul', revenue: 6490, expenses: 4300 },
];

export const totalRevenue = chartData.reduce((acc, item) => acc + item.revenue, 0);
export const totalExpenses = chartData.reduce((acc, item) => acc + item.expenses, 0);
