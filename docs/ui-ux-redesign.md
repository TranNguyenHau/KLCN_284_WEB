# Alpha Markets — UI/UX redesign and internationalisation

This document covers the frontend redesign delivered on top of the existing
React + Vite + Tailwind front end. No new npm dependency was added: the i18n
layer, the command palette, the export helpers and the toast system are all
local code, so the app still installs and builds exactly as before.

---

## 1. Design system

### Token architecture

Three layers, as recommended by the `design-system` skill bundled with
`ui-ux-pro-max-skill`: **primitive → semantic → component**. Raw colour values
live in `frontend/src/index.css` as semantic custom properties; Tailwind maps
them in `frontend/tailwind.config.js`; components only ever use the token
classes, never a raw hex. That is what makes the light/dark switch and any
future theme work without touching a component.

| Token | Role | Dark (default) | Light |
| --- | --- | --- | --- |
| `--bg` | page background | `#0F172A` | `#F1F5F9` |
| `--surface` | cards, header, sidebar | `#1E293B` | `#FFFFFF` |
| `--raised` | hover / inset rows | `#26344A` | `#F1F5F9` |
| `--line` | borders and dividers | `#334155` | `#E2E8F0` |
| `--ink` | primary text | `#E2E8F0` | `#0F172A` |
| `--muted` | secondary text | `#94A3B8` | `#64748B` |
| `--up` | uptrend, gains | `#10B981` | `#059669` |
| `--down` | downtrend, losses | `#EF4444` | `#DC2626` |
| `--forecast` | LSTM prediction curve | `#818CF8` | `#6366F1` |
| `--accent` | brand, primary actions | `#38BDF8` | `#0284C7` |
| `--warn` | caution, triggered alerts | `#FBBF24` | `#B45309` |

Dark is the default for every visitor; light stays available from the header
toggle. `frontend/index.html` applies the stored theme and language before first
paint so there is no flash of the wrong theme.

### Effects

- `.glass` — glassmorphism (translucency + `backdrop-blur(18px)` + inset highlight). Used for the sticky header, collapsible sidebar, command palette, dropdowns, toasts, the AI insights drawer and the Alpha AI chat widget.
- `.card` / `.card-hover` — data surfaces stay opaque for contrast, with a 1px inset highlight and lift-on-hover micro-interaction.
- `.skeleton` — shimmer placeholder used by `Skeleton`, `SkeletonStat`, `SkeletonTable` and `SkeletonChart`.
- `.live-dot` — pulsing ring for the market-open indicator; `animate-pulse-slow` for the streaming service pill.
- The LSTM forecast curve is drawn in three passes (a wide faint halo, a glowing dashed line via `.glow-forecast`, and the point markers) which produces the soft neon glow without relying on gradients that could silently fail.
- `prefers-reduced-motion` disables all of it.

### Responsive behaviour

Responsive targets: 375 / 768 / 1024 / 1440 (reasoned through from the markup;
no browser was available in this environment - see section 7). The sidebar is a
fixed rail at `lg` and a glass slide-over below it. The stock chart and the
insights drawer sit side by side from `xl`; below that the drawer stacks under
the chart. Every number cell can shrink and wrap - see section 8.1.

---

## 2. Internationalisation

### Files

| File | Purpose |
| --- | --- |
| `frontend/src/locales/en.json` | English dictionary |
| `frontend/src/locales/vi.json` | Vietnamese dictionary, same key shape |
| `frontend/src/i18n/index.jsx` | `I18nProvider`, `useI18n`, `LANGUAGES`, `INDICATOR_KEYS` |
| `frontend/src/components/LanguageSwitcher.jsx` | Header dropdown |

### Behaviour

- `useI18n()` returns `{ lang, locale, languages, setLang, toggleLang, t, tList }`.
- `t('prediction.title', { days: 7 })` interpolates `{days}`; a missing key returns the key itself so gaps are visible rather than silent.
- Switching language re-renders the tree — no reload, no request. Chart legends, table headers, nav items, chat suggestions and placeholders all move together because they read from the same context.
- The choice is stored in `localStorage` under `alpha.lang`, with the browser language as the first-visit fallback, and is mirrored onto `<html lang>`.
- Number and date formatting follow the language too: `utils/format.js` exposes `setFormatLocale()`, which `I18nProvider` calls during render, so `fmtPrice` renders `100,000` in English and `100.000` in Vietnamese everywhere without every call site passing a locale.
- The AI insights factors store i18n **keys** plus interpolation variables rather than pre-translated strings, so an open insights panel re-translates instantly when the language changes.
- The **chat answers in the selected language**, not the language that was typed. `AlphaChat` sends its active code as `lang` with every request, the Node side resolves it through `utils/language.js`, and both the Gemini prompt and the rule-based composer follow it - see section 10.3.

### Adding a language

1. Copy `en.json` to `<code>.json` and translate the values (keys unchanged).
2. Import it in `frontend/src/i18n/index.jsx` and add an entry to `DICTS` and `LANGUAGES`.
3. Nothing else on the front end — every component reads through `t()`.
4. For the chat specifically, three places know about languages on the Node side and need
the new code too: `SUPPORTED_LANGUAGES` and `GREETING` in `backend/utils/language.js`, the
output-language block in `services/llm/prompts.js`, and the string table in
`services/agent/composerMessages.js`. A code the backend does not know falls back to
Vietnamese rather than erroring, so a half-finished language degrades instead of breaking.

### Known scope limits

Two kinds of string still come from the Node backend in English and are shown
as-is: the per-signal prose in `/indicators` (`signal.detail`), and the
statistical method notes in `/portfolio` risk results (`method`). Translating
them properly means either returning them as codes from the API or moving that
copy into the dictionaries; the factor-level insights panel was built
client-side precisely so the highest-value explanation is fully localised.
Indicator *names* from the API are mapped through `INDICATOR_KEYS` and are
translated.

The rule-based chat composer used to be a third case - all of its copy was
English no matter the language. It is now bilingual (section 10.3): its sentence
templates live in `backend/services/agent/composerMessages.js`, and the English
`signal.detail` prose is the only fragment that does not cross over, because in
Vietnamese the composer reports the localised signal word instead of splicing
English detail into a Vietnamese sentence.

---

## 3. New components

| Component | Role |
| --- | --- |
| `CommandPalette.jsx` | Ctrl/⌘+K Spotlight modal: pages, stocks (with recent-symbol memory), actions, and "Ask Alpha AI" for the typed text. Arrow keys, Enter, Escape, scroll-into-view. |
| `AiInsightsDrawer.jsx` | Collapsible drawer beside the chart. Confidence gauge, LSTM-vs-technical agreement, and the five factor cards. |
| `PriceAlertWidget.jsx` | Target-price alerts backed by `/api/alerts`, polled every 25s, firing a mock notification toast on a cross. |
| `ExportMenu.jsx` | Dropdown for CSV and printable report. |
| `LanguageSwitcher.jsx` | EN/VI dropdown. |
| `TickerTape.jsx` | Seamless marquee of index quotes; pauses on hover; duplicate track hidden from screen readers. |
| `MarketStatusPill.jsx` | Market open/closed/pre-market/lunch/after-hours pill, plus data-source and service pills. |
| `Skeleton.jsx` | Shimmer loaders for lines, stats, tables and charts. |
| `hooks/useToast.jsx` | Toast provider that renders its own glass viewport. |

### Feature notes

- **Command palette** reuses two existing integration points instead of adding new plumbing: it dispatches the `alpha:ask` event that `AlphaChat` already listened for, and a new `alpha:export` event that `StockDetail` handles. Recent symbols are written to `alpha.recent-symbols` whenever a user opens a stock from the table, the inline search or the palette.
- **Export** is deliberately dependency-free. CSV is a `Blob` download with a UTF-8 BOM so Vietnamese characters survive Excel. The "PDF" is a print-styled report opened in a new window and handed to the browser's own print-to-PDF; if pop-ups are blocked the user gets an error toast.
- **AI insights** never invent a number. `utils/insights.js` derives five factors from real indicator values returned by `/api/stocks/:symbol/indicators` (trend vs SMA20/50, RSI level and crossover, MACD histogram direction, volume vs its 20-day average, Bollinger position). The confidence figure is explicitly labelled *factor agreement* and the panel states in copy that it is a read of the technical factors, not the model's internal confidence — consistent with the project rule that no prediction value or confidence interval is ever fabricated.
- **Price alerts** use the real `/api/alerts` endpoints, so the widget on the stock page and the alert table on the portfolio page show the same records.

---

## 4. Accessibility checklist

Checked against the `ui-ux-pro-max` pre-delivery list:

- [x] Icons are Lucide SVG, never emoji (the language flags are decorative and `aria-hidden`).
- [x] Every icon-only button has an `aria-label`.
- [x] Focus rings are preserved (`:focus-visible` outline) and the command palette keeps focus in its input, so keyboard navigation cannot be lost behind the modal.
- [x] `aria-pressed` on segmented controls, `aria-expanded`/`aria-haspopup` on dropdowns, `aria-modal` on the palette, `aria-live` on the toast region.
- [x] `prefers-reduced-motion` is respected globally.
- [x] Contrast: body text uses `--ink`/`--muted` pairs held above 4.5:1 on `--surface`; semantic colours are used for text at 15% alpha backgrounds with a matching solid foreground.
- [x] Live regions: the typing indicator and toasts announce; the ticker's duplicated track is `aria-hidden` so it is not read twice.

---

## 5. The requested skill packages

Three external things were requested. Two of them are **agent instruction
packages (markdown + local scripts), not runtime libraries**, so "installing"
them changes how an agent writes code; it does not change what the app ships.

**Important:** this environment has no shell (`bash` was not found), so I could
not run `npx skills`, `git clone`, or `pip`/`node` scripts. I did not install
anything and I am not claiming otherwise. What I *did* do is read the skill
sources and apply their guidance, which is the part that affects the code:

- **`ui-ux-pro-max-skill`** — applied its design-system generator output format (pattern · style · colours · typography · effects · anti-patterns · pre-delivery checklist) and its 10-category priority rubric. The theme chosen for a trading-desk product is a **premium dark data-dense terminal**: semantic tokens, tabular numerals, glass only on floating layers, meaningful motion, contrast and keyboard navigation before decoration. Its anti-patterns (emoji as icons, hover-only affordances, one duration for every transition, raw hex in components, colour as the only signal) are honoured — the up/down trend colour is always paired with an arrow glyph or a signed number.
- **`ponytail`** — applied its ladder: reuse what the codebase already has before adding anything. Concretely: no `i18next`/`react-intl` (≈50 lines of context instead), no `cmdk` (hand-rolled modal reusing the existing `alpha:ask` event), no `jspdf`/`papaparse` (native `Blob` and the browser's own print-to-PDF), no new toast or dropdown library, and locale-aware formatting added by threading one module-level locale instead of rewriting ~40 `fmtPrice` call sites.
- **`vercel-labs/skills`** — this is the CLI that installs skills from GitHub into an agent's skills directory. It needs a shell, so it could not run here.

### To install them yourself

Run these from the repository root:

```bash
# The open skills CLI from vercel-labs
npx skills add nextlevelbuilder/ui-ux-pro-max-skill --list
npx skills add nextlevelbuilder/ui-ux-pro-max-skill -a claude-code --copy -y

# Ponytail (agent skill + two lifecycle hooks; needs node on PATH)
npx skills add DietrichGebert/ponytail -a claude-code --copy -y

# Browse what else the ecosystem offers
npx skills add vercel-labs/agent-skills --list
```

Review what lands in your agent's skills directory before trusting it: these
packages run as *instructions to your coding agent*, and ponytail's plugin ships
lifecycle hooks, so treat the target directory as executable configuration
rather than documentation. Nothing from any of these packages was executed as
part of this change.

---

## 6. Files touched

```
frontend/
├─ index.html                         theme + lang applied pre-paint
├─ tailwind.config.js                 animations, easing, radius
└─ src/
   ├─ index.css                       tokens, glass, skeleton, glow, ticker
   ├─ main.jsx                        I18nProvider + ToastProvider
   ├─ i18n/index.jsx                  NEW
   ├─ locales/{en,vi}.json            NEW
   ├─ utils/{format,export,insights,marketStatus,recents}.js
   ├─ hooks/{useTheme,useToast}.jsx
   ├─ layouts/MainLayout.jsx          collapsible sidebar + sticky header
   ├─ components/                     10 new, and Card, StockTable, SearchBox,
   │                                  StatusViews, SentimentBadge, AlphaChat,
   │                                  PredictionPanel, charts/* localised
   └─ pages/                          Dashboard, StockDetail rebuilt;
                                      Portfolio, Trading, News, TechnicalAnalysis localised

backend/
├─ data/stocks.js                     SPX + BTC added to the ticker indices
└─ providers/sampleProvider.js        per-index tick + decimals
```

---

## 7. Verification status

There is no shell in this environment, so `npm run build`, `npm test` and the
FastAPI/Node services could not be started from here. The changes were written
to be build-safe by inspection (no new dependencies, Tailwind arbitrary values
kept out of `@apply` where a syntax mistake would break the build, both
dictionaries parsed and key-aligned by hand). Please run the following locally
before merging:

```bash
cd frontend && npm run build
cd backend && npm start
cd frontend && npm run dev     # then toggle EN/VI, press Ctrl+K, export both files
```

---

## 8. Number cards, the 404 page and route-change robustness

### 8.1 Number cards were overflowing

**Cause.** A grid or flex item defaults to `min-width: auto`, so a cell refuses to
shrink below its content width and simply grows out of its card. The stat cells had
no `min-w-0`, the values were single unwrappable lines (`text-lg font-semibold`), and
the index cards at `xl:grid-cols-5` laid the name, a `text-2xl` value and the change
chip out side by side in ~220px of space. Vietnamese makes it worse: `fmtMoney`
returns `500.000.000 VND` and `fmtCompact` returns `4,2 Tr`.

**Fix.**

- New `components/Stat.jsx`: one stat cell with `min-w-0`, a wrapping label and a
  value that wraps instead of pushing (`break-words` + `tabular-nums`). Reused by
  Dashboard (portfolio summary), StockDetail (OHLCV grid), Portfolio and Trading.
- New `.stat-label` / `.stat-value` component classes in `index.css`, so the numeric
  treatment is defined once. `sm:text-lg` stays in the markup on purpose - responsive
  variants inside `@apply` are avoided to keep the build predictable.
- Dashboard index cards now stack name → value → change instead of placing the change
  chip beside a `text-2xl` value, and the card is `overflow-hidden` as a last-resort
  clip. `PriceChange` is `whitespace-nowrap` so `(+0,85%)` can never split.
- StockDetail's OHLCV grid moved from `sm:grid-cols-5` to `sm:grid-cols-3 lg:grid-cols-5`,
  because five columns at 640px gave each Vietnamese label about 120px.
- Risk/P&L definition lists and the indicator signal cards got `min-w-0` +
  `break-words` too; they hold money strings and server prose.
- Same treatment for the last two hotspots: the prediction header in
  `PredictionPanel.jsx` (a `text-2xl` estimate next to a change chip now wraps) and the
  positive/neutral/negative counters in `News.jsx`.

### 8.1b The numbers themselves were mixed-language

The index and watchlist chips showed `-11,95 (-0.92%)`: the value used the Vietnamese
decimal comma while the percentage used `toFixed()`, which is always a dot. Fixed:

- `fmtPct` is locale-aware, and a new `fmtPercentValue` renders unsigned magnitudes
  (annualised volatility, max drawdown) without a leading `+`.
- `Trading.jsx` no longer interpolates raw numbers (`${x}%`): volatility, drawdown, the
  risk/reward ratio and the net return all format through `format.js`.
- `SentimentBadge` and the AI insight sentences (`utils/insights.js`: trend distance, RSI
  level, volume ratio) format through `fmtPrice`, so the prose reads `RSI là 62,5` in
  Vietnamese. The numeric comparisons in `insights.js` still use the raw numbers - only
  the interpolated copy is formatted.

### 8.2 A real 404 page

The catch-all route used to be `<Navigate to="/" replace />`, which silently hid
every wrong address. It is now `<Route path="*" element={<NotFound />} />`.

`pages/NotFound.jsx` shows the requested path, and offers:

- **Back to the previous page** - `navigate(-1)`, with a guard: `history.state.idx === 0`
  (first entry of the tab) falls back to the dashboard instead of leaving the user stuck.
- **Pages that work right now** - `/`, `/portfolio`, `/trading`, `/news`, `/analysis/VIC`.
- **Paths that are not implemented yet** - `/technical`, `/screener`, `/compare`,
  `/reports`, `/settings`, each rendered struck through with a "Not implemented" chip, and
  `/technical` pointing at its replacement. These are stated rather than hidden, as asked.
- **Stock deep links** - the symbol list comes from `/api/stocks/search`, so
  `/stock/MWG` and friends are one click away. If the requested path looks like a deep
  link (`/stocks/MWG`, `/stock/mwg/x`), the page resolves the symbol and tells the user
  whether the provider knows it.

`Footer.jsx` pointed its "Technical Analysis" link at `/technical`, which is not a route -
it now points at `/analysis/VIC`.

### 8.3 "Back froze the tab"

I could not reproduce this in a browser from here (no shell means no dev server, so no
preview). Reading the code, these are the concrete things that can produce exactly that
symptom, and each one is fixed:

**Most likely cause, and it is not a freeze at all.** The catch-all route was
`<Navigate to="/" replace />`. Every address the router does not match - `/stocks/MWG`
(the API spelling, with the `s`), `/technical`, `/stock/MWG/history` - was silently
rewritten to the dashboard. Visit such an address a few times and the history stack fills
up with identical `/` entries, so pressing **Back appears to do nothing: the view never
changes**. That is exactly "bấm back mà trang không load lại". It is fixed twice over: the
catch-all is now a real 404 page (8.2) instead of a redirect, and a deep link written the
API way (`/stocks/MWG`) is recognised and offered as a working `/stock/MWG` link.

Beyond that, these are the concrete things that can genuinely hang the tab, all fixed:

| Cause found | Fix |
| --- | --- |
| An uncaught render error unmounts the whole React tree, leaving a blank page that looks frozen and has no way out. | `components/ErrorBoundary.jsx`, used around `<Routes>` in `App.jsx` and around `<Outlet />` in `MainLayout.jsx`. It shows the message, keeps the sidebar alive and offers retry / back / home / reload. `resetKey` clears the crashed state as soon as the route changes. |
| A stock page fires six requests (quote, history, prediction, indicators, news, watchlist). Navigating away left them running, so the back press competed with in-flight work that no longer had a reader. | `useApi` now owns an `AbortController` and aborts on unmount or dependency change; `api.stock/history/prediction/indicators/news` accept an axios config, and StockDetail + TechnicalAnalysis pass the signal. |
| `background-attachment: fixed` on `body` forces a full-viewport repaint on every scroll frame, and the ticker animation ran *inside* the `backdrop-blur-xl` header, so the browser re-blurred the strip 60 times a second. Both are classic ways to peg the compositor on Windows Chrome. | The ambient gradient moved to a fixed, composited `.ambient` element; the header now blurs only the controls row and `TickerTape` sits outside it on an opaque strip. |
| A leftover overlay or scroll lock (`CommandPalette` sets `body.overflow = hidden`) can look like a dead page after a history navigation. | MainLayout closes the mobile drawer and the palette, clears `body.overflow` and scrolls to the top on every pathname change - so a back press visibly reloads the view instead of keeping the old scroll offset. |
| The 25s alert poll kept firing on a hidden tab. | The poll skips hidden tabs and re-runs on `visibilitychange`. |

**Please verify on your machine** (`npm run dev`, then: dashboard → MWG → browser Back) and tell
me if anything still hangs; the honest state is that the request/scroll/compositor fixes above
are reasoned from the code, not observed in a running browser.

---

## 9. Candlestick chart and dashboard layout

### 9.1 The candlestick chart is now a trading-terminal chart

`components/charts/CandleChart.jsx` was rebuilt around the reference look:

- **Candles.** One custom Recharts `shape` draws a 1px wick from `low` to `high` and a solid
  body from `open` to `close`, green when the session closed up and red when it closed down.
  The price -> pixel mapping is derived from the `hl` (`[low, high]`) bar Recharts hands to the
  shape, so the wick always lands exactly on the axis domain - no second scale to drift.
- **Density.** Up to 260 sessions are drawn (`limit={260}`, so the 1Y range fills the plot) and
  `maxBarSize={14}` keeps the candles thin with a hairline gap, instead of Recharts stretching a
  handful of bars across the whole width on a short range.
- **Guides.** Faint dashed grid on both axes, dashed horizontal lines at the highest and lowest
  session of the visible window, and a dashed vertical "now" line on the latest session.
- **Tooltip** shows O H L C with the close tinted green/red for the session, and the chart
  returns `null` for an empty history instead of computing `Math.min()` of nothing.
- **Remembered mode.** The line/candle choice is stored in `localStorage` under
  `alpha.chart-mode`, so a user who prefers candles gets candles on every stock page.

### 9.2 Dashboard layout

The overview page was reorganised around what a trader scans first:

```
┌──────────────────────────────── row 1 ────────────────────────────────┐
│ index cards: VN-Index · VN30 · HNX · S&P 500 · Bitcoin (5 across)      │
├───────────────────┬───────────────────┬───────────────────────────────┤
│ Top gainers       │ Top losers        │ Market sentiment              │
│ own height, scroll│ own height, scroll│ Watchlist (scrolls)           │
└───────────────────┴───────────────────┴───────────────────────────────┘
```

- Gainers and losers sit **next to each other** as two equal columns; market sentiment and the
  watchlist keep a narrower right rail, so the row is
  `xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)]`.
- **Nothing stretches unbounded.** The row is `items-start`, so a growing watchlist can never
  drag the two mover columns along with it. (The first version let the grid stretch them and gave
  all of the leftover height to the table rows, which turned six rows into six ~130px bands -
  visible in the dashboard screenshot that prompted this fix.)
- **Bounded heights instead.** The movers' table body is a fixed `h-[400px]` and its table uses
  `fill`, so six rows share that height evenly (~62px each) and a longer list scrolls; with fewer
  than five rows the card falls back to natural row heights, so two entries can never stretch into
  giant bands. 56px header + 400px body + 41px summary line = 497px, the same card height the
  watchlist reaches once it is long enough to scroll (56 + 440).
- **Long lists scroll.** The watchlist body is `max-h-[440px] overflow-y-auto` and the table
  headers are `sticky top-0` (`StockTable stickyHeader`, opaque background), so a long list
  scrolls inside its own card instead of lengthening the page and the neighbouring columns. Each
  mover card still closes with a summary line - the average change of its list. The portfolio
  page's watchlist follows the same rule, and its row is `items-start` too.
- The volume column is off in these two tables now that they share the row, and the table's
  minimum width dropped from 420px to 320px so a narrower column never grows a stray horizontal
  scrollbar.
- The simulated-account summary is **removed from the dashboard** (`PortfolioCard` deleted along
  with its now-unused imports). Those numbers live on the portfolio page, which is linked from
  the nav; the dashboard gives the space to the movers.
- The loading skeleton mirrors the new three-column layout, so nothing jumps when data arrives.
- Below `xl` everything stacks in one column: index cards, gainers, losers, sentiment, watchlist.

Backend support: `getMarketOverview()` used to return a fixed five gainers and five losers. It now
returns `Math.min(6, floor(catalogSize / 2))` per side, which is one row more with the current
12-symbol catalog and is guaranteed disjoint - the same symbol can never appear in both tables.

Still unverified by a build: see section 7.

---

## 10. Alpha AI: Gemini provider and the KLCN-284 analyst persona

The chat bot is now driven by Google Gemini with the persona the project brief asks for,
while the project's "never invent a number" rule stays on top of that persona.

### 10.1 The provider

- `backend/.env` was created (git-ignored) with `LLM_PROVIDER=gemini` and the supplied
  `LLM_API_KEY`; `backend/.env.example` documents every variable in the same order.
- **Key format.** Google AI Studio now issues *auth keys* with the `AQ.` prefix, which
  replace the older `AIza` standard keys (staged rejection through 2026). Auth keys work
  on the native `generativelanguage.googleapis.com` endpoints only, so
  `services/llm/index.js` keeps calling `/v1beta/models/<model>:generateContent` and never
  the OpenAI-compatible route, where an `AQ.` key is rejected.
- **Key transport.** The key goes out as the `x-goog-api-key` header. If the call is
  rejected as an auth failure the *same* request is retried once with `?key=` instead -
  never both at once, because Google answers two credential sources with "multiple
  authentication credentials received".
- **Model resolution.** `LLM_MODEL` wins when set; otherwise the provider walks
  `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`
  and stops at the first model that answers, remembering it for the rest of the process. The
  default is `gemini-3.5-flash` (GA, still on the free tier, since Pro models left it in
  April 2026); the 2.5 entry is a last resort because that family is retired on 16 October
  2026. Model names move faster than this code will, and a stale name returns a 404 that
  looks like a broken key. Gemini 3.x also thinks before answering and bills the thinking
  tokens as output, so a free quota drains faster than the visible answer suggests.
- **Turn shape.** Gemini wants `contents` to alternate `user`/`model` and to open with a
  `user` turn, and answers anything else with a 400. Two shapes had to be normalised before
  sending. A question that failed stays in the stored history, so retrying it - or typing a
  new question after a failure - puts two `user` turns in a row; the newer turn replaces the
  stale duplicate. And the chat widget seeds the greeting as the first assistant bubble, so
  a first-turn request would open with a `model` turn; the provider prepends a neutral
  one-line user turn. That also makes the history non-empty, which is what stops the model
  from repeating the greeting.
- **Diagnostics.** `llmName()` reports `gemini:<model>` (or `rule-based`), so
  `GET /api/health` and the provider chip under a chat answer both show which model is
  actually in use. Every error string is passed through a scrubber that replaces the key
  with `[redacted]` before it can reach a log line, a response, or the chat. When the model
  call fails, `agentService` now appends the **reason** to the fallback answer instead of
  hiding it - a rejected key is the most likely cause and the user should see it.

### 10.2 The persona

`services/llm/prompts.js` holds the analyst persona and the data rules that constrain it,
built per request by `buildSystemPrompt(language)`; the opening line lives in
`utils/language.js` as a two-language `GREETING` table.

- **Role:** Real-time Stock Data Analyst for the KLCN-284 group assignment - a
  professional day trader's instincts combined with a fund manager's quantitative reading.
- **Four-step process, always in order:** trend and momentum (including a volume spike
  check); quick technical read (RSI overbought/oversold, MACD cross, Bollinger position,
  nearest support and resistance); money flow (active buy vs active sell, bulls or bears);
  then an explicit **MUA / BÁN / THEO DÕI** call with entry price, stop loss, take profit
  and a risk level of Thấp / Trung bình / Cao.
- **Style:** short, no preamble, precise finance terminology, bullets and `Label: value`
  lines so it can be read during a session, the user addressed as *bạn*.
- **Off-topic guard:** anything outside stocks and finance gets one line saying it is
  outside the AI's topic, then an invitation back to the price data.
- **Zalo-safe formatting:** the prompt forbids `**`, `##`, `_` and markdown tables,
  because those marks show literally once the text is pasted into Zalo.
- **Data rules kept from the previous prompt** (the persona must not weaken them): only
  numbers present in the EVIDENCE JSON; a missing field or a failed tool is reported as
  missing rather than guessed; entry/SL/TP must be *derived* from real levels in the
  evidence (recent high/low, Bollinger bands, SMA 20/50, RSI, daily range) and must state
  their basis, or the answer says there is not enough data; an LSTM value is always called
  a model estimate; sample data must be labelled as not real-time; with no order book in
  the evidence the model must say so and read flow from volume and price instead; every
  answer closes with the not-investment-advice line. If the model is unreachable the reply
  falls back to the rule-based composer.

### 10.3 The reply follows the selected language

The chat answers in the interface language the user chose, whatever language they type in.

- `AlphaChat.jsx` sends its active code as `lang` on every `POST /api/chat`; the controller
  normalises it with `utils/language.js` (unknown or missing values fall back to Vietnamese,
  so an old client cannot break the endpoint) and echoes the resolved code back in the
  response.
- **LLM path.** `services/llm/prompts.js` now exposes `buildSystemPrompt(language)` instead
  of a constant. The persona body is one shared, Vietnamese-language template - it is the
  language of the brief, and two copies would drift - and two things are injected per
  request: the greeting for that language, and a mandatory output-language block appended
  at the *end* of the prompt, where the model weighs it most. That block is explicit that
  the answer must follow the selected language even when the question was typed in the
  other one.
- **Rule-based path.** `services/agent/composerMessages.js` is a new two-language string
  table with `{placeholder}` templates, mirroring the frontend dictionary. It carries every
  sentence the composer produces, plus three word maps: indicator states
  (bullish/bearish/neutral), news sentiment labels (positive/neutral/negative) and the
  indicator display names, which the indicator service returns in English - Vietnamese
  maps them to `Dải Bollinger (20, 2)`, `Đường trung bình động`, `Khối lượng`. The English
  `detail` prose that accompanies each signal is dropped in Vietnamese rather than spliced
  into a Vietnamese sentence, since the localised state word already carries the meaning.
- **Numbers follow the language too.** The composer formats money and percentages through
  `toLocaleString('vi-VN' | 'en-US')`, so a Vietnamese answer reads `1.234,56 VND` and
  `+0,85%` instead of mixing separators.
- The help text shown when no symbol is recognised and the notice appended when the model
  call fails are both localised through the same table.
- The seeded greeting is the one piece of copy that already behaved this way: switching
  language re-renders it in the new language (see 10.4).

### 10.4 The greeting and the Zalo copy

- `GREETING` ("Dữ liệu đã lên sàn! ...", with an English counterpart) is written into the prompt as the first-turn
  opener *and* seeded as the first assistant message in `AlphaChat.jsx`, kept in
  `chat.greeting` in both dictionaries. Seeding it as a real message rather than painting
  it into the empty state has two effects: the line is on screen even when no key is
  reachable, and it is part of the history sent to the model, so the model treats it as its
  own previous turn and does not repeat it. Clearing the conversation brings it back, and
  switching language re-renders it in the new language.
- The intro copy and the four suggestion chips now show until the first **user** message
  rather than while the message list is empty, which is what keeps the on-ramp visible next
  to the seeded greeting.
- Each assistant answer carries a **copy** button that flattens the markdown
  (`**bold**` → bold, `#` headings and bullet asterisks removed) before writing to the
  clipboard, with a hidden-textarea fallback for non-secure contexts. The rendered bubble
  keeps its bold headings - only the clipboard gets plain text.
- Fixed while in there: the error panel's retry button is now only rendered when there is
  something to retry, so a non-request error (a blocked clipboard, for example) can no
  longer throw on click.

Files touched: `backend/config.js`, `backend/.env` (new, git-ignored),
`backend/.env.example`, `backend/utils/language.js` (new), `backend/services/llm/index.js`,
`backend/services/llm/prompts.js`, `backend/services/agent/agentService.js`,
`backend/services/agent/composer.js`, `backend/services/agent/composerMessages.js` (new),
`backend/controllers/miscController.js`, `frontend/src/components/AlphaChat.jsx`,
`frontend/src/locales/en.json`, `frontend/src/locales/vi.json`, `README.md`.
No new dependency was added: the Gemini call is plain `axios` against the REST endpoint, and
the composer's string table is local code rather than an i18n package.

Still unverified: nothing here has been run. In particular the API key itself could not be
validated from this environment - it needs an outbound `POST`, and this sandbox only has
read-only web access. Start `backend` and open the chat; if the answer arrives without the
"rule-based composer" note, the key and model are working.
