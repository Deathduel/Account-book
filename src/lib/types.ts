export type TxType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  type: TxType;
  icon: string;
  color: string;
  isInvestment?: boolean;
}

export interface Transaction {
  id: number;
  type: TxType;
  amountCents: number;
  categoryId: string;
  date: string; // YYYY-MM-DD
  note: string;
  createdAt?: string;
}

export interface RecurringTemplate {
  id: string;
  type: TxType;
  categoryId: string;
  amountCents: number;
  note: string;
  dayOfMonth: number; // 1 - 28
}

export interface BudgetSettings {
  monthlyCents: number; // Global default monthly budget
  monthlyOverrides: Record<string, number>; // 'YYYY-MM' -> limitCents (per-month override)
  categories: Record<string, number>; // categoryId -> limitCents
  recurringTemplates: RecurringTemplate[]; // Fixed monthly bill templates
}

export interface StorageSnapshot {
  transactions: Transaction[];
  budget: BudgetSettings;
  storageMode: 'supabase' | 'local';
}
