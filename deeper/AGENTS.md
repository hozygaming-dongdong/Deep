# DEEPER — 專案根設定

累進下注、一次收網的釣魚 crash 博彩遊戲（PLAYABLE GAMBLING 類別）。
手機直版 540×960 全英文；品牌 **DEEPER**，遊戲內最深 band 仍叫 **ABYSS**。

> 註：早期有一版按鈕式 v1（＋ ABYSS 工作標題期）。**2026-07-20 已整份刪除**，
> 現在 repo 只有一條線＝手勢直控的水池制遊戲。歷史脈絡見 git log 與 docs/DEV-LOG-V2.md。

> **Claude Code ↔ Codex 共用記憶**：`AGENTS.md` 是根設定唯一實體，`CLAUDE.md` 必須是指向
> 本檔的 symlink。每次任務先讀 `docs/AGENT-MEMORY.md`；新發現的長期規則／偏好／gotcha
> 必須在同一批次寫回 repo 對應真相源，不能只留在任一工具的私有 auto-memory。
>
> Claude Code 啟動時匯入共享記憶：
> @docs/AGENT-MEMORY.md

## 架構地圖

```
deeper.html          遊戲 entry（手勢直控,markup + chrome CSS,邏輯在 src/engine/）=出貨版
src/econ/rng.js      決定性 PRNG（xfnv1a→mulberry32）——被 engine 共用
src/engine/          確定性物理核心：
                     world/entities/round = outcome 引擎（headless,遊戲與 sim 共跑同一份）
                     render-v2/main-v2    = view + 手勢 driver
                     audio-v2             = 程序化 WebAudio（零素材檔）
                     tuning.js            = simSummary（給 tuner 與 sim 共用的摘要）
                     **經濟常數集中在 world.js 的 `CFG` 物件**（applyCfg/rebuildCfg,export let
                     live binding）;動 CFG 預設＝重開 gate；tuner 草稿不影響遊戲，使用者保存後
                     IDLE 立即套用，進行中回合則在下一局起手前套用
tuner.html           經濟參數調控台（dev-only,不進 build）——改 CFG→跑真 simSummary→看 RTP/頻率
tools/sim.mjs        gate + RTP harness（`npm run sim`）
```

- dev：`npm run dev`（Vite，**port 8190** strictPort，`.claude/launch.json` 已接）
- build：`npm run build`（dist/：deeper.html 遊戲）；`npm run build:single`（dist-single 單檔）
- sim：`npm run sim`（預設 30k tune）；`npm run sim -- --rounds 200000` 跑凍結 gate

## 鐵則

1. **經濟凍結 gate**：動 `src/engine/world.js`（含 `CFG` 預設）／`entities.js` 任何經濟常數＝重開 gate（`npm run sim -- --rounds 200000` 全綠：決定性 80k bit-identical、**fixed-stop 天花板全 θ <100%**、事件頻率符合 spec；數字權威=docs/ECONOMY-V2.md）。tuner 改的是執行期 CFG，不動預設＝不需 re-green。
2. **sim 綠燈才動美術**；美術/手感改動不得夾帶經濟常數變更。
3. **ABYSS 命名**：`tier==='ABYSS'`／band stamp／配色判斷是程式依賴；改品牌只動品牌字串。
4. **視覺法典**：禁 glow 濾鏡、禁 magenta；金=實體鏡面金屬（烤焙 rim）；損失一律 petrol violet。詳 docs/design-system.md。
5. **preview rAF 陷阱**：代理 preview 分頁可能 `document.hidden=true`，動畫/深水不會自己跑——手動推幀驗證：`window.DEEPER_V2.stepFrames(n)`（另有 `gDown/gMove/gUp`、`pull`；`pull` 只在 state 為 HOLD/SINK 時生效，IDLE 直接 return——先手勢下沉再 pull 才跑得動一局）。深水軟鎖有 setTimeout 安全網。
6. **rng 消耗順序不可動**（provably-fair 對齊）：順序定義在 `src/engine/round.js` 頭部區塊（round init：current×4→**匿名 opening pool 抽樣**；enter L：**ante roll→ante pool draw**（每段各恆耗一支，miss 也耗）→spawn（魚 count roll→每魚；泡泡 count roll→每泡；金魚 count roll→每金魚；四帶各自用 0/1/2/3 權重映射既有 count roll）→descent hazard（每隻鯊魚一支 bite roll，miss→makePrize；獎品倍率區間重用 makePrize 既有第一支 value roll））；PULL：catch(0 rng)→**每顆已生成 bubble 各恆耗一支 assignment roll（miss 也耗）**→beast-show roll（恆耗且仍只有一支；先依 `beastShowRules` 從 LIVYATAN→MOSASAUR→GREAT WHITE 做倍率保證判定，命中必給獎且不斷鉤；沒命中才把同一 roll 經固定 hash salt 導出「有／無金魚預告→預告升大白鯊→大白鯊升蒼龍」三段 PULL 表演值，不得新增 rng）。**⚠ v2.4 每段成本 2 支 roll，且改了 pool/shark 抽法；2026-07-23 自由泳批次又把 bubble assignment 固定成 per-spawn 恆耗——均與更早 seed 不對齊**。
7. **跨代理寫回**：凡功能、手感、視覺、演出、經濟或 bug 修正改到行為／設計事實，code 同批更新 `docs/GDD.md` 與對應開發文件；完成前做端到端驗證。純機械重構可免。跨領域且需長期保留的新經驗寫 `docs/AGENT-MEMORY.md`，不得只寫 Claude/Codex 私有 memory。

## docs/ 路由

| 檔 | 內容 | 維護 |
|---|---|---|
| **GDD.md** | **遊戲企劃書=頂層設計真相源、活文件**（願景/機制/經濟哲學/UX/路線/現況） | **設計變動當下同步** |
| ECONOMY-V2.md | 經濟數字權威（現行 CFG 常數 + sim 表 + 決策依據；§0″=v2.15 現行、§0′↓=歷史） | 只在 re-green 時動 |
| DESIGN-V2.md | 核心重設計技術計劃 + 逐階段執行紀錄 | phase 進度同步 |
| DEV-LOG-V2.md | 開發方法論 + 決策脈絡 + 踩坑（接手者防重蹈；含已刪 v1 的歷史根因） | 收尾/踩坑時補 |
| design-system.md | 視覺法典（鎖定） | 打槍後才動 |
| BEAST-VISUAL.md | 巨獸重做:AI PNG 姿態圖+canvas 姿態切換(**已接入遊戲 2026-07-21**,含接入紀錄);資產 public/beasts/(遊戲)+assets/beasts/(原始)、demo demos/ | 動巨獸視覺時 |
| AGENT-MEMORY.md | Claude Code ↔ Codex 共用長期記憶（偏好、跨領域工作紀律、記憶路由） | 新的耐久知識出現時；不複製專門文件現況 |
| archive/ | ABYSS 期 workflow 產物（歷史） | **保留不竄改** |

**維護路由**：功能細節與歷史脈絡寫進 docs/ 對應檔或專案 memory，**勿回填本檔**（硬上限 10KB）。單一真相源：鐵則→本檔、實作史→docs/、gotcha→memory。
