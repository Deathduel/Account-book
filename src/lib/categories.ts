import type { Category, TxType } from './types';

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'c_canyin',    name: '餐饮',   type: 'expense', icon: '🍜', color: '#F59E0B' },
  { id: 'c_gouwu',     name: '购物',   type: 'expense', icon: '🛍️', color: '#3B82F6' },
  { id: 'c_riyong',    name: '日用',   type: 'expense', icon: '🧴', color: '#10B981' },
  { id: 'c_jiaotong',  name: '交通',   type: 'expense', icon: '🚇', color: '#6366F1' },
  { id: 'c_shucai',    name: '蔬菜',   type: 'expense', icon: '🥬', color: '#22C55E' },
  { id: 'c_shuiguo',   name: '水果',   type: 'expense', icon: '🍎', color: '#EF4444' },
  { id: 'c_lingshi',   name: '零食',   type: 'expense', icon: '🍿', color: '#F97316' },
  { id: 'c_yundong',   name: '运动',   type: 'expense', icon: '🏃', color: '#14B8A6' },
  { id: 'c_yule',      name: '娱乐',   type: 'expense', icon: '🎬', color: '#EC4899' },
  { id: 'c_tongxun',   name: '通讯',   type: 'expense', icon: '📱', color: '#06B6D4' },
  { id: 'c_fushi',     name: '服饰',   type: 'expense', icon: '👔', color: '#8B5CF6' },
  { id: 'c_meirong',   name: '美容',   type: 'expense', icon: '💄', color: '#F43F5E' },
  { id: 'c_zhufang',   name: '住房',   type: 'expense', icon: '🏠', color: '#EAB308' },
  { id: 'c_jujia',     name: '居家',   type: 'expense', icon: '🛋️', color: '#84CC16' },
  { id: 'c_zhangbei',  name: '长辈',   type: 'expense', icon: '👴', color: '#A855F7' },
  { id: 'c_shejiao',   name: '社交',   type: 'expense', icon: '🤝', color: '#0EA5E9' },
  { id: 'c_lvxing',    name: '旅行',   type: 'expense', icon: '✈️', color: '#2563EB' },
  { id: 'c_yanjiu',    name: '烟酒',   type: 'expense', icon: '🍷', color: '#D97706' },
  { id: 'c_shuma',     name: '数码',   type: 'expense', icon: '💻', color: '#475569' },
  { id: 'c_yiliao',    name: '医疗',   type: 'expense', icon: '💊', color: '#EF4444' },
  { id: 'c_shuji',     name: '书籍',   type: 'expense', icon: '📖', color: '#6366F1' },
  { id: 'c_xuexi',     name: '学习',   type: 'expense', icon: '📚', color: '#3B82F6' },
  { id: 'c_lijin',     name: '礼金',   type: 'expense', icon: '🧧', color: '#DC2626' },
  { id: 'c_bangong',   name: '办公',   type: 'expense', icon: '📎', color: '#64748B' },
  { id: 'c_weixiu',    name: '维修',   type: 'expense', icon: '🔧', color: '#78716C' },
  { id: 'c_caipiao',   name: '彩票',   type: 'expense', icon: '🎟️', color: '#F59E0B' },
  { id: 'c_qinyou',    name: '亲友',   type: 'expense', icon: '👨‍👩‍👧', color: '#EC4899' },
  { id: 'c_kuaidi',    name: '快递',   type: 'expense', icon: '📦', color: '#B45309' },
  { id: 'c_huangjin',  name: '黄金',   type: 'expense', icon: '🪙', color: '#EAB308', isInvestment: true },
  { id: 'c_shuidian',  name: '水电',   type: 'expense', icon: '⚡', color: '#0284C7' },
  { id: 'c_shouxufei', name: '手续费', type: 'expense', icon: '💸', color: '#6B7280' },
  { id: 'c_jijin',     name: '基金',   type: 'expense', icon: '📈', color: '#16A34A', isInvestment: true },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: 'i_licai',    name: '理财', type: 'income', icon: '📈', color: '#10B981', isInvestment: true },
  { id: 'i_huangjin', name: '黄金', type: 'income', icon: '🪙', color: '#EAB308', isInvestment: true },
  { id: 'i_jianzhi',  name: '兼职', type: 'income', icon: '💻', color: '#3B82F6' },
  { id: 'i_baoxiao',  name: '报销', type: 'income', icon: '🧾', color: '#F59E0B' },
  { id: 'i_hongbao',  name: '红包', type: 'income', icon: '🧧', color: '#EF4444' },
  { id: 'i_shouru',   name: '收入', type: 'income', icon: '💼', color: '#6366F1' },
  { id: 'i_caipiao',  name: '彩票', type: 'income', icon: '🎟️', color: '#EC4899' },
];

export const ALL_CATEGORIES: Category[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

const CATEGORY_MAP = new Map<string, Category>(ALL_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return (
    CATEGORY_MAP.get(id) ?? {
      id,
      name: '未分类',
      type: 'expense',
      icon: '📝',
      color: '#999999',
    }
  );
}

export function getCategoriesByType(type: TxType): Category[] {
  return type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}
