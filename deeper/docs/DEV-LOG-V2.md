# DEEPER — 開發歷程與方法論（v1 凍結 → v2 手勢重設計）

> 目標讀者 = 日後接手的人（含未來的我們）。這不是流水帳,是**「怎麼工作、為什麼這樣決定、踩了哪些坑」**——
> 讓接手者不必重踩同一個坑、能沿用同一套方法。實作史寫這裡;頂層設計看 [GDD.md](GDD.md)。
> 記錄時間:2026-07-18 起（跨多個長 session；§7 為 2026-07-19 的水池制改制）。

---

## 1. 這個 session 做了什麼（一句話）

從**凍結可玩的 v1**(按鈕、Σmult 經濟)出發,做了一次**核心重設計 v2**:物理即結果引擎 + 兩種魚相乘經濟 +
鯊魚風險 + 2.5D 景深 + **手勢直控**(甩鉤/負重下潛/操舵/回拉收網)+ 真實釣鉤物理。全程保持**確定性**與
**sim-green 紀律**,最後整合回 main。v2 經濟當時未調(手感 demo)——↳ 同夜 v2.1 批次輪已凍結(§6),
後再經 v2.1c 重凍結(現行數字見 ECONOMY-V2)。
（beast 演出八輪校準輪(2026-07-19 定稿)的方法論未另立章——結論已升格 kb:賭場演出文法五條
(taste-cases)+結果密封自由回放(determinism-preserving-feel);逐拍執行紀錄在 DESIGN-V2 P4v2。）

---

## 2. 設計方法論（可沿用的「怎麼做」）

### 2.1 經濟優先、sim 與遊戲共用同一份 code
- **econ 核心(常數/rng/round)是遊戲與 headless sim 共用的同一份**——不是兩份會漂移的實作。
- 動任何經濟常數 = 重開 gate（跑 sim,回目標 RTP 帶才算完成）。
- **價值**:P0 就靠這個抓到 v0「sim 有 school cap、live 沒有」的 +0.13pp 漂移——模型與遊戲對不上,先修模型。
- 教訓:**博彩遊戲的「完成」定義包含 sim 綠燈**;沒跑 sim 的經濟改動不算完成。

### 2.2 物理即結果 + 「決定性不必犧牲手感」
> ⚠ **「物理即結果」本身已於 2026-07-19 被水池制取代（§7）**——但本節的技術洞察
> （closed-form 多諧波、固定步 spring-damper、steerX 不進 sim）**全部仍然有效且仍在用**,
> 它們保的是「動得像活的」而不是「結果怎麼決定」。
- v2 選了 **physics-is-outcome**(結果 = f(seed, 玩家手勢),可重現、可驗證),配 hao 的原則
  「倍率浮動、數學留容差承受表演」。
- **關鍵技術洞察:有機/負重/活的運動 ≠ 放棄確定性**。做法:
  - 運動用 **closed-form 多諧波 + seeded 噪聲**(不可公度正弦疊加,看起來不重複),不逐幀抽 rng。
  - 負重/慣性用 **固定時間步的 spring-damper 積分**(vDepth 帶水阻 lag)。
  - 玩家操舵做成**額外橫移量 steerX**,**headless sim 預設 0**——所以 sim gate 完全不受影響。
- 這套讓「僵硬 → 有機」「1:1 → 負重」全部在**不動搖 provably-fair 地基**下完成。

### 2.3 機制優先於圖案:先追根因,再決定要不要大改（省下一次昂貴轉向）
- 使用者說「還是很僵硬,改用 3D 會更好嗎?」——**沒有反射性說好**。先診斷:僵硬的根因就在 code 裡
  (純正弦、恆定振幅、零慣性/次級運動),**是動態模型問題,不是維度問題**。
- 結論:3D 不會治僵硬(搬到 3D 但動法沒變 = 3D 的僵硬),而且會動搖剛選的 provably-fair 地基、需新美術方向。
- **先在 2D 修動態模型**(直攻根因、便宜、保地基),讓使用者用眼睛判斷。這避免了一次大改寫的錯誤轉向。
- 之後使用者要 2.5D,才用**分層 z-depth**(scale/haze/收斂 + 背景魚群)拿到「體積」,仍守決定性。
- 教訓:**「眼熟像某解法(3D)」只是待驗證假設;斷言前先追機制。「這裡不用大改」是合法且有價值的產出。**

### 2.4 三軸當設計評分標準
- **好玩博彩 = 隨機性 × 大獎潛力 × 可計算性**。每個機制都對照這三軸檢查。
- 尤其 **可計算 ≠ 可套利**:所有機制只減不增期望。
  ↳ v2.2 後「可計算性」改指「**我要潛多深**」(深度決定水池攤開多少);gate 標準也從
  全知機器人改為**真實人類前瞻**(§7.2),機器人審視延後到 P6。

### 2.5 端到端驗證是硬紀律（本 session 最痛的教訓,見 §3.1）
- 「讀 code 沒問題」「build 過」都**不等於能跑**。UI/前端改動必須實際載入、實際驅動、觀察行為才算完成。

### 2.6 文件分層 + 單一真相源
- **GDD（頂層願景/設計）→ 技術文件（DESIGN-V2/ECONOMY/design-system）→ 專案 memory（gotcha）→ kb（跨專案）**。
- 每份都標維護紀律;設計變動當下同步,不累積補。

---

## 3. 踩坑與 gotcha（省得再踩）

### 3.1 ★ 缺 export = ES 模組靜默死亡（build 過但白畫面）
- 我 import 了 `extCost`,但 `world.js` 當時沒 export（v2 sim 是把 0.4/0.8/1.5 寫死的）。
- 後果:**整個 `deeper-v2` 模組載入直接失敗、白畫面,而瀏覽器 console 不報錯**(onlyErrors 抓不到)。
- 更陷阱:**`npm run build` 過**——因為 vite build 只含 v1 頁(見 §3.2),沒建 v2,所以 build 綠不代表 v2 沒壞。
- 逼出真相的方法:`import('/src/engine/main-v2.js').then().catch(e=>e.message)` 動態 import 才拿到
  「does not provide an export named 'extCost'」。
- **教訓:改了 import/export 後,端到端載入驗證(§2.5)才擋得住;靜默死亡 + build 只建 v1 = 雙重盲區。**

### 3.2 Vite build 只含 v1 頁,v2 是 dev-only
- `vite.config.js` 的 inputs = `index.html` + `deeper.html`(v1)。**`deeper-v2.html` 與 `src/engine/*`
  只在 dev server 服務,不進 build**。→ `npm run build` 綠**不驗證 v2**;v2 必須在 dev preview 驗。

### 3.3 preview rAF 陷阱 + live rAF 競態
- Claude preview 分頁 **`document.hidden=true` → rAF 凍結**,動畫/深水不會自己跑。
  用 `window.DEEPER_V2.stepFrames(n)` 手動推幀驗證。
- 反過來,當**分頁可見(`docHidden=false`)時 live rAF 在跑**,會跟我注入的 `stepFrames`/手勢**競態**,
  造成測試中 state desync(hookInfo 回報跟預期對不上)。驗證時要嘛靠受控時鐘、要嘛接受競態只看關鍵不變量。

### 3.4 HMR churn 把瀏覽器狀態搞亂
- 密集連續編輯 → vite 反覆 full page reload → 瀏覽器狀態可能殘留/錯亂。
  東西看起來壞掉但 code 沒錯時,**重啟 dev server 清乾淨**再驗。

### 3.5 截圖紀律
- 截圖 = 秒級等待 + 大量 image tokens。只在**決策點**拍(定位一張、驗收一張);
  過程狀態用 `hookInfo()`/inspect 數值回報。本 session 大量用數值探針(位置/速度/state)取代過程截圖。

---

## 4. 關鍵設計決策脈絡（WHY,含被推翻的判斷）

- **物理即結果(B) 而非動畫貼合(A)**:使用者選 B,理由=真實感 + 「倍率浮動、數學承受表演」。
  代價=跨平台浮點確定性(真金階段才硬化,定點/verify-by-replay)。**最大長期成本,已記不當已解。**
- **兩種魚 score×mult**:相乘的大獎夢(取代 v1 的 Σmult 加總)。
- **鯊魚=具象化斷線風險**:看得見、可推理,與魚累積對稱(取代抽象 snapP)。退掉 v1 的 TITHE
  (鯊魚累積 + 漂移已提供「每次下潛有代價」,且一條鯊魚比抽象抽稅可讀)。
- **SOVEREIGN 傳奇尾**:P0 實測 v1 最優玩法 max 只 ×61 → 公告 ×500 不可達是宣稱完整性問題 → 補此 lane。
- **手勢直控(本作靈魂)**:負重速度模型、4 格離合、回拉=上滑=PULL。多次被使用者精修
  (不可回拉→可回拉但需滿 4 格;engageDy 用門檻值不用當下值才有油門)。
- **真實釣鉤**:線接「眼」、倒鉤以眼為支點鐘擺拖尾。
- **~~曾以為~~**:v2 SINK 深潛在手勢版一度是免費的(只 DROP 扣注)——使用者抓出「該收費的 SINK 也要收」,
  補上 extend 扣費 + 餘額脈動。

---

## 5. 這個 session 的節奏（迭代式手感打磨）

流程反覆是:**使用者給一句精準手感回饋 → 追根因/實作 → dev preview 用探針+截圖驗 → commit → 使用者再玩再修**。
手感類需求(僵硬、負重、鉤子物理、UI 版面)幾乎都要**實機拖過**才定,不是讀 code 能定的——
使用者的手感直覺是最終裁判,我方負責把根因診斷對、把地基守住。

---

## 6. v2.1 批次輪（2026-07-18 深夜,自主執行）——方法論增補與新坑

hao 給 v2.1 修訂批（DESIGN-V2 §8）後指示「按開發計劃做完不要停」。一晚走完
P1v2 凍結 → P2v2 場景 → P3v2 連爆 → P4v2 WHALE（commit b4e45d7/b01029e/6d1cdb8/42ac316）。

**調參方法論（最值錢的一段,詳版在 ECONOMY-V2 §4）**：
- **對抗式調參迴圈**：`--tune --rounds 30000` 快迭代（~40s）,每輪只動一組假設;200k 只在收斂後跑。
- **先診斷再下刀**：SHARP 爆表時別急著全域縮——寫 10 行診斷腳本分解（base/whale 佔比、stopL 分佈）,
  發現「1/645 的 whale 狙擊」與「57% 賭死換肥局」兩個結構洞,各自對症。
- **溢價是比率,縮放殺不死**：知情策略 vs 盲策略的溢價 ~1.4× 對 SCALE 完全免疫——只有結構刀有效
  （漂移=等待有價、windup=兌現滑移、雙膝=極尾折返、密度化=時刻方差↓）。
- **口徑決策要顯式**：溢價壓不完是「所見即所得+自由時機」的內生結構 → 轉為 skill-game 口徑
  （名義 RTP=最優玩法）。**這種「換框架」的決定要寫成可推翻的決策記錄**（ECONOMY-V2 §0）,
  不能默默當成調參結果。

**新坑**：
- **preview 分頁「可見」時 rAF 與 stepFrames 疊加雙速**：先前坑是 hidden=true rAF 凍結;這輪反過來——
  分頁可見,rAF 正常跑,stepFrames 注入=雙倍推進,「推到某狀態再截圖」永遠被 rAF 超車。解法:
  ①用 `V.resultT=-99999` 之類把狀態凍在演出拍;②或接受超車,截「持續時間長的拍」（drag 2.7s）。
- **改共用引擎 API 要 grep 全部 caller**：round.js 移除 `potentialBp()` 後 main-v2 的 dock 還在叫——
  Node `--check` 過、模組載入過,**跑到那行才炸**。防法:改 core API 後 `grep -rn "舊名" src/`。
- **fee 的 live/sim 雙端一致性**:概率收費 roll 一定要在共用核心（enter）做,live 只讀 `st.fees` 尾巴
  鏡射扣款——live 自己 roll 就 desync。
- **whale 級數字撐爆 UI**:×1234 的 payout 進 toPoints 口徑=六位數 odometer——大獎 lane 的數字
  要在每個讀數口徑上單獨想過（修法:結算後 potential 顯示 '—'）。

---

## 7. 水池制改制（2026-07-19）——方法論教訓

### 7.1 我在追錯的數字（最貴的一課）
Gate 的硬條件是「機器人 <100%」,但決定手感的是**盲玩/膽小那一帶**。我連續數輪用縮放去壓機器人,
把人類帶一起壓垮到 30%——hao 玩起來「幾乎贏不到錢」正是這個狀態的實測值。
**教訓:一個指標當 gate、另一個指標當體驗時,必須兩個都印出來看,否則會優化到只滿足前者。**

### 7.2 對抗性上界 ≠ 玩家模型
舊 SHARP 會**掃描未來 12 個收網時機、逐一精算後挑最優**——那是全知機器人。用它當唯一標準,
等於為了防一個現實中不存在的對手(provably-fair 是 commit-reveal,玩家局中拿不到 seed),
把遊戲做得沒有獎勵感。hao 拍板改成**真實人類前瞻**(無未來掃描、有 glance/reaction),
機器人降為資訊列、延後到 P6 硬化再處理。

### 7.3 ⚠ 一個必須留痕的量測錯誤
`previewPull` 長期沒把 `PULL_WINDUP` 算進去 → 歷來的 SHARP 都在**優化過期資訊**。
**所有舊版凍結的「SHARP <100%」都比實際寬鬆**（97.5%／96.8%／95.4%／95.8%／95.5%）。
修正後才看見真實的 265%。舊版是寬走廊、對時機不敏感,差距應該小得多,但**未量化**(推論,非確證)。

### 7.4 要保證的量,不能交給物理去碰運氣
第一版水池制用「spawn 時就把魚擺好」來導引預算,交付率只有 **17%**——幾何永遠會漏。
改成 hao 指定的**「在 PULL 瞬間才排列」**後直接到位。
同源踩坑:魚只跟 35% 海流、鉤子跟 100%,窄鉤下系統性錯開 ±35px(>26px 鉤半徑)。

### 7.5 工具錯了會反向傷害
為了壓狙擊我把 `PULL_WINDUP` 0.65→1.05——**對機器人完全無效**(它把延遲算進去挑時機),
只讓真人更難瞄。已退回並在 world.js 就地記下理由。

### 7.6 比較兩次 sim 前先對齊樣本數
我用 12k 局的結果去比 20k 局,誤判成回歸。**×100 只有 0.04% 機率,少數幾次就左右 1–2pp**。

### 7.7 換地基時,文件要標「語義變更」而不只是改數字
v2.2 之後,「可計算性」「所見即所得」在 GDD 裡的意思都變了。只改數字會讓接手者拿舊語義讀新系統——
GDD §5.2／§9／§13 已寫明新定義與舊定義為何作廢,維護紀律也補了這一條。

## 8. v2.4→v2.5 疊代（2026-07-20）——加注 / 鯊魚 salvage / 殘水滾存 / 參數控制台

### 8.1 ★ 經濟三要求會互相衝突,要當場算清楚
hao 一次給了「鯊魚 1/8×20% 咬斷」「96% RTP」「用倍率分布達成」三條。**這三條在數學上不能同時成立**:
2.5%/段咬斷＝全損時,L20 累積 40% 死局,RTP 結構性壓在 ~78%,拉到 96% 就會讓 fixed-stop 天花板破 100%(可套利)。
**發現這個衝突、算給 hao 看、讓他選(結果選了「咬斷只損未落袋」)**,比悶頭調參重要——調參救不了結構性衝突。

### 8.2 ★ 巨獸頻率與 RTP 貢獻的錯配陷阱
巨獸抽中率高(1/10)時,`p×倍率` 的表面 RTP 貢獻很大(WHALE 0.167×6=100%!),但實際被**掙脫＋深度門檻＋
沒現身**大幅打折。**tuner 裡巨獸只能用「抽中率/RTP 表面貢獻」當旋鈕,真實貢獻要靠 sim 量**(RTP×深度圖的青色段)。
別把表面 p×倍率 當成真 RTP。

### 8.3 ★★ 殘水滾存:safe-bank vs pool-carry（一次被打槍的模型）
hao 要「殘水滾存到下回合,讓最佳人類≈天花板」。**第一版把 carry 併進水池**→鯊魚咬斷會把累積的 carry 一起 wipe→
淺水囤 carry 又被咬光→best-human 差距**反而擴大**(88 vs 99)。**改成 safe-bank**(carry 是獨立銀行、收網時疊加付出、
鯊魚咬不掉,只損當局殘水)才對。教訓:**「滾存」有兩種實作,差在殘水暴不暴露於風險——先想清楚再寫**。

### 8.4 ★★ 滾存 + 巨獸 = RTP 通膨,巨獸池不能滾存
滾存讓普通池全額回收後,**巨獸從「被放棄的大池」變成純上行**→L12 fixed-stop 衝到 108%(可套利)。
修法:**巨獸列 this-round-only(不滾存)**,且巨獸倍率下修(6/18/60→4.5/13.5/45)壓回 <100%。
⚠ **巨獸倍率是很敏感的旋鈕**(峰在 L12):±1 檔就是 ±5~8pp 天花板。

### 8.5 「最佳人類≈天花板」與深度門檻的本質張力（hao 拍板接受）
滾存把**普通池**做成 play-independent(你要的),但**巨獸深度門檻**仍讓「抓不抓得到巨獸」play-dependent→
best-human(82%)與天花板(94.6%)差 ~12pp。**這無法在保留深度誘因下消掉**:滾存後巨獸門檻是**唯一**讓玩家有理由
下沉的東西,移除它＝玩家隨手就收。hao 2026-07-20 拍板**接受這個差距**＝搏巨獸的獎勵。

### 8.6 CFG 重構讓工具能跑真引擎（不漂移）
把散落的經濟常數集中成 `world.js` 的可變 `CFG`(`export let` live binding + `rebuildCfg`),遊戲/CLI/tuner **共讀同一份**。
`tuner.html` 改 CFG→跑真 `simSummary`(＝遊戲同一份 `simRound`)→永不漂移。**預設值不變＝sim 數字一模一樣**(重構零回歸)。
tuner 用 **Web Worker** 跑 sim:sync 迴圈在背景執行緒,postMessage 進度給主執行緒→**漸變進度條不凍結 UI**(真進度非假動畫)。

### 8.7 已解決的舊坑（狀態留痕）
- ~~§3.2 Vite build 只含 v1 頁~~ **已解決(2026-07-20)**:v1 刪除、`deeper-v2.html` 改名 `deeper.html` 直接當 build input、
  rename plugin 移除。`npm run build` 現在就是在建出貨版。歷史根因(雙盲區)留在 §3.1/§3.2。

## 9. 巨獸視覺打磨（2026-07-21~22）——寫實 PNG 的演出方法論

把 AI PNG 巨獸從「靜圖切換」磨到電影級（大白鯊到位、滄龍/利維坦調校中）。逐拍細節與**完整被打回清單**＝真相源 [BEAST-VISUAL.md](BEAST-VISUAL.md)「演出迭代紀錄」；這裡濃縮**可沿用的方法論**（給持續優化的接手者）。

### 9.1 ★★ 疊加式裝飾 vs 合成對齊（水中融合的最大轉向）
「PNG 不在水裡」試錯三段：① CSS filter 壓暗染色（把圖弄髒、吃掉細節）② 往場景疊 god-rays/浮游顆粒/caustics/vignette（獸自帶攝影棚光、場景另一套環境光，中間疊裝飾＝**硬加上去、誰也黏不住**）——**前兩段都打回**。正解＝**合成對齊**：離屏圖層 `source-atop` 把「水介質/黑位/深度霧」調進獸的**形狀內**（把主體調進場景，不是往場景加裝飾）＋`destination-in` 邊緣羽化去硬邊。教訓：**這是「機制優先於圖案」（§2.3）在視覺合成的延伸**——先問「為什麼不融」（兩套光源打架），不是「再加一層特效」。

### 9.2 ★ 手感物理也是「證明真的壞→根治」，不是調參堆疊
三個「不破圖/不假」的解都是找到物理根因後一次根治，不是調參數：
- **剪切連續條帶（破圖根治）**：分段變形從剛性平移改**平行四邊形剪切**（`ctx.transform` 讓相鄰段共用邊界 offset＝C0 連續、任意振幅零裂縫）。⚠ 最痛教訓：先前**降振幅妥協了三輪**（一直閃避大振幅）才想到從數學根治——「已知限制」長出的周邊複雜度＝根因沒解（[[thinking-protocols]]）。
- **兩股力模型（自轉假）**：身體角度＝跨幀積分狀態，只被「實際拉力訊號」（`tickWhale` 每幀傳 `pull:+1/-1/0`＝絞盤收/獸拖回/僵持）驅動——**鉤沒拉魚就不自轉**。時間驅動的 easeOut 扳正＝憑空自轉，打回。
- **爆發-安靜循環（掙扎假）**：獨立正弦堆疊＝洗衣機假感；真魚上鉤＝週期性猛掙＋間歇沉靜（`sin^6` 包絡），甩頭/抬身/尾拍/鐘擺全**同源同頻**。

### 9.3 逐拍迭代：負面路徑比正解貴，一定要留痕
hao 逐拍打回是主要工作模式。每個「做反了/太假/不對」背後的**為什麼**最貴、最難重建。BEAST-VISUAL 留了完整被打回清單（filter 染色、疊加氛圍、prev 水平定格、鉤穿過下顎、鉤埋頭裡線消失在鼻子、掙脫下墜像死掉…）。**咬合遮擋改三次才對**（鉤在獸後→鉤埋頭→鉤在臉前+上唇帶回蓋）、**掙脫從「死亡下沉」改成「咬斷叼鉤游走」**（IT GOT AWAY 要讓玩家氣、不是鯊魚死）——每個錯法都寫進 docs，不留＝下輪必重走。

### 9.4 跨 stage 連續性：抽共用函式 + 狀態跨階存活
套娃交接（滄龍湧出時大白鯊還在掙扎）**不能停格/突變**。把吊掛姿態抽 `gwHangPose()` 共用，`_gwA/_gwCX` 模組狀態跨 stage 存活，鉤/線持有者到「被吞」才轉手（透明度跟持有者淡出）。~~prev 通道畫水平定格~~＝動態斷裂，打回。

### 9.5 驗證流程（本輪反覆踩，補 §3.3/§3.4）
- **HMR 搶拍**：改完檔案 Vite reload 會搶走剛定格的畫面（截到 boot 或舊態）——導頁後**重跑**觸發腳本再截。
- **rAF 凍結陷阱的反面**：截圖會讓分頁短暫 active、rAF 恢復把演出跑掉——驗證前 `window.requestAnimationFrame=()=>0` 凍結，全靠 `stepFrames` 手動定格。
- **手勢模擬脆**：`onDown` 在非 IDLE 直接 return、`engageSink` 後需持續 `gMove` 維持油門——測試腳本要 `Object.assign(V,{...})` 完整重置（含 engaged/throttle/vDepth）再驅動。dev 面板 `beastEvery` 開時下沉免鯊魚，才能穩定重複觸發巨獸。

### 9.6 經濟零風險（守門留痕）
整輪視覺迭代 **world/entities/round 三檔零改動**（`git diff` 守門）＝不觸經濟凍結 gate、不需 re-green。dev 測試面板 `import.meta.env.DEV` gate → build tree-shake 驗證為 0，不進出貨版。

### 9.7 ★ 「定格＝洩題」：預告演出不能凍住前景（2026-07-22）
大白鯊 beast 秀原本 `lurk`（剪影）＋`stalk`（盤旋）是 **WHALE 接管相位**——一進場前景（reel 爬升、CATCH 滾動、鏡頭跟鉤）就凍住＋背景壓暗。hao 指出**定格本身就是洩題**：畫面一停、一暗，玩家立刻知道「大獎鎖定了」，「會不會來」的懸念當場消失。剪影本該是**預告（放大想像空間、不代表一定會出現）**，不是確認。
**根治＝把預告搬出接管、當背景圖層**：剪影改成 REELING 期的 `V.beastTele` FX（`tickReel` 計時），**狀態全程維持 REELING**（tickReel 照跑＝前景節奏原封不動），`drawWhale` 認 `wh.tele` 跳過 dim overlay（不壓暗前景），只有「衝出」那刻才 `startWhale2()` 從 `strike` 接管。文法＝**慢掠一次(預告)→隨機空窗(懸念)→衝出(揭曉)**。
教訓：**演出的「訊號洩漏」不只在畫面內容，也在「節奏中斷」**——任何和平常不一樣的暫停/壓暗/鏡頭鎖定，都是玩家能讀到的「事件即將發生」訊號。要「不破題」，前景就得**完全照常跑**，把戲藏在背景層。**延伸取捨**：曾考慮給蒼龍/利維坦也做預告（「疊層想像」——深處疊放遞增暗影），同日玩過大白鯊預告後 **hao 否決＝只預告大白鯊、深獸無預警爆出的「反差」衝擊更強**（給深獸也預告會稀釋 surprise）。留痕見 GDD §5.4 / BEAST-VISUAL。

### 9.8 鯊魚咬斷去前搖：「直接遊過線、斷了立即反饋」（2026-07-22）
hao：**SINK 時隨機出現的鯊魚不用前搖等待結果，節奏卡頓很不舒服**——鯊魚出現後就直接遊過線，沒斷變獎勵、斷了立即反饋。
- **被推翻的舊判斷**：v2.1e 的「咬擊拍（演出鐵則）」——接觸當下**凍住下潛、鏡頭框住鉤與鯊、張力音上揚 1.1–1.45 秒後才揭曉**，理由是「不准突然發生／必須看得見它來」。**該判斷在咬斷這條路上被 hao 反轉**：1.45 秒的 dread-ramp 讀成「節奏卡頓」而非張力。（§9.7 的教訓在此再現一次：**任何和平常不一樣的暫停都是訊號洩漏**——這裡不是洩漏而是純粹的卡頓，但根因同源＝「非常規的停頓破壞前景節奏」。）
- **改法（純 view 層，world/entities/round 經濟三檔零改動、rng 順序不動＝不需 re-green）**：
  - `STRIKE_DUR.hit` 1.45→**0.42s**；`STRIKE` 期間**海不凍**（`V.T` 照走，其餘魚照游），只暫停下潛（`vDepth=0`）。
  - **真的鯊魚衝線**取代抽象覆蓋層：`startStrike` 在咬你的那條（`nearestShark` 改用引擎 `bit` 旗標鎖定，不再靠 `resolved` fallback）掛上 render-only `_cut={t0,from,dur}`；`drawShark` 的 `_cut` 分支把牠從當前位置 easing 橫越到線（`×1.06` 咬穿）、放大 looming、full alpha。**廢除 `drawStrike`**（紫色 lunge 橢圓＋漸暗 dread-fill 覆蓋層整個移除）——斷線的戲改由「衝線的鯊魚 + 繩子受力轉紫顫動（讀 `fx.danger`）+ endInCut flash」承擔。
  - **沒咬斷 = 鯊魚退場**：`resolveHazard` 的 miss 分支補 `s.resolved=true`（本來只初始化 false、從未被設過）——missed 鯊魚淡到 0.25 alpha **且退出 `computeDanger` 計算**（不再一直懸念），留下 PRIZE 獎品魚。順帶修好一個潛在既有 bug：`computeDanger` 原本會把所有 spent 鯊魚一直算進危險值。
- **驗證（rAF 凍結下全程式化）**：程式驅動 30 局逼出真咬斷 → `STRIKE`→`REELING` 在第 26 幀（≈0.42s）、`bit`/`_cut` 各僅 1 條、charge p 0→1 期間 hook 凍結；空咬（base=0）→立即 `SNAP`＋`LINE CUT` 字卡；miss（6 條樣本）全 `resolved:true`＋6 條 PRIZE。**0.42s 瞬態無法截圖**（截圖會解凍 rAF 把它跑掉，§9.5 陷阱），靠 state machine + 幾何 + 旗標確認。
- **DEV 開關（hao：放到 DEV 開關方便測試）**：dev 面板加「SHARK 每段強制」列（`DEEPER_V2.sharkEvery('bite'|'miss'|null)`，`import.meta.env.DEV` gate、build tree-shake 不進出貨版）。跑**真引擎路徑**（改執行期 `CFG.sharkSpawnP/BiteP` live binding，含 salvage/字卡/獎品）：`bite`=咬中率拉到 1、spawn 維持 1/8 → 於真實深度看斷線；`miss`=spawn=1 每段出鯊魚且必失手 → 看退場+獎品、可一路下潛。與 `beastEvery` 互斥（beast 開時下沉清鯊魚）。
- **★ 連帶修好既有 soft-lock（dev 測試逼出）**：`createRound` 在 DROP 當下就 `enter(L1)` 並結算 L1 hazard（round.js:274），所以 **L1 一 DROP 就被咬（真實約 1/40 局）**＝ round 在玩家還沒下潛前就 `over=true`；但 `advanceDepth` 的 `while(canSink()…)` 在 `canSink()` 一開始就 false 時整段不跑，斷線演出永不觸發＝**卡死在 SINK**（鉤不下沉、拉不動）。修法：`advanceDepth` 開頭補「round 已 `over` 但還在 SINK/HOLD 且沒 strike → 立刻補演一次判決（`startStrike`/`endInCut`）」。驗證：bite 模式 40 局逼出 8 局 L1-DROP 咬斷，**8/8 都正常補演、0 卡死**（修前全會卡）。純 view/driver 層，不動經濟。
- **v2.6.1 再修：連 0.42s 的 STRIKE state 也是「暫停」，拿掉（hao：不能暫停/不影響操作節奏，鯊魚就是直接衝刺爆了就斷線）**。v2.6 雖去了 1.45s dread-ramp，但仍進 `STRIKE` state＝`vDepth=0`（下潛停住）＋`throttle/engaged/drag` 清掉（收走玩家的手勢）＋鏡頭進逼——**這本身就是暫停**。改成**不換 state 的純 FX overlay `V.cut={t,dur}`**：`armCut` 只掛 `sh._cut`＋起計時＋張力音，**完全不碰 vDepth/throttle/drag/state/zoom**；`tickCut` 每幀在主迴圈跑（獨立於 state），~0.35s 到就 `beginSalvageReel`/`endInCut`。下潛/操舵/手勢全程照走（`V.T`、`engine.steer`、`advanceDepth` 的 hook 下墜都加 `||V.cut` 讓 sealed-over 期間不凍）；charge 期間擋掉「新 pointer-down / 晚拉」以免 sealed 回合被提前 endInCut。**廢除 `startStrike`/`tickStrike`/STRIKE state**（camera/computeDanger/onDown 的 STRIKE 分支一併清）。驗證（rAF 凍結全程式化）：bite armed 當幀起，state 全程維持 **SINK**、`hookDepth` 持續增加（288→339，charge 中鉤子照沉 ~51px）、`V.T` 照走、`vDepth` 維持 151（手勢沒被收）→ ~0.35s 交棒 `SNAP`；salvage 樣本 armed@865→reel from 918（照沉 ~53px）、base 保留；miss 不受影響。純 view/driver 層，經濟三檔零改動。
- **REEF 才看到鯊魚（hao 觀察）→ 移到 SHALLOWS**：原因兩個，各修一刀：
  ① **咬你的鯊魚被畫成半透明**：`drawShark` 把 charging biter 的 alpha 也乘上 1.2s spawn 淡入（`introE`），而 biter **永遠是牠咬的那段剛生的**→衝線當下還在淡入＝看不清。修：`s._cut` 時強制 **full alpha + full size**（`s._cut ? 1 : (resolved?0.25:1)*introE`）。這是通用修正,任何深度的斷線鯊魚從此都清楚。
  ② **咬斷落點可控**：`bite` 模式原本 spawn 1/8→首隻 ~L8。改成 **spawn=1**,並在 `advanceDepth` 用 `devNeutralizeBite` 把 **< `SHARK_TEST_L` 的咬先中和掉**（清 over/snapped/bit＋把 biter 標 resolved 退場＋**把 contact.hit 翻 false**——否則 sink loop 的 `if(c.hit) armCut` 會照樣在被中和的那段開咬）。→ 咬斷穩定落在 `SHARK_TEST_L`。**落點幾經來回：先 L8(REEF)→hao 要更早改 L2(SHALLOWS)→hao 再要 REEF 中段改 `SHARK_TEST_L=7`(≈155m)**。⚠ spawn=1 下 <L7 每段都生一隻被中和的鯊魚,會在鉤子深度附近堆疊→給被中和的鯊魚加 **`_devFadeT0` 0.7s 快速淡出**（drawShark 乘 `devFade`,歸零即 skip),實測 L7 咬斷當幀「殘留 dim 鯊魚＝0」＝乾淨。驗證：連 6 局全 **L7/REEF**、biter 正確、charge 中鉤子照沉(不暫停)、salvage/空咬皆正常。`SHARK_TEST_L`＋`_devFadeT0` 全 dev-only（`V.sharkForce` 才生效,真玩無影響）。
  - **註**：`miss` 模式的鯊魚在 resolveHazard 當場 `resolved=true`＝一生成就淡到 0.25（退場語彙），所以看到的「亮」是 PRIZE 獎品魚,不是鯊魚本體。若要失手也先「亮著游過線再退場」是另一個演出加法,未做（等 hao 決定）。
- **v2.6.2 斷線改「真表演」＋去字卡去震動（hao：斷線要真表演出斷線、不出字卡、移除螢幕震動、挫敗感降到最低）**：
  - **空咬（base=0）＝真斷線演出，不再出 `LINE CUT` 字卡**：`endInCut` 拿掉 `showCard` 與 `V.shake=15` 與全螢幕 flash，只留 `A.cut()` 音＋ `markCutLine()`。新 `V.fx.cutLine={t,x,y}`（sever 點＝鉤子端），render 端 `drawCutLine`：**上半繩往上回彈＋阻尼甩動成鬆線＋frayed 斷頭；鉤子（＋金 lure）加速墜落、淡出被深海吞掉**。繩子/鉤子的正常繪製在 `cutSnap` 時跳過（改由 drawCutLine 畫）。鯊魚衝過線後 `raw>1` **繼續前衝＋淡出**（完整一趟游走,不定格）。
  - **恢復要慢 → 慢慢升回水面、到頂才長回鉤子（hao 多輪：屏幕恢復太快挫敗感太強；咬斷後屏幕慢慢回到上方；直到上方才長回鉤子）**：~~一度把 SNAP linger 縮到 1.5s「不 dwell」（判反了）→ 再改 cam 導向 idle 框+ease 1.3+linger 3.0s~~。**現行**：cardless SNAP（`cutRecover`）`camTarget=0`（一路升回水面/頂）、cam/zoom ease 1.3（慢）；**reset 改成「等鏡頭升到頂」才觸發**（`cutAtTop = cam<12`，linger 只當最小 0.9s）＝深度自適應（越深升越久）；**整段升程不畫繩/鉤**（`V.fx.cutRecover`→render `noHook`，line 是斷的、鉤子掉了），**到頂 reset 才長回新鉤**。實測 L7 深咬：camAtCut 449 → 每 ~0.4s 439/260/153/91/54/32/19 → t=2.77s cam=0 才 reset；升程截圖水裡全空無繩無鉤。beast escape（有字卡的 SNAP）不受影響。**v2.6.7 再修「跳動很大」（hao：斷線後重置畫面跳動很大→改動態恢復）**：診斷（逐幀 pixel delta 全 <28＝無 teleport；問題在**運動品質**）——指數 lerp（`cam+=(0-cam)·1.3`）**起手就衝**（首幀 ~8px/f）＋ reset 卡在 `cam<12` 造成末端 ~12px snap。改成**時間軸 ease-in-out（smootherstep `6p⁵−15p⁴+10p³`）animated pan**：`endInCut` 存 `V.cutCam={t,from:cam,dur:clamp(|cam|/150,1.8,3.4)}`，camera section 用 `cam=from·(1−smoother(t/dur))`（兩端零速度＝不 lurch）；reset 改 gate 在 `!V.cutCam`（pan 完整落到 0 才 reset＝無末端 snap）。實測首幀速度 8+→**0.3**、全程 max 4.7px/f（平滑中峰 @t1.5）、末端 snap 消失、t3.05s 落地 reset。純 view。
- **v2.6.8 到頂落新鉤＋微水花（hao：回升快到頂時鉤子從屏幕外上方落下掉入水中,要有微水花）**：`cutCam` pan 到 `p>=0.74` 觸發 `V.rehook`＝把 `V.hookDepth` 從 `REHOOK_FROM(-300,水面上方屏幕外)` 用 smootherstep 掉到 `IDLE_HOOK(150)`（`REHOOK_DUR 0.9s`）；穿越水面(`hookDepth>=0`)時噴 `V.fx.splash`＋`A.cast()`。render：`noHook` 在 rehook 期關掉（`fx.rehook`）＝沿用既有 rope/hook 繪製畫這支落下的鉤（負深度走 breached 分支＝在天空、正深度入水）；新 `drawSplash`＝水面小泡沫環＋7 顆水珠上拋落回（**微**、非巨獸破水）。reset gate 改等 `V.rehook.done`（pan＋落鉤都完成才 reset→IDLE，鉤停在 IDLE_HOOK＝無縫）。實測：rehook @2.25s(cam52,hd−300)→splash @2.77s(hd1,cam3,x270 水面中央)→hd 走 −300→150→reset @3.13s。純 view。
- **v2.6.9 重置與下一段無縫銜接（hao：要完整與下一段開始銜接）**：病根＝升程全程用**下潛引擎**畫（失去的獎品魚**帶著數字標籤**在水裡漂），reset 一 `endRound` 硬換成 idleEngine 的魚＝場景瞬切。修＝**cross-fade `V.cutFade`**：cutRecover 期 `cutFade 1→0`（rate 1.1，~0.9s 內失去的漁獲**淡出**、標籤因 `fade>0.45` gate 自動消失）；離開後 `0→1`（rate 1.7，idle 海**淡入**）。render：`_seaFade`(module var，繪魚/泡泡前設 `=fx.cutFade`)乘進 drawFish/drawBubble 的 alpha；`drawIdle` 改傳 `{cutFade}` 讓 idle 海也吃淡入；`engageSink` 重設 `cutFade=1`（新局全亮）。→ 升程是**乾淨空海**（截圖無魚無泡無標籤）、落新鉤入乾淨水、reset 後 idle 海淡入＝無硬切。實測 cutFade：SNAP 0.65→0(0.9s)→全程 0→IDLE 0.28→0.79→1(3.7s)。純 view。
  - **salvage（base>0）不走墜落**：它是「強制收網撈回 base」＝鉤子被拉上來,不演斷落；`beginSalvageReel` 不 `markCutLine`。breach 的「LINE CUT / saved +N」slam＋震動也調輕（cut 時 `flash=0.35`、`shake=0`）。⚠ salvage 仍有那行 slam 文字（非 drawCard 字卡,是海面 breach 標）——**要不要一併拿掉待 hao 定**。
  - **震動全面清零**：`tickCut`（charge 期）、`endInCut`、salvage breach（cut）、loss card（`tickCard` 對 `c.cold` 不震）全部不加 shake。
  - **驗證**：空咬 → `card:null`＋`cutLine` set＋`shake:0` 全程 0；rAF 凍結法（`requestAnimationFrame=()=>0` 後 stepFrames 定格）截到 t=0.28/0.52 兩幀：上繩鬆脫回彈、鉤子墜到 ~50→80m 淡出，無字卡無震動；salvage 仍正常 reel→PAYOUT、無墜落 overlay；console 無 error、build 過、經濟三檔零改。
- **v2.6.3 失手也衝線：得手/失手前段統一（hao：鯊魚失手的表演錯了、前面都一模一樣(鯊魚衝線)、只差失手變獎勵得手斷線）**。舊失手＝一 resolve 就淡掉＋獎品直接出現（完全沒衝線）＝跟得手前段兩樣。改成 `armMiss`：失手也掛 `sh._cut={miss:true}`（同一衝刺）＋ `A.strikeRise`，**但不設 `V.cut`**（回合不結束、下潛照走）；`computeDanger` 改成「任何 `sh._cut` 進行中都拉滿危險值」→繩子在得手/失手都同樣受力(懸念)，失手衝完鯊魚游走(raw>1 淡出)、危險值自然鬆回。獎勵改「咬點現身」：`armMiss` 把本段 PRIZE 的 `spawnT/spawnX` 重設到咬點 lx、`_revealT=衝刺尾`，drawFish 在 `_revealT` 前不畫、之後**前景淡入**(不走遠景 murk intro)＝鯊魚化成獎勵的感覺。⚠ **純演出，經濟零動**（hao 選「這輪只做演出」；咬斷=0 的經濟改動暫緩，safe-bank 定案為「保留滾到下局」待實作）。dev 交互：`必失手`每段都會衝線+現獎；`必咬斷`的 <L7 中和鯊(`_devFadeT0`/非 spent)被 `armMiss` 跳過、不誤觸。驗證：miss 模式 charge 旗標(`_cut.miss`)+獎品 `_revealT` 現身+charge 期 danger 起(0.39→)+state 全程 SINK(不暫停)；rAF 凍結截圖：紫顎鯊衝到鉤上、上繩轉紫、前一段失手已化成 443.77 獎品魚；console 無 error、build 過、round.js 僅早先 `s.resolved` 非經濟旗標。
- **v2.6.4 咬斷=0（★動經濟）＋由遠而近＋變成獎勵特效（hao：做咬斷等於0；鯊魚要由遠而近；經過後變成獎勵要有特效）**：
  - **★經濟：咬斷=0（移除 v2.4 salvage）**。`round.js` resolveHazard 得手支：不再 `settleBase`，`baseBp=0`／`payoutBp=0`／`roundPayBp=0`＝本局漁獲全損；**`carryOutBp=carryInBp`＝safe-bank 咬不掉、滾到下局**（照 hao 定案）。driver 端自動跟上：`tickCut` 的 `baseBp>0` 恆 false → 一律 `endInCut`（真斷線演出），salvage reel／「saved +N」slam 從此不觸（`beginSalvageReel` 成 dead code，留作 fallback）。`settleBase` 純幾何無 rng → 拔掉不動 provably-fair 順序。**⚠ RTP 崩：`npm run sim`（30k，correctness/determinism gate 全 PASS）best-human ≥1× 從 ~82% → 56.4%、天花板 L18 71.1%**（仍 <100% ✓）。**注意 CLI sim 未穿 carry → 這是「no-carry」下限，真值略高但仍遠低於目標**。**待 hao 定重 tune 方向**（降鯊魚頻率／拉池倍率…，用 tuner.html），再跑 200k 凍結 gate。數字權威見 ECONOMY-V2。
  - **從屏幕外游入（v2.6.5 refine，hao：由遠而近→改成真的從屏幕外游入）**：`CUT_DUR` 0.42→**0.6s**；`armCut`/`armMiss` 的 `from` 改由 `sharkEntryFrom`＝`lx ± SHARK_ENTRY(360)`（鯊魚所在那側的**屏幕外**起點）；drawShark `_cut` 改成 `x=from+(lx−from)·chargeE`（charge=1 正好到線＝咬/穿的瞬間）、raw>1 續行**穿出另一邊**淡出。scale `0.88+0.42·chargeE`（進場即近滿尺寸、commit 時微 loom，因為牠在自己的水深橫向游入、不是遠景小點）、alpha `0.62+0.38·chargeE`。得手/失手共用。~~v2.6.4 曾用 scale 0.42→1.37 原地由小長大~~（hao 要「從屏幕外游入」而非原地放大）。實測 `from=-89/-46`＝可視框左緣(~33)外、chargeP 0.44 截圖鯊魚正從左緣游入朝線。
  - **變成獎勵特效（drawFish）**：PRIZE 在 `_revealT` 後 0.5s 畫**金色擴散環＋六道 sparkle 射線**（隨 rp 擴大淡出）＝失手鯊魚「化成獎勵」的一擊。
  - 驗證：sim gate PASS（見上）；rAF 凍結截圖：chargeP 0.31 鯊魚小而暗（遠）、獎品 reveal 當幀金環+射線盛開；console 無 error、build 過。

- **v2.6.6 啟動不再突然變色（hao：啟動開始時海水不該突然變色）**：兩個病根——①**idle/attract 背景是藍灰**（`#38607A…`＝boot 同色），一開始下潛切成 SHALLOWS strata 的**藍綠 teal**＝色相 pop（實測 idle mid `#1b3d5a`→dive `#133f4a`）；②**陽光穿透光暈只畫在 ambient**（idle）＝一下潛頂部由亮轉暗。修：ambient 背景改成**SHALLOWS strata 同色**（`#0F4D5C→#0C3A47→#0A2A36`）、`#boot`(deeper.html) 同步；陽光光暈**移到 ambient/非 ambient 都畫、隨 hookDepth 淡出**（`surfK=1−max(0,hd−160)/(8·LAYER_DEPTH)`＝水面滿、~L10 消失）＝淺水(含 idle)有光、深水沒有。實測 idle↔dive-start 色差 top/mid/low **9/3/4**（修前 195/29/36）＝幾乎無感。純 view＋boot HTML,經濟零動。

## 10. v2.7 sealed-pool 重凍結（2026-07-22）——深度不再改寫 RTP

### 10.1 問題不是「倍率太低」，而是模型把水池又做回 crash 稅

hao 指出「現在是水池模型，怎麼會跟深度有關」，並要求淺水對 97% 的誤差最多 4pp。v2.6.4 的正值 pool 仍會被鯊魚依下潛段數歸零，所以深度越深遇到更多 hazard、RTP 越低；這與「下注時已抽出水池」的契約矛盾。單純拉高倍率只會把深層補回來，卻留下策略依賴與套利面，不能解根因。

### 10.2 三 lane 分帳與不可變契約

- opening ordinary table 固定 EV **93.10%**，使 L3 與 97% 只差 **3.90pp**。
- L12 解鎖獨立 BEAST lane，held EV **3.905pp**，只把深水補到 **97.005%**；escape 只損這條 lane。
- 每筆 0.25× ANTE 各買一個獨立完整 **97%** pool，不沿用 opening 表，也不升格成 beast。
- 鯊魚仍照既定 RNG 順序耗 spawn/bite roll，但 LINE CUT 只可演已封存的 total ×0；200k 中正值 pool 誤殺 **0**。
- ordinary 未攤開殘額 carry 到下一局；CLI、tuner 與 live engine 都要穿同一 carry 語義，否則量測不是玩家實際經歷的序列。

### 10.3 200k 凍結結果

- determinism：80k bit-identical；correctness、RNG、事件頻率 gates 全綠。
- fixed-stop：L3 **93.1%**、L6 **94.7%**、L9 **95.4%**、L12 **97.0%**；L12–L30 **96.98–97.06%**，天花板 L28 **97.1%<100%**。
- human θ=1/1.2/1.5/2/3/5：**96.5/96.5/96.6/96.7/96.8/96.9%**；oracle 約 **96%**；reaction 0.15/0.28/0.45s 均約 **97%**（v2.8 2× motion 後重跑；best-human 與 fixed 曲線不變）。
- L20 beast 實測：WHALE 1/249、GREAT 1/813、MEGALODON 1/1667；實際 LINE CUT 約 **1.19%**。

### 10.4 方法論結論

結果先封存後，風險演出只能**揭露結果**，不能再成為第二套會修改結果的經濟引擎。若「多走幾段」本身能把正 pool 砍成零，那就不是水池模型，而是把 crash hazard 偷塞回水池外面。往後任何深度事件都要過同一個 gate：正 ordinary／ANTE／carry 是否可能被改寫；答案必須是零次。

## 11. v2.8 SINK 新層分散生成＋活海 2×（2026-07-23）

hao 指出：SINK 時新層魚與泡泡沿釣線集中淡入，會讓緊接著的 PULL 看起來像「線在閃」；同時水體活動性不足。

- **根因**：有價值魚的 `FAVOR_X=[0,8]` 幾乎鎖在線上；render 又把魚／泡泡從 `z+520/420` 的遠景投影中心放大，兩層機制一起把隨機生成視覺壓回釣線。
- **生成修正**：SCORE favored、bubble、scatter 改在釣線左右 **44–205px** 的層內位置生成；bubble/scatter 用一支既有 roll 映射左右兩側，**不增加、不刪除 rng 消耗**。render 移除 far-z zoom，只用 0.72s smootherstep 在實際位置原地淡入。
- **速度修正**：魚的主／次諧波、wander、bob、z breath，以及泡泡 sway／bob／z breath 統一使用 `ACTIVE_MOTION_SPEED=2`；線性 drift 維持 1×，避免把視覺加速偷渡成更快逃逸的經濟改動。PULL 的 sealed arrangement 與 `ADJ_RAMP` 不變。
- **驗證**：dev preview 實際手勢 DROP→SINK→PULL，L1 新生魚在左側、兩顆泡泡分列左右，未沿線冒出；PULL 早／中段無新物件沿線閃現，console 0 error。`npm run build` 通過；`npm run sim -- --rounds 200000` 全 gate 通過（80k bit-identical、正 pool cut 違規 0、L3 93.10%、L12–L30 96.98–97.06%、fixed 天花板 L28 97.1%<100%、best-human 96.9%）。

### 11.1 v2.9 巨獸倍率區間可調（2026-07-23）

hao 要求巨獸倍率範圍能直接設定。`CFG.beast` 從單一 `mult` 改為 `min/max`，預設為 WHALE **×3–5**、GREAT **×10–17**、MEGALODON **×30–60**；三列算術平均仍是原本的 ×4／×13.5／×45，因此理論 beast EV 維持 **3.905pp**。

- **不動 RNG 順序**：`drawPoolOutcome(openU)` 先用 `openU` 選 row；若是 beast row，再用該 row 內的條件位置 `(openU-rowStart)/row.p` 均勻映射 `min→max`。全程仍只有開局那一支 roll。
- **tuner 主旋鈕**：巨獸表新增「最小 ×／最大 ×」欄；RTP% 以區間平均倍率反推 `p`，輸入最小值高於最大值時同步抬高最大值。事件頻率目標也改讀現行 `drawP`，不再顯示退役的 1/10、1/30、1/100。
- **欄位對齊修正**：普通列與巨獸列改共用六欄 grid；普通倍率跨 `min/max` 兩欄置中，兩區的 RTP／多久一次落在同一垂直基線，掙脫欄加寬避免 number stepper 遮住 `0.25` 尾數。
- **200k 驗證**：80k bit-identical；range 違規 0，實測 WHALE ×3.00–5.00／GREAT ×10.00–16.98／MEGALODON ×30.25–59.82；L3 93.10%、L12–L30 96.98–97.06%、天花板 L28 97.1%<100%、best-human 96.9%，全部 gate 通過。

### 11.2 v2.10 進水／生成權重分離＋自動補完＋caught WYSIWYG（2026-07-23）

hao 明確指出「進水倍率跟表演不掛勾」，並要求魚、泡泡、RTP 分布都用更直覺的權重概念設定。

- **語義澄清（hao）**：「脫鉤」只指魚／泡泡的**生成率不由進水倍率控制**，不是顯示與賠付脫鉤。第一版曾錯做 hidden carrier＋bubble economic ×1，會造成「看到抓 100、實付 30」；同批撤回，改成魚 `score`／泡泡 `mult` 各只有一份真值。
- **三組獨立分布**：opening ordinary＋BEAST 是進水抽樣權重；魚值與泡泡倍率各自是生成權重。`settleBase()` 以本深度 exposed pool 為 ceiling，完整魚／泡泡組合付得起才拉到鉤上，付不起就安排在路徑外，不縮數字、不打折、不 softcap。
- **近失也必須看得懂**：付不起的魚設為 escaped 並偏離 corridor；未採用的泡泡也用平滑 `adjX` 移到爆破半徑外，避免畫面上像穿過鉤子卻被結算忽略。
- **RNG 順序保留**：魚 tier 重用既有 offset roll，泡泡 tier 重用既有 tier roll；PULL 對每顆真正 popped 的 bubble 固定消耗一支 assignment roll，從「uplift 可被剩餘 pool 容納」的 caught fish 中選 target，然後才消耗 beast escape roll。
- **tuner 權重 UX**：opening 表改成直接編輯「權重 %」，RTP 貢獻為唯讀衍生值；魚／泡泡用滑桿＋數值框。三組都採同一規則：改一列後，其餘列按原比例分配剩餘值，其他全 0 時平均補，百分之一精度保證合計恆為 100%。分段色條同步顯示整體分布。
- **tuner clone 邊界 gotcha**：`run()` 會 `structuredClone(cfg)` 再送 Worker；分布色條的 `HTMLSpanElement` 只能留在 `poolCtl` view state，不可掛回 CFG row。瀏覽器驗證曾抓到 `DataCloneError`，移出 DOM 參照後自訂權重與預設權重都能完成 12,000×12 模擬。
- **正確性 gate**：新增 fish tier 全覆蓋、bubble tier／畫面精度、popped assignment，以及 `Σ caught fish shown bp === baseBp` 的逐局 WYSIWYG 檢查；後續自然路徑版的現行 200k 結果見 §11.3 與 ECONOMY-V2 §0″。

### 11.3 PULL 路徑先成立、跨深度自然命中（2026-07-23）

hao 指出舊版即使 WYSIWYG 數學正確，PULL 仍會露出 arranger：`settleBase()` 在 PULL 瞬間替 caught fish 寫 `adjX`，魚會突然衝進線；同時 bottom→top greedy 先花掉 budget，讓上方魚成片閃避，看起來像系統只准開固定數量。

> 本節的「每層一隻 route fish 預靠線」是中間版，已被 §11.4 自由泳定稿取代；保留作為為何不能預先貼線的決策紀錄。

- **路徑先成立**：每層 SCORE 魚仍先在 44–205px 的隨機位置淡入，只選一隻以既有 seed rank 在 0.48s 內自然游到距線 3–6px 的 route ribbon。動作大多落在 0.72s 淡入期，最早 PULL contact 前已完成；caught fish 不再設定 `adjX`，只保留接觸時 ≤hook radius 的 0.22s 咬鉤收束。
- **路徑資格不讀預算**：route fish 每層恆為一隻，不再由舊 `favored = layer offer > threshold` 決定；因此上、中、下都有相同機會先成為路徑候選。PULL 僅能選 route-committed fish，decoy 的瞬時擺動不參與 payout，時機套利仍為 0。
- **跨深度分配**：可賠付組合以既有 `routeRank` 排序，再由 pool ceiling 完整裝入；不按深度排序。付不起且真的在路徑上的魚才於鉤接近時做 near-miss，其他魚維持自然游線。
- **演出不提前劇透**：魚身金色 caught 狀態延後到 `_grab` 真接觸後才亮，不再在 PULL 一開始把整條命中名單染金。
- **新增 gate**：每隻 caught fish 的預測 corridor gap 必須 `< CATCH_RADIUS`；L12 的 caught fish 另統計上／中／下三區，防止日後重構重新 bottom-pack。
- **200k 正式凍結**：80k bit-identical；pull timing 差異 **0/1,482**；自然 corridor／WYSIWYG／bubble assignment／巨獸 range 全部 **0 違規**；上／中／下 caught **10,641／10,811／10,854**；L3 **93.10%**、L12–L30 **96.95–97.04%**、fixed 天花板 L24 **97.0%<100%**、best-human **96.4%**。完整數字見 ECONOMY-V2 §0″。

### 11.4 SINK 全自由泳＋PULL 自然碰撞（2026-07-23）

hao 再指出 route fish 雖消除了 PULL 瞬移，卻製造另一種割裂：SINK 時可賠付魚都繞在線旁，一 PULL 未採用者才游走，仍像先知道結果。定稿撤回整套預靠線。

- **魚／泡泡不再被 arranger 移動**：移除 `commitLayerRoute()`／`routeDx`；所有 SCORE 與 bubble 從 44–205px 隨機位置淡入後只走原始閉式軌跡。`settleBase()` 對魚、泡泡都先算未修改的 `tPass` corridor gap，只有 `< CATCH_RADIUS／POP_RADIUS` 才能成為候選；caught／popped 不設 `adjX`，未 pop 泡泡也不再被推離。
- **魚 3.2×、泡泡 2×**：SCORE 的主／次諧波、wander、bob、z breath 提到 3.2×；horizontal excursion 改為 pool／depth 無關的 34–72px。普通魚撤掉永久線性 drift，改成快速但有界的游線，避免上層魚因活得較久全部漂出場；SCATTER／PRIZE／bubble 的特殊 drift 保留。
- **跨深度仍無偏**：自然候選按 seed rank 裝入而非 bottom→top；gate 量測 L12 上／中／下 caught，防止舊偏差回來。
- **水池時機語義修正**：自由泳使不同 PULL 時機可以改變本次 `baseBp`，但未交付 ordinary 進 `carryOutBp`；新 gate 比對 `payoutBp + carryOutBp`，必須完全一致。這不是 timing 產值，而是同一 sealed value 在現在／之後之間移動。
- **固定 bubble RNG**：自然幾何會改變 pop 數；若只在 popped 時耗 assignment roll，後面的 beast escape roll 會偏移。改為每顆已生成 bubble 在 PULL 都恆耗一支 assignment roll（miss 也耗），popped 才使用該 roll 選魚；因此 geometry 不再改寫巨獸 verdict。這是新的 provably-fair stream 版本，與更早 seed 不對齊。
- **正式凍結**：200k 數字見 ECONOMY-V2 §0″；預覽驗證 SINK 魚／泡泡分列隨機位置，魚在 0.45s 內持續跨場游動，PULL 畫面中 25／100 魚維持在線外自然擦過，console 0 error。
- **200k 結果**：80k bit-identical；自然 corridor／WYSIWYG／bubble assignment／巨獸 range 全部 0 違規；paid-now 隨 timing 不同 **1,152/1,482**，`paid-now + carry` 違規 **0/1,482**；L12 上／中／下 caught **6,424／6,583／6,379**；L3 **93.10%**、L12–L30 **96.96–97.03%**、fixed 天花板 L12 **97.0%<100%**、best-human **97.0%**。

### 11.5 方向性巡游＋可見輪廓碰撞（2026-07-23）

hao 指出自由泳雖然已不預靠線，但多組高頻正弦疊加讓魚呈現「一頓一頓地跳」；同時中心點固定半徑會讓大魚／大泡泡在畫面已相碰時仍被判 miss。

- **根因**：舊 `fishX()` 同時加主波、2.3× 次諧波與 3.2× wander；瞬時速度頻繁互相抵消／加成，朝向又只用 `vx>=0` 直接鏡像。數學位置連續，視覺語義卻是抽動。
- **單一巡游相位**：沿用原本 `swimFreq` 那一支 RNG，改存 `swimSpeed`，不改消耗數量或順序。SCORE 各抽 32–68px/s，位置用 `amp·sin(speed/amp·life+phase)`；轉向間隔由個體 amp／speed 自然形成，慢 wander 降為原幅度 22%。SCATTER／PRIZE 保留更快個體區間。
- **平滑轉身**：render 以連續 `tanh(vx/18)` 當水平 foreshortening；魚在端點先側薄、再翻面，不做瞬間 `scale(+1↔−1)`。尾頻由個體速度衍生，快魚尾拍也較快。
- **輪廓即碰撞真相**：魚身尺寸與泡泡半徑移到 engine/render 共用常數；接觸半徑至少保留 26／20px，再按透視後可見輪廓擴張。自然接觸的物件必定得到 catch/pop 或 explicit near-miss verdict；付不起者在鉤逼近時才滑到「輪廓半徑＋14px」外，泡泡也不再淡掉後被鉤穿過。caught fish 掛線時保留接觸側 offset，避免把中心吸到線上。
- **新增 gate**：SCORE `swimSpeed` 必須落在 32–68 且樣本覆蓋兩端；每個可見輪廓接觸必須 resolve；caught gap 必須小於該魚自己的動態 contact radius。正式 200k 數字同步於 ECONOMY-V2 §0″。
- **預覽驗證**：連續 280ms 截圖中，同一隻魚先側薄再換向，兩隻魚位移速率不同；零獎 PULL 樣本的 25／100 魚全程保留在線外，鉤未穿過魚身。

### 11.6 魚倍率選項擴充（2026-07-23）

- `CFG.fishAppearance` 由 ×0.5／×1／×2／×3 擴充為排序後的 **×0.2／×0.5／×1／×1.5／×2／×3／×5**。
- 新增 ×0.2／×1.5／×5 預設權重為 0%，所以未調 tuner 的出貨行為與既有 seeded mapping 不變；它們仍是完整可編輯列，任一拉高後由相同 rebalance 規則讓其他列按比例補完，合計恆為 100%。
- sim 的 tier coverage gate 只要求正權重列必須實際出現；0% 選項仍會驗證「若出現，其值必須屬於 CFG row」，不把預設關閉誤判成 coverage failure。

### 11.7 v2.11 RTP 匿名化＋巨獸門檻式純表演（2026-07-23）

hao 再次把「進水／表演分離」的邊界說清楚：RTP 分布本身也是純權重，**不能在列名上預先指定魚或巨獸**；巨獸應在結算超過可設定倍率後才開演，而不是擁有一條會加錢或扣錢的經濟 lane。

- **資料模型去角色化**：`CFG.ordinary`／`CFG.beast` 改為 `poolExact`／`poolRange`。固定與區間列合計 100%，row 只含倍率、範圍與概率；tuner 顯示「結果 A…／區間 A…」，不顯示魚名、巨獸名、逃脫率或深度門檻。
- **97% 重分配**：保留舊表各倍率的合計 EV 結構，但把 deep-only 3.905pp 直接併回匿名 opening。`0@.15048 / .5@.4 / 1@.3 / 2@.1 / 5@.0462 / 3–5@.002 / 10–17@.0009 / 30–60@.00042`，`Σp=1`、raw EV **97.005%**。
- **先結算、後選戲**：PULL 完成 `base + carry` 後，以實付倍率和 `CFG.beastShowFrom` 比較；達標才令 `whaleTriggered=true`。tier 依門檻的 ×1／×3／×10 切三段，預設門檻 ×10、控制台最低 ×0.5，避免 0 使所有正回報都落入最高 tier。`beastShowBp` 必須逐 basis-point 等於 `payoutBp`，`whaleBp` 永遠為 0。
- **不動 seed stream shape**：舊 beast escape roll 仍在每次 PULL、bubble assignment 之後恆耗一支；production 不再用它決定錢或 escape，只保留 5% 無害假預告。因此同一批自由泳 seed 的後續消耗順序沒有再偏移。
- **深度語義收斂**：移除 `BEAST_MIN_L` 與 deep-only held lane。所有固定深度的 opening／ANTE 長期期望都約 97%；越深只因總投入、可見物件與 handle 增加而更常自然跨過表演門檻，不再因「潛到 L12 才送 EV」扭曲水池模型。
- **tuner UX**：RTP 卡只編匿名固定／區間權重並自動補完；巨獸另有「啟動倍率 ×」數值欄。模擬結果中的巨獸表只報各視覺 tier 的實測頻率與實付倍率區間，讓 operator 分得清哪個是數學、哪個是 show pacing。
- **gate 擴充**：新增門檻應觸發必觸發、不應觸發不得觸發、tier 正確、production escape 為 false、表演目標等於已付金額等逐局檢查。正式 200k 數字同步至 ECONOMY-V2 §0″。

### 11.8 v2.12 達標後再抽巨獸表演機率（2026-07-23）

hao 補充：高倍結算達到指定倍率只是取得巨獸表演資格，**不代表每次都要 100% 播放**。

- `CFG.beastShowP` 新增為純表演節奏參數，預設 **0.50**，tuner 以 0–100% 編輯；`beastShowFrom` 仍先判倍率資格。
- PULL 的既有最後一支 roll 改名為 beast-show roll：正常 PULL 恆耗一支，`qualified && roll < beastShowP` 才 `whaleTriggered=true`。未達標可沿用 `<5%` 假預告；達標但未中表演則不播預告，直接按原結算流程完成。
- 不新增 rng、不改 consume order；鯊魚在 SINK 已結束的 cut round 不進 PULL，因此沒有 show roll，沿用既有 stream 語義。
- sim gate 直接逐局驗證 `triggered === qualified && showRoll < beastShowP`，並繼續要求表演金額等於已付金額、`whaleBp=0`、production escape=false。
- tuner 在同一「巨獸表演」群組並列「啟動倍率 ×」與「表演機率 %」，兩個 visible label 都綁定自己的 number input；頻率標籤明示「倍率門檻 × 表演機率」，避免把 50% 誤讀成中獎率。
- 定向功能驗證以 3000 組相同 sequence 比對：共 86 次達標，`0%→0` 次表演、`50%→43` 次、`100%→86` 次，0%／100% payout mismatch 為 0；快速 30k correctness／determinism 亦為 PASS。
- 依 hao 指示，本批先交功能驗證，正式 200k 重凍結暫緩；ECONOMY-V2 §0″ 明確保留 v2.11 RTP 基線，不把舊表演頻率冒充 v2.12 結果。

### 11.9 v2.13 RTP-first 十組調控層（2026-07-23）

hao 明確修正 operator 語義：**RTP 分布要分配 RTP，不是直接編輯 probability weight**。

- tuner 先設定目標 RTP，再提供 10 組統一 row。最初使用 `中心倍率／±浮動範圍`，2026-07-24 依 hao 指示改為更直接的 `最小倍率／最大倍率／RTP 佔比／多久一次`：上下限相同即固定、不同即區間；舊保存資料載入時只在記憶體自動換算成 min/max，直到 operator 下次親自保存才寫回。hao 也已澄清「群組」不是所需語義，因此不設 selector。空白 row 保持 0，不會因自動補完的四捨五入餘數被意外啟用。
- 改任一 RTP 佔比時不再按原比例分攤：增加量從最低倍率 row 開始扣，不足才按倍率下限往上扣抵；降低量優先回補最低倍率 row。目標 RTP 本身增減也走相同的低倍優先規則，並以 0.001pp 精度保持合計。內部仍以 `p = RTP佔比 / 平均倍率` 反推抽樣概率，`1/p` 顯示多久一次，剩餘概率自動補成 ×0。概率權重已從 RTP 卡移除。
- 目標 RTP 同步縮放 ANTE pool 的 EV，保留其原有分布形狀，避免 opening 改成 96% 時深潛 ANTE 仍偷偷維持 97%。
- 數學上無效的配置（正值列 `Σp>1`、有 RTP 卻倍率為 0）會顯示具體原因並禁用「跑模擬」；頁面載入不再自動啟動 RTP 模擬。
- 瀏覽器定向驗證：目標改 96% 後合計精確 96.000%、未啟用 row 維持 0；現行最小＝最大會生成固定列、最小＜最大會生成區間列；無效案例會阻止執行。540px 寬度無橫向溢出；正式 200k 依使用者指示暫緩。

### 11.10 v2.14 鯊魚獎品倍率區間（2026-07-24）

- `CFG.sharkPrizeMin/max` 集中管理失手鯊魚轉成 PRIZE 魚的倍率，預設維持 ×3–×10；tuner 在鯊魚群組增加可見 label 綁定的最小／最大數值欄，最小抬高時會同步抬高最大，最大低於最小時就地修正。
- `makePrize()` 把既有第一支 value roll 套入設定區間做 log-uniform 抽樣；沒有新增或重排 RNG。PRIZE 顯示值仍是唯一 `score` 真值，付不起由自然路徑 miss，不暗改賠付。
- sim correctness gate 新增 PRIZE 區間逐魚檢查；本批依使用者先前指示不跑 RTP，僅做 ×4–×12 定向邊界驗證（最低 4、最高 11.99999999999）、語法與 build。

### 11.11 v2.15 四帶每段演出密度權重（2026-07-24）

- 移除全局 `fishMin/fishMax`、`bubbleScale`、`scatterScale`，改為 `CFG.spawnDensity[SHALLOWS|REEF|DEEPER|ABYSS][fish|bubble|scatter]`。每列都有 0／1／2／3 個的權重，獨立合計 100%。
- tuner 以四個帶區塊顯示 12 列權重控制。第一版四支並列 slider＋number 太高、太吵，第二版「選項 chips＋另一支 slider」仍無法一眼讀分布；hao 兩次明確打槍後，現行每列改為**唯一一條高對比堆疊 BAR**（灰藍／青綠／金／紫）：色塊寬度就是 0／1／2／3 的實際比例，點色塊或名稱選取後，拖動唯一分界把手直接改寬度。拖高目前項目會即時按原比例扣除其他項目，拖低則補回，合計鎖定 100%。同一控制也套用魚／泡泡倍率權重；0% 項目仍可從名稱選回，列首即時計算每段期望數量。
- 方向性邊界續修：選中色塊後同時提供左界／右界（首項只有右界、尾項只有左界）。拖右界只縮放目前項目右側的權重，左側 cents 完全不動；拖左界反向處理。這避免調整高倍右側時把低倍左側已定案比例一起打亂。
- 引擎重用 fishCount／bubbleCount／scatterPresence 原本各一支 roll，改映射到 count 權重；預設 `[0,50,50,0]`、舊各帶 bubble 分布與 `[1-p,p,0,0]` 金魚分布保持舊 seed mapping。調成 2／3 個時，新增實體自然消耗其自己的既有 entity rolls。

### 11.12 tuner 保存層與參數所有權（2026-07-24）

- header 收斂為唯讀的「最後設定時間」，不再放保存按鈕；任何參數改動都不會自動寫入，跑模擬也不等於保存。
- 有實際草稿改動時，viewport 底部浮出「恢復已保存（未保存過則恢復預設）／保存」操作列；未改動時收起。恢復只改工作草稿，不碰保存層。
- operator 親自保存後，`localStorage` 的 `deeper:tuner:saved-config:v1` 成為 tuner 真實調控值；重新載入時逐欄 merge，保存值優先，程式 `CFG` 只提供缺少欄位與新增欄位的預設。`↺ 還原預設` 也只形成未保存草稿，必須再由 operator 保存才會覆蓋。
- 保存成功同時透過 `storage`＋`BroadcastChannel` 通知遊戲。遊戲只白名單套入 engine CFG 欄位，忽略 tuner 專用的 `targetRtp/poolRows`；IDLE 立即 `applyCfg` 並清掉 idle preview cache，進行中回合只先排隊，`endRound`／下一局 `createRound` 前才套用，防止同一 seed 的半局被兩套數值切開。遊戲重開時也會讀最後保存記錄。
- 協作權限邊界：Claude Code／Codex 只能修改 repo 內預設值與 UI，不得主動點保存、寫入、重置或替 operator 改動保存層。
- 模擬結果初始、參數改動後與執行中都進入 skeleton 屏蔽：KPI 名稱、圖表軸／柱狀輪廓與巨獸表欄位仍可辨識，但不顯示假的或過期數字；只有 `finish()` 收到真 `simSummary` 才解除 `aria-busy`。
- 定向 one-hot 驗證四帶分別得到 `0魚/3泡/1金魚`、`1/2/2`、`2/1/3`、`3/0/0`；語法、diff 與 build 通過，正式 RTP 依使用者指示暫緩。

### 11.13 PULL 接觸時鐘對齊（2026-07-24）

- 根因不是 catch radius：`settleBase` 以段底 `layerDepthY(L)`＋固定 `REEL_SPEED=420` 預測接觸，但 live hook 從玩家實際深度起拉，畫面又以 280／448／672px/s 變速、bubble/scatter hitch 停鉤；魚在兩個時鐘間繼續游，於是會出現「引擎判 miss、畫面經過時已碰到」。
- `pull/previewPull` 新增可選真實起拉深度，live driver 傳入 `V.hookDepth`；headless/sim 省略參數時仍沿用段底，既有策略語義與 RNG 消耗不變。
- live reel 改為實體鉤固定使用同一個 `REEL_SPEED`，並精算 windup 跨幀剩餘時間；hitch 只保留 shake/flash/audio，不再停住鉤子。這是接觸表演對齊，不改 CFG、pool、半徑或 RNG。

### 11.14 泡泡可見輪廓接觸（2026-07-24）

- `BUBBLE_BODY_RADIUS` 本來就是 canvas 畫出的半徑，但舊 `bubblePopRadius` 又縮成 72% 後只加 7px，等於泡泡外圈有一大片看得到、判定卻不存在。現改為完整透視後半徑＋14px 可見鉤身伸出範圍，最大 cap 78px。
- 經濟 `b.popped=true` 在 PULL 時已封存，但 render 不再因此立刻刪除泡泡；只有 live hook 到達泡泡深度、`tickReel` 設 `_popped` 的 frame 才消失並爆開。爆點由未投影 `bubbleX` 改成 `bubbleProjectedX`，和玩家看到的玻璃圓位置一致。
- 這會擴大泡泡自然接觸候選、影響 paid-now／safe carry 的交付時機；未改泡泡面值、pool 上限或 RNG。依 hao 先前指示先做定向功能驗證，正式 RTP gate 暫緩。

### 11.15 魚／泡泡／失手鯊魚統一接觸（2026-07-24）

- `fishCatchRadius` 原本只取 archetype size 的 68%＋8px，巨魚與 PRIZE 的可見頭尾大量落在判定外。現和泡泡統一為「完整投影輪廓＋14px 鉤身 reach」，cap 96px；最小 `CATCH_RADIUS` 仍保留。
- 鯊魚攻擊線時仍是 hazard，且 charge 到線的 frame 一定揭曉 bite／miss；miss 轉成的既有 PRIZE 才是 PULL 可勾物。PRIZE render 補上背鰭、腹鰭、重下顎與金色 rim，視覺上仍讀作鯊魚形獎勵，而其幾何直接走同一 `fishCatchRadius`，不再另設不可見 shark catch lane。
- 未新增 payout、未改 PRIZE 顯示值、pool 上限或 RNG；擴張輪廓只改 paid-now／safe carry 交付時機。正式 RTP gate 仍依 hao「先完成功能快速驗證」指示暫緩。

### 11.16 RTP 低倍優先補差＋巨獸高到低階層判定（2026-07-24）

- RTP 佔比不再按其餘列原比例攤平。增加高倍列時，依倍率下限從最低列開始精確扣抵，最低列不足才歸零並扣下一列；降低列值或提高目標 RTP 時，差額優先回補最低倍率列。內部維持 0.001pp 整數單位，避免浮點尾數啟用空白列。
- `CFG.beastShowFrom/beastShowP` 改為三列 `beastShowRules[{tier,min,p}]`；tuner 以高→低順序顯示 LIVYATAN／MOSASAUR／GREAT WHITE 的水池門檻與表演機率。舊保存值只在記憶體無損遷移成 ×1／×3／×10 三階，不自動寫回。
- PULL 表演資格改讀 `beastShowBudgetBp = payoutBp + carryOutBp`，即本局 sealed pool budget。判定從最高階往下；高階 miss 才嘗試下一階。既有單一 show roll 以連續概率區段重現逐階獨立 Bernoulli：三階皆 70% 時依序為 70%／21%／6.3%／2.7% none，沒有新增 RNG 消耗。
- 所有表演分支仍要求 `beastShowBp === payoutBp`、`whaleBp === 0`，只換演出不換錢。本批依 operator 先前指示只做定向階層／RNG／建置驗證，正式 200k freeze 暫緩。

### 11.17 大白鯊斷鉤概率＋一般鯊魚口徑釐清（2026-07-24）

- 一般水中鯊魚維持兩段概率：每段 `sharkSpawnP=12.5%`，出現後 `sharkBiteP=20%`，表面 bite attempt 為 2.5%／段；但 v2.7 sealed-zero gate 仍在，所以只有當局 ordinary pool 已為 ×0 才真的斷線。tuner 改以百分比顯示並在欄位旁明示此條件，兩值 runtime 均 clamp 0–100%。
- GREAT WHITE 的 `beastShowRules[0]` 新增 `breakP`（預設 0%）；tuner 在同一階層表增加「斷鉤 %」欄，只有 GREAT WHITE 可編輯，MOSASAUR／LIVYATAN 顯示破折號。
- 不新增 RNG：既有 show roll 先完成高→低 tier selection，落在 GREAT WHITE 命中區段後，再以該區段內的 normalized position 判斷 `breakP`。斷鉤只走 `snapline` 視覺；結束時全額 credit balance，字卡改為 `LINE BROKEN / PAYOUT SECURED`，永久移除 production `IT GOT AWAY` 吞獎語義。

### 11.18 普通鯊魚改為水池無關的純表演概率（2026-07-24）

- hao 立即修正：普通鯊魚咬斷不應先看 sealed ×0，而要直接按表演設定判定。`resolveHazard` 因此改為 `hit = biteRoll < SHARK_BITE_P`，保留每隻出現鯊魚恆耗一支 bite roll 的 stream。
- 經濟安全改由 carry 保證：咬斷當局 `payoutBp=0`，但 `carryOutBp = ordinaryPoolBp + carryInBp`，完整保留當局 opening／ANTE 預算與既有 safe-bank。玩家失去本次交付節奏，不失去已抽中的價值。
- 預設仍是每段 12.5% 出現 × 出現後 20% 咬斷＝2.5% cut／實際經過段；tuner KPI 改用真實 `Σ stopL` 作分母，兩個設定欄均以 0–100% 顯示並 clamp。

### 11.19 金魚預告＋蒼龍零分斷鉤（2026-07-24）

- 玩家／operator 文案將「金鱗」統一改為「金魚」；內部 `SCATTER/scatter` 保留作既有型別相容，不改 entity/RNG 結構。
- 新增 `CFG.goldFishTeaseP`：每隻金魚獨立決定是否播放大白鯊剪影。判定重用 `makeScatter` 既有第一支 z roll；live 只在 SINK/HOLD 掛 1 秒背景 `beastTele`，不換 state、不壓暗、PULL 時清掉，絕不直接呼叫 `startWhale2`。因此剪影明確可落空。
- `beastShowRules[1].zeroBreakP` 是 MOSASAUR 專用的零分斷鉤概率。PULL 的完整 sealed budget（paid-now＋carry-out）為 0 時才用既有 show roll 判定；命中後播放完整蒼龍鏈並以 `LINE BROKEN / MOSASAUR STRUCK · +0` 結束。正值 pool 即使本局沒抓到、轉進 carry，也走原本高到低階層且 MOSASAUR 強制不斷鉤。
- tuner 巨獸頻率表新增「大白鯊預告」與「預告→真咬」；斷鉤欄同時顯示每幾局與該巨獸出現後的條件斷鉤率。蒼龍零分斷鉤計入 MOSASAUR 出現與斷鉤統計。
- 快速定向驗證：金魚預告 0%→100% 的 500 組同 seed 賠付／carry／show roll／接觸／捕獲 0 差異；零分蒼龍 200/200 斷鉤；正 50× carry 的蒼龍 200/200 出現、0 次斷鉤、200/200 全額支付。依 operator 指示未跑長 RTP gate。

### 11.20 倍率保證巨獸／PULL 事件鏈／SINK 鯊魚分區（2026-07-24）

- hao 重訂三個控制語義：原巨獸倍率表只保留「門檻 ×／機率 %」，移除旁邊的斷鉤；此路徑抽中就完整給獎並保證不斷。一般鯊魚區改名為「SINK 事件－鯊魚（SINK 每段都抽）」。
- 新增「PULL 事件－巨獸（PULL 各階段都抽）」四項：有鉤到金魚→預告、無金魚→預告、預告→GREAT WHITE、GREAT WHITE→MOSASAUR。金魚條件讀的是 `settleBase` 後實際 `st.scatters>0`，不是 SINK 生成數；因此移除 v2.19 的 spawn-time 預告與 SINK 剪影 queue。
- 強制巨獸表演（倍率保證路徑）優先；只要選中任何巨獸便整組跳過 PULL 事件鏈，只有非強制巨獸局才抽該事件，避免同一 PULL 出現兩個互相衝突的 verdict。事件鏈沿用既有單一 show roll，以固定 hash salt 導出三段 uniform，不新增 PRNG 消耗。想演出的獸若高於 sealed budget 門檻才 `lineBroken=true`；斷鉤只換表演，正 payout 仍 `PAYOUT SECURED`，0 payout 顯示 `NO PAYOUT · +0`。
- REELING 背景剪影現在同時承接真／假 PULL 預告：假預告游完即消失，不進 gap／`startWhale2`；真咬才走空窗後衝出。倍率保證巨獸仍保留原預告→衝出節奏。

### 11.21 強制巨獸 PULL 的金魚引子（2026-07-24）

- hao 要求倍率保證巨獸不要在 PULL 中無由來直接開演：強制巨獸局需在回收路徑較深的隨機位置安排一隻金魚，並且不能讓玩家看到它突然生成。
- `doPull()` 在引擎已完成 settlement、`directBeastShow=true` 後才呼叫 `armForcedBeastGold()`。新魚沿用 `makeScatter()` 外觀／自由泳模型，但標記 `_showOnly`、`score=0`，只加入 live `st.fish/st.caught`；刻意不增加 `st.scatters` 或 `pullHadGoldFish`，所以不改 payout、carry、PULL 事件條件或 headless sim。
- 視覺亂數由既有 `beastShowRoll + L` 做獨立 deterministic fork，不消耗 provably-fair stream。深水把魚放在當下鏡頭上方最深的安全點並留隨機縱深；淺水跑道不足則從隨機左右畫面外游入。兩種模式都反解 `fishX(contactT)`，讓它在 `PULL_WINDUP + (fromDepth-depth)/REEL_SPEED` 的真接觸時刻落在線上，沒有 PULL-time 補位。
- `tickReel()` 在該魚尚未 `_grab` 時暫緩倍率巨獸 telegraph；金魚被真實鉤到、播放既有金色 SCATTER hit 後，下一拍才啟動剪影／衝出。淺水 DEV 利維坦逐幀驗證：首幀畫面內無新增魚→金魚從右側外游入→鉤中爆金環→巨獸衝出；console 無錯，`npm run build` 通過。未改 CFG 預設，未重跑 RTP gate。
- **統計口徑補漏**：金魚引子使「所有強制巨獸都先有大白鯊預告」更明確，但 `simSummary` 仍只用 `pullBeastTeased/pullGreatWhite/pullMosasaur` 統計非強制 PULL 事件，導致預告顯示反而低於 GREAT WHITE。改成全演出漏斗：`whaleTease`＝兩路徑真／假預告、`whaleTriggered`＝預告後真咬、`beastTier>=1`＝真咬後升到蒼龍；表頭由「PULL 預告」改為「大白鯊預告」。只修摘要，不改 engine verdict、RNG 或參數。
- 定向驗證：零 budget 事件鏈 200/200 升 MOSASAUR 並斷鉤；50× budget 事件鏈 200/200 升 MOSASAUR、0 斷鉤；帶舊 `breakP/zeroBreakP=100%` 的倍率保證 MOSASAUR 200/200 給獎且 0 斷鉤；事件全關／全開 500 組同 seed 經濟欄 0 差異。正式長 RTP gate 依 operator 指示暫緩。

### 11.21 模擬按鈕原位狀態（2026-07-24）

- header 移除可見 `#status` 佔位，保留為 `aria-live` 的 sr-only 狀態；使用者按同一顆 `#run` 後，文字立即由「跑模擬」原位切成「模擬中…N%」並 disabled，完成恢復，失敗則原位顯示「重試模擬」。
- 既有頂部金色 progress bar 與 results skeleton 保留；不新增第二顆按鈕或重複可見狀態。按鈕固定最小寬度，切換長文字時 header 不位移。純 tuner UI，未改 CFG、保存層或模擬引擎。
- 「最後設定」時間由按鈕左側移入同一個 `.run-stack`，置中排在按鈕正下方；按鈕／時間共用 122px 最小寬度，保留原時間格式與保存來源。

### 11.22 調控台說明與巨獸平均開獎倍數（2026-07-25）

- 機制說明補上四帶 **3／6／9／12 段**、全程 30 段，以及 12 個 fixed-stop 深度與 L20 事件統計口徑。
- 巨獸表演頻率新增「平均開獎倍數」；只對實際觸發該階表演的樣本，以 `beastShowBp ÷ BP` 取平均。這是已封存實付獎金相對 base stake 的統計，不改門檻、概率、RNG 或保存參數。
- RTP 目標、倍率上下限與 RTP 佔比的 number input 在輸入期間不再被 repaint 回寫；可直接清空後輸入多位數／小數，失焦時才正規化顯示。有效數值仍即時依低倍優先規則補差，保存語義不變。

### 11.23 四帶倍率遞增＋數量／倍率同區設定（2026-07-28）

- `CFG.appearanceByBand` 讓 SHALLOWS／REEF／DEEPER／ABYSS 各自擁有魚與泡泡倍率權重；魚平均約 **×0.54→×0.86→×1.20→×1.66**，泡泡約 **×3.39→×4.52→×6.76→×8.92**。倍率 tier 仍重用每隻實體原有 roll，不增加或調換 RNG。
- tuner 移除兩個全域倍率區塊，改在每個深度帶中依序放「每段數量」與「倍率權重」，兩者沿用同一條堆疊 BAR 操作。四帶標題同步標出 3／6／9／12 段與米制範圍。
- 舊 operator 保存值不被預設偷換：舊全域 `fishAppearance/bubbleAppearance` 只在記憶體複製到四帶；只有 operator 親自保存後才落成新格式並同步遊戲。
- 30k 快速 gate 與正式 200k freeze 均全綠：80k bit-identical；四帶魚／泡泡所有正權重 tier 皆有樣本；WYSIWYG、可見接觸、自然路徑、paid-now＋carry 均 0 違規。
- 200k 數字：fixed-stop 天花板 **L3 97.21%**，L12–L30 **96.90–96.96%**；最佳人類策略 **97.0%**，全部 <100%；普通鯊魚 spawn／段 **12.52%**、咬斷／段 **2.49%**。完整證據同步至 ECONOMY-V2 §0″。

### 11.24 tuner 寬版設定佈局（2026-07-28）

- tuner 最大工作寬度由 1320px 擴到 1760px。第一版仍把結果／設定做成左右兩條長欄，使用者截圖直接指出捲到深度參數後左側會整片空白；因此同批修正為結果摘要在上、設定全寬在下，不再保留不等長側欄。
- 980px 以上結果摘要先排兩欄，1440px 以上排三欄；1180px 以上四組事件參數排成 2 欄、四個深度帶排成 2×2，機制說明同步雙欄。980px 以下仍依 DOM 順序維持單欄。
- 巨獸頻率表由自己的可鍵盤聚焦捲動容器承接，不讓整頁產生水平捲動。1280×720 實機量測：結果卡 **612／612px＋頻率表 1240px**、設定主欄 **1240px**、事件與深度子欄均 **591／591px**、八組倍率 BAR 溢出 0、頁面水平溢出 0、console 0 error。
- 本批只改 `tuner.html` 版面與可及性包裝，未觸碰 CFG、保存層、模擬引擎或 operator 已保存參數；`npm run build` 通過。

### 11.25 倍率／表演分群與四階識別（2026-07-28）

- tuner 設定區重整為四個固定 domain：**01 倍率模型**收 RTP 匿名倍率表與深度加注；**02 表演事件**只收保證巨獸、PULL 巨獸與 SINK 鯊魚；**03 四階深度**收各階數量與魚／泡泡倍率；**04 機制說明**。頁首增加四個 44px 高分類入口，平滑捲動並以 92px scroll padding 避開 sticky header。
- 「倍率巨獸」在 UI 改稱「保證巨獸（讀取水池門檻）」，避免與倍率數學群混淆；程式 key、判定與保存格式不變。1180px 以上三條表演規則並排成三欄，數學與表演不再共享同一張設定卡。
- 四階用不只一種線索識別：01–04、英文 band、中文層級、米制範圍／段數，加上 SHALLOWS 金、REEF 青、DEEPER 藍、ABYSS petrol violet。階段入口可直接跳到 `#band-*`；每階內再以 `A · 每段數量`／`B · 倍率權重` 分開兩種控制。

- 1280×720 實機驗證：分類四欄各 302px、表演三欄各約 389px、深度雙欄各約 593px；分類與 ABYSS 錨點均停在 header 下 92px；頁面與全部數量／倍率 BAR 水平溢出 0、console 0 error。`npm run build` 與 `git diff --check` 通過。
- 本批純 UI／資訊架構，不改 CFG、RNG、模擬或 operator 保存值，不需重跑經濟 gate。

### 11.26 手機觸控與雙擊縮放修正（2026-07-28）

- `deeper.html` 移除 viewport 的 `maximum-scale=1,user-scalable=no`，不再犧牲輔助縮放；遊戲畫布維持 `touch-action:none` 接管 DROP／SINK／PULL，boot、錢包、BET 與按鈕熱區使用 `touch-action:manipulation`，阻止雙擊放大與 300ms tap delay。
- 落地頁與 tuner 的可互動元素同步使用 `touch-action:manipulation`。tuner 在 680px 以下把 number／select 提升到 16px、44px 高，比例選項熱區提升到 44px，避免 iOS 聚焦自動放大並降低誤觸。
- 390×844 Playwright 實機 viewport 發現 tuner 單欄 grid 的 `1fr` 被子項 min-content 撐到 504px；改成 `minmax(0,1fr)` 並讓 `.col` 可收縮，RTP 五欄在 600px 以下改用流動三欄＋固定序號／頻率。複驗 tuner、遊戲、落地頁皆為 `scrollWidth=clientWidth=390`，遊戲 stage 完整 390×844，三頁 console 0 error；tuner 輸入 16px／44px、比例選項 44px，遊戲 canvas `touch-action:none`、其餘互動面 `manipulation`。
- 本批只改 HTML／CSS 與觸控行為，不改 CFG、RNG、模擬或 operator 保存值。

## 附:對照文件
- [GDD.md](GDD.md) — 頂層設計真相源
- [DESIGN-V2.md](DESIGN-V2.md) — v2 技術計劃 + 逐階段執行
- [ECONOMY-V2.md](ECONOMY-V2.md) — **經濟數字權威（§0″=現行 v2.21 sealed pool＋四帶倍率演出；§0′↓=歷史模型）**
- [design-system.md](design-system.md) — 視覺法典
> 早期 v1 文件（ECONOMY-V1 等）已於 2026-07-20 隨 v1 code 刪除；根因脈絡見本檔內文與 git log。
