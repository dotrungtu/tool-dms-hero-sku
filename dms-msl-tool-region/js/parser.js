'use strict';
/* =========================================================================
   parser.js  (ban Region x U/R)
   Doc file Excel/CSV va dung len cac cau truc du lieu trung gian
   (subset, chi muc san pham, chi muc ton kho, danh sach SKU hop le).
   ========================================================================= */

/* ----- Doc file Excel (.xlsx/.xls) ----- */
function readWorkbookFile(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const wb = XLSX.read(e.target.result, {type:'array', cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {defval:null, raw:true});
        resolve(rows);
      }catch(err){ reject(err); }
    };
    reader.onerror = () => reject(new Error('Khong doc duoc file'));
    reader.readAsArrayBuffer(file);
  });
}

/* ----- Tach toan bo van ban CSV thanh mang cac ban ghi.
   Quet theo tung ky tu nen xu ly duoc o co chua dau phay, dau nhay kep
   va ca ky tu xuong dong nam ben trong dau nhay. ----- */
function parseCsvText(text){
  const records = [];
  let row = [], cur = '', inQuote = false, atFieldStart = true;

  for(let i=0;i<text.length;i++){
    const ch = text[i];

    if(inQuote){
      if(ch === '"'){
        if(text[i+1] === '"'){ cur += '"'; i++; }   // dau nhay thoat: "" -> "
        else inQuote = false;                       // dong o
      } else cur += ch;                             // xuong dong trong o van giu nguyen
      continue;
    }

    if(ch === '"' && atFieldStart){
      inQuote = true; atFieldStart = false;
    } else if(ch === ','){
      row.push(cur); cur = ''; atFieldStart = true;
    } else if(ch === '\r'){
      /* bo qua, de \n xu ly */
    } else if(ch === '\n'){
      row.push(cur); records.push(row);
      row = []; cur = ''; atFieldStart = true;
    } else {
      // Dau nhay nam giua o khong dat trong ngoac (VD: Kim cat 6" - 84-027)
      // duoc coi la ky tu binh thuong.
      cur += ch; atFieldStart = false;
    }
  }
  if(cur !== '' || row.length){ row.push(cur); records.push(row); }

  return records.filter(r => r.some(c => c !== ''));   // bo dong trong
}

/* ----- Doc file CSV. Dong sai so cot se bi bo qua thay vi lam dung ca file ----- */
function readCsvFile(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      try{
        let text = e.target.result;
        if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // bo BOM

        const records = parseCsvText(text);
        if(!records.length){ resolve([]); return; }

        const headers = records[0].map(h => h.trim());
        const rows = [], skipped = [];

        for(let i=1;i<records.length;i++){
          const cells = records[i];
          if(cells.length < headers.length){ skipped.push(i+1); continue; }
          const obj = {};
          headers.forEach((h,j) => { obj[h] = cells[j]!==undefined ? cells[j].trim() : null; });
          rows.push(obj);
        }

        if(skipped.length) console.warn('Bo qua dong CSV khong dung so cot:', skipped);
        rows.__skippedLines = skipped;
        resolve(rows);
      }catch(err){ reject(err); }
    };
    reader.onerror = () => reject(new Error('Khong doc duoc file'));
    reader.readAsText(file, 'UTF-8');
  });
}

/* ----- Chon cach doc dua theo duoi file ----- */
function readDataFile(file){
  return /\.csv$/i.test(file.name) ? readCsvFile(file) : readWorkbookFile(file);
}

function pick(row, ...names){
  for(const nm of names){ if(row[nm]!==undefined && row[nm]!==null && row[nm]!=='') return row[nm]; }
  return null;
}
function s(v){ return v===null||v===undefined ? '' : String(v).trim(); }
function n(v){ const x = parseFloat(v); return isNaN(x)?0:x; }

function validateCols(rows, required){
  if(!rows.length) return ['File rong, khong co du lieu.'];
  const cols = Object.keys(rows[0]);
  return required.filter(c => !cols.includes(c)).map(c=>`Thieu cot "${c}"`);
}

/* Moi to hop Region x OTD L4 x Segment x U/R cua HERO NEW la mot danh sach.
   (HERO NEW co san cot "Subset" = Region_OTD L4_Segment_U/R, khop 100%.) */
function buildSubsets(heroRows){
  const map = new Map();
  for(const r of heroRows){
    const region = s(pick(r,'Region'));
    const otd    = s(pick(r,'OTD L4'));
    const seg    = s(pick(r,'Segment'));
    const ur     = s(pick(r,'U/R')).toUpperCase();
    const skuGroup = s(pick(r,'SKU Groups'));
    if(!region || !otd || !seg || !ur || !skuGroup) continue;
    const key = [region, otd, seg, ur].join('|');
    if(!map.has(key)) map.set(key,{region,otd,seg,ur,skuGroups:new Set()});
    map.get(key).skuGroups.add(skuGroup);
  }
  return map;
}

function buildProductIndex(productRows){
  const idx = new Map(); // SKU Groups -> [{itemCode,itemName}]
  for(const r of productRows){
    const skuGroup = s(pick(r,'SKU Groups'));
    const itemCode = s(pick(r,'Item Code'));
    const itemName = s(pick(r,'Item Name'));
    if(!skuGroup || !itemCode) continue;
    if(!idx.has(skuGroup)) idx.set(skuGroup, []);
    idx.get(skuGroup).push({itemCode,itemName});
  }
  return idx;
}

/* Area -> Region (ten trong HERO NEW). Lay tu bang NPP (DISTRIBUTOR_AREA va
   NPP nhap tay), Area khong co NPP nao thi tra qua node: node Area bat dau bang
   node Region (VD: VN1NR1A01 thuoc VN1NR1). */
function buildAreaRegionMap(){
  const m = new Map();
  const add = (area, region) => {
    const h = heroRegionOf(region);
    if(area && h && !m.has(area)) m.set(area, h);
  };
  for(const v of Object.values(DISTRIBUTOR_AREA)) add(v[1], v[0]);
  for(const v of Object.values(overrides.distArea)) add(v[1], v[0]);
  const regions = Object.entries(allRegionConfigs());
  for(const [area, node] of Object.entries(AREA_TO_DIST_CODE)){
    if(m.has(area)) continue;
    const hit = regions.find(([, cfg]) => cfg.node && node.startsWith(cfg.node));
    if(hit) m.set(area, hit[0]);
  }
  return m;
}

/* ----- Nguon ton kho 1: Stock Area.xlsx (query truc tiep tu database) -----
   File co cot GroupName = Area. Doi Area sang Region roi cong don ton kha dung.
   Tra ve {index: Map<'Region|ItemCode', ton>, stats} */
function buildStockIndex(stockRows){
  const idx = new Map();
  const areaRegion = buildAreaRegionMap();
  const unknownAreas = new Map();     // Area khong tra duoc ra Region -> so dong
  const regionOfArea = new Map();     // nho ket qua tra cuu, file co the rat nhieu dong
  for(const r of stockRows){
    const area = s(pick(r,'GroupName'));
    const prd  = s(pick(r,'PRD_CD'));
    const avail = n(pick(r,'AVAILABLE_STK'));
    if(!area || !prd) continue;
    if(!regionOfArea.has(area)) regionOfArea.set(area, areaRegion.get(area) || heroRegionOf(area));
    const region = regionOfArea.get(area);
    if(!region){ unknownAreas.set(area, (unknownAreas.get(area)||0) + 1); continue; }
    const key = region+'|'+prd;
    idx.set(key, (idx.get(key)||0) + avail);
  }
  return {index: idx, stats: {unknownAreas: [...unknownAreas.keys()].sort(),
                              unknownAreaRows: [...unknownAreas.values()].reduce((a,b)=>a+b, 0)}};
}

/* ----- Nguon ton kho 2: INVT_MASTER.csv (xuat tu he thong) -----
   File nay chi co ma NPP, khong co Region/Area nen phai tra qua
   DISTRIBUTOR_AREA. Cac buoc loc:
     1. Khu trung lap theo NPP + kho + san pham (file co nhieu dong giong
        het nhau, chi khac Cost Price)
     2. Status Code = 'A'
     3. Chi lay kho trong ALLOWED_WAREHOUSES
     4. Bo NPP nam trong INACTIVE_DISTRIBUTORS (da ngung kinh doanh)
     5. Doi ma NPP sang Region roi cong don ton kha dung cua moi NPP trong Region
   Tra ve {index: Map<'Region|ItemCode', ton>, unknownDistributors, stats} */
function buildStockIndexFromInvt(invtRows){
  const R = INVT_RULES;
  const index = new Map();
  const seen = new Set();
  const unknown = new Map();   // ma NPP chua khai bao Region/Area -> so dong
  const badRegion = new Map(); // ten Region trong bang NPP khong khop Region nao cua HERO NEW
  const areaRegion = buildAreaRegionMap();
  const regionOfDist = new Map();  // 'Region|Area' cua bang NPP -> Region HERO NEW (nho ket qua)
  const stats = {total:invtRows.length, duplicate:0, notActive:0,
                 otherWarehouse:0, inactiveDist:0, unknownDist:0, unknownRegion:0, used:0};

  for(const row of invtRows){
    const dist = s(pick(row, R.distCol));
    const whs  = s(pick(row, R.whsCol));
    const prd  = s(pick(row, R.productCol));
    if(!dist || !prd) continue;

    const key = dist+'|'+whs+'|'+prd;
    if(seen.has(key)){ stats.duplicate++; continue; }
    seen.add(key);

    if(s(pick(row, R.statusCol)) !== R.statusValue){ stats.notActive++; continue; }
    if(!ALLOWED_WAREHOUSES.has(whs)){ stats.otherWarehouse++; continue; }
    if(INACTIVE_DISTRIBUTORS.has(dist) || overrides.inactiveDist[dist]){ stats.inactiveDist++; continue; }

    const mapped = DISTRIBUTOR_AREA[dist] || overrides.distArea[dist];
    if(!mapped){
      unknown.set(dist, (unknown.get(dist)||0) + 1);
      stats.unknownDist++;
      continue;
    }

    // mapped = [Region, Area]. Region cua bang NPP viet khac HERO NEW (VD: DaNang / DN)
    const rk = mapped[0] + '|' + mapped[1];
    if(!regionOfDist.has(rk)) regionOfDist.set(rk, heroRegionOf(mapped[0]) || areaRegion.get(mapped[1]) || null);
    const region = regionOfDist.get(rk);
    if(!region){
      badRegion.set(mapped[0], (badRegion.get(mapped[0])||0) + 1);
      stats.unknownRegion++;
      continue;
    }
    const k = region + '|' + prd;
    index.set(k, (index.get(k)||0) + n(pick(row, R.availCol)));
    stats.used++;
  }
  stats.unknownRegionNames = [...badRegion.keys()].sort();

  return {index, unknownDistributors:[...unknown.keys()].sort(), stats};
}

// Ten NPP, dung de hien thi o buoc bo sung du lieu
function buildDistributorNames(invtRows){
  const names = new Map();
  for(const row of invtRows){
    const c = s(pick(row,'Distributor Code'));
    if(c && !names.has(c)) names.set(c, s(pick(row,'Distributor Name')));
  }
  return names;
}

/**
 * Doc PRODUCT_INFO.csv, tra ve:
 *   valid  - Set Item Code dat du 3 dieu kien
 *            (Status = A, Selling Type = 1, Parent Product Code rong)
 *   newSku - Set Item Code co New SKU Ind = 'Y' (luon giu lai du ton kho = 0)
 */
const STATUS_LABEL = {A:'Active', B:'Blocked / ngừng kinh doanh', I:'Inactive / không hoạt động'};

function buildProductInfoSets(pinfoRows){
  const valid = new Set(), newSku = new Set();
  const reason = new Map();        // Item Code -> ly do bi loai
  const rule = PRODUCT_INFO_RULES;

  for(const r of pinfoRows){
    const code = s(pick(r, rule.codeCol));
    if(!code) continue;
    const status  = s(pick(r, rule.statusCol));
    const selling = s(pick(r, rule.sellingTypeCol));
    const parent  = s(pick(r, rule.parentCol));

    if(status===rule.statusValue && selling===rule.sellingTypeValue && parent===''){
      valid.add(code);
      if(s(pick(r, rule.newSkuCol)) === rule.newSkuValue) newSku.add(code);
      continue;
    }

    // Ghi lai TAT CA dieu kien khong dat, de bao cao noi ro ly do
    const why = [];
    if(status !== rule.statusValue){
      why.push(`Status = ${status || '(trống)'}${STATUS_LABEL[status] ? ' — '+STATUS_LABEL[status] : ''}`);
    }
    if(selling !== rule.sellingTypeValue){
      why.push(`Selling Type = ${selling || '(trống)'} (không phải hàng để bán)`);
    }
    if(parent !== ''){
      why.push(`Là SKU con của ${parent}`);
    }
    reason.set(code, why.join(' · '));
  }
  return {valid, newSku, reason};
}

/* ----- Doc file MSL da upload lan truoc, dung lam moc doi chieu ----- */

// Tach tien to ngay (6 chu so dau) khoi ma MSL
function splitMslCode(code){
  const m = /^(\d{6})(.+)$/.exec(code);
  return m ? {prefix:m[1], rest:m[2]} : {prefix:'', rest:code};
}

/**
 * Tu MSL_INFO.csv cua lan upload truoc, lay ra thong tin dot dang chay.
 * Tra ve {prefix, startDate, endDate, codes:Map<code, totalCu>, rows:Map<code, dong INFO>}
 */
function buildBaselineInfo(rows){
  const codes = new Map();
  const infoRows = new Map();      // ma -> dong INFO; file gop tay co the lap ma, dong sau ghi de
  const prefixes = new Map();
  const datesByPrefix = new Map();  // tien to -> ngay hieu luc, de file lan ma dot cu khong lay nham ngay
  for(const r of rows){
    const code = s(pick(r,'Must Sell List Code'));
    if(!code) continue;
    codes.set(code, parseInt(s(pick(r,'Total Number of SKU')),10) || 0);
    infoRows.set(code, r);
    const p = splitMslCode(code).prefix;
    if(p) prefixes.set(p, (prefixes.get(p)||0)+1);
    const d = datesByPrefix.get(p) || {start:'', end:''};
    if(!d.start) d.start = s(pick(r,'Start Date'));
    if(!d.end)   d.end   = s(pick(r,'End Date'));
    datesByPrefix.set(p, d);
  }
  // tien to pho bien nhat = tien to cua dot dang chay
  let prefix = '', best = -1;
  for(const [p,c] of prefixes){ if(c > best){ best = c; prefix = p; } }
  const d = datesByPrefix.get(prefix) || {start:'', end:''};
  return {prefix, startDate: d.start, endDate: d.end, codes, rows: infoRows};
}

/* Ma U tren DMS PROD la 1 / 2 / 3; file tu UAT ghi 01 / 02 / 03.
   Bo so 0 dau de hai cach ghi deu doi chieu duoc. */
function normalizeUrCode(v){
  const t = s(v);
  return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t;
}

/**
 * Tu MSL_CUSTASSIGN.CSV cua lan upload truoc, doc ra moi ma MSL dang ap cho
 * nhung Region / Kenh / Phan khuc / U/R nao. Ma da gop co nhieu gia tri o mot chieu.
 *   cap 4 kenh (cap 3 'TTON'+kenh cua ban cu) -> Kenh;  cap R -> Phan khuc;
 *   cap U ma U -> tra nguoc UR_TYPES ra U/R;  cap G node Region -> tra nguoc REGIONS
 * Tra ve Map<MSL Code, {regions, otds, segs, urs, unknownG, unknownU}> (moi truong la Set)
 */
function buildBaselineCust(rows){
  const regionByNode = new Map();
  for(const [hero, cfg] of Object.entries(allRegionConfigs())){
    if(cfg.node && !regionByNode.has(cfg.node)) regionByNode.set(cfg.node, hero);
  }
  const urByCode = new Map();
  for(const [ur, cfg] of Object.entries(allUrConfigs())){
    const c = normalizeUrCode(cfg.code);
    if(c && !urByCode.has(c)) urByCode.set(c, ur);
  }

  const map = new Map();
  for(const r of rows){
    const code  = s(pick(r,'Must Sell List Code'));
    const level = s(pick(r,'Customer Hierarchy Level')).toUpperCase();
    const val   = s(pick(r,'Assignment Code'));
    if(!code || !val) continue;
    if(!map.has(code)) map.set(code, {regions:new Set(), otds:new Set(), segs:new Set(), urs:new Set(),
                                      unknownG:new Set(), unknownU:new Set()});
    const e = map.get(code);
    if(level === '4') e.otds.add(val);
    else if(level === '3') e.otds.add(val.replace(/^TTON/, ''));
    else if(level === 'R') e.segs.add(val);
    else if(level === 'U'){
      const u = urByCode.get(normalizeUrCode(val));
      if(u) e.urs.add(u); else e.unknownU.add(val);
    }
    else if(level === 'G'){
      const g = regionByNode.get(val);
      if(g) e.regions.add(g); else e.unknownG.add(val);
    }
  }
  return map;
}

/**
 * Tu MSL_PRDASSIGN.csv cua lan upload truoc, lay ra danh sach SKU dang co.
 * Tra ve Map<MSL Code, Set<Item Code>>
 */
function buildBaselinePrd(rows){
  const map = new Map();
  for(const r of rows){
    const code = s(pick(r,'Must Sell List Code'));
    const item = s(pick(r,'Prodcat Code'));
    if(!code || !item) continue;
    if(!map.has(code)) map.set(code, new Set());
    map.get(code).add(item);
  }
  return map;
}

/* Region / gia tri U/R co trong HERO NEW nhung chua co cau hinh */
function detectGaps(subsets){
  const regions = new Set(), urs = new Set();
  for(const sub of subsets.values()){ regions.add(sub.region); urs.add(sub.ur); }
  return {
    missingRegions: [...regions].filter(r => !resolveRegion(r)).sort(),
    missingUrs: [...urs].filter(u => !resolveUr(u)).sort()
  };
}

function detectMissingSkuGroups(subsets, productIndex){
  const missing = new Set();
  for(const sub of subsets.values()){
    for(const g of sub.skuGroups){
      if(!productIndex.has(g) && !overrides.itemCodes[g]) missing.add(g);
    }
  }
  return [...missing].sort();
}
