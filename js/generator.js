'use strict';
/* =========================================================================
   generator.js
   Logic nghiep vu chinh.
     - computeTargetLists()  : tinh ra danh sach SKU "dung ra phai co" hom nay
     - generate()            : che do TAO MOI dau thang -> 4 file day du
     - generateUpdate()      : che do CAP NHAT giua thang -> file bo sung
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

function mslDescription(area, otd, seg){
  return `${area}_Danh sách SKU bán chạy ${otd}_${seg}`;
}

/**
 * Tinh danh sach SKU mong muon cho tung to hop Area x Kenh x Phan khuc.
 *
 * stockMode:
 *   'onlyInStock' - chi giu SKU con ton kho (tru SKU moi thi luon giu)
 *   'includeAll'  - giu tat ca, khong loai vi ton kho
 *
 * Tra ve { lists: Map<key,{area,otd,seg,mslCode,items:[{itemCode,itemName}]}>,
 *          report: {...} }
 */
function computeTargetLists(datePrefix, stockMode){
  const { productRows, pinfoRows, subsets } = state;

  const productIndex = buildProductIndex(productRows);
  const stockIndex   = currentStockIndex();     // Stock Area.xlsx hoac INVT_MASTER.csv
  const { valid: validProducts, newSku: newSkuSet, reason: invalidReason } = buildProductInfoSets(pinfoRows);

  // Area nao khong co dong nao trong nguon ton kho -> thieu du lieu, khong phai het hang
  const areasWithStockData = areasWithStock();

  const lists = new Map();
  const noStock = [], keptByNewSku = [], filteredOut = [], missingItemReport = [], emptySubsets = [];
  let noStockRowCut = 0;   // so dong bi loai vi khong co dong ton kho, o che do "giu lai tat ca"

  for(const key of [...subsets.keys()].sort()){
    const sub = subsets.get(key);
    const { area, otd, seg } = sub;
    const mslCode = datePrefix + area + '_' + otd + '_' + seg;

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
        missingItemReport.push({area, otd, seg, skuGroup:g,
          reason:'SKU Group không có dòng nào trong Product List.xlsx'});
        continue;
      }
      for(const it of items) itemMap.set(it.itemCode, it.itemName);
    }

    /* B2: loc theo PRODUCT_INFO */
    const afterProductInfo = new Map();
    let cutByPinfo = 0;
    for(const [itemCode, itemName] of itemMap){
      if(!validProducts.has(itemCode)){
        filteredOut.push({area, otd, seg, mslCode, itemCode, itemName,
          reason: invalidReason.get(itemCode) || 'Không tìm thấy mã này trong PRODUCT_INFO.csv'});
        cutByPinfo++;
        continue;
      }
      afterProductInfo.set(itemCode, itemName);
    }

    /* B3: loc theo ton kho. SKU moi (New SKU Ind = Y) luon duoc giu lai */
    const hasStockData = areasWithStockData.has(area);
    const items = [];
    let cutByStock = 0;
    for(const [itemCode, itemName] of afterProductInfo){
      const avail = stockIndex.get(area + '|' + itemCode);
      const hasStock = avail !== undefined && avail > 0;

      if(hasStock){
        items.push({itemCode, itemName});
        continue;
      }

      const isNewSku = newSkuSet.has(itemCode);

      // Co dong ton kho ghi 0  -> NPP co kinh doanh mat hang nay, dang tam het.
      // Khong co dong nao      -> NPP khong kinh doanh mat hang nay, khong dua vao.
      const hasStockRow = avail !== undefined;
      const reason = !hasStockData
        ? `Area ${area} không có dữ liệu tồn kho trong file ${stockSourceName()}`
        : (!hasStockRow ? `Không có dòng tồn kho cho mã này tại ${area} — NPP không kinh doanh mặt hàng này`
                        : `Tồn khả dụng = ${avail} tại ${area}`);
      noStock.push({area, otd, seg, mslCode, itemCode, itemName,
                    avail: avail || 0, isNewSku, hasStockRow, reason});

      if(isNewSku){
        items.push({itemCode, itemName});
        keptByNewSku.push({area, otd, seg, mslCode, itemCode, itemName,
          reason:'New SKU Ind = Y — SKU mới ra mắt, giữ lại dù chưa có hàng'});
      } else if(stockMode === 'includeAll' && hasStockRow){
        items.push({itemCode, itemName});
      } else {
        cutByStock++;
        if(stockMode === 'includeAll') noStockRowCut++;
      }
    }

    if(!items.length){
      emptySubsets.push({area, otd, seg, mslCode,
        candidates: itemMap.size, cutByPinfo, cutByStock,
        reason: itemMap.size === 0
          ? 'Không tra được Item Code nào từ các SKU Group'
          : (cutByStock > 0
              ? `Có ${itemMap.size} SKU: ${cutByPinfo} bị loại theo PRODUCT_INFO, ${cutByStock} hết tồn kho`
              : `Cả ${itemMap.size} SKU đều bị loại theo PRODUCT_INFO`)});
      continue;
    }
    lists.set(mslCode, {area, otd, seg, mslCode, items});
  }

  return {
    lists,
    report: {
      noStock, keptByNewSku, filteredOut, missingItemReport, emptySubsets,
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
 * Thong ke theo tung Area: bao nhieu danh sach, bao nhieu SKU, ty le SKU
 * bi loai vi het ton kho. Giup phat hien Area co du lieu ton kho bat thuong.
 */
function analyzeByArea(lists, report){
  // Area nao hoan toan khong co du lieu ton kho -> thieu du lieu, khong phai het hang
  const areasWithStockData = areasWithStock();

  const map = new Map();
  const touch = a => {
    if(!map.has(a)) map.set(a, {area:a, lists:0, skuRows:0, noStock:0, newSkuKept:0,
                                filtered:0, emptyLists:0, hasStockData: areasWithStockData.has(a)});
    return map.get(a);
  };
  for(const l of lists.values()){ const e = touch(l.area); e.lists++; e.skuRows += l.items.length; }
  report.noStock.forEach(r => touch(r.area).noStock++);
  report.keptByNewSku.forEach(r => touch(r.area).newSkuKept++);
  report.filteredOut.forEach(r => touch(r.area).filtered++);
  report.emptySubsets.forEach(r => touch(r.area).emptyLists++);

  return [...map.values()].map(e => {
    const candidates = e.skuRows + e.noStock;   // truoc khi loc ton kho
    e.inStockRate = candidates ? Math.round((e.skuRows / candidates) * 100) : 0;
    e.avgSkuPerList = e.lists ? Math.round(e.skuRows / e.lists) : 0;
    return e;
  }).sort((a,b) => a.area.localeCompare(b.area));
}

/**
 * Tim cac ma MSL co danh sach SKU GIONG HET nhau -> co the gop lam mot.
 * Phan loai kieu gop de biet co gop duoc an toan khong:
 *   'segment' - cung Area + cung Kenh, chi khac Phan khuc  (de gop nhat)
 *   'channel' - cung Area + cung Phan khuc, chi khac Kenh
 *   'area'    - cung Kenh + Phan khuc, khac Area
 *   'mixed'   - khac nhieu chieu, can can nhac ky
 */
function findMergeableLists(lists){
  const byFingerprint = new Map();
  for(const l of lists.values()){
    const fp = [...l.items.map(i => i.itemCode)].sort().join(',');
    if(!byFingerprint.has(fp)) byFingerprint.set(fp, []);
    byFingerprint.get(fp).push(l);
  }

  const groups = [];
  for(const [fp, members] of byFingerprint){
    if(members.length < 2) continue;

    const areas = new Set(members.map(m => m.area));
    const otds  = new Set(members.map(m => m.otd));
    const segs  = new Set(members.map(m => m.seg));

    let kind, kindLabel;
    if(areas.size === 1 && otds.size === 1){ kind='segment'; kindLabel='Cùng Area + Kênh, chỉ khác Phân khúc'; }
    else if(areas.size === 1 && segs.size === 1){ kind='channel'; kindLabel='Cùng Area + Phân khúc, chỉ khác Kênh'; }
    else if(areas.size === 1){ kind='area-inner'; kindLabel='Cùng Area, khác cả Kênh và Phân khúc'; }
    else if(otds.size === 1 && segs.size === 1){ kind='area'; kindLabel='Cùng Kênh + Phân khúc, khác Area'; }
    else { kind='mixed'; kindLabel='Khác nhiều chiều — cân nhắc kỹ'; }

    const preview = makeMergedUnit(members, state.datePrefix);
    groups.push({
      kind, kindLabel,
      skuCount: members[0].items.length,
      codes: members.map(m => m.mslCode).sort(),
      areas: [...areas].sort(), otds: [...otds].sort(), segs: [...segs].sort(),
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
  const order = {segment:0, channel:1, 'area-inner':2, area:3, mixed:4};
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
    areas: [list.area], otds: [list.otd], segs: [list.seg],
    items: list.items,
    description: mslDescription(list.area, list.otd, list.seg),
    merged: false, sourceCodes: [list.mslCode]
  };
}

/**
 * Gop nhieu danh sach co danh sach SKU giong het nhau thanh mot don vi.
 * Ma moi ghep theo dang: <tien to><cac Area>_<cac Kenh>_<cac Phan khuc>
 * VD: 260801HCMC4_TH_C_D_E
 */
function makeMergedUnit(lists, datePrefix){
  const uniq = arr => [...new Set(arr)].sort();
  const areas = uniq(lists.map(l => l.area));
  const otds  = uniq(lists.map(l => l.otd));
  const segs  = uniq(lists.map(l => l.seg));

  // Uu tien dang co dau gach: 260801HCMC4_TH_C_D_E
  // Neu vuot 20 ky tu thi bo dau gach o phan gop: 260801HCMC4_TH_CDE
  const full    = datePrefix + [areas.join('_'), otds.join('_'), segs.join('_')].join('_');
  const compact = datePrefix + areas.join('') + '_' + otds.join('') + '_' + segs.join('');
  const mslCode = full.length <= MAX_CODE_LEN ? full : compact;

  // Mo ta cung co tran do dai rieng
  const longDesc  = `${areas.join('_')}_Danh sách SKU bán chạy ${otds.join('_')}_${segs.join('_')}`;
  const shortDesc = `${areas.join('')}_SKU bán chạy ${otds.join('')}_${segs.join('')}`;
  const description = longDesc.length <= MAX_DESC_LEN ? longDesc : shortDesc;

  return {
    mslCode, areas, otds, segs,
    items: lists[0].items,          // giong het nhau nen lay bat ky
    description, merged: true,
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

function buildCondRows(mslCode){
  return [
    {'Distributor Code':HQ,'MSL Code':mslCode,'Assignment Type':'H','Condition Type':1,'Sequence':1},
    {'Distributor Code':HQ,'MSL Code':mslCode,'Assignment Type':'R','Condition Type':1,'Sequence':2}
  ];
}

/**
 * Sinh dong CUSTASSIGN cho mot don vi xuat (co the la 1 danh sach hoac
 * nhieu danh sach da gop). Voi don vi da gop thi lay HOP cua tung cap
 * roi khu trung lap: nhieu Kenh -> nhieu dong cap 3/4, nhieu Phan khuc
 * -> nhieu dong cap R, nhieu Area -> nhieu dong cap G.
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
    if(lv === '3') add(HQ,'3','TTON'+o);
    else if(lv === '4') add(HQ,'4',o);
  });
  unit.segs.forEach(sg => add(HQ,'R',sg));
  unit.areas.forEach(a => add(G_ROW_DIST_CODE,'G', resolveAreaCode(a)));

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
  report.byArea = analyzeByArea(lists, report);
  report.merge  = findMergeableLists(lists);

  // Danh sach day du cac MSL se tao
  report.allLists = [...lists.values()].map(l => ({
    mslCode: l.mslCode, area: l.area, otd: l.otd, seg: l.seg, skuCount: l.items.length
  }));

  // Tong hop: moi Item Code xuat hien trong bao nhieu danh sach
  const skuMap = new Map();
  for(const l of lists.values()){
    for(const it of l.items){
      if(!skuMap.has(it.itemCode)) skuMap.set(it.itemCode, {itemCode:it.itemCode, itemName:it.itemName, lists:0, areas:new Set()});
      const e = skuMap.get(it.itemCode);
      e.lists++; e.areas.add(l.area);
    }
  }
  report.skuSummary = [...skuMap.values()]
    .map(e => ({itemCode:e.itemCode, itemName:e.itemName, lists:e.lists, areaCount:e.areas.size}))
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
      areas: unit.areas, otds: unit.otds, segs: unit.segs,
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

   Mot ma dang chay co the ap cho nhieu to hop Area x Kenh x Phan khuc (ma da
   gop dau thang). Pham vi cua ma doc tu MSL_CUSTASSIGN: khach khop mot Area,
   mot Kenh va mot Phan khuc cua ma thi nhan ma -> pham vi la tich cheo 3 chieu.
   SKU moi duoc dua vao:
     1. cac ma dang chay, ma rong truoc: chi them SKU ma MOI to hop trong pham
        vi ma deu con thieu (ma rieng cua mot to hop la ma rong = 1). Ma con ap
        cho to hop da bi bo khoi Hero New thi khong them gi.
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

  /* B1: pham vi tung ma dang chay = cac to hop trong Hero New ma ma do ap cho.
     Bo qua ma cua dot khac: tien to khac, hoac het han truoc ngay bat dau dot nay. */
  const subsetByCode = new Map();          // ma to hop -> {area,otd,seg}
  for(const sub of state.subsets.values()){
    subsetByCode.set(datePrefix + sub.area + '_' + sub.otd + '_' + sub.seg, sub);
  }
  const isIso = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const allBaseCodes = new Set([...baseInfo.codes.keys(), ...basePrd.keys()]);
  const cover = new Map();                 // ma dang chay -> Set<ma to hop>
  const outside = new Map();               // ma dang chay -> so to hop DMS dang ap ma Hero New da bo
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
    if(c) for(const a of c.areas) for(const o of c.otds) for(const sg of c.segs){
      const k = datePrefix + a + '_' + o + '_' + sg;
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
      manual.push({mslCode:k, area:list.area, otd:list.otd, seg:list.seg, mergedCode:from,
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
    const join = f => [...new Set(subs.map(f))].sort().join(', ');
    return {area: join(x => x.area), otd: join(x => x.otd), seg: join(x => x.seg)};
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
      {mslCode: code, description: s(base['Must Sell List Description']) || mslDescription(scope.area, scope.otd, scope.seg)},
      s(base['Start Date']) || startDate, s(base['End Date']) || endDate, newTotal));
    items.forEach(it => prdRows.push(buildPrdRow(code, it.itemCode)));
    grownLists.push(Object.assign({mslCode: code}, scope, {
      oldTotal, addedCount: items.length, newTotal,
      addedItems: items.map(it => it.itemCode).join(', '),
      note: n > 1 ? `Mã gộp — áp cho ${n} tổ hợp` : ''}));
  }

  for(const {unit, splitFrom} of newUnits){
    infoRows.push(buildInfoRow(unit, startDate, endDate, unit.items.length));
    buildCondRows(unit.mslCode).forEach(r => condRows.push(r));
    buildCustRows(unit).forEach(r => custRows.push(r));
    unit.items.forEach(it => prdRows.push(buildPrdRow(unit.mslCode, it.itemCode)));
    newLists.push({mslCode: unit.mslCode, area: unit.areas[0], otd: unit.otds[0], seg: unit.segs[0],
      skuCount: unit.items.length,
      note: splitFrom ? `Tách từ mã gộp ${splitFrom} — chỉ chứa SKU mới, SKU cũ vẫn ở mã gộp` : ''});
  }

  /* SKU dang nam trong DMS nhung hien da het hang - chi bao cao, khong xoa duoc.
     SKU moi (New SKU Ind = Y) khong tinh vao day: chung co ton kho = 0 la co y. */
  const stockIndex = currentStockIndex();
  const { newSku: newSkuSet } = buildProductInfoSets(state.pinfoRows);
  for(const [mslCode, items] of basePrd){
    if(!cover.has(mslCode)) continue;      // ma cua dot khac
    const c = baseCust.get(mslCode);
    const areas = c && c.areas.size ? [...c.areas] : [splitMslCode(mslCode).rest.split('_')[0]];
    for(const area of areas) for(const itemCode of items){
      if(newSkuSet.has(itemCode)) continue;
      const avail = stockIndex.get(area + '|' + itemCode);
      if(avail === undefined || avail <= 0){
        goneOutOfStock.push({mslCode, area, itemCode, avail: avail || 0});
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
