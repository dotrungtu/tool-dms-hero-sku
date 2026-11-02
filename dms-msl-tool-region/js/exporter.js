'use strict';
/* =========================================================================
   exporter.js  (ban Region x U/R)
   Chuyen bang du lieu thanh CSV dung chuan DMS va tai ve may.
   ========================================================================= */

function escapeCsvValue(v){
  const str = (v===null || v===undefined) ? '' : String(v);
  return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g,'""') + '"' : str;
}

function toCsv(rows, headers){
  const lines = [headers.map(escapeCsvValue).join(',')];
  for(const r of rows) lines.push(headers.map(h => escapeCsvValue(r[h])).join(','));
  return lines.join('\r\n');
}

function downloadCsv(filename, csvText){
  const blob = new Blob(['﻿' + csvText], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadAllOutputs(result){
  const jobs = activeOutputSpecs()
    .filter(spec => result[spec.key].length)     // khong tai file rong
    .map(spec => [spec.file, result[spec.key], spec.headers]);
  // Che do cap nhat: tai kem bo file moc, de khong quen luu cho lan sau
  if(result.baseline){
    BASELINE_OUTPUT_SPECS.forEach(spec => jobs.push([spec.file, result.baseline[spec.key], spec.headers]));
  }
  jobs.forEach(([file, rows, headers], i) => {
    setTimeout(() => downloadCsv(file, toCsv(rows, headers)), i * 350);
  });
}

function downloadBaselineFiles(result){
  if(!result || !result.baseline) return;
  BASELINE_OUTPUT_SPECS.forEach((spec, i) => {
    setTimeout(() => downloadCsv(spec.file, toCsv(result.baseline[spec.key], spec.headers)), i * 350);
  });
}

/* =========================================================================
   Bao cao doi chieu de gui lai Biz Team.
   Gom nhom theo san pham thay vi liet ke lai o tung danh sach MSL, nen
   file ngan gon va doc duoc. Cot "So danh sach bi anh huong" cho biet
   muc do tac dong.
   ========================================================================= */

function groupCount(items, keyFn, buildRow){
  const map = new Map();
  for(const it of items){
    const k = keyFn(it);
    if(!map.has(k)) map.set(k, {row: buildRow(it), count: 0});
    map.get(k).count++;
  }
  return [...map.values()].map(v => Object.assign(v.row, {'Số danh sách bị ảnh hưởng': v.count}));
}

const REPORT_HEADERS = ['Loại','Region','Item Code','Tên hàng / SKU Group','Tồn khả dụng','Số danh sách bị ảnh hưởng','MSL Code'];

/* ----- Bao cao rieng cho che do CAP NHAT giua thang ----- */
const CHANGE_HEADERS = ['Loại thay đổi','MSL Code','Region','Kênh','Phân khúc','U/R','Số SKU cũ','Số SKU thêm','Tổng SKU mới','Item Code được thêm','Ghi chú'];

function buildChangeCsv(result){
  const rep = result.report;
  const rows = [];

  rep.newLists.forEach(r => rows.push({
    'Loại thay đổi':'Danh sách mới (upload đủ 4 file)',
    'MSL Code':r.mslCode,'Region':r.region,'Kênh':r.otd,'Phân khúc':r.seg,'U/R':r.ur,
    'Số SKU cũ':0,'Số SKU thêm':r.skuCount,'Tổng SKU mới':r.skuCount,'Item Code được thêm':'',
    'Ghi chú':r.note
  }));

  rep.grownLists.forEach(r => rows.push({
    'Loại thay đổi':'Danh sách đang chạy, thêm SKU',
    'MSL Code':r.mslCode,'Region':r.region,'Kênh':r.otd,'Phân khúc':r.seg,'U/R':r.ur,
    'Số SKU cũ':r.oldTotal,'Số SKU thêm':r.addedCount,'Tổng SKU mới':r.newTotal,
    'Item Code được thêm':r.addedItems,'Ghi chú':r.note
  }));

  rep.manual.forEach(r => rows.push({
    'Loại thay đổi':'Xử lý tay',
    'MSL Code':r.mslCode,'Region':r.region,'Kênh':r.otd,'Phân khúc':r.seg,'U/R':r.ur,
    'Số SKU cũ':'','Số SKU thêm':'','Tổng SKU mới':'',
    'Item Code được thêm':r.addedItems,'Ghi chú':r.reason
  }));

  return toCsv(rows, CHANGE_HEADERS);
}

/* ----- Danh sach SKU dang trong DMS nhung nay da het hang (khong xoa duoc) ----- */
function buildOutOfStockCsv(result){
  const rows = groupCount(result.report.goneOutOfStock, r => r.region+'|'+r.itemCode, r => ({
    'Region':r.region,'Item Code':r.itemCode,'Tồn khả dụng':r.avail
  })).sort((a,b) => a.Region.localeCompare(b.Region));
  return toCsv(rows, ['Region','Item Code','Tồn khả dụng','Số danh sách bị ảnh hưởng']);
}

/* =========================================================================
   Xuat rieng tung danh sach chi tiet trong bao cao.
   Moi danh sach deu co cot "Lý do" noi ro vi sao SKU nam trong danh sach do.
   ========================================================================= */

const DIM_HEADERS = ['Region','Kênh','Phân khúc','U/R'];
const dimCols = r => ({'Region':r.region,'Kênh':r.otd,'Phân khúc':r.seg,'U/R':r.ur});

const DETAIL_EXPORTS = {
  alllists: {
    file: 'DANH_SACH_MSL.csv',
    headers: ['MSL Code', ...DIM_HEADERS, 'Số SKU'],
    rows: rep => rep.allLists.map(r => Object.assign({'MSL Code':r.mslCode}, dimCols(r), {'Số SKU':r.skuCount}))
  },
  skusummary: {
    file: 'TONG_HOP_SKU.csv',
    headers: ['Item Code','Tên hàng','Số danh sách chứa SKU','Số Region'],
    rows: rep => rep.skuSummary.map(r => ({
      'Item Code':r.itemCode,'Tên hàng':r.itemName,
      'Số danh sách chứa SKU':r.lists,'Số Region':r.regionCount}))
  },
  nostock: {
    file: 'SKU_TON_KHO_0.csv',
    headers: ['MSL Code', ...DIM_HEADERS, 'Item Code','Tên hàng','Tồn khả dụng (cả Region)','Kết quả','Lý do'],
    rows: rep => rep.noStock.map(r => Object.assign({'MSL Code':r.mslCode}, dimCols(r), {
      'Item Code':r.itemCode,'Tên hàng':r.itemName,'Tồn khả dụng (cả Region)':r.avail,
      'Kết quả': r.isNewSku ? 'Giữ (SKU mới)'
                : (rep.stockMode === 'includeAll' && r.hasStockRow
                    ? 'Giữ (tồn = 0)'
                    : 'Loại'),
      'Lý do':r.reason}))
  },
  newsku: {
    file: 'SKU_MOI_GIU_LAI.csv',
    headers: ['MSL Code', ...DIM_HEADERS, 'Item Code','Tên hàng','Lý do'],
    rows: rep => rep.keptByNewSku.map(r => Object.assign({'MSL Code':r.mslCode}, dimCols(r), {
      'Item Code':r.itemCode,'Tên hàng':r.itemName,'Lý do':r.reason}))
  },
  filtered: {
    file: 'SKU_LOAI_THEO_PRODUCT_INFO.csv',
    headers: ['MSL Code', ...DIM_HEADERS, 'Item Code','Tên hàng','Lý do bị loại'],
    rows: rep => rep.filteredOut.map(r => Object.assign({'MSL Code':r.mslCode}, dimCols(r), {
      'Item Code':r.itemCode,'Tên hàng':r.itemName,'Lý do bị loại':r.reason}))
  },
  missitem: {
    file: 'SKU_GROUP_THIEU_ITEM_CODE.csv',
    headers: [...DIM_HEADERS, 'SKU Group','Lý do'],
    rows: rep => rep.missingItemReport.map(r => Object.assign(dimCols(r), {'SKU Group':r.skuGroup,'Lý do':r.reason}))
  },
  empty: {
    file: 'DANH_SACH_BI_BO_QUA.csv',
    headers: ['MSL Code', ...DIM_HEADERS, 'Tổng SKU','Loại theo PRODUCT_INFO','Loại vì hết tồn','Lý do'],
    rows: rep => rep.emptySubsets.map(r => Object.assign({'MSL Code':r.mslCode}, dimCols(r), {
      'Tổng SKU':r.candidates,'Loại theo PRODUCT_INFO':r.cutByPinfo,
      'Loại vì hết tồn':r.cutByStock,'Lý do':r.reason}))
  },
  byregion: {
    file: 'THONG_KE_THEO_REGION.csv',
    headers: ['Region','Có dữ liệu tồn kho','Số danh sách','Dòng SKU','TB SKU/danh sách','SKU hết tồn kho',
              'Giữ nhờ SKU mới','SKU loại theo PRODUCT_INFO','Danh sách bị bỏ','Tỉ lệ SKU còn hàng (%)'],
    rows: rep => rep.byRegion.map(r => ({
      'Region':r.region,'Có dữ liệu tồn kho':r.hasStockData ? 'Có' : 'KHÔNG',
      'Số danh sách':r.lists,'Dòng SKU':r.skuRows,'TB SKU/danh sách':r.avgSkuPerList,
      'SKU hết tồn kho':r.noStock,'Giữ nhờ SKU mới':r.newSkuKept,
      'SKU loại theo PRODUCT_INFO':r.filtered,'Danh sách bị bỏ':r.emptyLists,
      'Tỉ lệ SKU còn hàng (%)':r.inStockRate}))
  }
};

function exportDetail(key, result){
  const spec = DETAIL_EXPORTS[key];
  if(!spec) return;
  downloadCsv(spec.file, toCsv(spec.rows(result.report), spec.headers));
}

/* ----- De xuat gop ma MSL trung danh sach SKU ----- */
function buildMergeCsv(result){
  const rows = [];
  result.report.merge.groups.forEach((g, i) => {
    g.codes.forEach((code, j) => rows.push({
      'Nhóm': i+1,
      'Kiểu gộp': g.kindLabel,
      'MSL Code': code,
      'Vai trò': j === 0 ? 'Mã đại diện' : 'Gộp vào mã đại diện',
      'Số SKU chung': g.skuCount,
      'Số mã trong nhóm': g.codes.length,
      'Region trong nhóm': g.regions.join(' | '),
      'Kênh trong nhóm': g.otds.join(' | '),
      'Phân khúc trong nhóm': g.segs.join(' | '),
      'U/R trong nhóm': g.urs.join(' | ')
    }));
  });
  return toCsv(rows, ['Nhóm','Kiểu gộp','MSL Code','Vai trò','Số SKU chung','Số mã trong nhóm',
                      'Region trong nhóm','Kênh trong nhóm','Phân khúc trong nhóm','U/R trong nhóm']);
}

/* ----- Thong ke theo Region (dung chung dinh nghia voi DETAIL_EXPORTS) ----- */
function buildRegionCsv(result){
  const spec = DETAIL_EXPORTS.byregion;
  return toCsv(spec.rows(result.report), spec.headers);
}

function buildReportCsv(result){
  const rep = result.report;
  const rows = [];

  // 1. SKU bi loai boi PRODUCT_INFO - ly do thuoc ve san pham, khong phu thuoc Region
  groupCount(rep.filteredOut, r => r.itemCode, r => ({
    'Loại':'Loại theo PRODUCT_INFO',
    'Region':'(tất cả)', 'Item Code':r.itemCode, 'Tên hàng / SKU Group':r.itemName,
    'Tồn khả dụng':'', 'MSL Code':''
  })).sort((a,b)=>b['Số danh sách bị ảnh hưởng']-a['Số danh sách bị ảnh hưởng'])
    .forEach(r => rows.push(r));

  // 2. SKU ton kho = 0. SKU moi luon duoc giu lai nen tach rieng nhan.
  const labelFor = r => {
    if(r.isNewSku) return 'Tồn = 0, giữ vì SKU mới';
    if(rep.stockMode === 'includeAll'){
      return r.hasStockRow ? 'Tồn = 0, giữ theo lựa chọn'
                           : 'Loại, không có tồn kho ở Region';
    }
    return 'Loại vì hết tồn';
  };
  groupCount(rep.noStock, r => r.region+'|'+r.itemCode, r => ({
    'Loại': labelFor(r),
    'Region':r.region, 'Item Code':r.itemCode,
    'Tên hàng / SKU Group':r.itemName, 'Tồn khả dụng':r.avail, 'MSL Code':''
  })).sort((a,b)=> a.Region.localeCompare(b.Region) || b['Số danh sách bị ảnh hưởng']-a['Số danh sách bị ảnh hưởng'])
    .forEach(r => rows.push(r));

  // 3. SKU Group khong tra ra Item Code
  groupCount(rep.missingItemReport, r => r.skuGroup, r => ({
    'Loại':'SKU Group không có Item Code', 'Region':'(tất cả)', 'Item Code':'',
    'Tên hàng / SKU Group':r.skuGroup, 'Tồn khả dụng':'', 'MSL Code':''
  })).sort((a,b)=>b['Số danh sách bị ảnh hưởng']-a['Số danh sách bị ảnh hưởng'])
    .forEach(r => rows.push(r));

  // 4. Danh sach MSL bi bo qua hoan toan - liet ke tung dong
  rep.emptySubsets.forEach(r => rows.push({
    'Loại':'Danh sách bị bỏ (không còn SKU)', 'Region':r.region, 'Item Code':'',
    'Tên hàng / SKU Group':`${r.otd} / ${r.seg} / ${r.ur}`, 'Tồn khả dụng':'',
    'Số danh sách bị ảnh hưởng':1, 'MSL Code':r.mslCode
  }));

  return toCsv(rows, REPORT_HEADERS);
}
