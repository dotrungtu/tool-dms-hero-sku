'use strict';
/* =========================================================================
   state.js
   Trang thai chung cua ung dung + du lieu bo sung nguoi dung nhap
   (luu tam trong localStorage cua trinh duyet).
   ========================================================================= */

const EMPTY_OVERRIDES = {
  areaCodes:{},      // Area -> ma NPP (dong cap G trong CUSTASSIGN)
  otd:{},            // Loai cua hang -> '3' hoac '4' (cap trong CUSTASSIGN)
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
function saveOverrides(){ localStorage.setItem(LS_KEY, JSON.stringify(overrides)); }
let overrides = loadOverrides();

function resolveAreaCode(area){ return AREA_TO_DIST_CODE[area] || overrides.areaCodes[area] || null; }
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

const state = {
  mode: 'create',              // 'create' = tao moi dau thang | 'update' = cap nhat giua thang
  files: { hero:null, product:null, stock:null, invt:null, pinfo:null, baseInfo:null, baseCust:null, basePrd:null },
  heroRows: null, productRows: null, pinfoRows: null,
  stockRows: null,             // Stock Area.xlsx  (query database)
  invtRows: null,              // INVT_MASTER.csv  (xuat tu he thong)
  baseInfoRows: null, baseCustRows: null, basePrdRows: null,   // file MSL da upload lan truoc
  datePrefix: '', startDate: '', endDate: '',
  stockMode: 'onlyInStock',   // 'onlyInStock' | 'includeAll'
  subsets: null,               // Map key -> {area,otd,seg,skuGroups:Set}
  missingAreas: [], missingOtd: [], missingSkuGroups: [], unknownDistributors: [],
  invtStats: null,             // thong ke buoc loc INVT_MASTER
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

/* Chi muc ton kho 'Area|ItemCode' -> tong ton kha dung, dung chung cho ca 2 nguon */
function currentStockIndex(){
  if(state.invtRows){
    const r = buildStockIndexFromInvt(state.invtRows);
    state.invtStats = r.stats;
    state.unknownDistributors = r.unknownDistributors;
    return r.index;
  }
  state.unknownDistributors = [];
  return buildStockIndex(state.stockRows || []);
}

/* Cac Area co du lieu ton kho - dung de phan biet "het hang" voi "thieu du lieu" */
function areasWithStock(){
  const set = new Set();
  if(state.invtRows){
    for(const [k] of currentStockIndex()) set.add(k.split('|')[0]);
  } else {
    for(const r of (state.stockRows || [])){
      const g = s(pick(r,'GroupName'));
      if(g) set.add(g);
    }
  }
  return set;
}

function activeOutputSpecs(){
  return state.mode === 'update' ? UPDATE_OUTPUT_SPECS : OUTPUT_SPECS;
}
