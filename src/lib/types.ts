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

export interface BudgetSettings {
  monthlyCents: number;
  categories: Record<string, number>; // categoryId -> limitCents
}

export interface StorageSnapshot {
  transactions: Transaction[];
  budget: BudgetSettings;
  storageMode: 'supabase' | 'local';
}
