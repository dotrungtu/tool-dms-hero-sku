'use strict';
/* =========================================================================
   ui.js
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
  show('sec-areas', state.missingAreas.length > 0);
  show('sec-otd',   state.missingOtd.length > 0);
  show('sec-sku',   state.missingSkuGroups.length > 0);

  setHtml('gap-areas', state.missingAreas.map(a => `
    <div class="gap-row">
      <span class="tag">${escapeHtml(a)}</span>
      <input type="text" placeholder="VD: VN1XXXA01" data-area="${escapeHtml(a)}" value="${escapeHtml(overrides.areaCodes[a]||'')}">
      <label class="chk"><input type="checkbox" data-skip-area="${escapeHtml(a)}"> Bỏ qua Area này</label>
    </div>`).join(''));

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
      <input type="text" placeholder="Region (VD: Mekong)" data-dist-region="${escapeHtml(d)}"
             value="${escapeHtml((overrides.distArea[d]||[])[0] || '')}">
      <input type="text" placeholder="Area (VD: MK8)" data-dist-area="${escapeHtml(d)}"
             value="${escapeHtml((overrides.distArea[d]||[])[1] || '')}">
      <label class="chk"><input type="checkbox" data-dist-inactive="${escapeHtml(d)}"> Đã ngưng kinh doanh</label>
    </div>`).join(''));
}

function collectGapInputs(){
  document.querySelectorAll('[data-area]').forEach(inp => {
    const a = inp.dataset.area;
    const skip = document.querySelector(`[data-skip-area="${CSS.escape(a)}"]`);
    if(skip && skip.checked) return;
    if(inp.value.trim()) overrides.areaCodes[a] = inp.value.trim();
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

  // Nha phan phoi moi trong INVT_MASTER
  state.unknownDistributors.forEach(d => {
    const off = document.querySelector(`[data-dist-inactive="${CSS.escape(d)}"]`);
    if(off && off.checked){ overrides.inactiveDist[d] = true; return; }
    const region = document.querySelector(`[data-dist-region="${CSS.escape(d)}"]`);
    const area   = document.querySelector(`[data-dist-area="${CSS.escape(d)}"]`);
    const rv = region ? region.value.trim() : '';
    const av = area ? area.value.trim() : '';
    if(av) overrides.distArea[d] = [rv || '(chưa rõ)', av];
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
      <b>không có dòng tồn kho nào</b> tại Area (NPP không kinh doanh mặt hàng đó) thì <b>vẫn bị loại</b>.`;
  } else {
    modeHtml = `<b>Chế độ tồn kho: Chỉ lấy SKU còn hàng.</b>
      ${rep.noStock.length.toLocaleString('vi-VN')} SKU có tồn kho = 0 <b>đã bị loại</b> khỏi file kết quả.`;
  }
  const modeBanner = setHtml('report-mode-banner', modeHtml);
  if(modeBanner) modeBanner.className = 'hint ' + (rep.stockMode === 'includeAll' ? 'warn' : 'ok');

  if(state.invtStats && stockSource() === 'invt'){
    const st = state.invtStats;
    setHtml('report-stock-source',
      `<b>Nguồn tồn kho: INVT_MASTER.csv</b> — ${st.total.toLocaleString('vi-VN')} dòng gốc →
       bỏ ${st.duplicate.toLocaleString('vi-VN')} dòng trùng,
       ${st.notActive.toLocaleString('vi-VN')} dòng Status ≠ A,
       ${st.otherWarehouse.toLocaleString('vi-VN')} dòng kho không tính,
       ${st.inactiveDist.toLocaleString('vi-VN')} dòng của NPP đã ngưng kinh doanh →
       còn <b>${st.used.toLocaleString('vi-VN')}</b> dòng được dùng.`);
  } else {
    setHtml('report-stock-source', '<b>Nguồn tồn kho: Stock Area.xlsx</b> — file query trực tiếp từ database, đã có sẵn Region/Area.');
  }

  setHtml('report-pinfo-note',
    `Đã áp dụng bộ lọc <b>PRODUCT_INFO.csv</b>: ${rep.validProductCount.toLocaleString('vi-VN')} mã sản phẩm hợp lệ
     (Status = A, Selling Type = 1, Parent Product Code trống), trong đó
     <b>${rep.newSkuCount.toLocaleString('vi-VN')}</b> mã là SKU mới (New SKU Ind = Y) — luôn được giữ lại kể cả khi tồn kho = 0.`);

  const L = {area:'Area',otd:'Kênh',seg:'Phân khúc',mslCode:'MSL Code',itemCode:'Item Code',
             itemName:'Tên hàng',avail:'Tồn khả dụng',reason:'Lý do',skuCount:'Số SKU',
             skuGroup:'SKU Group',lists:'Số danh sách',areaCount:'Số Area',
             candidates:'Tổng SKU',cutByPinfo:'Loại theo PRODUCT_INFO',cutByStock:'Loại vì hết tồn'};

  renderLimitedTable('detail-alllists', rep.allLists,
    ['mslCode','area','otd','seg','skuCount'], L,
    'Không có danh sách nào.', 300);

  renderLimitedTable('detail-skusummary', rep.skuSummary,
    ['itemCode','itemName','lists','areaCount'], L,
    'Không có SKU nào.', 300);

  renderLimitedTable('detail-nostock', rep.noStock,
    ['mslCode','area','otd','seg','itemCode','itemName','avail','reason'], L,
    'Không có SKU nào hết tồn kho.', 300);

  renderLimitedTable('detail-newsku', rep.keptByNewSku,
    ['mslCode','area','otd','seg','itemCode','itemName','reason'], L,
    'Không có SKU mới nào cần giữ lại.', 300);

  renderLimitedTable('detail-filtered', rep.filteredOut,
    ['mslCode','area','otd','seg','itemCode','itemName','reason'], L,
    'Không có SKU nào bị loại bởi bộ lọc PRODUCT_INFO.', 300);

  renderLimitedTable('detail-missitem', rep.missingItemReport,
    ['area','otd','seg','skuGroup','reason'], L,
    'Tất cả SKU Groups đều tìm được Item Code.', 300);

  renderLimitedTable('detail-empty', rep.emptySubsets,
    ['mslCode','area','otd','seg','candidates','cutByPinfo','cutByStock','reason'], L,
    'Không có danh sách nào bị bỏ qua.', 300);

  if(rep.sizeStats){
    setHtml('size-stats',
      `Mỗi danh sách chứa từ <b>${rep.sizeStats.min}</b> đến <b>${rep.sizeStats.max}</b> SKU
       — trung vị <b>${rep.sizeStats.median}</b>, trung bình <b>${rep.sizeStats.avg}</b>.`);
  }
  renderAreaTable('detail-byarea', rep.byArea);
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
  setCount('cnt-byarea',     rep.byArea.length);
  setCount('cnt-merge',      rep.merge.totalGroups);

  renderDownloadCards(r);
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

  let cls, html;
  if(!badCode.length && !badDesc.length){
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
     Các mã gộp đã được áp dụng vào cả 4 file — <code>MSL_CUSTASSIGN</code> nhận đủ Kênh, Phân khúc và Area của cả nhóm.`);
}

/* ----- Bang thong ke theo Area, kem thanh ty le con hang ----- */
function renderAreaTable(containerId, rows){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!rows || !rows.length){ el.innerHTML = '<p class="muted">Không có dữ liệu.</p>'; return; }

  const barClass = p => p >= 60 ? 'high' : (p >= 30 ? 'mid' : 'low');
  let html = `<div class="table-scroll"><table><thead><tr>
      <th>Area</th><th>Danh sách</th><th>Dòng SKU</th><th>TB SKU/danh sách</th>
      <th>SKU hết tồn</th><th>Giữ nhờ SKU mới</th><th>Danh sách bị bỏ</th>
      <th style="min-width:150px">Tỉ lệ SKU còn hàng</th></tr></thead><tbody>`;
  rows.forEach(r => {
    html += `<tr>
      <td><b>${escapeHtml(r.area)}</b>${r.hasStockData ? '' : ' <span class="badge red">thiếu tồn kho</span>'}</td>
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
      ${noData.length} Area có trong Hero New nhưng <b>không có một dòng nào</b> trong file ${escapeHtml(stockSourceName())}
      (${noData.map(r => escapeHtml(r.area)).join(', ')}).
      Toàn bộ SKU của các Area này bị coi như hết hàng — hãy xin lại file tồn kho đầy đủ trước khi chốt danh sách.</div>`;
  }

  const lowButHasData = rows.filter(r => r.hasStockData && r.inStockRate < 20);
  if(lowButHasData.length){
    html += `<div class="hint warn" style="margin-top:12px"><b>Tỉ lệ còn hàng thấp:</b>
      ${lowButHasData.map(r => escapeHtml(r.area)+' ('+r.inStockRate+'%)').join(', ')}.
      Có dữ liệu tồn kho nhưng phần lớn SKU đang hết hàng — nên rà lại trước khi chốt.</div>`;
  }
  el.innerHTML = html;
}

/* ----- Chon nhom ma MSL de gop ----- */

const MERGE_BADGE = {segment:'green', channel:'blue', 'area-inner':'amber', area:'amber', mixed:'red'};

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
    warns.push(`<b>${rep.unknownGCodes.length}</b> mã có dòng cấp G mang mã NPP không tra được ra Area
      (VD: <code>${escapeHtml(rep.unknownGCodes[0])}</code>) — phạm vi của các mã này có thể bị đọc thiếu.`);
  }
  show('upd-unmatched', warns.length > 0);
  setHtml('upd-unmatched', warns.join('<br>'));

  renderLimitedTable('upd-detail-new', rep.newLists,
    ['mslCode','area','otd','seg','skuCount','note'],
    {mslCode:'MSL Code',area:'Area',otd:'Kênh',seg:'Phân khúc',skuCount:'Số SKU',note:'Ghi chú'},
    'Không có danh sách mới nào phát sinh.', 300);

  renderLimitedTable('upd-detail-grown', rep.grownLists,
    ['mslCode','area','otd','seg','oldTotal','addedCount','newTotal','addedItems','note'],
    {mslCode:'MSL Code',area:'Area',otd:'Kênh',seg:'Phân khúc',oldTotal:'SKU cũ',addedCount:'Thêm',newTotal:'Tổng mới',addedItems:'Item Code được thêm',note:'Ghi chú'},
    'Không có danh sách nào cần bổ sung SKU.', 300);

  show('upd-sec-manual', rep.manual.length > 0);
  renderLimitedTable('upd-detail-manual', rep.manual,
    ['mslCode','area','otd','seg','mergedCode','addedItems','reason'],
    {mslCode:'Tổ hợp',area:'Area',otd:'Kênh',seg:'Phân khúc',mergedCode:'Mã gộp đang áp',addedItems:'SKU cần thêm',reason:'Lý do'},
    'Không có.', 300);

  const b = state.result.baseline;
  setHtml('dl-baseline-note',
    `Bộ file mốc gồm <b>${b.infoRows.length.toLocaleString('vi-VN')}</b> danh sách,
     <b>${b.custRows.length.toLocaleString('vi-VN')}</b> dòng CUSTASSIGN và
     <b>${b.prdRows.length.toLocaleString('vi-VN')}</b> dòng SKU.`);

  const goneGrouped = {};
  rep.goneOutOfStock.forEach(r => {
    const k = r.area+'|'+r.itemCode;
    if(!goneGrouped[k]) goneGrouped[k] = {area:r.area, itemCode:r.itemCode, avail:r.avail, count:0};
    goneGrouped[k].count++;
  });
  renderLimitedTable('upd-detail-gone', Object.values(goneGrouped),
    ['area','itemCode','avail','count'],
    {area:'Area',itemCode:'Item Code',avail:'Tồn khả dụng',count:'Số danh sách chứa SKU này'},
    'Không có SKU nào trong DMS bị hết hàng.', 300);

  renderDownloadCards(state.result);
}
