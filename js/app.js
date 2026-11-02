'use strict';
/* =========================================================================
   app.js
   Diem khoi dong: gan su kien cho cac nut, dieu phoi luong 5 buoc
   cho ca hai che do (tao moi dau thang / cap nhat giua thang).
   ========================================================================= */

/* ----- Buoc 1: nap file ----- */

async function handleFile(kind, file, zone){
  setZoneStatus(zone, 'Đang đọc file...', null);
  try{
    const rows = await readDataFile(file);
    const errs = validateCols(rows, REQUIRED_COLS[kind]);
    if(errs.length){
      setZoneStatus(zone, '✖ File không đúng định dạng: ' + errs.join(', '), 'error');
      state[kind+'Rows'] = null;
      updateUploadState();
      return;
    }
    state[kind+'Rows'] = rows;
    state.files[kind] = file.name;
    let msg = `✓ ${file.name} — ${rows.length.toLocaleString('vi-VN')} dòng`;
    if(rows.__skippedLines && rows.__skippedLines.length){
      msg += ` (bỏ qua ${rows.__skippedLines.length} dòng lỗi định dạng)`;
    }
    setZoneStatus(zone, msg, 'ok');
    updateUploadState();
  }catch(err){
    setZoneStatus(zone, '✖ Lỗi đọc file: ' + err.message, 'error');
    state[kind+'Rows'] = null;
    updateUploadState();
  }
}

function updateUploadState(){
  const base = state.heroRows && state.productRows && state.pinfoRows
            && (state.invtRows || state.stockRows);      // mot trong hai nguon ton kho
  const ready = state.mode === 'update'
    ? base && state.baseInfoRows && state.baseCustRows && state.basePrdRows
    : base;
  const btn = document.getElementById('btn-to-params');
  if(btn) btn.disabled = !ready;
}

/* ----- Buoc 2: thiet lap ----- */

function initParamsScreen(){
  if(state.mode === 'update'){
    const info = buildBaselineInfo(state.baseInfoRows);
    const prd  = buildBaselinePrd(state.basePrdRows);
    const cust = buildBaselineCust(state.baseCustRows);
    // Ma gop = ma ap cho nhieu hon mot to hop Area x Kenh x Phan khuc
    const merged = [...cust.values()].filter(c => c.areas.size * c.otds.size * c.segs.size > 1).length;
    const badG = [...cust].filter(([,c]) => c.unknownG.size).map(([code]) => code);
    const el = setHtml('upd-detected', info.prefix
      ? `Đã nhận diện đợt đang chạy: <b><code>${escapeHtml(info.prefix)}</code></b> &nbsp;|&nbsp;
         Hiệu lực <b>${escapeHtml(info.startDate)}</b> → <b>${escapeHtml(info.endDate)}</b> &nbsp;|&nbsp;
         <b>${prd.size.toLocaleString('vi-VN')}</b> danh sách với
         <b>${state.basePrdRows.length.toLocaleString('vi-VN')}</b> dòng SKU đang có trên DMS.
         ${merged ? `<br>Trong đó <b>${merged.toLocaleString('vi-VN')}</b> mã gộp (một mã áp cho nhiều tổ hợp Area × Kênh × Phân khúc)
           — SKU mới sẽ được đưa vào đúng mã gộp, không tạo lại danh sách lẻ.` : ''}
         ${badG.length ? `<br><b>Lưu ý:</b> ${badG.length} mã có dòng cấp G mang mã NPP không tra được ra Area
           (VD: <code>${escapeHtml(badG[0])}</code>) — công cụ không biết các mã này áp cho Area nào,
           tổ hợp của chúng có thể bị coi là danh sách mới.` : ''}`
      : '<b>Không đọc được mã đợt</b> từ file MSL_INFO.csv. Kiểm tra lại xem có đúng file đã upload lần trước không.');
    if(el) el.className = 'hint ' + (!info.prefix ? 'err' : (badG.length ? 'warn' : 'ok'));
    return;
  }

  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth()+2, 0);
  setValue('inp-prefix', todayPrefix());
  setValue('inp-start',  localIsoDate(today));
  setValue('inp-end',    localIsoDate(end));
}

function goFromParamsToGaps(){
  if(state.mode === 'create'){
    state.datePrefix = getValue('inp-prefix').trim();
    state.startDate  = getValue('inp-start');
    state.endDate    = getValue('inp-end');
    const modeEl = document.querySelector('input[name="stock-mode"]:checked');
    state.stockMode = modeEl ? modeEl.value : 'onlyInStock';

    if(!/^\d{6}$/.test(state.datePrefix)){
      alert('Tiền tố ngày phải là 6 chữ số (VD: 260801).'); return;
    }
    if(!state.startDate || !state.endDate){
      alert('Vui lòng chọn Ngày bắt đầu và Ngày kết thúc.'); return;
    }
    if(state.endDate < state.startDate){
      alert('Ngày kết thúc phải sau Ngày bắt đầu.'); return;
    }
  } else {
    const info = buildBaselineInfo(state.baseInfoRows);
    if(!info.prefix){
      alert('Không đọc được mã đợt từ file MSL_INFO.csv đã upload lần trước.'); return;
    }
    state.datePrefix = info.prefix;
    state.startDate  = info.startDate;
    state.endDate    = info.endDate;
    state.stockMode  = 'onlyInStock';
  }

  state.subsets = buildSubsets(state.heroRows);
  const gaps = detectGaps(state.subsets);
  state.missingAreas = gaps.missingAreas;
  state.missingOtd = gaps.missingOtd;
  state.missingSkuGroups = detectMissingSkuGroups(state.subsets, buildProductIndex(state.productRows));

  // Doc ton kho de phat hien NPP moi chua khai bao Region/Area
  currentStockIndex();

  const hasGaps = state.missingAreas.length || state.missingOtd.length
               || state.missingSkuGroups.length || state.unknownDistributors.length;
  const gapPill = document.getElementById('step-gaps');

  if(hasGaps){
    if(gapPill) gapPill.classList.remove('hidden-step');
    renderGapsScreen();
    showStep('gaps');
  } else {
    if(gapPill) gapPill.classList.add('hidden-step');
    runGenerateAndShowReport();
  }
}

/* ----- Buoc 4: sinh du lieu + bao cao ----- */

function runGenerateAndShowReport(){
  if(state.mode === 'update'){
    state.result = generateUpdate();
    renderUpdateReport();
  } else {
    state.result = generate();
    renderReport();
  }
  showStep('report');
}

/* Kiem tra ma sau gop co bi trung nhau hoac trung ma dang co khong */
function findDuplicateNames(names, picks){
  const groups = state.result.report.merge.groups;
  const used = new Map();
  for(const i of picks){
    const code = names[i] || groups[i].mergedCode;
    if(used.has(code)) return code;
    used.set(code, i);
  }
  // Trung voi ma cua danh sach khong duoc gop
  const mergedSources = new Set();
  picks.forEach(i => groups[i].codes.forEach(c => mergedSources.add(c)));
  for(const [code] of used){
    if(state.targetLists.has(code) && !mergedSources.has(code)) return code;
  }
  return null;
}

function goBackFromReport(){
  const pill = document.getElementById('step-gaps');
  showStep(!pill || pill.classList.contains('hidden-step') ? 'params' : 'gaps');
}

/**
 * Gan su kien cho mot phan tu theo id. Neu phan tu khong ton tai thi bo qua
 * thay vi bao loi — nho vay xoa bot nut trong index.html khong lam chet ung dung.
 */
function on(id, event, handler){
  const el = document.getElementById(id);
  if(el) el.addEventListener(event, handler);
}

function scrollToId(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({block:'center'});
}

/* ----- Khoi dong ----- */

document.addEventListener('DOMContentLoaded', () => {
  setupDropzone('zone-hero',     'file-hero',     (f,z) => handleFile('hero',f,z));
  setupDropzone('zone-product',  'file-product',  (f,z) => handleFile('product',f,z));
  setupDropzone('zone-stock',    'file-stock',    (f,z) => handleFile('stock',f,z));
  setupDropzone('zone-invt',     'file-invt',     (f,z) => handleFile('invt',f,z));
  setupDropzone('zone-pinfo',    'file-pinfo',    (f,z) => handleFile('pinfo',f,z));
  setupDropzone('zone-baseinfo', 'file-baseinfo', (f,z) => handleFile('baseInfo',f,z));
  setupDropzone('zone-basecust', 'file-basecust', (f,z) => handleFile('baseCust',f,z));
  setupDropzone('zone-baseprd',  'file-baseprd',  (f,z) => handleFile('basePrd',f,z));

  document.querySelectorAll('input[name="run-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.mode = radio.value;
      applyMode();
      updateUploadState();
    });
  });

  on('btn-to-params', 'click', () => {
    previewTable('preview-hero',    state.heroRows,    5);
    previewTable('preview-product', state.productRows, 5);
    previewTable('preview-stock',   state.invtRows || state.stockRows, 5);
    previewTable('preview-pinfo',   state.pinfoRows,   5);
    initParamsScreen();
    showStep('params');
  });

  on('btn-params-back', 'click', () => showStep('upload'));
  on('btn-params-next', 'click', goFromParamsToGaps);

  on('btn-gaps-back', 'click', () => showStep('params'));
  on('btn-gaps-next', 'click', () => {
    collectGapInputs();
    runGenerateAndShowReport();
  });

  on('btn-report-back',   'click', goBackFromReport);
  on('btn-report-back-2', 'click', goBackFromReport);
  on('btn-report-next',   'click', () => showStep('download'));
  on('btn-report-next-2', 'click', () => showStep('download'));

  /* ----- O so lieu bam duoc: mo va cuon toi danh sach tuong ung ----- */
  document.querySelectorAll('[data-jump]').forEach(tile => {
    tile.addEventListener('click', () => {
      const sec = document.getElementById(tile.dataset.jump);
      if(!sec) return;
      sec.open = true;
      sec.scrollIntoView({behavior:'smooth', block:'start'});
      sec.classList.add('flash');
      setTimeout(() => sec.classList.remove('flash'), 1200);
    });
  });

  /* ----- Nut tai rieng tung danh sach chi tiet ----- */
  document.querySelectorAll('[data-export]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      exportDetail(btn.dataset.export, state.result);
    });
  });

  /* ----- Gop ma MSL ----- */
  on('btn-merge-safe',     'click', () => selectMergeGroups(g => g.kind === 'segment'));
  on('btn-merge-samearea', 'click', () => selectMergeGroups(g => g.areas.length === 1));
  on('btn-merge-all',      'click', () => selectMergeGroups(() => true));
  on('btn-merge-none',     'click', () => selectMergeGroups(() => false));

  on('btn-apply-merge', 'click', () => {
    const {picks, names, descs} = getMergeSelection();
    if(!picks.length) return;

    const groups = state.result.report.merge.groups;
    const tooLong = picks.filter(i => (names[i] || groups[i].mergedCode).length > MAX_CODE_LEN
                                   || (descs[i] || groups[i].mergedDescription).length > MAX_DESC_LEN);
    if(tooLong.length){
      alert(`${tooLong.length} nhóm có mã hoặc mô tả vượt giới hạn DMS `
          + `(mã tối đa ${MAX_CODE_LEN}, mô tả tối đa ${MAX_DESC_LEN} ký tự). Vui lòng rút ngắn trước khi gộp.`);
      return;
    }

    const dupe = findDuplicateNames(names, picks);
    if(dupe){ alert('Mã sau gộp bị trùng nhau: ' + dupe + '\nVui lòng đặt tên khác.'); return; }

    const total = picks.reduce((s,i) => s + groups[i].savings, 0);
    if(!confirm(`Gộp ${picks.length} nhóm, bớt ${total} mã MSL?\n\nThao tác này áp dụng vào cả 4 file. Bạn có thể hoàn tác sau.`)) return;

    state.result = applyMerges(picks, names, descs);
    renderReport();
    scrollToId('detail-merge');
  });

  on('btn-undo-merge', 'click', () => {
    state.result = generate();
    renderReport();
    scrollToId('detail-merge');
  });

  on('btn-dl-report', 'click', () => downloadCsv('BAO_CAO_DOI_CHIEU.csv',   buildReportCsv(state.result)));
  on('btn-dl-area',   'click', () => downloadCsv('THONG_KE_THEO_AREA.csv',  buildAreaCsv(state.result)));
  on('btn-dl-merge',  'click', () => downloadCsv('DE_XUAT_GOP_MA.csv',      buildMergeCsv(state.result)));
  on('btn-dl-change', 'click', () => downloadCsv('NHAT_KY_THAY_DOI.csv',    buildChangeCsv(state.result)));
  on('btn-dl-gone',   'click', () => downloadCsv('SKU_HET_HANG.csv',        buildOutOfStockCsv(state.result)));
  on('btn-dl-baseline', 'click', () => downloadBaselineFiles(state.result));
  on('btn-dl-all',    'click', () => downloadAllOutputs(state.result));

  on('btn-restart', 'click', () => {
    if(confirm('Bắt đầu lại từ đầu? Các file đã tải lên sẽ bị xoá (thông tin bổ sung vẫn được lưu).')){
      location.reload();
    }
  });

  applyMode();
  updateUploadState();
});
