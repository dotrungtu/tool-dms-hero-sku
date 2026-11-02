'use strict';
/* =========================================================================
   constants.js  (ban Region x U/R)
   Bang tra cuu nghiep vu. Ban nay danh cho template HERO NEW moi:
     - Khong con cot Area, danh sach chia theo Region x OTD L4 x Segment x U/R
     - Dong cap G trong MSL_CUSTASSIGN lay node cua Region (VD: VN1NR1)
     - Them cap gan U (Urban/Rural/Highland), MSL_CONDITION co 3 dong H/R/U
   Mau tham chieu: 260211_N1_CHTL_A_HL
     CONDITION : H seq 1, R seq 2, U seq 3
     CUSTASSIGN: 4 CHTL | R A | U 03 | SPVB MSL_DIST G VN1NR1
   ========================================================================= */

/* Region trong HERO NEW (cot "Region") ->
     abbr        : viet tat dung trong ma MSL (VD: 260211_N1_CHTL_A_HL)
     node        : node cap NPP cua Region tren DMS (dong G trong CUSTASSIGN)
     stockRegion : ten Region trong bang NPP (DISTRIBUTOR_AREA) / Stock Area,
                   dung de cong ton kho theo Region
   Node lay theo phan dau chung cua node cac Area thuoc Region (VD: Area HNC01 =
   VN1NR1A01 -> Region North 1 = VN1NR1). North 1 = VN1NR1 khop file mau. */
const REGIONS = {
  'North 1': {abbr:'N1', node:'VN1NR1', stockRegion:'North 1'},
  'North 2': {abbr:'N2', node:'VN1NR2', stockRegion:'North 2'},
  'DN':      {abbr:'DN', node:'VN1DNU', stockRegion:'DaNang'},
  'HCMC':    {abbr:'HC', node:'VN1HMC', stockRegion:'HCMC'},
  'HCMP':    {abbr:'HP', node:'VN1HMP', stockRegion:'HCMP'},
  'MK':      {abbr:'MK', node:'VN1MKU', stockRegion:'Mekong'}
};

/* Gia tri cot "U/R" trong HERO NEW ->
     abbr : viet tat dung trong ma MSL
     code : Assignment Code cua dong cap U trong CUSTASSIGN
   HIGHLAND = HL / 03 lay tu file mau. Viet tat UB / RR da duoc nguoi dung xac nhan. */
const UR_TYPES = {
  'URBAN':    {abbr:'UB', code:'01'},
  'RURAL':    {abbr:'RR', code:'02'},
  'HIGHLAND': {abbr:'HL', code:'03'}
};

/* Cac gia tri cau hinh o tren CHUA duoc nguoi dung xac nhan.
   Cong cu hien canh bao o Buoc 2 va Buoc 4 cho toi khi danh sach nay rong.
   Khi da chot: sua gia tri trong REGIONS / UR_TYPES roi xoa dong tuong ung. */
const UNCONFIRMED_CONFIG = [
  'Mã U của URBAN (01) và RURAL (02) — mới biết chắc HIGHLAND = 03',
  'Viết tắt Region trong mã: North 2 = N2, DN = DN, HCMC = HC, HCMP = HP, MK = MK — mới biết chắc North 1 = N1'
];

/* Area -> node NPP cap Area. Ban nay khong gan theo Area nua, chi dung bang
   nay de tra Area cua file Stock Area.xlsx ra Region khi Area khong co trong
   bang NPP (DISTRIBUTOR_AREA). */
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

/* Kenh: HERO NEW chia danh sach theo OTD L4, nen moi danh sach gan dung mot
   dong cap 4 voi Assignment Code = ma OTD L4 (giong dong CHTL trong file mau).
   Khong dung cap 3 ('TTON' + ma) nhu ban cu, vi cap 3 se ap cho moi OTD L4
   cung nhom va trung voi danh sach cua cac OTD L4 khac. */
const CHANNEL_LEVEL = '4';

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
// Ma day du dang 260211_N1_CHTL_A_HL (19 ky tu). Kenh dai (VD: WSDEPO) se vuot
// 20 -> cong cu bo dau gach sau ngay: 260211N1_WSDEPO_A_HL.
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
  hero: ['Region','OTD L4','Segment','U/R','SKU Groups'],
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

// Dung chung khoa voi ban theo Area: NPP moi, Item Code nhap tay... nhap o ban
// nao cung dung duoc o ban kia. Ban nay them 2 truong rieng: regions, urTypes.
const LS_KEY = 'dms_msl_tool_overrides_v1';
