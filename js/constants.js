'use strict';
/* =========================================================================
   constants.js
   Bang tra cuu nghiep vu, rut ra tu du lieu DMS mau (MSL_*.csv) va cac
   quy tac loc do nguoi dung cung cap. Khong phu thuoc file nao khac.
   ========================================================================= */

const AREA_TO_DIST_CODE = {
  DNC01:'VN1DNUA01', DNC02:'VN1DNUA02', DNC03:'VN1DNUA03', DNC04:'VN1DNUA04',
  DNC05:'VN1DNUA05', DNC06:'VN1DNUA06', DNC07:'VN1DNUA07',
  HCMC1:'VN1HMCA01', HCMC2:'VN1HMCA02', HCMC3:'VN1HMCA03', HCMC4:'VN1HMCA04',
  HCMC5:'VN1HMCA05', HCMC6:'VN1HMCA06',
  HCMP1:'VN1HMPA01', HCMP2:'VN1HMPA02', HCMP4:'VN1HMPA04', HCMP5:'VN1HMPA05',
  HCMP6:'VN1HMPA06', HCMP7:'VN1HMPA07', HCMP8:'VN1HMPA08',
  HNC01:'VN1NR1A01', HNC02:'VN1NR1A02', HNC03:'VN1NR1A03', HNC04:'VN1NR1A04', HNC05:'VN1NR1A05',
  HNP08:'VN1NR1A07', HNP09:'VN1NR1A08', HNP10:'VN1NR1A09',
  HPC:'VN1NR2A15',
  MK1:'VN1MKUA01', MK2:'VN1MKUA02', MK3:'VN1MKUA03', MK4:'VN1MKUA04', MK5:'VN1MKUA05',
  MK6:'VN1MKUA06', MK7:'VN1MKUA07', MK8:'VN1MKUA08', MK9:'VN1MKUA09',
  NE05:'VN1NR2A12', NE06:'VN1NR2A13', NE07:'VN1NR2A14',
  RR01:'VN1NR2A08', RR02:'VN1NR2A09', RR03:'VN1NR2A10', RR04:'VN1NR2A11'
};
// Ghi chu: HCMC7 va HCMP3 chua co trong du lieu mau -> se hien o buoc "Bo sung du lieu".

/* Moi loai cua hang chi dung MOT cap trong MSL_CUSTASSIGN:
     '3' -> dong cap 3, Assignment Code = 'TTON' + ma kenh  (da bao gom cap 4)
     '4' -> dong cap 4, Assignment Code = chinh ma kenh
   Hai cap loai tru nhau, khong bao gio sinh ca hai cho cung mot kenh. */
const OTD_LEVEL = {
  CF:'3', CT:'3', GT:'3', NH:'3', QA:'3', SAC:'3', SPO:'3', VCH:'3',

  CHTL:'4', ITN:'4', KHAC:'4', KS:'4', MM:'4', NT:'4', QSR:'4', QVD:'4',
  TH:'4', VM:'4', WSC1:'4', WSC2:'4', WSDEPO:'4', WSMIX:'4', WSSTH:'4',

  // "WS" khong co trong du lieu DMS mau, nguoi dung chot dung cap 4.
  WS:'4'
};

const UOM_EXCEPTIONS = {
  '10000566':{uom:'RCS',minQty:2}, '10000751':{uom:'RCS',minQty:2}, '10000753':{uom:'RCS',minQty:2},
  '10000752':{uom:'RCS',minQty:2}, '10000056':{uom:'RCS',minQty:2}, '10000073':{uom:'RCS',minQty:2},
  '10000701':{uom:'RCS',minQty:2}, '10000832':{uom:'RCS',minQty:2}, '10000877':{uom:'RCS',minQty:2},
  '10000823':{uom:'RCS',minQty:2}, '10000865':{uom:'RCS',minQty:2}, '10000802':{uom:'RCS',minQty:2},
  '10000212':{uom:'RCS',minQty:2}, '10000831':{uom:'RCS',minQty:2}
};

const G_ROW_DIST_CODE = 'SPVB';
const HQ = 'HQ';

// Gioi han do dai truong tren DMS - vuot qua se bi tu choi khi upload.
// Ma chua gop da cham dung tran 20 (VD: 260605DNC01_WSDEPO_C), nen ma gop
// phai duoc rut gon hoac dat tay.
const MAX_CODE_LEN = 20;
const MAX_DESC_LEN = 50;

// Dieu kien loc PRODUCT_INFO.csv (theo yeu cau nghiep vu):
//  - Status of the Product = 'A' (Active)
//  - Selling Type = '1' (hang de ban - loai bo thiet bi, POSM, dung cu)
//  - Parent Product Code (SKU) = rong (khong phai SKU con)
// Rieng "New SKU Ind" = 'Y' (SKU moi ra mat) thi LUON duoc giu lai,
// ke ca khi ton kho = 0, vi hang chua kip ve NPP.
const PRODUCT_INFO_RULES = {
  statusCol:'Status of the Product', statusValue:'A',
  sellingTypeCol:'Selling Type', sellingTypeValue:'1',
  parentCol:'Parent Product Code (SKU)',
  codeCol:'Product Code',
  newSkuCol:'New SKU Ind', newSkuValue:'Y'
};

// Dieu kien loc INVT_MASTER.csv (nguon ton kho thay the Stock Area.xlsx):
//  - Status Code = 'A' (Active)
//  - Warehouse Code nam trong ALLOWED_WAREHOUSES
//  - Distributor Code khong nam trong INACTIVE_DISTRIBUTORS
//  - Khu trung lap (file co nhieu dong giong het nhau, chi khac Cost Price)
const INVT_RULES = {
  distCol:'Distributor Code', whsCol:'Warehouse Code', productCol:'Product Code',
  statusCol:'Status Code', statusValue:'A', availCol:'Stock Available'
};

const REQUIRED_COLS = {
  hero: ['Area','OutletTypeDetail','Segment','SKU Groups'],
  product: ['Item Code','SKU Groups'],
  stock: ['GroupName','PRD_CD','AVAILABLE_STK'],
  invt: ['Distributor Code','Warehouse Code','Product Code','Status Code','Stock Available'],
  pinfo: ['Product Code','Status of the Product','Selling Type','Parent Product Code (SKU)','New SKU Ind'],
  baseInfo: ['Must Sell List Code','Start Date','End Date','Total Number of SKU'],
  baseCust: ['Must Sell List Code','Customer Hierarchy Level','Assignment Code'],
  basePrd: ['Must Sell List Code','Prodcat Code']
};

/* --- File xuat o che do TAO MOI dau thang --- */
const OUTPUT_SPECS = [
  {file:'MSL_INFO.csv', key:'infoRows', headers:['Distributor Code','Must Sell List Code','Must Sell List Description','Start Date','End Date','Operation Type','Min Quantity Condition','Total Number of SKU']},
  {file:'MSL_CONDITION.csv', key:'condRows', headers:['Distributor Code','MSL Code','Assignment Type','Condition Type','Sequence']},
  {file:'MSL_CUSTASSIGN.CSV', key:'custRows', headers:['Distributor Code','Must Sell List Code','Assignment Type','Customer Hierarchy Level','Assignment Code']},
  {file:'MSL_PRDASSIGN.csv', key:'prdRows', headers:['Distributor Code','Must Sell List Code','Prodcat Level','Prodcat Code','UOM Code','Minimum Quantity']}
];

/* --- File xuat o che do CAP NHAT giua thang ---
   DMS cong don khi upload lai, nen:
   - CONDITION / CUSTASSIGN chi duoc chua DANH SACH MOI PHAT SINH,
     neu upload lai cho danh sach dang chay se bi nhan doi dong.
   - PRDASSIGN chi chua SKU CAN THEM.
   - INFO chua ca danh sach moi lan danh sach cu co Total thay doi. --- */
const UPDATE_OUTPUT_SPECS = [
  {file:'MSL_INFO_UPDATE.csv', key:'infoRows', headers:OUTPUT_SPECS[0].headers,
   note:'Danh sách mới phát sinh + danh sách đang chạy có Total thay đổi'},
  {file:'MSL_CONDITION_NEW.csv', key:'condRows', headers:OUTPUT_SPECS[1].headers,
   note:'CHỈ danh sách mới phát sinh — không upload cho danh sách đang chạy'},
  {file:'MSL_CUSTASSIGN_NEW.CSV', key:'custRows', headers:OUTPUT_SPECS[2].headers,
   note:'CHỈ danh sách mới phát sinh — không upload cho danh sách đang chạy'},
  {file:'MSL_PRDASSIGN_ADD.csv', key:'prdRows', headers:OUTPUT_SPECS[3].headers,
   note:'Chỉ các SKU cần bổ sung thêm'}
];

/* --- Bo file moc sau lan cap nhat: file moc cu + phan bo sung ---
   KHONG upload len DMS, chi dung lam file moc cho lan cap nhat sau. --- */
const BASELINE_OUTPUT_SPECS = [
  {file:'MOC_MSL_INFO.csv', key:'infoRows', headers:OUTPUT_SPECS[0].headers},
  {file:'MOC_MSL_CUSTASSIGN.CSV', key:'custRows', headers:OUTPUT_SPECS[2].headers},
  {file:'MOC_MSL_PRDASSIGN.csv', key:'prdRows', headers:OUTPUT_SPECS[3].headers}
];

const LS_KEY = 'dms_msl_tool_overrides_v1';
