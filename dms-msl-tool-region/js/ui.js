'use strict';
/* =========================================================================
   ui.js  (ban Region x U/R)
   Cac ham dung giao dien: dieu huong buoc, vung keo-tha file, bang xem truoc,
   man hinh bo sung du lieu thieu va man hinh bao cao.
   ========================================================================= */

const STEPS = ['upload','params','gaps','report','download'];

/* -------------------------------------------------------------------------
   Cac ham ghi ra giao dien deu BO QUA khi phan tu khong ton tai.
   Nho vay xoa bot phan hien thi trong index.html se khong lam gay ung dung.
   ------------------------------------------------------------------------- */
function setHtml(id, html){
  const el = document.getElementById(id);
  if(el) el.innerHTML = html;
  return el;
}
function setText(id, text){
  const el = document.getElementById(id);
  if(el) el.textContent = text;
  return el;
}
function show(id, visible){
  const el = document.getElementById(id);
  if(el) el.style.display = visible ? '' : 'none';
  return el;
}
function setValue(id, value){
  const el = document.getElementById(id);
  if(el) el.value = value;
  return el;
}
function getValue(id, fallback){
  const el = document.getElementById(id);
  return el ? el.value : (fallback !== undefined ? fallback : '');
}

function showStep(id){
  document.querySelectorAll('.screen').forEach(el =>
    el.classList.toggle('active', el.id === 'screen-'+id));
  document.querySelectorAll('.step-pill').forEach(el => {
    const st = el.dataset.step;
    el.classList.toggle('active', st === id);
    el.classList.toggle('done', STEPS.indexOf(st) < STEPS.indexOf(id));
  });
  window.scrollTo({top:0, behavior:'smooth'});
}

function setupDropzone(zoneId, inputId, onFile){
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if(!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if(e.dataTransfer.files.length) onFile(e.dataTransfer.files[0], zone);
  });
  input.addEventListener('change', e => {
    if(e.target.files.length) onFile(e.target.files[0], zone);
  });
}

function setZoneStatus(zone, text, kind){
  if(!zone) return;
  zone.classList.remove('filled','error');
  if(kind === 'ok') zone.classList.add('filled');
  if(kind === 'error') zone.classList.add('error');
  const st = zone.querySelector('.status');
  if(st) st.textContent = text;
}

function previewTable(containerId, rows, maxRows){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!rows || !rows.length){ el.innerHTML = '<p class="muted">Chưa có dữ liệu.</p>'; return; }
  const cols = Object.keys(rows[0]).slice(0, 12);
  let html = '<div class="table-scroll"><table><thead><tr>' +
             cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
  rows.slice(0, maxRows).forEach(r => {
    html += '<tr>' + cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table></div>';
  if(Object.keys(rows[0]).length > cols.length){
    html += `<p class="muted">(Chỉ hiển thị ${cols.length} cột đầu trong tổng số ${Object.keys(rows[0]).length} cột)</p>`;
  }
  el.innerHTML = html;
}

function escapeHtml(v){
  if(v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function tableHtml(rows, cols, labels){
  let html = '<div class="table-scroll"><table><thead><tr>' +
             cols.map(c => `<th>${escapeHtml(labels[c] || c)}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>' + cols.map(c => `<td>${escapeHtml(row[c])}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function renderLimitedTable(containerId, rows, cols, labels, emptyMsg, limit){
  const el = document.getElementById(containerId);
  if(!el) return;
  rows = rows || [];
  if(!rows.length){ el.innerHTML = `<p class="muted">${escapeHtml(emptyMsg)}</p>`; return; }
  el.innerHTML = tableHtml(rows.slice(0, limit), cols, labels);
  if(rows.length > limit){
    el.innerHTML += `<p class="muted">... và ${(rows.length-limit).toLocaleString('vi-VN')} dòng khác (chỉ hiển thị ${limit} dòng đầu — tải file báo cáo để xem đầy đủ).</p>`;
  }
}

/* ----- Man hinh 3: bo sung du lieu thieu ----- */

function renderGapsScreen(){
  show('sec-regions', state.missingRegions.length > 0);
  show('sec-urs',     state.missingUrs.length > 0);
  show('sec-otd',     state.missingOtd.length > 0);
  show('sec-sku',     state.missingSkuGroups.length > 0);

  setHtml('gap-regions', state.missingRegions.map(g => {
    const ov = overrides.regions[g] || {};
    return `
    <div class="gap-row gap-row-dist">
      <span class="tag">${escapeHtml(g)}</span>
      <input type="text" placeholder="Viết tắt trong mã (VD: N1)" data-region-abbr="${escapeHtml(g)}" value="${escapeHtml(ov.abbr||'')}">
      <input type="text" placeholder="Node G của Region (VD: VN1NR1)" data-region-node="${escapeHtml(g)}" value="${escapeHtml(ov.node||'')}">
      <input type="text" placeholder="Tên Region trong bảng NPP (VD: Mekong)" data-region-stock="${escapeHtml(g)}" value="${escapeHtml(ov.stockRegion||'')}">
      <label class="chk"><input type="checkbox" data-skip-region="${escapeHtml(g)}"> Bỏ qua Region này</label>
    </div>`;
  }).join(''));

  setHtml('gap-urs', state.missingUrs.map(u => {
    const ov = overrides.urTypes[u] || {};
    return `
    <div class="gap-row">
      <span class="tag">${escapeHtml(u)}</span>
      <input type="text" placeholder="Viết tắt trong mã (VD: HL)" data-ur-abbr="${escapeHtml(u)}" value="${escapeHtml(ov.abbr||'')}">
      <input type="text" placeholder="Mã cấp U trong CUSTASSIGN (VD: 3)" data-ur-code="${escapeHtml(u)}" value="${escapeHtml(ov.code||'')}">
      <label class="chk"><input type="checkbox" data-skip-ur="${escapeHtml(u)}"> Bỏ qua giá trị này</label>
    </div>`;
  }).join(''));

  setHtml('gap-otd', state.missingOtd.map(o => `
    <div class="gap-row">
      <span class="tag">${escapeHtml(o)}</span>
      <div>
        <label class="chk"><input type="radio" name="otd-lv-${escapeHtml(o)}" data-otd-level="${escapeHtml(o)}" value="3"> Cấp 3 — <code>TTON${escapeHtml(o)}</code></label>
        <label class="chk"><input type="radio" name="otd-lv-${escapeHtml(o)}" data-otd-level="${escapeHtml(o)}" value="4" checked> Cấp 4 — <code>${escapeHtml(o)}</code></label>
      </div>
      <span class="muted" style="font-size:11.5px">Không chắc? Giữ cấp 4.</span>
    </div>`).join(''));

  setHtml('gap-sku', state.missingSkuGroups.map(g => `
    <div class="gap-row">
      <span class="tag">${escapeHtml(g)}</span>
      <input type="text" placeholder="Nhập Item Code (nhiều mã cách nhau bởi dấu phẩy)" data-sku="${escapeHtml(g)}" value="${escapeHtml(overrides.itemCodes[g]||'')}">
      <label class="chk"><input type="checkbox" data-skip-sku="${escapeHtml(g)}"> Bỏ qua SKU Group này</label>
    </div>`).join(''));

  show('sec-dist', state.unknownDistributors.length > 0);
  const names = state.invtRows ? buildDistributorNames(state.invtRows) : new Map();
  setHtml('gap-dist', state.unknownDistributors.map(d => `
    <div class="gap-row gap-row-dist">
      <span class="tag">${escapeHtml(d)}</span>
      <span class="muted">${escapeHtml(names.get(d) || '')}</span>
      <input type="text" placeholder="Region (VD: MK hoặc Mekong)" data-dist-region="${escapeHtml(d)}"
             value="${escapeHtml((overrides.distArea[d]||[])[0] || '')}">
      <input type="text" placeholder="Area (không bắt buộc, VD: MK8)" data-dist-area="${escapeHtml(d)}"
             value="${escapeHtml((overrides.distArea[d]||[])[1] || '')}">
      <label class="chk"><input type="checkbox" data-dist-inactive="${escapeHtml(d)}"> Đã ngưng kinh doanh</label>
    </div>`).join(''));
}

function collectGapInputs(){
  const val = sel => { const el = document.querySelector(sel); return el ? el.value.trim() : ''; };
  const checked = sel => { const el = document.querySelector(sel); return !!(el && el.checked); };

  // Region moi: can du viet tat va node G thi moi luu; bo qua -> to hop cua Region bi loai
  state.missingRegions.forEach(g => {
    const k = CSS.escape(g);
    if(checked(`[data-skip-region="${k}"]`)) return;
    const abbr = val(`[data-region-abbr="${k}"]`), node = val(`[data-region-node="${k}"]`);
    if(abbr && node) overrides.regions[g] = {abbr, node, stockRegion: val(`[data-region-stock="${k}"]`) || g};
  });
  // Gia tri U/R moi: can du viet tat va ma U
  state.missingUrs.forEach(u => {
    const k = CSS.escape(u);
    if(checked(`[data-skip-ur="${k}"]`)) return;
    const abbr = val(`[data-ur-abbr="${k}"]`), code = val(`[data-ur-code="${k}"]`);
    if(abbr && code) overrides.urTypes[u] = {abbr, code};
  });
  state.missingOtd.forEach(o => {
    const picked = document.querySelector(`[data-otd-level="${CSS.escape(o)}"]:checked`);
    overrides.otd[o] = picked ? picked.value : '4';
  });
  document.querySelectorAll('[data-sku]').forEach(inp => {
    const g = inp.dataset.sku;
    const skip = document.querySelector(`[data-skip-sku="${CSS.escape(g)}"]`);
    if(skip && skip.checked) return;
    if(inp.value.trim()) overrides.itemCodes[g] = inp.value.trim();
  });

  // Nha phan phoi moi trong INVT_MASTER: ban nay chi can Region, Area khong bat buoc
  state.unknownDistributors.forEach(d => {
    const off = document.querySelector(`[data-dist-inactive="${CSS.escape(d)}"]`);
    if(off && off.checked){ overrides.inactiveDist[d] = true; return; }
    const region = document.querySelector(`[data-dist-region="${CSS.escape(d)}"]`);
    const area   = document.querySelector(`[data-dist-area="${CSS.escape(d)}"]`);
    const rv = region ? region.value.trim() : '';
    const av = area ? area.value.trim() : '';
    if(rv) overrides.distArea[d] = [rv, av || '(chưa rõ)'];
  });

  saveOverrides();
}

/* ----- Man hinh 4: bao cao ----- */

function renderReport(){
  const r = state.result, rep = r.report;

  setText('sum-mslcount', rep.keptSubsets.toLocaleString('vi-VN'));
  setText('sum-skucount', r.prdRows.length.toLocaleString('vi-VN'));
  setText('sum-newsku',   rep.keptByNewSku.length.toLocaleString('vi-VN'));
  setText('sum-filtered', rep.filteredOut.length.toLocaleString('vi-VN'));
  setText('sum-nostock',  rep.noStock.length.toLocaleString('vi-VN'));
  setText('sum-empty',    rep.emptySubsets.length.toLocaleString('vi-VN'));

  let modeHtml;
  if(rep.stockMode === 'includeAll'){
    const kept = rep.noStock.filter(x => x.hasStockRow && !x.isNewSku).length;
    modeHtml = `<b>Chế độ tồn kho: Giữ lại cả SKU tồn kho = 0.</b>
      ${kept.toLocaleString('vi-VN')} dòng có tồn khả dụng = 0 nhưng NPP vẫn kinh doanh mặt hàng đó nên
      <b>được giữ lại</b>. Riêng ${rep.noStockRowCut.toLocaleString('vi-VN')} dòng
      <b>không có dòng tồn kho nào</b> ở cả Region (không NPP nào kinh doanh mặt hàng đó) thì <b>vẫn bị loại</b>.`;
  } else {
    modeHtml = `<b>Chế độ tồn kho: Chỉ lấy SKU còn hàng.</b>
      ${rep.noStock.length.toLocaleString('vi-VN')} SKU có tồn kho = 0 <b>đã bị loại</b> khỏi file kết quả.`;
  }
  const modeBanner = setHtml('report-mode-banner', modeHtml);
  if(modeBanner) modeBanner.className = 'hint ' + (rep.stockMode === 'includeAll' ? 'warn' : 'ok');

  setHtml('report-stock-source', stockSourceHtml());

  setHtml('report-pinfo-note',
    `Đã áp dụng bộ lọc <b>PRODUCT_INFO.csv</b>: ${rep.validProductCount.toLocaleString('vi-VN')} mã sản phẩm hợp lệ
     (Status = A, Selling Type = 1, Parent Product Code trống), trong đó
     <b>${rep.newSkuCount.toLocaleString('vi-VN')}</b> mã là SKU mới (New SKU Ind = Y) — luôn được giữ lại kể cả khi tồn kho = 0.`);

  const L = {region:'Region',otd:'Kênh',seg:'Phân khúc',ur:'U/R',mslCode:'MSL Code',itemCode:'Item Code',
             itemName:'Tên hàng',avail:'Tồn khả dụng (cả Region)',reason:'Lý do',skuCount:'Số SKU',
             skuGroup:'SKU Group',lists:'Số danh sách',regionCount:'Số Region',
             candidates:'Tổng SKU',cutByPinfo:'Loại theo PRODUCT_INFO',cutByStock:'Loại vì hết tồn'};
  const D = ['region','otd','seg','ur'];

  renderLimitedTable('detail-alllists', rep.allLists,
    ['mslCode', ...D, 'skuCount'], L,
    'Không có danh sách nào.', 300);

  renderLimitedTable('detail-skusummary', rep.skuSummary,
    ['itemCode','itemName','lists','regionCount'], L,
    'Không có SKU nào.', 300);

  renderLimitedTable('detail-nostock', rep.noStock,
    ['mslCode', ...D, 'itemCode','itemName','avail','reason'], L,
    'Không có SKU nào hết tồn kho.', 300);

  renderLimitedTable('detail-newsku', rep.keptByNewSku,
    ['mslCode', ...D, 'itemCode','itemName','reason'], L,
    'Không có SKU mới nào cần giữ lại.', 300);

  renderLimitedTable('detail-filtered', rep.filteredOut,
    ['mslCode', ...D, 'itemCode','itemName','reason'], L,
    'Không có SKU nào bị loại bởi bộ lọc PRODUCT_INFO.', 300);

  renderLimitedTable('detail-missitem', rep.missingItemReport,
    [...D, 'skuGroup','reason'], L,
    'Tất cả SKU Groups đều tìm được Item Code.', 300);

  renderLimitedTable('detail-empty', rep.emptySubsets,
    ['mslCode', ...D, 'candidates','cutByPinfo','cutByStock','reason'], L,
    'Không có danh sách nào bị bỏ qua.', 300);

  if(rep.sizeStats){
    setHtml('size-stats',
      `Mỗi danh sách chứa từ <b>${rep.sizeStats.min}</b> đến <b>${rep.sizeStats.max}</b> SKU
       — trung vị <b>${rep.sizeStats.median}</b>, trung bình <b>${rep.sizeStats.avg}</b>.`);
  }
  renderRegionTable('detail-byregion', rep.byRegion);
  renderMergeSuggestions('detail-merge', rep.merge);
  renderMergeAppliedBanner();
  renderLengthCheck();
  setCount('cnt-alllists',   rep.allLists.length);
  setCount('cnt-skusummary', rep.skuSummary.length);
  setCount('cnt-nostock',    rep.noStock.length);
  setCount('cnt-newsku',     rep.keptByNewSku.length);
  setCount('cnt-filtered',   rep.filteredOut.length);
  setCount('cnt-missitem',   rep.missingItemReport.length);
  setCount('cnt-empty',      rep.emptySubsets.length);
  setCount('cnt-byregion',   rep.byRegion.length);
  setCount('cnt-merge',      rep.merge.totalGroups);

  renderDownloadCards(r);
}

/* Mo ta nguon ton kho dang dung (INVT_MASTER hoac Stock Area) */
function stockSourceHtml(){
  if(state.invtStats && stockSource() === 'invt'){
    const st = state.invtStats;
    let html = `<b>Nguồn tồn kho: INVT_MASTER.csv</b> — ${st.total.toLocaleString('vi-VN')} dòng gốc →
       bỏ ${st.duplicate.toLocaleString('vi-VN')} dòng trùng,
       ${st.notActive.toLocaleString('vi-VN')} dòng Status ≠ A,
       ${st.otherWarehouse.toLocaleString('vi-VN')} dòng kho không tính,
       ${st.inactiveDist.toLocaleString('vi-VN')} dòng của NPP đã ngưng kinh doanh →
       còn <b>${st.used.toLocaleString('vi-VN')}</b> dòng được dùng.`;
    if(st.unknownRegion){
      html += ` Bỏ ${st.unknownRegion.toLocaleString('vi-VN')} dòng của NPP có Region không khớp HERO NEW
        (${(st.unknownRegionNames||[]).map(escapeHtml).join(', ')}).`;
    }
    return html;
  }
  const st = state.stockAreaStats || {unknownAreas:[], unknownAreaRows:0};
  let html = '<b>Nguồn tồn kho: Stock Area.xlsx</b> — file query trực tiếp từ database.';
  if(st.unknownAreas.length){
    html += ` Bỏ ${st.unknownAreaRows.toLocaleString('vi-VN')} dòng có Area không tra được ra Region
      (${st.unknownAreas.slice(0,10).map(escapeHtml).join(', ')}${st.unknownAreas.length > 10 ? '…' : ''}).`;
  }
  return html;
}

function setCount(id, n){
  const el = document.getElementById(id);
  if(el) el.textContent = n.toLocaleString('vi-VN');
}

/* ----- Kiem tra do dai truong tren toan bo file sap xuat ----- */
function renderLengthCheck(){
  const rows = state.result.infoRows;
  const badCode = rows.filter(r => String(r['Must Sell List Code']).length > MAX_CODE_LEN);
  const badDesc = rows.filter(r => String(r['Must Sell List Description']).length > MAX_DESC_LEN);
  const clashes = state.result.report.codeCollisions || [];

  let cls, html;
  if(clashes.length){
    cls = 'hint err';
    html = `<b>Trùng mã MSL!</b> ${clashes.length} tổ hợp sinh ra mã đã dùng cho tổ hợp khác
      (VD: <code>${escapeHtml(clashes[0].mslCode)}</code>) nên đã bị bỏ qua — kiểm tra lại viết tắt Region / U/R.`;
  } else if(!badCode.length && !badDesc.length){
    const maxC = Math.max(0, ...rows.map(r => String(r['Must Sell List Code']).length));
    const maxD = Math.max(0, ...rows.map(r => String(r['Must Sell List Description']).length));
    cls = 'hint ok';
    html = `<b>Độ dài trường hợp lệ.</b> Mã dài nhất ${maxC}/${MAX_CODE_LEN} ký tự,
      mô tả dài nhất ${maxD}/${MAX_DESC_LEN} ký tự — nằm trong giới hạn DMS.`;
  } else {
    cls = 'hint err';
    html = `<b>Vượt giới hạn DMS!</b>
      ${badCode.length ? `${badCode.length} mã dài quá ${MAX_CODE_LEN} ký tự (VD: <code>${escapeHtml(badCode[0]['Must Sell List Code'])}</code>). ` : ''}
      ${badDesc.length ? `${badDesc.length} mô tả dài quá ${MAX_DESC_LEN} ký tự. ` : ''}
      Upload sẽ bị từ chối — hãy sửa trước khi tải file.`;
  }
  const el = setHtml('length-check', html);
  if(el) el.className = cls;
}

function renderMergeAppliedBanner(){
  const applied = state.result.report.mergeApplied;
  if(!applied || !applied.groupCount){ show('merge-applied-banner', false); return; }
  show('merge-applied-banner', true);
  setHtml('merge-applied-banner',
    `<b>Đã gộp ${applied.groupCount.toLocaleString('vi-VN')} nhóm mã MSL.</b>
     Bớt được ${applied.codesSaved.toLocaleString('vi-VN')} mã và
     ${applied.prdRowsSaved.toLocaleString('vi-VN')} dòng PRDASSIGN.
     Các mã gộp đã được áp dụng vào cả 4 file — <code>MSL_CUSTASSIGN</code> nhận đủ Kênh, Phân khúc, U/R và Region của cả nhóm.`);
}

/* ----- Bang thong ke theo Region, kem thanh ty le con hang ----- */
function renderRegionTable(containerId, rows){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!rows || !rows.length){ el.innerHTML = '<p class="muted">Không có dữ liệu.</p>'; return; }

  const barClass = p => p >= 60 ? 'high' : (p >= 30 ? 'mid' : 'low');
  let html = `<div class="table-scroll"><table><thead><tr>
      <th>Region</th><th>Danh sách</th><th>Dòng SKU</th><th>TB SKU/danh sách</th>
      <th>SKU hết tồn</th><th>Giữ nhờ SKU mới</th><th>Danh sách bị bỏ</th>
      <th style="min-width:150px">Tỉ lệ SKU còn hàng</th></tr></thead><tbody>`;
  rows.forEach(r => {
    html += `<tr>
      <td><b>${escapeHtml(r.region)}</b>${r.hasStockData ? '' : ' <span class="badge red">thiếu tồn kho</span>'}</td>
      <td class="num">${r.lists.toLocaleString('vi-VN')}</td>
      <td class="num">${r.skuRows.toLocaleString('vi-VN')}</td>
      <td class="num">${r.avgSkuPerList}</td>
      <td class="num">${r.noStock.toLocaleString('vi-VN')}</td>
      <td class="num">${r.newSkuKept.toLocaleString('vi-VN')}</td>
      <td class="num">${r.emptyLists ? `<span class="badge amber">${r.emptyLists}</span>` : '0'}</td>
      <td><div style="display:flex;align-items:center;gap:9px">
            <div class="bar ${barClass(r.inStockRate)}" style="flex:1"><span style="width:${r.inStockRate}%"></span></div>
            <span style="font-variant-numeric:tabular-nums;min-width:34px;text-align:right">${r.inStockRate}%</span>
          </div></td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  const noData = rows.filter(r => !r.hasStockData);
  if(noData.length){
    html += `<div class="hint err" style="margin-top:12px"><b>Thiếu dữ liệu tồn kho:</b>
      ${noData.length} Region có trong HERO NEW nhưng <b>không có một dòng nào</b> trong file ${escapeHtml(stockSourceName())}
      (${noData.map(r => escapeHtml(r.region)).join(', ')}).
      Toàn bộ SKU của các Region này bị coi như hết hàng — kiểm tra lại file tồn kho, hoặc tên Region trong bảng NPP.</div>`;
  }

  const lowButHasData = rows.filter(r => r.hasStockData && r.inStockRate < 20);
  if(lowButHasData.length){
    html += `<div class="hint warn" style="margin-top:12px"><b>Tỉ lệ còn hàng thấp:</b>
      ${lowButHasData.map(r => escapeHtml(r.region)+' ('+r.inStockRate+'%)').join(', ')}.
      Có dữ liệu tồn kho nhưng phần lớn SKU đang hết hàng — nên rà lại trước khi chốt.</div>`;
  }
  el.innerHTML = html;
}

/* ----- Chon nhom ma MSL de gop ----- */

const MERGE_BADGE = {ur:'green', segment:'green', channel:'blue', region:'blue', 'region-inner':'amber', mixed:'red'};

function lenBadge(len, max){
  return `<span class="badge ${len > max ? 'red' : 'green'}">${len}/${max}</span>`;
}

function renderMergeSuggestions(containerId, merge){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!merge || !merge.groups.length){
    el.innerHTML = '<p class="muted">Không có mã MSL nào trùng danh sách SKU — không cần gộp.</p>';
    show('merge-actions', false);
    return;
  }
  show('merge-actions', true);

  const fits = merge.groups.filter(g => g.fitsCodeLimit && g.fitsDescLimit);
  const over = merge.groups.length - fits.length;
  const fitSavings = fits.reduce((s,g) => s+g.savings, 0);

  let html = `<div class="hint"><b>Phát hiện ${merge.totalGroups.toLocaleString('vi-VN')} nhóm</b> gồm
    ${merge.totalCodes.toLocaleString('vi-VN')} mã MSL có danh sách SKU <b>trùng khít tuyệt đối</b>
    — không thừa, không thiếu một mã hàng nào. Chỉ những nhóm như vậy mới được đề xuất gộp.</div>`;

  html += `<div class="hint ${over ? 'warn' : 'ok'}">
    <b>${fits.length}/${merge.groups.length} nhóm</b> gộp được ngay (bớt ${fitSavings.toLocaleString('vi-VN')} mã).
    ${over ? `<b>${over} nhóm</b> còn lại có mã tự sinh vượt trần <b>${MAX_CODE_LEN} ký tự</b> của DMS —
      cần bạn tự đặt tên ngắn hơn thì mới chọn được.` : ''}</div>`;

  html += '<div id="merge-list">';
  merge.groups.forEach((g, i) => {
    const blocked = !g.fitsCodeLimit || !g.fitsDescLimit;
    html += `<div class="merge-group${blocked ? ' is-blocked' : ''}" data-mg="${i}">
      <div class="mg-head">
        <label class="chk" style="display:inline-flex;align-items:center;gap:7px;font-weight:600">
          <input type="checkbox" data-merge-pick="${i}"${blocked ? ' disabled' : ''}> Gộp nhóm này
        </label>
        <span class="badge ${MERGE_BADGE[g.kind]||'blue'}">${escapeHtml(g.kindLabel)}</span>
        <span class="muted">${g.codes.length} mã · ${g.skuCount} SKU chung · bớt ${g.savings} mã,
          ${g.prdRowsSaved.toLocaleString('vi-VN')} dòng PRDASSIGN ·
          CUSTASSIGN ${g.custRowsBefore} → ${g.custRowsAfter} dòng</span>
      </div>

      <div class="mg-field">
        <span class="muted">Mã sau gộp</span>
        <input type="text" class="merge-name" data-merge-name="${i}" value="${escapeHtml(g.mergedCode)}">
        <span data-len="${i}">${lenBadge(g.mergedCodeLength, MAX_CODE_LEN)}</span>
      </div>
      <div class="mg-field">
        <span class="muted">Mô tả</span>
        <input type="text" class="merge-desc" data-merge-desc="${i}" value="${escapeHtml(g.mergedDescription)}">
        <span data-dlen="${i}">${lenBadge(g.mergedDescription.length, MAX_DESC_LEN)}</span>
      </div>

      <div class="mg-codes">${g.codes.slice(0,14).map(c => `<span>${escapeHtml(c)}</span>`).join('')}
        ${g.codes.length>14 ? `<span class="muted">+${g.codes.length-14} mã khác</span>` : ''}</div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('[data-merge-pick]').forEach(cb =>
    cb.addEventListener('change', updateMergeSummary));

  const wire = (sel, attr, badgeAttr, max) => {
    el.querySelectorAll(sel).forEach(inp => inp.addEventListener('input', () => {
      const i = inp.dataset[attr];
      el.querySelector(`[${badgeAttr}="${i}"]`).innerHTML = lenBadge(inp.value.trim().length, max);
      const row = el.querySelector(`.merge-group[data-mg="${i}"]`);
      const codeOk = row.querySelector('.merge-name').value.trim().length <= MAX_CODE_LEN;
      const descOk = row.querySelector('.merge-desc').value.trim().length <= MAX_DESC_LEN;
      const cb = row.querySelector('[data-merge-pick]');
      const ok = codeOk && descOk && row.querySelector('.merge-name').value.trim().length > 0;
      cb.disabled = !ok;
      if(!ok) cb.checked = false;
      row.classList.toggle('is-blocked', !ok);
      updateMergeSummary();
    }));
  };
  wire('.merge-name', 'mergeName', 'data-len',  MAX_CODE_LEN);
  wire('.merge-desc', 'mergeDesc', 'data-dlen', MAX_DESC_LEN);

  updateMergeSummary();
}

function getMergeSelection(){
  const picks = [...document.querySelectorAll('[data-merge-pick]:checked')].map(cb => parseInt(cb.dataset.mergePick,10));
  const names = {}, descs = {};
  picks.forEach(i => {
    const n = document.querySelector(`[data-merge-name="${i}"]`);
    const d = document.querySelector(`[data-merge-desc="${i}"]`);
    if(n && n.value.trim()) names[i] = n.value.trim();
    if(d && d.value.trim()) descs[i] = d.value.trim();
  });
  return {picks, names, descs};
}

function updateMergeSummary(){
  const groups = state.result.report.merge.groups;
  const {picks} = getMergeSelection();
  const savedCodes = picks.reduce((s,i) => s + groups[i].savings, 0);
  const savedPrd   = picks.reduce((s,i) => s + groups[i].prdRowsSaved, 0);

  setHtml('merge-summary', picks.length
    ? `Đã chọn <b>${picks.length}</b> nhóm — sẽ bớt <b>${savedCodes.toLocaleString('vi-VN')}</b> mã MSL
       và <b>${savedPrd.toLocaleString('vi-VN')}</b> dòng PRDASSIGN.`
    : 'Chưa chọn nhóm nào. Bỏ qua bước này nếu bạn muốn giữ nguyên toàn bộ mã MSL.');

  const applyBtn = document.getElementById('btn-apply-merge');
  if(applyBtn) applyBtn.disabled = !picks.length;

  const applied = state.result.report.mergeApplied;
  show('btn-undo-merge', !!(applied && applied.groupCount));
}

function selectMergeGroups(filterFn){
  const groups = state.result.report.merge.groups;
  document.querySelectorAll('[data-merge-pick]').forEach(cb => {
    if(cb.disabled){ cb.checked = false; return; }        // nhom vuot tran khong the chon
    cb.checked = filterFn(groups[parseInt(cb.dataset.mergePick,10)]);
  });
  updateMergeSummary();
}

function renderDownloadCards(result){
  const specs = activeOutputSpecs();
  const grid = document.getElementById('dl-grid');
  if(!grid) return;
  grid.innerHTML = specs.map(spec => {
    const count = result[spec.key].length;
    const empty = count === 0;
    return `
    <div class="dl-card${empty ? ' is-empty' : ''}">
      <div class="fname">${escapeHtml(spec.file)}</div>
      <div class="cnt">${count.toLocaleString('vi-VN')} dòng dữ liệu${empty ? ' — không cần upload' : ''}</div>
      ${spec.note ? `<div class="note">${escapeHtml(spec.note)}</div>` : ''}
      <button class="btn secondary" data-dl="${escapeHtml(spec.key)}"${empty ? ' disabled' : ''}>Tải file này</button>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-dl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const spec = specs.find(sp => sp.key === btn.dataset.dl);
      downloadCsv(spec.file, toCsv(result[spec.key], spec.headers));
    });
  });
}

/* ----- Hien/an cac phan giao dien theo che do dang chon ----- */
function applyMode(){
  const isUpdate = state.mode === 'update';
  document.querySelectorAll('[data-only-mode]').forEach(el => {
    el.style.display = (el.dataset.onlyMode === state.mode) ? '' : 'none';
  });
  setText('params-title', isUpdate
    ? 'Bước 2 — Xác nhận thông tin đợt đang chạy'
    : 'Bước 2 — Thiết lập cho đợt tạo file lần này');
}

/* ----- Bao cao rieng cho che do cap nhat ----- */
function renderUpdateReport(){
  const rep = state.result.report;

  setText('upd-baseline', rep.baselineLists.toLocaleString('vi-VN'));
  setText('upd-newlists', rep.newLists.length.toLocaleString('vi-VN'));
  setText('upd-grown',    rep.grownLists.length.toLocaleString('vi-VN'));
  setText('upd-addedsku', state.result.prdRows.length.toLocaleString('vi-VN'));
  setText('upd-gone',     rep.goneOutOfStock.length.toLocaleString('vi-VN'));
  setText('upd-merged',   rep.mergedCount.toLocaleString('vi-VN'));

  const nothing = !rep.newLists.length && !rep.grownLists.length;
  const manualOnly = nothing && rep.manual.length > 0;
  const banner = setHtml('upd-banner', manualOnly
    ? `<b>Không có file nào cần upload</b>, nhưng có <b>${rep.manual.length}</b> tổ hợp cần xử lý tay — xem mục &laquo;Cần xử lý tay&raquo; bên dưới.`
    : nothing
    ? '<b>Không có thay đổi nào.</b> Tồn kho hôm nay không làm phát sinh SKU mới cần bổ sung — không cần upload gì cả.'
    : `<b>Đợt đang chạy: <code>${escapeHtml(rep.datePrefix)}</code></b> &nbsp;|&nbsp; Hiệu lực ${escapeHtml(rep.startDate)} → ${escapeHtml(rep.endDate)}.
       Mã MSL và ngày hiệu lực được giữ nguyên theo file gốc để DMS cập nhật đúng danh sách đang chạy.`);
  if(banner) banner.className = 'hint ' + (nothing && !manualOnly ? 'ok' : 'warn');

  // Ma dang chay khong doi chieu duoc voi Hero New -> khong duoc bo sung SKU
  const warns = [];
  if(rep.unmatchedCodes.length){
    warns.push(`<b>${rep.unmatchedCodes.length}</b> mã đang chạy không khớp tổ hợp nào trong Hero New hiện tại
      (VD: <code>${escapeHtml(rep.unmatchedCodes[0])}</code>) nên không được bổ sung SKU.
      Thường do Hero New đã bỏ tổ hợp đó, hoặc file mốc thiếu dòng CUSTASSIGN của mã.`);
  }
  if(rep.outsideCodes.length){
    warns.push(`<b>${rep.outsideCodes.length}</b> mã gộp còn áp cho tổ hợp đã bị bỏ khỏi Hero New
      (VD: <code>${escapeHtml(rep.outsideCodes[0])}</code>) — không thêm SKU vào các mã này để khỏi áp cho
      tổ hợp đã bỏ; SKU mới của các tổ hợp còn lại được tách ra danh sách riêng.`);
  }
  if(rep.otherBatchCodes.length){
    warns.push(`<b>${rep.otherBatchCodes.length}</b> mã thuộc đợt khác (khác tiền tố <code>${escapeHtml(rep.datePrefix)}</code>
      hoặc đã hết hạn, VD: <code>${escapeHtml(rep.otherBatchCodes[0])}</code>) — bỏ qua, chỉ giữ lại trong bộ file mốc.`);
  }
  if(rep.unknownGCodes.length){
    warns.push(`<b>${rep.unknownGCodes.length}</b> mã có dòng cấp G mang node không tra được ra Region
      (VD: <code>${escapeHtml(rep.unknownGCodes[0])}</code>).`);
  }
  if(rep.unknownUCodes.length){
    warns.push(`<b>${rep.unknownUCodes.length}</b> mã có dòng cấp U mang mã không tra được ra U/R
      (VD: <code>${escapeHtml(rep.unknownUCodes[0])}</code>).`);
  }
  if(rep.noUCodes.length){
    warns.push(`<b>${rep.noUCodes.length}</b> mã không có dòng cấp U
      (VD: <code>${escapeHtml(rep.noUCodes[0])}</code>) — danh sách theo Area, cập nhật bằng tool cũ.`);
  }
  show('upd-unmatched', warns.length > 0);
  setHtml('upd-unmatched', warns.join('<br>'));

  const DL = {region:'Region',otd:'Kênh',seg:'Phân khúc',ur:'U/R'};
  renderLimitedTable('upd-detail-new', rep.newLists,
    ['mslCode','region','otd','seg','ur','skuCount','note'],
    Object.assign({mslCode:'MSL Code',skuCount:'Số SKU',note:'Ghi chú'}, DL),
    'Không có danh sách mới nào phát sinh.', 300);

  renderLimitedTable('upd-detail-grown', rep.grownLists,
    ['mslCode','region','otd','seg','ur','oldTotal','addedCount','newTotal','addedItems','note'],
    Object.assign({mslCode:'MSL Code',oldTotal:'SKU cũ',addedCount:'Thêm',newTotal:'Tổng mới',addedItems:'Item Code được thêm',note:'Ghi chú'}, DL),
    'Không có danh sách nào cần bổ sung SKU.', 300);

  show('upd-sec-manual', rep.manual.length > 0);
  renderLimitedTable('upd-detail-manual', rep.manual,
    ['mslCode','region','otd','seg','ur','mergedCode','addedItems','reason'],
    Object.assign({mslCode:'Tổ hợp',mergedCode:'Mã gộp đang áp',addedItems:'SKU cần thêm',reason:'Lý do'}, DL),
    'Không có.', 300);

  const b = state.result.baseline;
  setHtml('dl-baseline-note',
    `Bộ file mốc gồm <b>${b.infoRows.length.toLocaleString('vi-VN')}</b> danh sách,
     <b>${b.custRows.length.toLocaleString('vi-VN')}</b> dòng CUSTASSIGN và
     <b>${b.prdRows.length.toLocaleString('vi-VN')}</b> dòng SKU.`);

  const goneGrouped = {};
  rep.goneOutOfStock.forEach(r => {
    const k = r.region+'|'+r.itemCode;
    if(!goneGrouped[k]) goneGrouped[k] = {region:r.region, itemCode:r.itemCode, avail:r.avail, count:0};
    goneGrouped[k].count++;
  });
  renderLimitedTable('upd-detail-gone', Object.values(goneGrouped),
    ['region','itemCode','avail','count'],
    {region:'Region',itemCode:'Item Code',avail:'Tồn khả dụng (cả Region)',count:'Số danh sách chứa SKU này'},
    'Không có SKU nào trong DMS bị hết hàng.', 300);

  renderDownloadCards(state.result);
}
