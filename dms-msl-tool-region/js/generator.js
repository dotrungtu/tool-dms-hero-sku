'use strict';
/* =========================================================================
   generator.js  (ban Region x U/R)
   Logic nghiep vu chinh.
     - computeTargetLists()  : tinh ra danh sach SKU "dung ra phai co" hom nay
     - generate()            : che do TAO MOI dau thang -> 4 file day du
     - generateUpdate()      : che do CAP NHAT giua thang -> file bo sung
   Moi danh sach = mot to hop Region x OTD L4 x Segment x U/R cua HERO NEW.
   ========================================================================= */

function pad2(x){ return String(x).padStart(2,'0'); }

function todayPrefix(){
  const d = new Date();
  return String(d.getFullYear()).slice(2)+pad2(d.getMonth()+1)+pad2(d.getDate());
}

/* Ngay theo gio may dang YYYY-MM-DD. Khong dung toISOString() vi ham do
   doi sang gio UTC, o VN (UTC+7) se bi lui 1 ngay. */
function localIsoDate(d){
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}

/* ----- Ma va mo ta danh sach ----- */

function regionAbbr(region){ const c = resolveRegion(region); return c ? c.abbr : region; }
function urAbbr(ur){ const c = resolveUr(ur); return c ? c.abbr : ur; }

/**
 * Ghep ma MSL tu 5 phan [ngay, Region, Kenh, Phan khuc, U/R], noi bang dau gach.
 * DMS gioi han 20 ky tu: vuot thi bo dan tung dau gach theo thu tu
 *   1. sau ngay                 260211N1_WSDEPO_B_UB     261201HCMC_CHTL_A_UB
 *   2. giua Region va Kenh      261201HCMPWSMIX_B_RR
 *   3. giua Phan khuc va U/R    261201HCMCWSDEPO_CHL
 *   4. giua Kenh va Phan khuc
 * Phan khuc luon 1 ky tu va U/R 2 ky tu nen ma van khong trung nhau;
 * computeTargetLists van kiem tra trung ma cho chac.
 */
function joinCode(parts){
  const seps = ['_', '_', '_', '_'];
  const build = () => parts.map((p, i) => p + (i < seps.length ? seps[i] : '')).join('');
  let code = build();
  for(const i of [0, 1, 3, 2]){
    if(code.length <= MAX_CODE_LEN) break;
    seps[i] = '';
    code = build();
  }
  return code;
}

/* Ma MSL cua mot to hop. VD: 260211_N1_CHTL_A_HL */
function subsetCode(datePrefix, region, otd, seg, ur){
  return joinCode([datePrefix, regionAbbr(region), otd, seg, urAbbr(ur)]);
}

/* Ten Region / U/R trong mo ta: 'North 1' -> 'North1', 'HIGHLAND' -> 'Highland' */
function regionLabel(region){ return String(region).replace(/\s+/g, ''); }
function urLabel(ur){ const t = String(ur).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }

/* Mo ta cho mot hoac nhieu to hop (ma gop), theo mau nguoi dung chot:
     North1_Highland_Danh sách SKU bán chạy_CHTL_A
   Vuot 50 ky tu (thuong la ma gop) thi rut gon:
     North1_HighlandRural_SKU bán chạy_CHTL_A */
function listDescription(regions, otds, segs, urs){
  const G = regions.map(regionLabel), U = urs.map(urLabel);
  const longDesc  = `${G.join('_')}_${U.join('_')}_Danh sách SKU bán chạy_${otds.join('_')}_${segs.join('_')}`;
  const shortDesc = `${G.join('')}_${U.join('')}_SKU bán chạy_${otds.join('')}_${segs.join('')}`;
  return longDesc.length <= MAX_DESC_LEN ? longDesc : shortDesc;
}

function mslDescription(region, otd, seg, ur){
  return listDescription([region], [otd], [seg], [ur]);
}

/**
 * Tinh danh sach SKU mong muon cho tung to hop Region x Kenh x Phan khuc x U/R.
 *
 * stockMode:
 *   'onlyInStock' - chi giu SKU con ton kho trong Region (tru SKU moi thi luon giu)
 *   'includeAll'  - giu ca SKU ton = 0 neu Region co dong ton kho cho ma do
 *
 * Ton kho xet theo Region: cong ton kha dung cua moi NPP thuoc Region.
 *
 * Tra ve { lists: Map<mslCode,{region,otd,seg,ur,mslCode,items:[{itemCode,itemName}]}>,
 *          report: {...} }
 */
function computeTargetLists(datePrefix, stockMode){
  const { productRows, pinfoRows, subsets } = state;

  const productIndex = buildProductIndex(productRows);
  const stockIndex   = currentStockIndex();     // Stock Area.xlsx hoac INVT_MASTER.csv
  const { valid: validProducts, newSku: newSkuSet, reason: invalidReason } = buildProductInfoSets(pinfoRows);

  // Region nao khong co dong nao trong nguon ton kho -> thieu du lieu, khong phai het hang
  const regionsWithStockData = regionsWithStock();

  const lists = new Map();
  const codeOwner = new Map();   // ma -> to hop da dung ma do (phat hien trung ma)
  const noStock = [], keptByNewSku = [], filteredOut = [], missingItemReport = [], emptySubsets = [];
  const codeCollisions = [];
  let noStockRowCut = 0;   // so dong bi loai vi khong co dong ton kho, o che do "giu lai tat ca"

  for(const key of [...subsets.keys()].sort()){
    const sub = subsets.get(key);
    const { region, otd, seg, ur } = sub;
    const dims = {region, otd, seg, ur};

    /* Region / U/R chua co cau hinh thi khong sinh duoc dong G / dong U -> bo qua */
    if(!resolveRegion(region) || !resolveUr(ur)){
      emptySubsets.push(Object.assign({mslCode:'', candidates:0, cutByPinfo:0, cutByStock:0,
        reason: !resolveRegion(region)
          ? `Region ${region} chưa có cấu hình (viết tắt / node G) — không tạo được danh sách`
          : `U/R ${ur} chưa có cấu hình (viết tắt / mã U) — không tạo được danh sách`}, dims));
      continue;
    }

    const mslCode = subsetCode(datePrefix, region, otd, seg, ur);
    if(codeOwner.has(mslCode)){
      const other = codeOwner.get(mslCode);
      codeCollisions.push({mslCode, first: other, second: key});
      emptySubsets.push(Object.assign({mslCode, candidates:0, cutByPinfo:0, cutByStock:0,
        reason:`Trùng mã với tổ hợp ${other.split('|').join(' / ')} — kiểm tra lại viết tắt Region / U/R`}, dims));
      continue;
    }
    codeOwner.set(mslCode, key);

    /* B1: gom Item Code tu cac SKU Groups */
    const itemMap = new Map();
    for(const g of sub.skuGroups){
      let items = productIndex.get(g);
      if((!items || !items.length) && overrides.itemCodes[g]){
        items = overrides.itemCodes[g].split(',')
                 .map(c => ({itemCode:c.trim(), itemName:'(nhập tay)'}))
                 .filter(x => x.itemCode);
      }
      if(!items || !items.length){
        missingItemReport.push(Object.assign({skuGroup:g,
          reason:'SKU Group không có dòng nào trong Product List.xlsx'}, dims));
        continue;
      }
      for(const it of items) itemMap.set(it.itemCode, it.itemName);
    }

    /* B2: loc theo PRODUCT_INFO */
    const afterProductInfo = new Map();
    let cutByPinfo = 0;
    for(const [itemCode, itemName] of itemMap){
      if(!validProducts.has(itemCode)){
        filteredOut.push(Object.assign({mslCode, itemCode, itemName,
          reason: invalidReason.get(itemCode) || 'Không tìm thấy mã này trong PRODUCT_INFO.csv'}, dims));
        cutByPinfo++;
        continue;
      }
      afterProductInfo.set(itemCode, itemName);
    }

    /* B3: loc theo ton kho cua ca Region. SKU moi (New SKU Ind = Y) luon duoc giu lai */
    const hasStockData = regionsWithStockData.has(region);
    const items = [];
    let cutByStock = 0;
    for(const [itemCode, itemName] of afterProductInfo){
      const avail = stockIndex.get(region + '|' + itemCode);
      const hasStock = avail !== undefined && avail > 0;

      if(hasStock){
        items.push({itemCode, itemName});
        continue;
      }

      const isNewSku = newSkuSet.has(itemCode);

      // Co dong ton kho ghi 0  -> Region co kinh doanh mat hang nay, dang tam het.
      // Khong co dong nao      -> khong NPP nao trong Region kinh doanh, khong dua vao.
      const hasStockRow = avail !== undefined;
      const reason = !hasStockData
        ? `Region ${region} không có dữ liệu tồn kho trong file ${stockSourceName()}`
        : (!hasStockRow ? `Không có dòng tồn kho cho mã này ở Region ${region} — không NPP nào trong Region kinh doanh mặt hàng này`
                        : `Tồn khả dụng cộng cả Region ${region} = ${avail}`);
      noStock.push(Object.assign({mslCode, itemCode, itemName,
                    avail: avail || 0, isNewSku, hasStockRow, reason}, dims));

      if(isNewSku){
        items.push({itemCode, itemName});
        keptByNewSku.push(Object.assign({mslCode, itemCode, itemName,
          reason:'New SKU Ind = Y — SKU mới ra mắt, giữ lại dù chưa có hàng'}, dims));
      } else if(stockMode === 'includeAll' && hasStockRow){
        items.push({itemCode, itemName});
      } else {
        cutByStock++;
        if(stockMode === 'includeAll') noStockRowCut++;
      }
    }

    if(!items.length){
      emptySubsets.push(Object.assign({mslCode,
        candidates: itemMap.size, cutByPinfo, cutByStock,
        reason: itemMap.size === 0
          ? 'Không tra được Item Code nào từ các SKU Group'
          : (cutByStock > 0
              ? `Có ${itemMap.size} SKU: ${cutByPinfo} bị loại theo PRODUCT_INFO, ${cutByStock} hết tồn kho`
              : `Cả ${itemMap.size} SKU đều bị loại theo PRODUCT_INFO`)}, dims));
      continue;
    }
    lists.set(mslCode, {region, otd, seg, ur, mslCode, items});
  }

  return {
    lists,
    report: {
      noStock, keptByNewSku, filteredOut, missingItemReport, emptySubsets, codeCollisions,
      noStockRowCut,
      totalSubsets: subsets.size,
      validProductCount: validProducts.size,
      newSkuCount: newSkuSet.size,
      stockMode
    }
  };
}

/* =========================================================================
   PHAN TICH SAU - phuc vu bao cao chi tiet
   ========================================================================= */

/**
 * Thong ke theo tung Region: bao nhieu danh sach, bao nhieu SKU, ty le SKU
 * bi loai vi het ton kho. Giup phat hien Region co du lieu ton kho bat thuong.
 */
function analyzeByRegion(lists, report){
  const regionsWithStockData = regionsWithStock();

  const map = new Map();
  const touch = g => {
    if(!map.has(g)) map.set(g, {region:g, lists:0, skuRows:0, noStock:0, newSkuKept:0,
                                filtered:0, emptyLists:0, hasStockData: regionsWithStockData.has(g)});
    return map.get(g);
  };
  for(const l of lists.values()){ const e = touch(l.region); e.lists++; e.skuRows += l.items.length; }
  report.noStock.forEach(r => touch(r.region).noStock++);
  report.keptByNewSku.forEach(r => touch(r.region).newSkuKept++);
  report.filteredOut.forEach(r => touch(r.region).filtered++);
  report.emptySubsets.forEach(r => touch(r.region).emptyLists++);

  return [...map.values()].map(e => {
    const candidates = e.skuRows + e.noStock;   // truoc khi loc ton kho
    e.inStockRate = candidates ? Math.round((e.skuRows / candidates) * 100) : 0;
    e.avgSkuPerList = e.lists ? Math.round(e.skuRows / e.lists) : 0;
    return e;
  }).sort((a,b) => a.region.localeCompare(b.region));
}

/**
 * Tim cac ma MSL co danh sach SKU GIONG HET nhau -> co the gop lam mot.
 * Phan loai kieu gop (4 chieu: Region, Kenh, Phan khuc, U/R):
 *   'ur'           - chi khac U/R            (pho bien nhat, de gop nhat)
 *   'segment'      - chi khac Phan khuc
 *   'channel'      - chi khac Kenh
 *   'region'       - chi khac Region
 *   'region-inner' - cung Region, khac tu 2 chieu tro len
 *   'mixed'        - khac nhieu chieu, can can nhac ky
 */
function findMergeableLists(lists){
  const byFingerprint = new Map();
  for(const l of lists.values()){
    const fp = [...l.items.map(i => i.itemCode)].sort().join(',');
    if(!byFingerprint.has(fp)) byFingerprint.set(fp, []);
    byFingerprint.get(fp).push(l);
  }

  const groups = [];
  for(const [, members] of byFingerprint){
    if(members.length < 2) continue;

    const regions = new Set(members.map(m => m.region));
    const otds    = new Set(members.map(m => m.otd));
    const segs    = new Set(members.map(m => m.seg));
    const urs     = new Set(members.map(m => m.ur));
    const differing = [regions, otds, segs, urs].filter(x => x.size > 1).length;

    let kind, kindLabel;
    if(differing === 1){
      if(urs.size > 1)       { kind='ur';      kindLabel='Cùng Region + Kênh + Phân khúc, chỉ khác U/R'; }
      else if(segs.size > 1) { kind='segment'; kindLabel='Cùng Region + Kênh + U/R, chỉ khác Phân khúc'; }
      else if(otds.size > 1) { kind='channel'; kindLabel='Cùng Region + Phân khúc + U/R, chỉ khác Kênh'; }
      else                   { kind='region';  kindLabel='Cùng Kênh + Phân khúc + U/R, chỉ khác Region'; }
    }
    else if(regions.size === 1){ kind='region-inner'; kindLabel='Cùng Region, khác từ 2 chiều trở lên — cân nhắc kỹ'; }
    else { kind='mixed'; kindLabel='Khác nhiều chiều — cân nhắc kỹ'; }

    const preview = makeMergedUnit(members, state.datePrefix);
    groups.push({
      kind, kindLabel, oneDim: differing === 1,
      skuCount: members[0].items.length,
      codes: members.map(m => m.mslCode).sort(),
      regions: [...regions].sort(), otds: [...otds].sort(), segs: [...segs].sort(), urs: [...urs].sort(),
      savings: members.length - 1,
      mergedCode: preview.mslCode,
      mergedCodeLength: preview.mslCode.length,
      mergedDescription: preview.description,
      fitsCodeLimit: preview.mslCode.length <= MAX_CODE_LEN,
      fitsDescLimit: preview.description.length <= MAX_DESC_LEN,
      custRowsAfter: buildCustRows(preview).length,
      custRowsBefore: members.reduce((s,m) => s + buildCustRows(makeUnit(m)).length, 0),
      prdRowsSaved: (members.length - 1) * members[0].items.length
    });
  }

  // Nhom de gop nhat va tiet kiem nhieu nhat len dau
  const order = {ur:0, segment:1, channel:2, region:3, 'region-inner':4, mixed:5};
  groups.sort((a,b) => order[a.kind]-order[b.kind] || b.savings-a.savings);

  return {
    groups,
    totalGroups: groups.length,
    totalCodes: groups.reduce((s,g) => s+g.codes.length, 0),
    totalSavings: groups.reduce((s,g) => s+g.savings, 0)
  };
}

/* ----- Dung 4 dong du lieu cho mot danh sach MSL ----- */

function buildInfoRow(unit, startDate, endDate, total){
  return {
    'Distributor Code': HQ,
    'Must Sell List Code': unit.mslCode,
    'Must Sell List Description': unit.description,
    'Start Date': startDate,
    'End Date': endDate,
    'Operation Type': 'O',
    'Min Quantity Condition': 'A',
    'Total Number of SKU': total
  };
}

/* ----- Don vi xuat: 1 danh sach don le hoac nhieu danh sach da gop ----- */

function makeUnit(list){
  return {
    mslCode: list.mslCode,
    regions: [list.region], otds: [list.otd], segs: [list.seg], urs: [list.ur],
    items: list.items,
    description: mslDescription(list.region, list.otd, list.seg, list.ur),
    merged: false, sourceCodes: [list.mslCode]
  };
}

/**
 * Gop nhieu danh sach co danh sach SKU giong het nhau thanh mot don vi.
 * Ma moi: <ngay>_<cac Region>_<cac Kenh>_<cac Phan khuc>_<cac U/R>
 * VD: 260211_N1_CHTL_A_RR_UB; vuot 20 ky tu thi bo dau gach ben trong tung
 * chieu roi bo dan dau gach giua cac chieu nhu ma thuong: 260211N1_CHTL_A_RRUB
 */
function makeMergedUnit(lists, datePrefix){
  const uniq = arr => [...new Set(arr)].sort();
  const regions = uniq(lists.map(l => l.region));
  const otds    = uniq(lists.map(l => l.otd));
  const segs    = uniq(lists.map(l => l.seg));
  const urs     = uniq(lists.map(l => l.ur));
  const R = regions.map(regionAbbr), U = urs.map(urAbbr);

  const full    = [datePrefix, R.join('_'), otds.join('_'), segs.join('_'), U.join('_')].join('_');
  const mslCode = full.length <= MAX_CODE_LEN
    ? full
    : joinCode([datePrefix, R.join(''), otds.join(''), segs.join(''), U.join('')]);

  return {
    mslCode, regions, otds, segs, urs,
    items: lists[0].items,          // giong het nhau nen lay bat ky
    description: listDescription(regions, otds, segs, urs), merged: true,
    sourceCodes: lists.map(l => l.mslCode).sort()
  };
}

/* ----- Dung 4 bang du lieu tu danh sach don vi xuat ----- */

function buildOutputTables(units, startDate, endDate){
  const infoRows = [], condRows = [], custRows = [], prdRows = [];
  for(const u of units){
    infoRows.push(buildInfoRow(u, startDate, endDate, u.items.length));
    buildCondRows(u.mslCode).forEach(r => condRows.push(r));
    buildCustRows(u).forEach(r => custRows.push(r));
    u.items.forEach(it => prdRows.push(buildPrdRow(u.mslCode, it.itemCode)));
  }
  return {infoRows, condRows, custRows, prdRows};
}

/* 3 dong moi danh sach: H (kenh) seq 1, R (phan khuc) seq 2, U (urban/rural) seq 3 */
function buildCondRows(mslCode){
  return [
    {'Distributor Code':HQ,'MSL Code':mslCode,'Assignment Type':'H','Condition Type':1,'Sequence':1},
    {'Distributor Code':HQ,'MSL Code':mslCode,'Assignment Type':'R','Condition Type':1,'Sequence':2},
    {'Distributor Code':HQ,'MSL Code':mslCode,'Assignment Type':'U','Condition Type':1,'Sequence':3}
  ];
}

/**
 * Sinh dong CUSTASSIGN cho mot don vi xuat (co the la 1 danh sach hoac
 * nhieu danh sach da gop). Thu tu giong file mau:
 *   cap 3/4 = kenh | cap R = Phan khuc | cap U = ma U/R | cap G = node Region (SPVB, MSL_DIST)
 * Voi don vi da gop thi lay HOP cua tung cap roi khu trung lap.
 */
function buildCustRows(unit){
  const rows = [], seen = new Set();
  const add = (dist, level, code) => {
    const key = level+'|'+code;
    if(!code || seen.has(key)) return;
    seen.add(key);
    rows.push({'Distributor Code':dist,'Must Sell List Code':unit.mslCode,
               'Assignment Type': level==='G' ? 'MSL_DIST' : 'MSL_CUST',
               'Customer Hierarchy Level':level,'Assignment Code':code});
  };

  // Moi kenh chi sinh dung mot dong: cap 3 (TTON+ma) HOAC cap 4 (ma kenh)
  unit.otds.forEach(o => {
    const lv = resolveOtd(o);
    if(lv === '3') add(HQ, '3', 'TTON' + o);
    else if(lv === '4') add(HQ, '4', o);
  });
  unit.segs.forEach(sg => add(HQ, 'R', sg));
  unit.urs.forEach(u => { const c = resolveUr(u); add(HQ, 'U', c ? c.code : null); });
  unit.regions.forEach(g => { const c = resolveRegion(g); add(G_ROW_DIST_CODE, 'G', c ? c.node : null); });

  return rows;
}

function buildPrdRow(mslCode, itemCode){
  const uom = resolveUom(itemCode);
  return {
    'Distributor Code': HQ,
    'Must Sell List Code': mslCode,
    'Prodcat Level': 10,
    'Prodcat Code': itemCode,
    'UOM Code': uom.uom,
    'Minimum Quantity': uom.minQty
  };
}

/* ========================= CHE DO TAO MOI ========================= */

function generate(){
  const { datePrefix, startDate, endDate, stockMode } = state;
  const { lists, report } = computeTargetLists(datePrefix, stockMode);

  state.targetLists = lists;                 // giu lai de co the gop ma sau
  const units = [...lists.values()].map(makeUnit);
  const {infoRows, condRows, custRows, prdRows} = buildOutputTables(units, startDate, endDate);

  report.keptSubsets = infoRows.length;
  report.byRegion = analyzeByRegion(lists, report);
  report.merge  = findMergeableLists(lists);

  // Danh sach day du cac MSL se tao
  report.allLists = [...lists.values()].map(l => ({
    mslCode: l.mslCode, region: l.region, otd: l.otd, seg: l.seg, ur: l.ur, skuCount: l.items.length
  }));

  // Tong hop: moi Item Code xuat hien trong bao nhieu danh sach
  const skuMap = new Map();
  for(const l of lists.values()){
    for(const it of l.items){
      if(!skuMap.has(it.itemCode)) skuMap.set(it.itemCode, {itemCode:it.itemCode, itemName:it.itemName, lists:0, regions:new Set()});
      const e = skuMap.get(it.itemCode);
      e.lists++; e.regions.add(l.region);
    }
  }
  report.skuSummary = [...skuMap.values()]
    .map(e => ({itemCode:e.itemCode, itemName:e.itemName, lists:e.lists, regionCount:e.regions.size}))
    .sort((a,b) => b.lists - a.lists);

  // Phan bo so SKU tren moi danh sach
  const sizes = [...lists.values()].map(l => l.items.length).sort((a,b)=>a-b);
  report.sizeStats = sizes.length ? {
    min: sizes[0], max: sizes[sizes.length-1],
    median: sizes[Math.floor(sizes.length/2)],
    avg: Math.round(sizes.reduce((s,x)=>s+x,0) / sizes.length)
  } : null;

  return {mode:'create', infoRows, condRows, custRows, prdRows, report};
}

/**
 * Ap dung gop ma cho cac nhom nguoi dung da chon, roi dung lai 4 bang.
 * selectedIndexes: mang chi so cac nhom trong report.merge.groups
 * customNames: {chiSoNhom: 'ma tu dat'} - tuy chon
 */
function applyMerges(selectedIndexes, customNames, customDescs){
  const { datePrefix, startDate, endDate } = state;
  const lists = state.targetLists;
  const groups = state.result.report.merge.groups;
  const chosen = new Set(selectedIndexes);

  const mergedCodes = new Set();
  const units = [];
  const applied = [];

  selectedIndexes.forEach(i => {
    const g = groups[i];
    const members = g.codes.map(c => lists.get(c)).filter(Boolean);
    if(members.length < 2) return;
    const unit = makeMergedUnit(members, datePrefix);
    if(customNames && customNames[i]) unit.mslCode = customNames[i];
    if(customDescs && customDescs[i]) unit.description = customDescs[i];
    members.forEach(m => mergedCodes.add(m.mslCode));
    units.push(unit);
    applied.push({
      mergedCode: unit.mslCode, description: unit.description,
      sourceCodes: unit.sourceCodes, skuCount: unit.items.length,
      regions: unit.regions, otds: unit.otds, segs: unit.segs, urs: unit.urs,
      savedCodes: members.length - 1, savedPrdRows: (members.length - 1) * unit.items.length
    });
  });

  // Cac danh sach khong nam trong nhom nao duoc chon thi giu nguyen
  for(const list of lists.values()){
    if(!mergedCodes.has(list.mslCode)) units.push(makeUnit(list));
  }
  units.sort((a,b) => a.mslCode.localeCompare(b.mslCode));

  const tables = buildOutputTables(units, startDate, endDate);
  const report = Object.assign({}, state.result.report, {
    keptSubsets: tables.infoRows.length,
    mergeApplied: {
      groups: applied,
      groupCount: applied.length,
      codesSaved: applied.reduce((s,a) => s+a.savedCodes, 0),
      prdRowsSaved: applied.reduce((s,a) => s+a.savedPrdRows, 0),
      selectedIndexes: [...chosen]
    }
  });

  return Object.assign({mode:'create'}, tables, {report});
}

/* ========================= CHE DO CAP NHAT =========================
   So sanh danh sach "dung ra phai co hom nay" voi bo file da upload lan truoc.
   Chi sinh phan CAN THEM. Khong bao gio sinh dong xoa vi DMS khong ho tro.

   Mot ma dang chay co the ap cho nhieu to hop Region x Kenh x Phan khuc x U/R
   (ma da gop dau thang). Pham vi cua ma doc tu MSL_CUSTASSIGN: khach khop mot
   Region, mot Kenh, mot Phan khuc va mot U/R cua ma thi nhan ma -> pham vi la
   tich cheo 4 chieu. SKU moi duoc dua vao:
     1. cac ma dang chay, ma rong truoc: chi them SKU ma MOI to hop trong pham
        vi ma deu con thieu (ma rieng cua mot to hop la ma rong = 1). Ma con ap
        cho to hop da bi bo khoi HERO NEW thi khong them gi.
     2. phan con thieu cua tung to hop -> danh sach moi rieng cho to hop, chi
        chua SKU moi (them vao ma gop se ap sai cho cac to hop khac)
   To hop chua co ma nao ap -> danh sach moi day du.
   ================================================================== */

function generateUpdate(){
  const baseInfo = buildBaselineInfo(state.baseInfoRows);
  const basePrd  = buildBaselinePrd(state.basePrdRows);
  const baseCust = buildBaselineCust(state.baseCustRows);

  const datePrefix = baseInfo.prefix;
  const startDate  = baseInfo.startDate;
  const endDate    = baseInfo.endDate;

  // Giua thang luon dung logic "chi SKU con hang" de tim hang moi ve.
  const { lists, report } = computeTargetLists(datePrefix, 'onlyInStock');

  /* B1: pham vi tung ma dang chay = cac to hop trong HERO NEW ma ma do ap cho.
     Bo qua ma cua dot khac: tien to khac, hoac het han truoc ngay bat dau dot nay. */
  const subsetByCode = new Map();          // ma to hop -> {region,otd,seg,ur}
  for(const sub of state.subsets.values()){
    if(!resolveRegion(sub.region) || !resolveUr(sub.ur)) continue;
    subsetByCode.set(subsetCode(datePrefix, sub.region, sub.otd, sub.seg, sub.ur), sub);
  }
  const isIso = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const allBaseCodes = new Set([...baseInfo.codes.keys(), ...basePrd.keys()]);
  const cover = new Map();                 // ma dang chay -> Set<ma to hop>
  const outside = new Map();               // ma dang chay -> so to hop DMS dang ap ma HERO NEW da bo
  const coveredBy = new Map();             // ma to hop -> [ma dang chay]
  const otherBatchCodes = [];
  for(const code of allBaseCodes){
    const p = splitMslCode(code).prefix;
    const end = s((baseInfo.rows.get(code) || {})['End Date']);
    if((p && p !== datePrefix) || (isIso(end) && isIso(startDate) && end < startDate)){
      otherBatchCodes.push(code);
      continue;
    }
    const set = new Set();
    if(subsetByCode.has(code)) set.add(code);      // du phong khi thieu dong CUSTASSIGN
    let combos = 0;
    const c = baseCust.get(code);
    if(c) for(const g of c.regions) for(const o of c.otds) for(const sg of c.segs) for(const u of c.urs){
      const k = subsetCode(datePrefix, g, o, sg, u);
      combos++;
      if(subsetByCode.has(k)) set.add(k);
    }
    cover.set(code, set);
    outside.set(code, Math.max(0, combos - set.size));
    for(const k of set){
      if(!coveredBy.has(k)) coveredBy.set(k, []);
      coveredBy.get(k).push(code);
    }
  }

  /* B2: SKU dang co cua tung to hop = hop SKU cua moi ma dang ap cho no */
  const existing = new Map();              // ma to hop -> Set<Item Code>
  for(const [k, codes] of coveredBy){
    const set = new Set();
    codes.forEach(c => (basePrd.get(c) || []).forEach(it => set.add(it)));
    existing.set(k, set);
  }
  const addedFor = k => {
    const t = lists.get(k);
    if(!t) return [];
    const ex = existing.get(k) || new Set();
    return t.items.filter(it => !ex.has(it.itemCode));
  };
  const markCovered = (keys, items) => keys.forEach(k => {
    if(!existing.has(k)) existing.set(k, new Set());
    items.forEach(it => existing.get(k).add(it.itemCode));
  });

  /* B3: dua SKU moi vao ma dang chay, ma rong truoc. Chi them SKU ma MOI to hop
     trong pham vi ma deu con thieu, nen khong ap sai cho to hop nao. Thu tu ma
     rong -> hep giup SKU chung cua ca nhom vao ma gop, khong bi rai ra ma le. */
  const grown = new Map();                 // ma dang chay -> SKU can them
  const grow = (code, items) => {
    if(!grown.has(code)) grown.set(code, []);
    grown.get(code).push(...items);
    markCovered([...cover.get(code)], items);
  };
  const byWidth = [...cover.keys()]
    .filter(code => cover.get(code).size && !outside.get(code))
    .sort((a,b) => cover.get(b).size - cover.get(a).size || a.localeCompare(b));
  for(const code of byWidth){
    const [first, ...others] = [...cover.get(code)];
    const othersAdded = others.map(m => new Set(addedFor(m).map(it => it.itemCode)));
    const common = addedFor(first).filter(it => othersAdded.every(set => set.has(it.itemCode)));
    if(common.length) grow(code, common);
  }

  /* B4: phan con thieu cua tung to hop -> danh sach moi */
  const newUnits = [], manual = [];
  for(const k of [...lists.keys()].sort()){
    const list = lists.get(k);
    const codes = coveredBy.get(k) || [];

    if(!codes.length){                     // chua co ma nao ap: danh sach moi day du
      newUnits.push({unit: makeUnit(list), splitFrom: null});
      continue;
    }
    const rest = addedFor(k);
    if(!rest.length) continue;

    const from = [...codes].sort((a,b) => cover.get(a).size - cover.get(b).size || a.localeCompare(b))[0];
    if(allBaseCodes.has(k)){               // ma cua to hop da duoc dung cho ma khac tren DMS
      manual.push({mslCode:k, region:list.region, otd:list.otd, seg:list.seg, ur:list.ur, mergedCode:from,
        addedItems: rest.map(it => it.itemCode).join(', '),
        reason:`Mã ${k} đã có trên DMS nhưng còn áp cho tổ hợp khác — không thêm vào được, cũng không tách riêng được`});
      continue;
    }
    newUnits.push({unit: Object.assign(makeUnit(list), {items: rest}), splitFrom: from});
    markCovered([k], rest);
  }

  /* B5: dung du lieu xuat */
  const infoRows = [], condRows = [], custRows = [], prdRows = [];
  const newLists = [], grownLists = [], goneOutOfStock = [];

  const scopeOf = code => {
    const subs = [...cover.get(code)].map(k => subsetByCode.get(k));
    const uniq = f => [...new Set(subs.map(f))].sort();
    return {regions: uniq(x => x.region), otds: uniq(x => x.otd), segs: uniq(x => x.seg), urs: uniq(x => x.ur)};
  };

  for(const code of [...grown.keys()].sort()){
    const items = grown.get(code);
    const base = baseInfo.rows.get(code) || {};
    const oldTotal = (basePrd.get(code) || new Set()).size;
    const newTotal = oldTotal + items.length;
    const scope = scopeOf(code);
    const n = cover.get(code).size;
    // Giu nguyen mo ta va ngay hieu luc cua ma tren DMS
    infoRows.push(buildInfoRow(
      {mslCode: code, description: s(base['Must Sell List Description'])
                                   || listDescription(scope.regions, scope.otds, scope.segs, scope.urs)},
      s(base['Start Date']) || startDate, s(base['End Date']) || endDate, newTotal));
    items.forEach(it => prdRows.push(buildPrdRow(code, it.itemCode)));
    grownLists.push({mslCode: code,
      region: scope.regions.join(', '), otd: scope.otds.join(', '),
      seg: scope.segs.join(', '), ur: scope.urs.join(', '),
      oldTotal, addedCount: items.length, newTotal,
      addedItems: items.map(it => it.itemCode).join(', '),
      note: n > 1 ? `Mã gộp — áp cho ${n} tổ hợp` : ''});
  }

  for(const {unit, splitFrom} of newUnits){
    infoRows.push(buildInfoRow(unit, startDate, endDate, unit.items.length));
    buildCondRows(unit.mslCode).forEach(r => condRows.push(r));
    buildCustRows(unit).forEach(r => custRows.push(r));
    unit.items.forEach(it => prdRows.push(buildPrdRow(unit.mslCode, it.itemCode)));
    newLists.push({mslCode: unit.mslCode, region: unit.regions[0], otd: unit.otds[0], seg: unit.segs[0],
      ur: unit.urs[0], skuCount: unit.items.length,
      note: splitFrom ? `Tách từ mã gộp ${splitFrom} — chỉ chứa SKU mới, SKU cũ vẫn ở mã gộp` : ''});
  }

  /* SKU dang nam trong DMS nhung hien da het hang o Region - chi bao cao, khong xoa duoc.
     SKU moi (New SKU Ind = Y) khong tinh vao day: chung co ton kho = 0 la co y. */
  const stockIndex = currentStockIndex();
  const { newSku: newSkuSet } = buildProductInfoSets(state.pinfoRows);
  for(const [mslCode, items] of basePrd){
    if(!cover.has(mslCode)) continue;      // ma cua dot khac
    const c = baseCust.get(mslCode);
    const regions = c && c.regions.size
      ? [...c.regions]
      : [...new Set([...cover.get(mslCode)].map(k => subsetByCode.get(k).region))];
    for(const region of regions) for(const itemCode of items){
      if(newSkuSet.has(itemCode)) continue;
      const avail = stockIndex.get(region + '|' + itemCode);
      if(avail === undefined || avail <= 0){
        goneOutOfStock.push({mslCode, region, itemCode, avail: avail || 0});
      }
    }
  }

  const result = {mode:'update', infoRows, condRows, custRows, prdRows};
  result.baseline = buildCumulativeBaseline(baseInfo, result);
  result.report = Object.assign(report, {
    newLists, grownLists, goneOutOfStock, manual,
    mergedCount: [...cover].filter(([code, set]) => set.size + outside.get(code) > 1).length,
    unmatchedCodes: [...cover].filter(([,set]) => !set.size).map(([code]) => code).sort(),
    outsideCodes: [...cover].filter(([code, set]) => set.size && outside.get(code)).map(([code]) => code).sort(),
    otherBatchCodes: otherBatchCodes.sort(),
    unknownGCodes: [...baseCust].filter(([,c]) => c.unknownG.size).map(([code]) => code).sort(),
    unknownUCodes: [...baseCust].filter(([,c]) => c.unknownU.size).map(([code]) => code).sort(),
    // Ma khong co dong cap U nao: thuong la danh sach tao theo mau cu (theo Area)
    noUCodes: [...baseCust].filter(([code, c]) => cover.has(code) && !c.urs.size && !c.unknownU.size)
                           .map(([code]) => code).sort(),
    baselineLists: basePrd.size,
    baselineSkuRows: state.basePrdRows.length,
    datePrefix, startDate, endDate,
    keptSubsets: lists.size
  });
  return result;
}

/* Bo file moc sau khi upload xong lan nay = bo file moc cu + phan bo sung.
   Moi ma giu mot dong INFO (dong moi nhat); dong CUSTASSIGN / PRDASSIGN khu trung. */
function buildCumulativeBaseline(baseInfo, delta){
  const info = new Map(baseInfo.rows);
  delta.infoRows.forEach(r => info.set(r['Must Sell List Code'], r));
  const uniq = (rows, cols) => {
    const seen = new Set();
    return rows.filter(r => {
      const k = cols.map(c => s(r[c])).join('|');
      if(seen.has(k)) return false;
      seen.add(k); return true;
    });
  };
  return {
    infoRows: [...info.values()],
    custRows: uniq([...state.baseCustRows, ...delta.custRows],
                   ['Must Sell List Code','Customer Hierarchy Level','Assignment Code']),
    prdRows:  uniq([...state.basePrdRows, ...delta.prdRows], ['Must Sell List Code','Prodcat Code'])
  };
}
