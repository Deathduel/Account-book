# 简账 · 个人极简记账本

一款专为自用打造的响应式 PWA 记账本：**手机极速记账 + 电脑宽屏复盘**，无账户/无信用卡还款/无标签冗余项。

## 核心特性

- **自定义收支分类**：完整内置 32 项支出 + 7 项收入（含黄金/基金/理财，电脑端支持一键排除投资类看纯日常消费）。
- **手机端（PWA）**：
  - 明细首页：左上角可选 **1949–2100 任意年月**，点击顶部收入/支出直达单笔排行，点击单条流水可删除/修改/查看明细。
  - 极速记账：圆形图标 4 列网格 + 内置加减计算器键盘 + 内置「今天」日期选择弹窗（1949–2100）。
  - 图表分析：支出/收入切换、周/月/年分段、全可点子时段（含自选 1949–2100 任意年月）、均值虚线折线图与分类排行。
  - 账单与日历：月账单/年账单（1949–2100）、月度账单报告、预算剩余环形图（左上角支持返回）、红绿日预算达标日历。
  - 底部一键导入 / 导出：支持按月/按年/全部导出 CSV，包含 5 列：**时间、支出/收入、用途、金额、备注**；同时支持 CSV 账单批量导入（兼容 UTF-8 与 Excel GBK 编码、自动判重、支持下载标准模板）。
- **电脑端（≥ 768px 自动切换）**：宽屏复盘工作台、明细表格行内编辑备注/分类、全维度图表与日历复盘。
- **双模式存储**：
  - **本地开箱即用**：不配任何环境变量即可直接启动，自动持久化到 `data/ledger.json`。
  - **方案 A 云端免费同步**：配置 Supabase 环境变量部署到 Vercel 后自动切为 PostgreSQL 云同步。

## 1. 本地运行

```bash
npm install
npm run dev
```

打开浏览器访问 `http://localhost:3000` 即可使用（若 Windows PowerShell 提示禁止执行脚本，改用 `npm.cmd run dev`）。

## 2. 免费云端部署（方案 A：Vercel + Supabase）

1. **创建 Supabase 数据库**：
   - 登录 [Supabase](https://supabase.com) 新建免费项目。
   - 打开 **SQL Editor**，复制粘贴 [`supabase/schema.sql`](supabase/schema.sql) 并点击 **Run** 建表。
   - 在 **Project Settings → API** 复制 `Project URL` 和 `service_role` key。
2. **部署到 Vercel**：
   - 将本项目推送到 GitHub（私人仓库），在 [Vercel](https://vercel.com) 导入该仓库。
   - 在 Vercel 项目的 **Environment Variables** 添加：
     - `SUPABASE_URL` = 你的 Supabase Project URL
     - `SUPABASE_SERVICE_ROLE_KEY` = 你的 `service_role` key
     - `APP_PIN` = 你想设置的单人访问密码（可选，验证后 30 天免输）
     - `APP_AUTH_SECRET` = 任意随机字符串
   - 点击 **Deploy**，几分钟后获得专属 HTTPS 域名。
3. **手机添加到桌面（PWA）**：
   - iOS Safari 打开网址 → 点底部「分享」→「添加到主屏幕」。
   - Android Chrome 打开网址 → 右上角菜单 →「添加到主屏幕 / 安装应用」。
