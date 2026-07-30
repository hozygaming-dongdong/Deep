# BEAST-VISUAL — 巨獸視覺重做（AI 姿態圖 + canvas 姿態切換）

> 2026-07-21 起。巨獸（beast/whale 大獎事件）的視覺與演出重做真相源。
> **現況：已接入遊戲（2026-07-21）。** 見下「§接入紀錄」。數值/機制真相源仍是 GDD/ECONOMY-V2；本檔只管視覺與演出。

## 為什麼是這條路（決策脈絡，含被否決的）

- **手繪向量剪影＝否決**。先試過用 SVG path / canvas 手畫三隻怪獸（多輪迭代、加明暗/牙齒/眼神），hao 定調：**天花板就是「生物圖鑑／工程示意圖」**，再怎麼調都不像正式遊戲美術。→ 改走 **AI 生成透明 PNG 姿態圖**。
- **切件旋轉下顎做咬合＝否決**。曾把單張圖的下顎用 PIL 多邊形切成獨立圖層、canvas 繞鉸鏈旋轉（利維坦 +24° 咬合驗證 OK、滄龍試到 -72°）。但**滄龍大 croc 張口用旋轉閉不出強咬合**，且被獵物遮擋。→ 改走 **多姿態整張切換**（張口姿↔閉口姿），咬合讀感強太多。切件的 `_*_body/_*_jaw` 已棄用。
- **單張靜圖平移＝不夠**。hao 反覆指出「靜態圖平移」沒衝擊力。→ 每個動作用**不同姿態圖切換**＋**爆衝姿本身帶水花**（圖有動勢）＋ motion blur/速度線/水花爆炸/頓點/鏡頭，才有動態感。
- **這是遊戲首次引入圖片資產**：原本全程序化 canvas、零素材（見 audio 也零素材）。巨獸破例用 PNG，為的是這個美術水準，hao 認可。

## 三階生物（套娃食物鏈，由下往上一階吃一階）

| Tier | 物種 | 倍率 | 角色 |
|---|---|---|---|
| 0 | 大白鯊 Great White | 10–30× | 出場咬光魚 → 被滄龍咬 |
| 1 | 滄龍 Mosasaur | 30–100× | 咬掉大白鯊 → 被利維坦咬 |
| 2 | 利維坦 Livyatan | 100–1000× | 咬掉滄龍 → 破海面 |

對應遊戲既有 Russian-doll 三階（round.js 的 whaleTier）。

## 資產 `assets/beasts/`（透明 PNG，命名＝物種-姿態）

- **大白鯊**：`great-white-cruise`(閉口巡游/黑影)、`great-white-bite`(血盆張口俯衝)、`great-white-dragged`(扭身頭朝下被拖)。
- **滄龍**：`mosasaur-open`(張口撲，備用)、`mosasaur-burst`(爆衝**帶水花**)、`mosasaur-clamp`(**閉口咬合**)。
- **利維坦**：`livyatan-rise-open`(**頭朝上垂直、巨口朝上、水花**)、`livyatan-rise-closed`(頭朝上、閉口)；`livyatan-cave-open/closed/breach`(頭偏下的**舊方向，已被 rise-* 取代**，保留備用)。

> ⚠ **利維坦一定用 rise-*（頭朝上）**：套娃「從下吞掉整支上方獵物」＝獵物縮進**上方朝上的巨口**才成立。cave-*（頭偏下）方向不對，hao 打回。

## 演出技法（都在示意 demo，接遊戲時照搬）

1. **閉嘴出場 → 衝刺張口 → 閉口咬合**：潛伏用閉口姿(clamp)、衝刺中切張口/爆衝姿(burst)、咬中切閉口姿(clamp)＝真咬合。
2. **爆發式時序**：潛伏 → `expo=pow(t,2.4)` 加速暴衝（**不要 `2^(10t-10)` 那種，會變瞬移**）。
3. **動態特效**：爆衝姿帶水花(圖本身動勢)、`drawBlur` 殘影、`dLines` 速度線、水花爆炸 `SP`、衝擊波環 `RG(fast)`、咬中**頓點 `hold`(凍結 clock)**＋閃白＋大震屏。
4. **拖拉過程**：咬中後獵物往下拖拽、掙扎(震屏/氣泡)才 alpha→0 消失（別瞬間消失）。
5. **鏡頭**：`camZ/camY` 跟隨當前主角；潛伏拉遠(壓迫)→衝刺跟隨上升→咬合推進(zfx punch)→拖拉跟隨下沉。三隻＝三套連續表演。

## 示意 demo

`demos/beast-nested-predation.html`。dev server 開 `http://localhost:8190/demos/beast-nested-predation.html`。
- rAF 有跑（preview 分頁非 hidden）；定格驗證用 `window.SEEK(t)`，恢復 `window.PLAY()`，點畫面重播。
- 關鍵拍：滄龍衝刺張口 ~5.5、滄龍咬合拖拉 ~6.2、**利維坦頭朝上吞滄龍 ~9.78（高潮）**、破海面 ~12。

## 生圖管線（Codex CLI，零 Claude token）

`codex exec -m gpt-5.5 -s workspace-write "先 view_image <現有素材當造型參考>，生成同一隻…姿態…，放純綠 #00ff00 chroma-key 背景…只印 IMG= 路徑"` → `remove_chroma_key.py --auto-key border --soft-matte --despill` 去背 → Read 驗證像素。**新姿態一律參考現有素材**才前後一致。hao 授權：**免費(Codex 額度)生圖不用逐張確認**、付費 gpt-image-1 才問。

## 接入紀錄（2026-07-21 完成，接自示意 demo）

**策略＝保留狀態機、只換 render**：遊戲巨獸是**狀態機驅動**（`main-v2.js tickWhale`：
burst→swallow→bite→haul↺→struggle→{snapline 逃走 / drag 拉鋸}→land），承載 escape
分支、套娃拉鋸、滾分對齊等 gameplay 綁定；demo 是固定 timeline 只管演出。**故 tickWhale
後段一字未動**，只把 `render-v2.js drawWhale` 從程序化剪影換成 PNG 姿態切換（舊
`drawWhaleFallback`/`beastBody` 保留當降級）。**未動 world/entities/round 經濟常數＝不需
re-green**（鐵則1）。

**改動落點**：
- `render-v2.js`：`BEAST_POSE` 姿態表（含 `mo` 嘴部偏移）＋模組頂層 `new Image()` 預載
  ＋helper（`beastRect/beastMouthPt/drawBeast/drawBeastBlur/beastSpeedLines/beastSpray`）
  ＋重寫 `drawWhale`（phase→姿態；鉤含嘴用 `beastMouthPt` 對齊；套娃 `prevDraw` 沿用）。
  `whaleClamp` 判斷加入 lurk/strike。
- `main-v2.js`：`startWhale2` stage0 起始 `phase='lurk'`；`tickWhale` 加 `lurk`（大白鯊
  水平繞圈潛伏）+`strike`（水平衝刺咬光魚串，＝原 stage0 swallow 語意）兩 case（stage≥1
  仍走 burst/swallow）；`BEAST_FX` slam 文案→`GREAT WHITE/MOSASAUR/LIVYATAN`。
- 資產：`public/beasts/`（7 張；Vite 原樣 serve `/beasts/*.png`；**刻意不用 import** 以免
  `build:single` 把 ~10MB base64 內聯進單檔）。
- dev 測試：`DEEPER_V2.beastEvery(mult,escape)`/`beastOff`（每局收網強制觸發）＋**畫布右上角
  測試面板** `#beastDev`（`import.meta.env.DEV` gate → build tree-shake 不進出貨；點 tier
  即設定,正常玩反覆體驗）。`forceWhale` 與面板共用 `applyBeastArm` helper。
  beastEvery 開時**下沉免鯊魚**（`advanceDepth` flag-gated 清 `st.over`＋不 `startStrike`）,
  直達巨獸深度不被咬斷——否則潛到 L12 有 26% 被鯊魚咬(sim §4),看不到巨獸。**flag 預設關,
  正常遊戲鯊魚一字不動**。

**方向處理（關鍵）**：大白鯊 stage0＝**水平**（繞圈 lurk→衝刺 strike，用其水平 PNG 方向）；
滄龍(1)/利維坦(2)＝**垂直頭朝上湧出**（rise-*/burst 直圖方向），套娃「由下往上把上一隻縮進
上方巨口」。hao 選了「加大白鯊繞圈潛伏前戲」，正好讓 stage0 走水平＝對齊各物種 PNG 基準方向。

**已驗證**：dev（8190）`forceWhale`+`stepFrames` 定格三 tier×held/escaped 全過（大白鯊
繞圈黑影→衝刺血盆大口→滄龍垂直湧出→咬合爆閃→利維坦吞滿畫面→逃走用 dragged 下潛）；
`npm run build` 產物 `dist/beasts/` 齊、console 無 error。**⚠ preview rAF 陷阱反面**：截圖會讓
分頁短暫 active、rAF 恢復自動推演出（定格失效）——驗證時先 `window.requestAnimationFrame=()=>0`
凍結自動循環，全靠 `stepFrames` 手動推。

**已知取捨**：`build:single`（viteSingleFile）不內聯 `public/` → single 檔巨獸走 fallback
剪影（single 是附件/aggregator 次要用途，出貨＝dist/，接受）。

**微調脈絡**：lurk `dark` 0.55→0.74（潛伏黑影更陰森）、`beastSpray` 粒子加密加亮（爆衝水花更足）。

## 演出迭代紀錄（2026-07-22，hao 逐拍打磨；含被打回的路徑）

**大白鯊四拍重排**：純黑剪影快掠（`lurkDir` 每局隨機雙向、頭朝游向——初版 flip 寫死=倒退游,bug 已修）→ 從 lurk 離場側**反向爆衝**（速度 -30%＝0.72s）→ 咬住拖行 → 垂直吊拖。

**兩股力模型（核心）**：身體角度＝跨幀狀態 `_gwA`，只被「絞盤真的在收（pull>0）」拽向垂直、「獸贏（pull<0）」扭回水平；**僵持（bite/struggle，鉤沒動）不自轉**。pull 訊號由 tickWhale 每幀傳給 render（haul 回拖/drag tug/land/snapline）。hao 定調：「鉤子沒拉，魚就不能自己轉」——扳正永遠跟實際拉扯同步，~~跟 phase 時間走的 easeOut 扳正~~（會憑空自轉）打回。

**慣性拖鉤**：strike 衝速在咬合瞬間存成慣性＋殘存推進力（~1s 指數衰竭），推力>線張力＝**拖著鉤走**（~0.37 畫面寬）、線繃斜，衰竭後彈簧+阻尼慢拽回；**撞擊瞬間動量 ×0.45**（咬上線的衝擊）。鏡頭 `beastPanX` 隨衝勢平移（zoom rig `panX`）；**背景以 `PANM=170` 加寬**（底色/帶層/天空/海面波浪/內波/流線/光斑）——pan 出去仍是海不是黑（hao：更寬的海面）。

**水中融合的路線（三段試錯，前兩段勿重走）**：
- ~~CSS filter 壓暗染色~~（saturate/sepia/hue-rotate）——把 PNG「弄髒」，細節被吃掉，打回。
- ~~疊加式氛圍層~~（caustics 線/浮游顆粒/god rays/vignette/青藍 overlay/螢幕空間頂光梯度）——「硬加上去」：獸自帶攝影棚光、場景另一套光，中間疊裝飾誰也黏不住；整批退役（code 留退役註記）。
- ✅ **合成對齊**：離屏圖層 + source-atop **水介質**縱向漸層（0.26/0.44/0.68，一筆做色度拉向水色/黑位抬升/深度霧，亮度細節按比例保留）＋ **邊緣羽化** destination-in（拿自身模糊 alpha 只軟化輪廓 1-2px，非 glow）。量級試過最強 0.42/0.66/0.92（太沉、吃主角光環）收回中間值。候選下一步：**活光**（光在獸形狀內流動）。

**剪切連續條帶（破圖根治）**：分段貼圖從剛性平移改**平行四邊形剪切**——左緣=off(i)、右緣=off(i+1)，相鄰段共用邊界值＝C0 連續，任何振幅/旋轉**構造上零裂縫**。先前「降振幅避破圖」的妥協全數收回。振幅 `tailPow≈2` 集中尾段（hao：尾巴要一直打水、像真的在海裡游），厚身近剛體。

**自然掙扎節奏**：~~持續勻速抖（獨立正弦堆疊=洗衣機假感）~~打回 → **爆發-安靜循環**（`sin^6` 包絡 ~2s 一波），甩頭/抬身/尾拍與慢鐘擺**同源同頻**連動；滄龍/利維坦同節奏（相位按 stage 錯開）。

**咬合三層遮擋（hao 三修才對，錯誤路徑勿重走）**：①鉤+線整組畫在**臉前**（鉤眼+上柄可見、線接在眼上）→ ②**上唇帶**（嘴縫上方 15px、高 18px）用 `_beastLayer` 自身像素回蓋鉤中段＝咬住 → ③鉤彎口縫露出、下唇線以下乾淨。~~鉤整支畫獸後~~（能見段像從下顎穿出）、~~鉤埋進頭+線畫進嘴點~~（線消失在鼻子上=反了）皆打回。鉤眼距嘴縫 18px（沉進嘴）。

**大白鯊斷鉤＝咬斷游走（不是死掉）**：~~gwDrag 下墜+淡出~~（像死亡）打回 → 一記甩頭掙斷（0.2s 甩頭姿）→ **叼著鉤**沿行進方向加速游出畫＋殘影/速度線，僅出畫前距離淡出。v2.17 起此分支由可調 `breakP` 控制，情緒是「牠咬走鉤、但獎金已鎖定」；production 字卡固定 `LINE BROKEN / PAYOUT SECURED` 並全額入帳，舊 `IT GOT AWAY` 吞獎語義只屬歷史。

**v2.19 分流預告／斷鉤**：每隻金魚可按 `goldFishTeaseP` 在 SINK/HOLD 送出一趟 GREAT WHITE 剪影；它沿用背景 `beastTele` 畫法但沒有懸念空窗與後續 `startWhale2`，因此預告可完全落空。MOSASAUR 的 `zeroBreakP` 只服務零分結果：完整演出後咬斷，字卡為 `LINE BROKEN / MOSASAUR STRUCK · +0`；由正水池選出的 MOSASAUR 絕不走 snapline。

**v2.20 現行覆蓋**：倍率巨獸命中後是保證演出／保證給獎，已移除 `breakP/zeroBreakP`。剪影預告改到 PULL 後才判：依實際有／無鉤到金魚選入口率，假預告只游過一次即消失；預告升 GREAT WHITE、再升 MOSASAUR。只有 PULL 事件想演出的獸高於水池門檻才走 snapline，且仍不改 sealed payout／carry。

**倍率保證巨獸的金魚入場（2026-07-24）**：強制巨獸 PULL 在 sealed settlement 後加入一隻零分、純演出的金魚作為咬鉤引子；它不回填實際金魚計數，也不會反向觸發 PULL 事件鏈。深水取「最深但仍在鏡頭上方」的隨機路徑點，隨回收鏡頭從上緣自然帶入；淺水改由隨機左右側畫面外游入。自由泳位置反解到真實接觸時刻，巨獸背景預告等這隻金魚 `_grab` 後才啟動，因此畫面文法是「金魚自然進場→鉤中→巨獸預告／衝出」，沒有 PULL 當下原地生魚。

**尺寸**：大白鯊 0.34→0.27→0.216→**0.238**（hao 縮兩輪 20% 再放大 10%）。

**套娃交接連續性（hao：滄龍還沒咬到，鯊魚不能停格/突變）**：吊掛姿態抽成 `gwHangPose()` 共用——
stage0 吊拖與「stage1 burst/swallow 的 prev 鯊魚」走同一套（`_gwA/_gwCX` 模組狀態跨 stage 存活、
時間項 closed-form）→ 滄龍湧出全程鯊魚照樣垂直掙扎；**鉤/線也不換手**（holdHook 持有者=prev，
吞掉才交給當前獸，透明度跟持有者一起淡出）。~~prev 通道畫成水平定格~~＝突變，打回。

**滄龍/利維坦（垂直獸，2026-07-22 起調校中，未達大白鯊逐拍精度）**：
- **嘴對鉤**（bug1）＝**嘴點反推中心**：給 pose+rot 反推身體中心，讓「經 rot 的嘴」恆落在
  (cx, hookY)——跟大白鯊 `gwHangPose` 同哲學，頭怎麼俯仰嘴都釘在鉤上。~~by 用 `beastCyForMouthY`
  只對齊未旋轉嘴 y、加 rot 後嘴飄~~，打回。
- **頭身動勢**（bug2）＝頭部俯仰（湧出**前傾撲食**/吞食**低頭一壓**/掙扎**甩頭**，繞嘴非整體轉）
  ＋身體分段游動波加大（垂直獸 `base 0.035` > 大白鯊 0.02）。原本只有整體 skew＝僵。
- **咬合讀感的素材限制（待 hao 定方向）**：滄龍 `clamp`/利維坦 `rise-closed` 都是**閉口長吻/
  抹香鯨形**，「咬合口」＝吻尖（`mo` 座標），現況＝「頭朝上叼著線」（套娃邏輯：整口吞掉前一隻+鉤
  再閉口咬住，合理）。要更明顯「張口含鉤」需用張口姿當咬合姿、或補張口咬合姿態圖。

**套娃咬合戲重排（滄龍咬大白鯊，hao 2026-07-22「不能定格／照常表演／突然被咬／爆血／嘴掛鉤」）**：
- **大白鯊照常→被咬一震→拖進嘴**（取代平滑淡出）：`prev` 大白鯊全程 `gwHangPose(struggling=true)`
  延續猛掙扎（burst 湧出時仍在上方垂直掙扎吊掛）；咬合進度 `bit=(eaten-0.45)/0.55`，swallow 後段加
  被咬抽搐 `thrash=bit*(1-bit)*4`（中段峰值＝剛被咬最猛）＋略縮進上方巨口＋陡淡出 `1-eaten^2.6`
  （前段保持可見在掙扎、末段才消失）。~~`alpha=1-eaten*1.5` 線性淡出＋`y+=eaten*26`~~＝溫吞消失無戲，打回。
- **咬合噴血**（`spawnBlood`/`drawBlood`，新 `V.fx.blood` 系統，main-v2＋render-v2）：swallow **咬下瞬間**
  `p≥0.6` 觸發（與大白鯊被咬抽搐同框，**非**等到 bite），`stage≥1`（獸吃獸）才噴。**深海血＝暗血紅核心→
  墨褐雲被深水稀釋→透明**（紅光水下最先被吸收＝物理真實；有血腥衝擊但不鮮紅／不 magenta——design-system
  損失才用 petrol-violet，血是大獎升級的暴力）。粒子受水阻快速減速＋微沉。⚠ 血色偏暗＝刻意（深海血腥
  ＋不踩鮮紅法典），**量級待 hao 定奪**（旋鈕見下）。
- **滄龍咬合重排（消除定格＋嘴掛鉤）**：swallow **全程 `openP` 張口撲咬**（不中途切 `shutP`——避免
  `mo` 座標 `[.56,.20]`→`[.50,.16]` 跳變導致嘴脫鉤／身體跳），咬下 `rot` 用 `pow(p,2.6)` 加速（頭繞嘴俯衝、
  嘴仍釘鉤），pose 切 `shutP` 延到 bite＝對齊爆血衝擊（切換跳變被掩蓋成咬力）；**bite 不再靜止**＝咬合餘震
  `exp(-p*6)*sin(p*46)`＋維持低頭咬緊 `-exp(-p*3)*0.12`＋咬緊較勁 `grind 0.10`（不靠稀疏 `burst` spike）。
  ~~bite 只有 `sin(T*4.2)*0.055`+稀疏 burst~~＝幾乎靜止的定格感，打回。
- **獸出現「閃圖到畫面中央」bug 修復（既有 bug，hao 察覺，非本次引入）**：所有 phase 轉換的**第一幀**，
  `tickWhale` 末尾的 `fx.whale.p` **沿用舊 phase 的 `p`≈1**（`p` 在 switch 前算好，switch 內改了 `phase`
  ＋歸零 `wh.t` 卻沒重算）→ 新 phase 用**終點值畫一幀**＝獸閃到畫面中央（大白鯊 strike `bx=cx+mouthDX`／
  滄龍 burst `by=bLerp(下方,鉤位,e=1)=鉤位`），下一幀才從起點正常演出。修復：`fx.whale` 前用**轉換後**
  的 phase/t **重算 `p`**（轉換幀 `wh.t=0`→`p=0`＝各 phase 正確起點）。實測 burst/strike 首幀 `fx.p` 由 1.0→0.0、獸不再閃現。
- **血再壓暗（hao）**：血色 stop RGB 降一檔（核心 `rgba(122,20,30)`→`rgba(86,13,21)`、血滴 `#7A1420`→`#560E17`）＝深海血更沉、更融入水。
- **大白鯊剪影「預告」搬進 REELING 背景層（消除「剪影破題」）**（2026-07-22，hao）：原本 `lurk`/`stalk`（剪影＋盤旋）是 **WHALE 接管相位**＝一進場前景（reel 爬升、CATCH 滾動、鏡頭）就凍住＋壓暗，**定格本身＝洩題**（畫面一停玩家就知道大獎鎖定）。改成**剪影＝REELING 期的背景 FX**（`V.beastTele`／`V.fx.beastTele`，`main-v2` `tickReel` 內計時）：狀態全程維持 REELING，前景照跑、不壓暗（`drawWhale` 的 `wh.tele` 跳過 dim overlay），剪影只是背景巨影**掠過一次**（`hFrac` 加大到 `BEAST_H[0]×0.92`、慢掠 1.0s＝原速×0.7）→ 隨機 0.35–1.2s 懸念空窗（不再現身，前景仍動＝不像卡頓）→ 到 `WHALE_MIN_BURST` 或間隔到才 `startWhale2()` **直接從 `strike` 衝出**接管。觸發深度 `WHALE_TELE_DEPTH=960`（較深補償慢掠，衝出仍落 mid-reef）。**純演出、經濟零改**。文法＝**慢掠一次(預告)→隨機空窗(懸念)→衝出(揭曉)**。決策脈絡見 DEV-LOG §9.7。

## 持續優化（hao：之後還要持續優化——現況＝大白鯊到位、滄龍/利維坦調校中）

**巨獸演出（接續逐拍磨）**
- [x] **套娃咬合戲（滄龍咬大白鯊）＝照常掙扎→被咬爆血→拖進嘴**（2026-07-22，見迭代紀錄「套娃咬合戲重排」）：大白鯊不再平滑淡出、咬下瞬間噴深海暗紅血、滄龍 swallow 全程張口不跳＋bite 消除定格。利維坦咬滄龍沿用同套（垂直獸 `prev` else 分支）。血量級/血色待 hao 定奪。
- ~~[ ] **蒼龍/利維坦的「疊層想像」預告**：大白鯊預告那段深處依序閃過小→大暗影,實際升級與否由密封倍率決定。~~ **❌ 否決（2026-07-22 hao）**：**只預告大白鯊、蒼龍/利維坦無預警爆出的「反差」衝擊力更強**。深獸也給預告會稀釋掉「更大的東西突然殺出」的震撼——留大白鯊當唯一預告的錨,升級全靠 surprise。（曾一度定案要做,同日玩過大白鯊預告後推翻＝反差 > 疊層想像。此為「預告只放大想像、不代表一定出現」原則的收斂。）
- [ ] **滄龍/利維坦逐拍到大白鯊等級**：嘴反推/頭俯仰/身體扭動＋咬合戲已上（2026-07-22），但各拍振幅/時序未逐拍精調——湧出撲食、吞食壓身、拉鋸回拖的動勢要各自磨（大白鯊那種等級）。
- [ ] **滄龍/利維坦「叼著」咬合讀感**：swallow 已改張口撲咬，但 bite 消除定格後仍回 `shutP` 閉口叼線；要全程「張口含鉤」需補張口咬合姿態圖（走 Codex 免費生圖，參考現有素材）。
- [ ] **活光**：光在獸形狀內流動（水面波光映背上）——水中融合的候選下一層（前四層＝水介質/羽化/[已退役的疊加層]，見迭代紀錄）。
- [ ] 大白鯊「閉口衝刺/咬合」專屬姿（咬合暫用 `gwCruise`）、各階「拖拉下沉」專屬姿。

**旋鈕**（隨時可調的參數，程式碼位置）
- 水介質量級 `drawWhale` 的 `mg` 三段 stop（現 0.26/0.44/0.68，試過最強 0.42/0.66/0.92 太沉）｜羽化 `featherCanvas` blur 3.5px｜咬合唇帶 rect（現嘴縫上方 15px、高 18px）｜鉤含深度（眼距嘴縫 18px）｜背景加寬 `PANM=170`｜**咬合血**（`spawnBlood` 雲 `r1`／噴濺 `n·sp·gush`；`drawBlood` 血色 stop `rgba(122,20,30)`→墨褐；觸發閾值 swallow `p≥0.6`、`stage≥1`）。

**雜項（非阻塞）**
- [ ] demo 打磨（示意 demo，非遊戲本體）｜檔名去版本號（`-v2`→無版本，連 import/CLAUDE/launch.json）｜清根目錄暫存 `_*.png/_*.html`（已歸位）。

> 完成史：接進遊戲（2026-07-21）｜大白鯊逐拍打磨到電影級（2026-07-22，見「演出迭代紀錄」）。

## hao 品味鐵則

要**兇/恐怖/不可愛**（小而冷的掠食者眼、張口露齒，別大圓眼可愛臉）；**又快又狠**；**圖要有動態、不是靜態圖平移**。
