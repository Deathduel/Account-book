import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './categories';
import { pad2 } from './format';
import type { TxType } from './types';

export interface ParsedImportItem {
  type: TxType;
  amountCents: number;
  categoryId: string;
  date: string;
  note: string;
}

export interface CsvParseResult {
  sourceName: '简账标准 CSV' | '微信支付账单' | '支付宝账单';
  items: ParsedImportItem[];
  skippedRows: number;
  filteredTransfers: number;
  errors: string[];
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const clean = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) {
    const y = Number(m1[1]);
    const mo = Number(m1[2]);
    const d = Number(m1[3]);
    if (y >= 1949 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  }

  const m2 = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (m2) {
    const y = Number(m2[1]);
    const mo = Number(m2[2]);
    const d = Number(m2[3]);
    if (y >= 1949 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  }
  return null;
}

function parseType(raw: string): TxType | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === '/' || s.includes('不计') || s.includes('中性') || s.includes('其他')) return null;
  if (s.includes('支') || s === 'expense' || s === 'out') return 'expense';
  if (s.includes('收') || s === 'income' || s === 'in') return 'income';
  return null;
}

function parseAmountCents(raw: string): number {
  const cleaned = raw.replace(/[¥￥,\s+]/g, '').replace(/元$/, '');
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(Math.abs(n) * 100);
}

// Smart keyword classifier for WeChat Pay / Alipay bills into the user's exact 32 expense + 7 income categories
const EXPENSE_KEYWORDS: Array<[string, string[]]> = [
  ['c_shucai',    ['蔬菜', '买菜', '叮咚买菜', '朴朴', '菜市场', '生鲜', '盒马', '美团买菜', '小象超市', '肉菜']],
  ['c_shuiguo',   ['水果', '百果园', '鲜丰', '果切', '草莓', '西瓜', '苹果', '车厘子']],
  ['c_lingshi',   ['零食', '奶茶', '咖啡', '瑞幸', '星巴克', '霸王茶姬', '喜茶', '蜜雪', '库迪', '古茗', '茶百道', '辣条', '蛋糕', '甜品']],
  ['c_canyin',    ['餐饮', '美团外卖', '饿了么', '餐厅', '饭店', '面馆', '火锅', '烧烤', '肯德基', '麦当劳', '汉堡', '食堂', '早餐', '午餐', '晚餐', '快餐', '外卖']],
  ['c_jiaotong',  ['交通', '地铁', '公交', '滴滴', '高德打车', '打车', '出租车', '12306', '铁路', '火车', '高铁', '停车', '加油', '充电桩', 'ETC', '单车', '哈啰', '青桔']],
  ['c_shuidian',  ['水电', '电费', '水费', '燃气', '煤气', '国家电网', '南方电网', '热力', '供暖']],
  ['c_tongxun',   ['通讯', '话费', '流量', '宽带', '中国移动', '中国联通', '中国电信']],
  ['c_zhufang',   ['住房', '房租', '物业', '房贷', '自如', '贝壳', '链家']],
  ['c_kuaidi',    ['快递', '顺丰', '菜鸟', '中通', '圆通', '韵达', '申通', '极兔', '京东快递', '邮政EMS', '丰巢']],
  ['c_yiliao',    ['医疗', '医院', '药房', '药店', '挂号', '体检', '诊所', '牙科', '医保']],
  ['c_huangjin',  ['黄金', '积存金', '金条', '足金', '周大福', '老凤祥']],
  ['c_jijin',     ['基金', '定投', 'ETF', '天天基金', '蚂蚁财富', '理财通']],
  ['c_shouxufei', ['手续费', '服务费', '提现费', '年费']],
  ['c_caipiao',   ['彩票', '福彩', '体彩', '双色球', '刮刮乐']],
  ['c_yule',      ['娱乐', '电影', '猫眼', '淘票票', '游戏', 'Steam', '腾讯充值', '网易', '米哈游', '燕云', '鸣潮', 'B站', '爱奇艺', '腾讯视频', '优酷', '网易云', 'QQ音乐', 'KTV']],
  ['c_xuexi',     ['学习', '课程', '培训', '考试', '报名费', 'OpenAI', 'DeepSeek', 'Gemini', 'ChatGPT', 'Claude', '会员订阅']],
  ['c_shuji',     ['书籍', '书店', '当当', '新华书店', '微信读书', 'Kindle']],
  ['c_shuma',     ['数码', 'Apple', '苹果', '华为', '小米', '京东自营数码', '耳机', '键盘', '鼠标', '充电宝']],
  ['c_fushi',     ['服饰', '优衣库', 'ZARA', '衣服', '鞋子', '外套', '裤子', '内衣', '袜子', '耐克', '阿迪']],
  ['c_meirong',   ['美容', '理发', '剪发', '美发', '护肤', '化妆品', '洗面奶', '面膜', '美甲']],
  ['c_yundong',   ['运动', '健身', '羽毛球', '游泳', '瑜伽', '跑步', '球馆', '迪卡侬']],
  ['c_lvxing',    ['旅行', '携程', '飞猪', '去哪儿', '酒店', '民宿', '机票', '景区', '门票']],
  ['c_yanjiu',    ['烟酒', '香烟', '茅台', '啤酒', '白酒', '红酒', '便利店烟']],
  ['c_lijin',     ['礼金', '随礼', '份子钱', '红包']],
  ['c_weixiu',    ['维修', '修车', '换屏', '管道疏通', '开锁', '家电清洗']],
  ['c_jujia',     ['居家', '宜家', '家具', '家电', '窗帘', '床品']],
  ['c_riyong',    ['日用', '超市', '便利店', '7-11', '全家', '罗森', '名创优品', '抽纸', '洗洁精', '洗衣液', '牙膏', '洗发水', '屈臣氏']],
  ['c_gouwu',     ['购物', '淘宝', '天猫', '拼多多', '京东', '抖音电商', '得物', '闲鱼', '小红书']],
];

const INCOME_KEYWORDS: Array<[string, string[]]> = [
  ['i_baoxiao',  ['报销', '退税', '发票']],
  ['i_hongbao',  ['红包', '微信红包', '群收款']],
  ['i_huangjin', ['黄金', '积存金']],
  ['i_licai',    ['理财', '基金', '分红', '利息', '赎回', '收益']],
  ['i_caipiao',  ['彩票', '中奖']],
  ['i_jianzhi',  ['兼职', '外包', '稿费', '副业']],
  ['i_shouru',   ['工资', '薪资', '奖金', '收入', '转账']],
];

const INTERNAL_TRANSFER_PATTERNS = [
  '信用卡还款',
  '花呗还款',
  '白条还款',
  '零钱通',
  '零钱提现',
  '零钱充值',
  '银行卡提现',
  '余额宝',
  '余利宝',
  '朝朝宝',
  '转入零钱',
  '转出到银行卡',
  '充值-普通',
];

const INVALID_STATUS_PATTERNS = ['交易关闭', '已全额退款', '退款成功', '已撤销', '支付失败'];

function classifyByKeywords(type: TxType, text: string): string {
  const table = type === 'expense' ? EXPENSE_KEYWORDS : INCOME_KEYWORDS;
  for (const [catId, words] of table) {
    if (words.some((w) => text.includes(w))) return catId;
  }
  return type === 'expense' ? 'c_gouwu' : 'i_shouru';
}

function matchCategory(type: TxType, purposeRaw: string, noteRaw: string): { categoryId: string; note: string } {
  const pool = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  let purpose = purposeRaw.trim();
  let note = noteRaw.trim();

  if (!note && purpose.includes(' - ')) {
    const [head, ...rest] = purpose.split(' - ');
    purpose = head.trim();
    note = rest.join(' - ').trim();
  }

  const exact = pool.find((c) => c.name === purpose || c.id === purpose);
  if (exact) return { categoryId: exact.id, note };

  const partial = pool.find((c) => purpose && (purpose.includes(c.name) || c.name.includes(purpose)));
  if (partial) {
    const mergedNote = note ? note : purpose !== partial.name ? purpose : '';
    return { categoryId: partial.id, note: mergedNote };
  }

  const combinedText = `${purpose} ${note}`;
  const guessedId = classifyByKeywords(type, combinedText);
  const mergedNote = note || purpose;
  return { categoryId: guessedId, note: mergedNote };
}

export async function readCsvFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gb18030').decode(buf);
  } catch {
    return utf8;
  }
}

export function parseBookkeepingCsv(text: string): CsvParseResult {
  const matrix = parseCsvMatrix(text);
  if (matrix.length === 0) {
    return {
      sourceName: '简账标准 CSV',
      items: [],
      skippedRows: 0,
      filteredTransfers: 0,
      errors: ['文件内容为空'],
    };
  }

  // Scan top 35 rows to locate header row (WeChat & Alipay CSVs have metadata preamble lines)
  let headerRowIdx = -1;
  let sourceName: CsvParseResult['sourceName'] = '简账标准 CSV';

  const preambleText = matrix
    .slice(0, 20)
    .map((r) => r.join(' '))
    .join(' ');
  const isWechatPreamble = preambleText.includes('微信支付账单');
  const isAlipayPreamble = preambleText.includes('支付宝');

  for (let i = 0; i < Math.min(matrix.length, 35); i++) {
    const joined = matrix[i].join(',');
    if (joined.includes('交易时间') && (joined.includes('收/支') || joined.includes('金额'))) {
      headerRowIdx = i;
      if (isWechatPreamble || joined.includes('交易类型')) sourceName = '微信支付账单';
      else if (isAlipayPreamble || joined.includes('交易分类') || joined.includes('商品说明')) {
        sourceName = '支付宝账单';
      }
      break;
    }
    if (
      i === 0 &&
      (joined.includes('时间') ||
        joined.includes('日期') ||
        joined.toLowerCase().includes('date') ||
        joined.includes('用途') ||
        joined.includes('金额'))
    ) {
      headerRowIdx = 0;
      sourceName = '简账标准 CSV';
      break;
    }
  }

  const hasHeader = headerRowIdx >= 0;
  const header = hasHeader ? matrix[headerRowIdx].map((h) => h.toLowerCase()) : [];
  const findCol = (keywords: string[]) =>
    header.findIndex((h) => keywords.some((kw) => h.includes(kw)));

  const items: ParsedImportItem[] = [];
  const errors: string[] = [];
  let skippedRows = 0;
  let filteredTransfers = 0;

  if (sourceName === '微信支付账单' || sourceName === '支付宝账单') {
    const dateCol = findCol(['交易时间']);
    const typeCol = findCol(['收/支', '收支']);
    const amountCol = findCol(['金额']);
    const counterpartyCol = findCol(['交易对方']);
    const productCol = findCol(['商品说明', '商品']);
    const categoryCol = findCol(['交易分类', '交易类型']);
    const statusCol = findCol(['交易状态', '当前状态']);
    const noteCol = findCol(['备注']);

    for (let i = headerRowIdx + 1; i < matrix.length; i++) {
      const cols = matrix[i];
      const rawDate = dateCol >= 0 ? cols[dateCol] || '' : '';
      const date = normalizeDate(rawDate);
      if (!date) continue;

      const rawStatus = statusCol >= 0 ? cols[statusCol] || '' : '';
      if (rawStatus && INVALID_STATUS_PATTERNS.some((p) => rawStatus.includes(p))) {
        filteredTransfers++;
        continue;
      }

      const rawType = typeCol >= 0 ? cols[typeCol] || '' : '';
      const type = parseType(rawType);
      if (!type) {
        filteredTransfers++;
        continue;
      }

      const rawCounterparty = counterpartyCol >= 0 ? cols[counterpartyCol] || '' : '';
      const rawProduct = productCol >= 0 ? cols[productCol] || '' : '';
      const rawCat = categoryCol >= 0 ? cols[categoryCol] || '' : '';
      const rawNote = noteCol >= 0 ? cols[noteCol] || '' : '';

      const fullDesc = `${rawCat} ${rawCounterparty} ${rawProduct} ${rawNote}`;
      if (INTERNAL_TRANSFER_PATTERNS.some((p) => fullDesc.includes(p))) {
        filteredTransfers++;
        continue;
      }

      const amountCents = parseAmountCents(amountCol >= 0 ? cols[amountCol] || '' : '');
      if (amountCents <= 0) {
        skippedRows++;
        continue;
      }

      const cleanProduct = rawProduct && rawProduct !== '/' ? rawProduct : '';
      const cleanCounterparty = rawCounterparty && rawCounterparty !== '/' ? rawCounterparty : '';
      const cleanNote = rawNote && rawNote !== '/' ? rawNote : '';
      const noteParts = [cleanCounterparty, cleanProduct, cleanNote].filter(Boolean);
      const mergedNote = Array.from(new Set(noteParts)).join(' · ').slice(0, 120);

      const categoryId = classifyByKeywords(type, `${rawCat} ${mergedNote}`);
      items.push({
        type,
        amountCents,
        categoryId,
        date,
        note: mergedNote,
      });
    }

    return { sourceName, items, skippedRows, filteredTransfers, errors };
  }

  // Standard 5-column CSV (时间, 支出/收入, 用途, 金额, 备注)
  const dateCol = hasHeader ? findCol(['时间', '日期', 'date']) : 0;
  const typeCol = hasHeader ? findCol(['支出', '收入', '收支', '类型', 'type']) : 1;
  const purposeCol = hasHeader ? findCol(['用途', '分类', '类别', 'category']) : 2;
  const amountCol = hasHeader ? findCol(['金额', 'amount']) : 3;
  const noteCol = hasHeader ? findCol(['备注', '说明', 'note']) : 4;

  const startRow = hasHeader ? headerRowIdx + 1 : 0;
  for (let i = startRow; i < matrix.length; i++) {
    const cols = matrix[i];
    const rawDate = dateCol >= 0 ? cols[dateCol] || '' : '';
    const rawType = typeCol >= 0 ? cols[typeCol] || '' : '';
    const rawPurpose = purposeCol >= 0 ? cols[purposeCol] || '' : '';
    const rawAmount = amountCol >= 0 ? cols[amountCol] || '' : '';
    const rawNote = noteCol >= 0 ? cols[noteCol] || '' : '';

    const date = normalizeDate(rawDate);
    if (!date) {
      skippedRows++;
      if (errors.length < 5) errors.push(`第 ${i + 1} 行：时间格式无法识别 (${rawDate || '空'})`);
      continue;
    }

    const amountCents = parseAmountCents(rawAmount);
    if (amountCents <= 0) {
      skippedRows++;
      if (errors.length < 5) errors.push(`第 ${i + 1} 行：金额无效 (${rawAmount || '空'})`);
      continue;
    }

    let type = parseType(rawType);
    if (!type) {
      type = rawAmount.trim().startsWith('+') ? 'income' : 'expense';
    }

    const { categoryId, note } = matchCategory(type, rawPurpose, rawNote);
    items.push({
      type,
      amountCents,
      categoryId,
      date,
      note: note.slice(0, 200),
    });
  }

  return { sourceName, items, skippedRows, filteredTransfers, errors };
}

export function downloadCsvTemplate(): void {
  const sample = [
    ['时间', '支出/收入', '用途', '金额', '备注'],
    ['2026-11-21', '支出', '蔬菜', '5.00', '早市青菜'],
    ['2026-11-21', '支出', '餐饮', '28.00', '午饭牛肉面'],
    ['2026-11-21', '收入', '报销', '150.00', '出差报销'],
  ];
  const csv = '\uFEFF' + sample.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '简账_导入模板.csv';
  a.click();
  URL.revokeObjectURL(url);
}
