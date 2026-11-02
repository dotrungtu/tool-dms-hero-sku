'use strict';
/* =========================================================================
   state.js  (ban Region x U/R)
   Trang thai chung cua ung dung + du lieu bo sung nguoi dung nhap
   (luu tam trong localStorage cua trinh duyet).
   ========================================================================= */

const EMPTY_OVERRIDES = {
  areaCodes:{},      // (ban theo Area) giu lai de khong mat du lieu cua ban kia
  otd:{},            // Loai cua hang -> '3' hoac '4' (dung chung voi ban theo Area)
  regions:{},        // Region -> {abbr, node, stockRegion}  (bo sung cho REGIONS)
  urTypes:{},        // Gia tri U/R -> {abbr, code}         (bo sung cho UR_TYPES)
  itemCodes:{},      // SKU Group -> danh sach Item Code nhap tay
  uomExceptions:{},  // Item Code -> {uom, minQty}
  distArea:{},       // Ma NPP -> [Region, Area]  (bo sung cho DISTRIBUTOR_AREA)
  inactiveDist:{}    // Ma NPP -> true            (bo sung cho INACTIVE_DISTRIBUTORS)
};

function loadOverrides(){
  try{
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    return Object.assign(JSON.parse(JSON.stringify(EMPTY_OVERRIDES)), raw||{});
  }catch(e){ return JSON.parse(JSON.stringify(EMPTY_OVERRIDES)); }
}
function saveOverrides(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(overrides)); }catch(e){ /* trinh duyet chan luu tru */ }
}
let overrides = loadOverrides();

/* Cau hinh cua mot Region / mot gia tri U/R. null neu chua khai bao. */
function resolveRegion(region){ return REGIONS[region] || overrides.regions[region] || null; }
function resolveUr(ur){ return UR_TYPES[ur] || overrides.urTypes[ur] || null; }
/* Tra ve '3' hoac '4' - cap duoc dung cho loai cua hang nay, null neu chua khai bao.
   Van doc duoc du lieu bo sung dang cu {hasL3, hasL4} da luu trong trinh duyet. */
function resolveOtd(otd){
  if(OTD_LEVEL[otd]) return OTD_LEVEL[otd];
  const ov = overrides.otd[otd];
  if(!ov) return null;
  if(typeof ov === 'string') return ov;
  return ov.hasL3 ? '3' : '4';          // dinh dang cu
}
function resolveUom(itemCode){ return UOM_EXCEPTIONS[itemCode] || overrides.uomExceptions[itemCode] || {uom:'PC',minQty:1}; }

function allRegionConfigs(){ return Object.assign({}, overrides.regions, REGIONS); }
function allUrConfigs(){ return Object.assign({}, overrides.urTypes, UR_TYPES); }

/* Ten Region trong bang NPP / Stock Area (VD: 'DaNang', 'Mekong') hoac ten
   Region trong HERO NEW (VD: 'DN', 'MK') -> ten Region trong HERO NEW.
   Khong phan biet hoa thuong. null neu khong tra duoc. */
function heroRegionOf(name){
  const key = s(name).toLowerCase();
  if(!key) return null;
  for(const [hero, cfg] of Object.entries(allRegionConfigs())){
    if(hero.toLowerCase() === key) return hero;
    if(cfg.stockRegion && String(cfg.stockRegion).toLowerCase() === key) return hero;
  }
  return null;
}

const state = {
  mode: 'create',              // 'create' = tao moi dau thang | 'update' = cap nhat giua thang
  files: { hero:null, product:null, stock:null, invt:null, pinfo:null, baseInfo:null, baseCust:null, basePrd:null },
  heroRows: null, productRows: null, pinfoRows: null,
  stockRows: null,             // Stock Area.xlsx  (query database)
  invtRows: null,              // INVT_MASTER.csv  (xuat tu he thong)
  baseInfoRows: null, baseCustRows: null, basePrdRows: null,   // file MSL da upload lan truoc
  datePrefix: '', startDate: '', endDate: '',
  stockMode: 'onlyInStock',   // 'onlyInStock' | 'includeAll'
  subsets: null,               // Map key -> {region,otd,seg,ur,skuGroups:Set}
  missingRegions: [], missingUrs: [], missingOtd: [], missingSkuGroups: [], unknownDistributors: [],
  invtStats: null,             // thong ke buoc loc INVT_MASTER
  stockAreaStats: null,        // thong ke Area cua Stock Area.xlsx khong tra duoc ra Region
  result: null                 // {mode,infoRows,condRows,custRows,prdRows, report:{...}}
};

/* Nguon ton kho dang dung: uu tien INVT_MASTER neu co, nguoc lai dung Stock Area */
function stockSource(){
  return state.invtRows ? 'invt' : (state.stockRows ? 'stock' : null);
}

/* Ten file ton kho dang dung, de hien thi trong ly do / canh bao */
function stockSourceName(){
  return stockSource() === 'invt' ? 'INVT_MASTER.csv' : 'Stock Area.xlsx';
}

/* Chi muc ton kho 'Region|ItemCode' -> tong ton kha dung cua moi NPP trong Region.
   Region la ten trong HERO NEW. Dung chung cho ca 2 nguon. */
function currentStockIndex(){
  if(state.invtRows){
    const r = buildStockIndexFromInvt(state.invtRows);
    state.invtStats = r.stats;
    state.unknownDistributors = r.unknownDistributors;
    state.stockAreaStats = null;
    return r.index;
  }
  state.unknownDistributors = [];
  const r = buildStockIndex(state.stockRows || []);
  state.stockAreaStats = r.stats;
  return r.index;
}

/* Cac Region co du lieu ton kho - dung de phan biet "het hang" voi "thieu du lieu" */
function regionsWithStock(){
  const set = new Set();
  for(const [k] of currentStockIndex()) set.add(k.split('|')[0]);
  return set;
}

function activeOutputSpecs(){
  return state.mode === 'update' ? UPDATE_OUTPUT_SPECS : OUTPUT_SPECS;
}
