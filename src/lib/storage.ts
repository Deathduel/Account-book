import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  BudgetSettings,
  RecurringTemplate,
  StorageSnapshot,
  Transaction,
  TxType,
} from './types';

interface LocalStoreFile {
  nextId: number;
  transactions: Transaction[];
  budget: BudgetSettings;
}

const DEFAULT_BUDGET: BudgetSettings = {
  monthlyCents: 200000,
  monthlyOverrides: {},
  categories: {},
  recurringTemplates: [],
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');

let cachedSbKey = '';
let cachedSbClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const sig = `${url}|${key}`;
  if (cachedSbClient && cachedSbKey === sig) return cachedSbClient;
  cachedSbKey = sig;
  cachedSbClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedSbClient;
}

export function getStorageMode(): 'supabase' | 'local' {
  return getSupabaseClient() ? 'supabase' : 'local';
}

function unpackBudgetRow(
  monthlyCentsRaw: unknown,
  rawJson: unknown,
  directOverrides?: unknown,
  directTemplates?: unknown,
): BudgetSettings {
  const monthlyCents = Math.max(0, Math.round(Number(monthlyCentsRaw ?? 200000)));
  const obj =
    rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson)
      ? (rawJson as Record<string, unknown>)
      : {};

  const categories: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('__')) continue;
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n > 0) categories[k] = n;
  }

  const rawOverrides =
    directOverrides && typeof directOverrides === 'object'
      ? directOverrides
      : obj.__monthlyOverrides;
  const monthlyOverrides: Record<string, number> = {};
  if (rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)) {
    for (const [k, v] of Object.entries(rawOverrides as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}$/.test(k)) {
        const n = Math.round(Number(v));
        if (Number.isFinite(n) && n >= 0) monthlyOverrides[k] = n;
      }
    }
  }

  const rawTemplates = Array.isArray(directTemplates)
    ? directTemplates
    : Array.isArray(obj.__recurringTemplates)
    ? obj.__recurringTemplates
    : [];
  const recurringTemplates: RecurringTemplate[] = [];
  for (const item of rawTemplates) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<RecurringTemplate>;
    const amt = Math.round(Number(r.amountCents ?? 0));
    const day = Math.min(28, Math.max(1, Math.round(Number(r.dayOfMonth ?? 1))));
    if (
      r.id &&
      (r.type === 'expense' || r.type === 'income') &&
      r.categoryId &&
      Number.isFinite(amt) &&
      amt > 0
    ) {
      recurringTemplates.push({
        id: String(r.id),
        type: r.type,
        categoryId: String(r.categoryId),
        amountCents: amt,
        note: String(r.note || '').trim().slice(0, 100),
        dayOfMonth: day,
      });
    }
  }

  return { monthlyCents, monthlyOverrides, categories, recurringTemplates };
}

function packBudgetJson(budget: BudgetSettings): Record<string, unknown> {
  return {
    ...budget.categories,
    __monthlyOverrides: budget.monthlyOverrides,
    __recurringTemplates: budget.recurringTemplates,
  };
}

async function readLocalStore(): Promise<LocalStoreFile> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreFile>;
    const txs = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    const maxId = txs.reduce((m, t) => Math.max(m, t.id || 0), 0);
    const b = parsed.budget;
    return {
      nextId: Math.max(parsed.nextId || 1, maxId + 1),
      transactions: txs,
      budget: b
        ? unpackBudgetRow(b.monthlyCents, b.categories, b.monthlyOverrides, b.recurringTemplates)
        : { ...DEFAULT_BUDGET },
    };
  } catch {
    return {
      nextId: 1,
      transactions: [],
      budget: { ...DEFAULT_BUDGET },
    };
  }
}

async function writeLocalStore(data: LocalStoreFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpFile, DATA_FILE);
}

export async function pingStorage(): Promise<{ storageMode: 'supabase' | 'local'; dbOk: boolean }> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('budgets').select('id').limit(1);
    if (error) throw new Error(`Supabase ping error: ${error.message}`);
    return { storageMode: 'supabase', dbOk: true };
  }
  await readLocalStore();
  return { storageMode: 'local', dbOk: true };
}

const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_MAX_PAGES = 200; // up to 200,000 transactions

async function fetchAllSupabaseTransactions(sb: SupabaseClient): Promise<Transaction[]> {
  const all: Transaction[] = [];
  for (let page = 0; page < SUPABASE_MAX_PAGES; page++) {
    const from = page * SUPABASE_PAGE_SIZE;
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await sb
      .from('transactions')
      .select('id, type, amount_cents, category_id, occurred_on, note, created_at')
      .order('occurred_on', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) throw new Error(`Supabase transactions error: ${error.message}`);
    const rows = data || [];
    for (const row of rows) {
      all.push({
        id: Number(row.id),
        type: row.type as TxType,
        amountCents: Number(row.amount_cents),
        categoryId: String(row.category_id),
        date: String(row.occurred_on).slice(0, 10),
        note: String(row.note || ''),
        createdAt: row.created_at ? String(row.created_at) : undefined,
      });
    }
    if (rows.length < SUPABASE_PAGE_SIZE) break;
  }
  return all;
}

export async function getSnapshot(): Promise<StorageSnapshot> {
  const sb = getSupabaseClient();
  if (sb) {
    const [transactions, budgetRes] = await Promise.all([
      fetchAllSupabaseTransactions(sb),
      sb.from('budgets').select('monthly_cents, categories').eq('id', 'default').maybeSingle(),
    ]);

    if (budgetRes.error) throw new Error(`Supabase budgets error: ${budgetRes.error.message}`);

    const budget = budgetRes.data
      ? unpackBudgetRow(budgetRes.data.monthly_cents, budgetRes.data.categories)
      : { ...DEFAULT_BUDGET };

    return { transactions, budget, storageMode: 'supabase' };
  }

  const local = await readLocalStore();
  const sorted = [...local.transactions].sort((a, b) =>
    a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date),
  );
  return { transactions: sorted, budget: local.budget, storageMode: 'local' };
}

export interface CreateTxInput {
  type: TxType;
  amountCents: number;
  categoryId: string;
  date: string;
  note: string;
}

export async function createTransaction(input: CreateTxInput): Promise<Transaction> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from('transactions')
      .insert({
        type: input.type,
        amount_cents: input.amountCents,
        category_id: input.categoryId,
        occurred_on: input.date,
        note: input.note,
      })
      .select('id, type, amount_cents, category_id, occurred_on, note, created_at')
      .single();

    if (error) throw new Error(`Supabase insert error: ${error.message}`);
    return {
      id: Number(data.id),
      type: data.type as TxType,
      amountCents: Number(data.amount_cents),
      categoryId: String(data.category_id),
      date: String(data.occurred_on).slice(0, 10),
      note: String(data.note || ''),
      createdAt: data.created_at ? String(data.created_at) : undefined,
    };
  }

  const local = await readLocalStore();
  const created: Transaction = {
    id: local.nextId++,
    type: input.type,
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    date: input.date,
    note: input.note,
    createdAt: new Date().toISOString(),
  };
  local.transactions.unshift(created);
  await writeLocalStore(local);
  return created;
}

export async function updateTransaction(
  id: number,
  patch: Partial<CreateTxInput>,
): Promise<Transaction | null> {
  const sb = getSupabaseClient();
  if (sb) {
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.type !== undefined) updatePayload.type = patch.type;
    if (patch.amountCents !== undefined) updatePayload.amount_cents = patch.amountCents;
    if (patch.categoryId !== undefined) updatePayload.category_id = patch.categoryId;
    if (patch.date !== undefined) updatePayload.occurred_on = patch.date;
    if (patch.note !== undefined) updatePayload.note = patch.note;

    const { data, error } = await sb
      .from('transactions')
      .update(updatePayload)
      .eq('id', id)
      .select('id, type, amount_cents, category_id, occurred_on, note, created_at')
      .maybeSingle();

    if (error) throw new Error(`Supabase update error: ${error.message}`);
    if (!data) return null;
    return {
      id: Number(data.id),
      type: data.type as TxType,
      amountCents: Number(data.amount_cents),
      categoryId: String(data.category_id),
      date: String(data.occurred_on).slice(0, 10),
      note: String(data.note || ''),
      createdAt: data.created_at ? String(data.created_at) : undefined,
    };
  }

  const local = await readLocalStore();
  const idx = local.transactions.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  local.transactions[idx] = { ...local.transactions[idx], ...patch };
  await writeLocalStore(local);
  return local.transactions[idx];
}

export async function deleteTransaction(id: number): Promise<boolean> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw new Error(`Supabase delete error: ${error.message}`);
    return true;
  }

  const local = await readLocalStore();
  const before = local.transactions.length;
  local.transactions = local.transactions.filter((t) => t.id !== id);
  if (local.transactions.length === before) return false;
  await writeLocalStore(local);
  return true;
}

export async function deleteTransactionsBatch(ids: number[]): Promise<number> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return 0;

  const sb = getSupabaseClient();
  if (sb) {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
      const { error } = await sb.from('transactions').delete().in('id', chunk);
      if (error) throw new Error(`Supabase batch delete error: ${error.message}`);
    }
    return uniqueIds.length;
  }

  const local = await readLocalStore();
  const idSet = new Set(uniqueIds);
  const before = local.transactions.length;
  local.transactions = local.transactions.filter((t) => !idSet.has(t.id));
  const deleted = before - local.transactions.length;
  if (deleted > 0) await writeLocalStore(local);
  return deleted;
}

function makeDedupKey(t: {
  date: string;
  type: TxType;
  amountCents: number;
  categoryId: string;
  note: string;
}): string {
  return `${t.date}|${t.type}|${t.amountCents}|${t.categoryId}|${t.note.trim()}`;
}

export async function importTransactions(
  items: CreateTxInput[],
  skipDuplicates = true,
): Promise<{ imported: Transaction[]; skippedDuplicates: number }> {
  if (items.length === 0) return { imported: [], skippedDuplicates: 0 };

  const snapshot = await getSnapshot();
  const existingKeys = new Set(snapshot.transactions.map((t) => makeDedupKey(t)));
  const toInsert: CreateTxInput[] = [];
  let skippedDuplicates = 0;

  for (const item of items) {
    const key = makeDedupKey(item);
    if (skipDuplicates && existingKeys.has(key)) {
      skippedDuplicates++;
      continue;
    }
    existingKeys.add(key);
    toInsert.push(item);
  }

  if (toInsert.length === 0) {
    return { imported: [], skippedDuplicates };
  }

  const sb = getSupabaseClient();
  if (sb) {
    const CHUNK_SIZE = 500;
    const imported: Transaction[] = [];
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE).map((item) => ({
        type: item.type,
        amount_cents: item.amountCents,
        category_id: item.categoryId,
        occurred_on: item.date,
        note: item.note,
      }));

      const { data, error } = await sb
        .from('transactions')
        .insert(chunk)
        .select('id, type, amount_cents, category_id, occurred_on, note, created_at');

      if (error) throw new Error(`Supabase batch insert error: ${error.message}`);

      for (const row of data || []) {
        imported.push({
          id: Number(row.id),
          type: row.type as TxType,
          amountCents: Number(row.amount_cents),
          categoryId: String(row.category_id),
          date: String(row.occurred_on).slice(0, 10),
          note: String(row.note || ''),
          createdAt: row.created_at ? String(row.created_at) : undefined,
        });
      }
    }

    return { imported, skippedDuplicates };
  }

  const local = await readLocalStore();
  const nowIso = new Date().toISOString();
  const imported: Transaction[] = toInsert.map((item) => ({
    id: local.nextId++,
    type: item.type,
    amountCents: item.amountCents,
    categoryId: item.categoryId,
    date: item.date,
    note: item.note,
    createdAt: nowIso,
  }));
  local.transactions = [...imported, ...local.transactions];
  await writeLocalStore(local);
  return { imported, skippedDuplicates };
}

export async function saveBudget(budget: BudgetSettings): Promise<BudgetSettings> {
  const clean = unpackBudgetRow(
    budget.monthlyCents,
    budget.categories,
    budget.monthlyOverrides,
    budget.recurringTemplates,
  );

  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from('budgets').upsert(
      {
        id: 'default',
        monthly_cents: clean.monthlyCents,
        categories: packBudgetJson(clean),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`Supabase budget upsert error: ${error.message}`);
    return clean;
  }

  const local = await readLocalStore();
  local.budget = clean;
  await writeLocalStore(local);
  return clean;
}
