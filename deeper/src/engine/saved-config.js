/* Operator-owned tuner persistence shared by tuner.html and the live game.
   The saved record may contain tuner-only fields (targetRtp/poolRows); the game
   only receives the engine-facing CFG keys below. */
export const SAVED_CFG_KEY='deeper:tuner:saved-config:v1';
export const SAVED_CFG_CHANNEL='deeper:tuner:config:v1';

const ENGINE_CFG_KEYS=[
  'depthBands',
  'poolExact','poolRange','antePool',
  'beastShowRules',
  'goldFishTeaseP','noGoldFishTeaseP','teaseToGreatWhiteP','greatWhiteToMosasaurP',
  'anteAmt','anteFrom',
  'sharkEnabled',
  'sharkSpawnP','sharkBiteP','sharkPrizeMin','sharkPrizeMax',
  'spawnDensity','appearanceByBand','fishAppearance','bubbleAppearance',
];

export function readSavedCfg(){
  try{
    const record=JSON.parse(globalThis.localStorage?.getItem(SAVED_CFG_KEY)||'null');
    return record?.schema===1 && record.cfg && typeof record.savedAt==='string' ? record : null;
  }catch{ return null; }
}

export function engineCfgFromRecord(record){
  if(!record?.cfg || typeof record.savedAt!=='string') return null;
  const patch={};
  for(const key of ENGINE_CFG_KEYS){
    if(record.cfg[key]!==undefined) patch[key]=structuredClone(record.cfg[key]);
  }
  /* v2.21 read compatibility. Old saves had one global fish/bubble mix; treat
     that operator-owned mix as the source for every band until they save the
     new per-band controls themselves. */
  if(!patch.appearanceByBand && (Array.isArray(patch.fishAppearance)||Array.isArray(patch.bubbleAppearance))){
    const bands=['SHALLOWS','REEF','DEEPER','ABYSS'];
    patch.appearanceByBand=Object.fromEntries(bands.map(b=>[b,{
      ...(Array.isArray(patch.fishAppearance)?{fish:structuredClone(patch.fishAppearance)}:{}),
      ...(Array.isArray(patch.bubbleAppearance)?{bubble:structuredClone(patch.bubbleAppearance)}:{}),
    }]));
  }
  if(!patch.beastShowRules && (record.cfg.beastShowFrom!==undefined || record.cfg.beastShowP!==undefined)){
    const from=Math.max(0.5,+record.cfg.beastShowFrom||10);
    const p=Math.max(0,Math.min(1,Number.isFinite(+record.cfg.beastShowP)?+record.cfg.beastShowP:0.5));
    patch.beastShowRules=[
      {tier:0,min:from,p},
      {tier:1,min:from*3,p},
      {tier:2,min:from*10,p},
    ];
  }
  return Object.keys(patch).length ? patch : null;
}
