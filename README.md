# 简账 · 个人极简记账本

一款专为自用打造的响应式 PWA 记账本：**手机极速记账 + 电脑宽屏复盘**，无账户/无信用卡还款/无标签冗余项。

## 核心特性

- **自定义收支分类**：完整内置 32 项支出 + 7 项收入（含黄金/基金/理财，**手机端与电脑端均支持一键切换「含投资 / 纯消费」**排除黄金、基金、理财）。
- **手机端（PWA）**：
  - **明细首页**：左上角可选 **1949–2100 任意年月**，支持多选 / 全选本月批量删除；点击顶部收入/支出直达单笔排行；快捷入口涵盖账单、预算、日历、固定月账单。
  - **极速记账**：圆形图标 4 列网格 + 内置加减计算器键盘 + **历史备注一键填充** + **「再记一笔」连续记账** + 1949–2100 日期选择弹窗 + **乐观更新（0 延迟秒显，失败自动回滚）**。
  - **图表分析**：支出/收入切换、周/月/年分段、含投资/纯消费切换、均值虚线折线图与分类排行，**点击任意分类可展开下钻查看该时段明细**。
  - **账单与日历**：月账单/年账单（1949–2100）、月度账单报告、**按月生效预算（支持全局默认 + 某月单独覆盖）**、红绿日预算达标日历、**固定月账单模板与一键生成本月账单**。
  - **一键导入 / 导出**：导出 5 列标准 CSV（**时间、支出/收入、用途、金额、备注**）；导入自动识别 **简账标准 CSV / 微信支付账单 / 支付宝账单**（自动兼容 UTF-8/GBK、跳过内部转账/信用卡还款/零钱通/余额宝与关闭订单、智能映射分类并自动判重）。
  - **桌面图标优化**：内置 180×180 `apple-touch-icon.png` 及 192/512 PNG PWA 图标，iOS/Android 添加到主屏幕清晰不糊。
- **电脑端（≥ 768px 自动切换）**：宽屏复盘工作台、批量勾选删除、行内编辑备注/分类、图表分类下钻、分月预算、固定月账单管理、微信/支付宝 CSV 导入。
- **双模式存储与云端保活**：
  - **本地开箱即用**：不配环境变量时自动持久化到 `data/ledger.json`。
  - **云端免费同步（Netlify / Vercel + Supabase）**：配置环境变量后自动切为 PostgreSQL 云同步，全量分页读取突破单次 1000 行上限；内置 `/api/health` 接口与 `.github/workflows/keepalive.yml`（每 5 天自动 ping 防 Supabase 免费版 7 天休眠）。

## 1. 本地运行

```bash
npm install
npm run dev
```

打开浏览器访问 `http://localhost:3000` 即可使用（若 Windows PowerShell 提示禁止执行脚本，改用 `npm.cmd run dev`）。

## 2. 免费云端部署（Supabase + Netlify / Vercel 二选一）

先完成 **2.1 Supabase 建库**，再按需选择 **Netlify**（国内直连体验通常更好）或 **Vercel** 部署前端与 API。

### 2.1 创建 Supabase 数据库

1. 登录 [Supabase](https://supabase.com) 新建免费项目（地区推荐 `Southeast Asia (Singapore)`）。
2. 打开左侧 **SQL Editor**，复制粘贴 [`supabase/schema.sql`](supabase/schema.sql) 并点击 **Run** 建表与授权。
3. 在 **Project Settings → API** 复制以下两个值备用：
   - `Project URL`（对应 `SUPABASE_URL`）
   - `service_role` / `secret` key（对应 `SUPABASE_SERVICE_ROLE_KEY`，切勿泄漏给他人）

### 通用环境变量（Netlify 与 Vercel 相同）

| 变量名 | 说明 |
| --- | --- |
| `SUPABASE_URL` | Supabase 的 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 的 `service_role` / `secret` key |
| `APP_PIN` | 单人访问密码（可选；设置后需输入密码解锁，验证后 30 天免输） |
| `APP_AUTH_SECRET` | 任意长随机字符串（用于签名登录 Cookie） |

---

### 2.2 方式一：部署到 Netlify

1. 将本项目推送到 GitHub（推荐私人仓库）。
2. 登录 [Netlify](https://app.netlify.com/) → **Add new project** → **Import an existing project** → 选择 **GitHub**（若看不到仓库，点页面底部 **Give it access on GitHub** 授权该仓库）。
3. 构建参数保持 Netlify 自动识别的默认项（`Next.js` / `npm run build` / `.next`）。
4. 在 **Environment variables**（或创建时的 Keys and secrets）添加上述 4 个环境变量，点击 **Deploy**。
5. **注意访问权限**：若站点默认为 Private，进入站点 **Project configuration / Manage → Who can see it** 改为 **Public - anyone can visit**，再直接使用浏览器打开专属域名 `https://<你的站点>.netlify.app/`（请勿在 Netlify 后台预览框内登录，避免 iframe 拦截 Cookie；站内已由 `APP_PIN` 保护隐私）。

---

### 2.3 方式二：部署到 Vercel

1. 将本项目推送到 GitHub（推荐私人仓库）。
2. 登录 [Vercel](https://vercel.com) → **Add New… → Project** → 导入该 GitHub 仓库。
3. 框架会自动识别为 **Next.js**，展开 **Environment Variables** 添加上述 4 个环境变量。
4. 点击 **Deploy**，几分钟后即可获得专属 HTTPS 域名（`https://<你的项目>.vercel.app`）。

---

### 2.4 自动防休眠保活（Supabase 免费版）

Supabase 免费版连续 7 天无访问会自动暂停。项目内置了保活接口 `/api/health` 与定时工作流 [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml)（每 5 天自动请求一次数据库）：

- 若部署域名不是工作流里的默认地址，请在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 新增变量 `APP_URL`，值为你的线上域名（例如 `https://your-app.netlify.app` 或 `https://your-app.vercel.app`，末尾不要带 `/`）。

---

### 2.5 手机添加到桌面（PWA）

- **iOS Safari**：打开线上网址 → 点底部「分享」→「添加到主屏幕」。
- **Android Chrome / Edge**：打开线上网址 → 右上角菜单 →「添加到主屏幕 / 安装应用」。
