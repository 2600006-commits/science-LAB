/* ============================================================
   과학실 재고 관리 시스템 - 프론트엔드 앱 로직
   ============================================================ */

const state = {
  view: 'lab',
  labTab: 'locations',
  sortDir: 'asc',
  locQuery: '',
  itemsCache: [],
  vendorsCache: [],
  typesCache: [],
  purchaseCache: [],
  pendingPhoto: null,
  formVendors: [], formTypes: [], formLocations: [],
};

const PO_STATUSES = ['요청', '승인', '주문', '수령'];
const EXCEL_COLUMNS = ['판매처', '카탈로그번호', '물품명', '단가', '단위', '재고수량', 'URL', '메모', '타입', '보관위치', '세부위치', '유효기간', 'LOT번호', 'CAS번호'];

/* ---------------- 부트스트랩 ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  renderTopbarRight();
  setView('lab');
  if (window.innerWidth <= 860) {
    const btn = document.getElementById('mobile-menu-btn');
    if (btn) btn.style.display = 'inline-flex';
  }
});

/* ---------------- 세션/공통 ---------------- */
function currentUser() { const s = Session.get(); return s ? s.user : null; }
function isLoggedIn() { return !!currentUser(); }

function logout() {
  Session.clear();
  toast('로그아웃 되었습니다.');
  renderTopbarRight();
  setView(state.view);
}

function renderTopbarRight() {
  const el = document.getElementById('topbar-right');
  const user = currentUser();
  const adminOn = !!AdminSession.get();
  el.innerHTML = `
    ${user
      ? `<span class="muted small" style="margin-right:6px;">${escapeHtml(user.name)}님</span>
         <button class="btn btn-sm" onclick="logout()">로그아웃</button>`
      : `<button class="btn btn-sm" onclick="openLoginModal()">로그인</button>`}
    <button class="btn btn-sm ${adminOn ? 'btn-primary' : ''}" onclick="openAdminModal()">관리자</button>
  `;
}

/* ---------------- 라우팅 ---------------- */
function setView(view) {
  state.view = view;
  document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('topbar-title').textContent = { lab: 'LAB 관리', inventory: '재고관리', purchase: '구매관리' }[view] || '';
  document.getElementById('sidebar').classList.remove('open');
  renderView();
}

function renderView() {
  const content = document.getElementById('content');
  if (!isLoggedIn()) { content.innerHTML = gateHtml(); return; }
  if (state.view === 'lab') renderLab();
  else if (state.view === 'inventory') renderInventory();
  else if (state.view === 'purchase') renderPurchase();
}

function gateHtml() {
  return `<div class="gate">
    <h2>로그인이 필요합니다</h2>
    <p class="muted">재고 데이터를 확인하려면 먼저 로그인해 주세요.</p>
    <button class="btn btn-primary" onclick="openLoginModal()">로그인</button>
  </div>`;
}

/* ================= LAB 관리 ================= */
function renderLab() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-header"><div><h1>LAB 관리</h1><p>보관위치, 타입, 판매처, 등록자를 관리합니다.</p></div></div>
    <div class="tabs">
      ${tabBtn('locations', '보관위치')}${tabBtn('types', '타입')}${tabBtn('vendors', '판매처')}${tabBtn('registrants', '등록자')}
    </div>
    <div id="lab-tab-content"></div>
  `;
  renderLabTabContent();
}
function tabBtn(key, label) { return `<button class="tab ${state.labTab === key ? 'active' : ''}" onclick="setLabTab('${key}')">${label}</button>`; }
function setLabTab(tab) { state.labTab = tab; renderLab(); }

function renderLabTabContent() {
  const host = document.getElementById('lab-tab-content');
  if (state.labTab === 'locations') renderLocationsTab(host);
  else if (state.labTab === 'types') renderTypesTab(host);
  else if (state.labTab === 'vendors') renderVendorsTab(host);
  else if (state.labTab === 'registrants') renderRegistrantsTab(host);
}

/* ---- 보관위치 ---- */
function renderLocationsTab(host) {
  host.innerHTML = `<div class="card">
    <div class="search-row">
      <input type="text" id="loc-search" value="${escapeAttr(state.locQuery)}" placeholder="보관위치 검색..." onkeyup="if(event.key==='Enter') searchLocations()">
      <button class="btn" onclick="searchLocations()">검색</button>
      <button class="btn" onclick="toggleLocSort()">정렬 ${state.sortDir === 'asc' ? '▲' : '▼'}</button>
      <button class="btn btn-primary" onclick="promptAddLocation()">+ 보관위치 추가</button>
    </div>
    <div id="loc-list">불러오는 중...</div>
  </div>`;
  loadLocations();
}
async function loadLocations() {
  try {
    const sortBy = state.sortDir === 'asc' ? 'name' : 'name_desc';
    const { locations } = await Api.getLocations(state.locQuery, sortBy);
    renderLocList(locations);
  } catch (e) { apiErr(e); }
}
function searchLocations() { state.locQuery = document.getElementById('loc-search').value.trim(); loadLocations(); }
function toggleLocSort() { state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'; renderLabTabContent(); }

function renderLocList(locations) {
  const groups = {};
  locations.forEach(l => {
    if (!groups[l.mainLocation]) groups[l.mainLocation] = { mainId: null, subs: [] };
    if (!l.subLocation) groups[l.mainLocation].mainId = l.id;
    else groups[l.mainLocation].subs.push(l);
  });
  const keys = Object.keys(groups);
  const html = keys.length === 0
    ? `<p class="muted small">등록된 보관위치가 없습니다.</p>`
    : keys.map(name => {
      const g = groups[name];
      return `<div class="card" style="margin-bottom:10px;">
        <div class="flex space-between">
          <strong>${escapeHtml(name)}</strong>
          <div class="flex gap-8">
            ${g.mainId ? `<button class="btn btn-sm" onclick="promptAddSubLocation('${g.mainId}')">+ 세부위치</button>
            <button class="btn btn-sm btn-danger" onclick="deleteLocationConfirm('${g.mainId}')">삭제</button>` : ''}
          </div>
        </div>
        ${g.subs.length
          ? `<div class="mt-8" style="display:flex; flex-wrap:wrap; gap:6px;">
              ${g.subs.map(s => `<span class="badge" style="background:#EAEAEC;color:#1D1D1F;">${escapeHtml(s.subLocation)}
                <button style="border:none;background:none;cursor:pointer;margin-left:4px;color:#FF3B30;" onclick="deleteLocationConfirm('${s.id}')">✕</button></span>`).join('')}
            </div>`
          : `<p class="muted small mt-8">세부 위치 없음</p>`}
      </div>`;
    }).join('');
  document.getElementById('loc-list').innerHTML = html;
}
function promptAddLocation() {
  promptModal('보관위치 추가', '예: 약품장, 실험대 A', async (val) => {
    try { await Api.addLocation(val); closeModal(); toast('보관위치가 추가되었습니다.', 'success'); loadLocations(); }
    catch (e) { apiErr(e); }
  });
}
function promptAddSubLocation(locationId) {
  promptModal('세부 위치 추가', '예: 1단, 왼쪽 칸', async (val) => {
    try { await Api.addSubLocation(locationId, val); closeModal(); toast('세부 위치가 추가되었습니다.', 'success'); loadLocations(); }
    catch (e) { apiErr(e); }
  });
}
function deleteLocationConfirm(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  Api.deleteLocation(id).then(() => { toast('삭제되었습니다.', 'success'); loadLocations(); }).catch(apiErr);
}

/* ---- 타입 ---- */
function renderTypesTab(host) {
  host.innerHTML = `<div class="form-grid" style="grid-template-columns: 340px 1fr; align-items:start;">
    <div class="card">
      <div class="card-title">타입 추가</div>
      <div class="field"><label>타입 이름</label><input id="type-name" type="text" placeholder="예: 시약, 유리기구"></div>
      <div class="field mt-8"><label>세부 항목 (타입에 맞는 값들)</label>
        <div id="type-fields"></div>
        <button class="btn btn-sm mt-8" onclick="addTypeFieldInput()">+ 항목 추가</button>
      </div>
      <button class="btn btn-primary mt-8" style="width:100%;" onclick="submitAddType()">타입 등록</button>
    </div>
    <div class="card">
      <div class="card-title">등록된 타입</div>
      <div id="type-list">불러오는 중...</div>
    </div>
  </div>`;
  document.getElementById('type-fields').innerHTML = '';
  addTypeFieldInput();
  loadTypes();
}
let typeFieldCount = 0;
function addTypeFieldInput() {
  const wrap = document.getElementById('type-fields');
  const id = 'tf_' + (typeFieldCount++);
  const row = document.createElement('div');
  row.className = 'flex gap-8 mt-8';
  row.id = id;
  row.innerHTML = `<input type="text" placeholder="항목명 (예: 농도, 용량)" class="type-field-input">
    <button class="btn btn-sm btn-ghost" onclick="document.getElementById('${id}').remove()">✕</button>`;
  wrap.appendChild(row);
}
async function submitAddType() {
  const name = document.getElementById('type-name').value.trim();
  if (!name) { toast('타입 이름을 입력하세요.', 'error'); return; }
  const fields = [...document.querySelectorAll('.type-field-input')].map(i => i.value.trim()).filter(Boolean);
  try {
    await Api.addType(name, fields);
    toast('타입이 등록되었습니다.', 'success');
    document.getElementById('type-name').value = '';
    document.getElementById('type-fields').innerHTML = '';
    addTypeFieldInput();
    loadTypes();
  } catch (e) { apiErr(e); }
}
async function loadTypes() {
  try {
    const { types } = await Api.getTypes();
    state.typesCache = types;
    document.getElementById('type-list').innerHTML = types.length ? types.map(t => `
      <div class="card" style="margin-bottom:10px;">
        <div class="flex space-between"><strong>${escapeHtml(t.name)}</strong><button class="btn btn-sm btn-danger" onclick="deleteTypeConfirm('${t.id}')">삭제</button></div>
        <div class="mt-8 small muted">${t.fields.length ? t.fields.map(f => escapeHtml(f)).join(', ') : '세부 항목 없음'}</div>
      </div>`).join('') : `<p class="muted small">등록된 타입이 없습니다.</p>`;
  } catch (e) { apiErr(e); }
}
function deleteTypeConfirm(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  Api.deleteType(id).then(() => { toast('삭제되었습니다.', 'success'); loadTypes(); }).catch(apiErr);
}

/* ---- 판매처 ---- */
function renderVendorsTab(host) {
  host.innerHTML = `<div class="card">
    <div class="card-title">판매처 등록</div>
    <div class="form-grid">
      <div class="field"><label>판매처명 *</label><input id="v-name" type="text"></div>
      <div class="field"><label>URL</label><input id="v-url" type="url" placeholder="https://"></div>
      <div class="field"><label>담당자명</label><input id="v-contact" type="text"></div>
      <div class="field"><label>담당자 연락처</label><input id="v-phone" type="tel"></div>
      <div class="field"><label>담당자 이메일</label><input id="v-email" type="email"></div>
      <div class="field full"><label>메모</label><textarea id="v-memo"></textarea></div>
    </div>
    <button class="btn btn-primary mt-8" onclick="submitAddVendor()">판매처 등록</button>
  </div>
  <div class="card">
    <div class="card-title">판매처 목록</div>
    <div class="table-wrap"><table><thead><tr><th>판매처</th><th>URL</th><th>담당자</th><th>연락처</th><th>이메일</th><th>메모</th><th></th></tr></thead>
    <tbody id="vendor-tbody"><tr class="empty-row"><td colspan="7">불러오는 중...</td></tr></tbody></table></div>
  </div>`;
  loadVendors();
}
async function submitAddVendor() {
  const name = document.getElementById('v-name').value.trim();
  if (!name) { toast('판매처명을 입력하세요.', 'error'); return; }
  try {
    await Api.addVendor({
      name, url: document.getElementById('v-url').value.trim(),
      contactName: document.getElementById('v-contact').value.trim(),
      contactPhone: document.getElementById('v-phone').value.trim(),
      contactEmail: document.getElementById('v-email').value.trim(),
      memo: document.getElementById('v-memo').value.trim()
    });
    toast('판매처가 등록되었습니다.', 'success');
    ['v-name', 'v-url', 'v-contact', 'v-phone', 'v-email', 'v-memo'].forEach(id => document.getElementById(id).value = '');
    loadVendors();
  } catch (e) { apiErr(e); }
}
async function loadVendors() {
  try {
    const { vendors } = await Api.getVendors();
    state.vendorsCache = vendors;
    document.getElementById('vendor-tbody').innerHTML = vendors.length ? vendors.map(v => `<tr>
      <td>${escapeHtml(v.name)}</td>
      <td>${v.url ? `<a href="${escapeAttr(v.url)}" target="_blank" rel="noopener">방문</a>` : '-'}</td>
      <td>${escapeHtml(v.contactName || '-')}</td>
      <td>${escapeHtml(v.contactPhone || '-')}</td>
      <td>${escapeHtml(v.contactEmail || '-')}</td>
      <td>${escapeHtml(v.memo || '-')}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteVendorConfirm('${v.id}')">삭제</button></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="7">등록된 판매처가 없습니다.</td></tr>`;
  } catch (e) { apiErr(e); }
}
function deleteVendorConfirm(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  Api.deleteVendor(id).then(() => { toast('삭제되었습니다.', 'success'); loadVendors(); }).catch(apiErr);
}

/* ---- 등록자 ---- */
function renderRegistrantsTab(host) {
  host.innerHTML = `<div class="card"><div class="card-title">등록자 목록</div><div id="registrant-list">불러오는 중...</div></div>
  <div id="registrant-items"></div>`;
  loadRegistrants();
}
async function loadRegistrants() {
  try {
    const { registrants } = await Api.getRegistrants();
    document.getElementById('registrant-list').innerHTML = registrants.length
      ? `<div style="display:flex; flex-wrap:wrap; gap:8px;">${registrants.map(r => `<button class="btn btn-sm" onclick="showRegistrantItems('${escapeAttr(r)}')">${escapeHtml(r)}</button>`).join('')}</div>`
      : `<p class="muted small">등록된 물품이 없습니다.</p>`;
  } catch (e) { apiErr(e); }
}
async function showRegistrantItems(name) {
  try {
    const { items } = await Api.getItemsByRegistrant(name);
    document.getElementById('registrant-items').innerHTML = `<div class="card">
      <div class="card-title">${escapeHtml(name)} 님이 등록한 물품 (${items.length})</div>
      ${renderItemsTable(items, { readonly: true })}
    </div>`;
  } catch (e) { apiErr(e); }
}

/* ================= 재고관리 ================= */
function renderInventory() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-header">
      <div><h1>재고관리</h1><p>물품을 추가하고 재고를 관리합니다.</p></div>
      <div class="flex gap-8">
        <button class="btn" onclick="openExcelModal()">엑셀로 등록</button>
        <button class="btn" onclick="openPurchaseRequestModal()">구매요청</button>
        <button class="btn btn-primary" onclick="openAddItemModal()">+ 물품추가</button>
      </div>
    </div>
    <div class="search-row"><input id="item-search" type="text" placeholder="물품명, 판매처, 카탈로그번호 검색..." onkeyup="if(event.key==='Enter') loadItems()"><button class="btn" onclick="loadItems()">검색</button></div>
    <div id="item-list">불러오는 중...</div>
  `;
  loadItems();
}
async function loadItems() {
  try {
    const q = document.getElementById('item-search') ? document.getElementById('item-search').value : '';
    const { items } = await Api.getItems(q);
    state.itemsCache = items;
    document.getElementById('item-list').innerHTML = renderItemsTable(items, { readonly: false });
  } catch (e) { apiErr(e); }
}
function renderItemsTable(items, opts = {}) {
  if (!items.length) return `<div class="card"><p class="muted small" style="text-align:center;padding:20px;">등록된 물품이 없습니다.</p></div>`;
  const rows = items.map(it => `
    <tr>
      <td>${it.photoUrl ? `<img src="${escapeAttr(it.photoUrl)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">` : `<div style="width:40px;height:40px;border-radius:6px;background:#EFEFF1;"></div>`}</td>
      <td><strong>${escapeHtml(it.name)}</strong>${it.catalogNo ? `<div class="small muted">${escapeHtml(it.catalogNo)}</div>` : ''}</td>
      <td>${escapeHtml(it.vendor || '-')}</td>
      <td>${escapeHtml(it.type || '-')}</td>
      <td>${escapeHtml([it.location, it.subLocation].filter(Boolean).join(' / ') || '-')}</td>
      <td>${opts.readonly ? escapeHtml(String(it.stockQty)) : `
        <div class="flex gap-8">
          <button class="btn btn-sm btn-ghost" onclick="adjustStock('${it.id}',-1)">−</button>
          <span>${escapeHtml(String(it.stockQty))} ${escapeHtml(it.unit || '')}</span>
          <button class="btn btn-sm btn-ghost" onclick="adjustStock('${it.id}',1)">+</button>
        </div>`}</td>
      <td>${it.unitPrice ? Number(it.unitPrice).toLocaleString() + '원' : '-'}</td>
      <td>${it.expiryDate ? escapeHtml(formatDate(it.expiryDate)) : '-'}</td>
      ${opts.readonly ? '' : `<td>
        <div class="flex gap-8">
          <button class="btn btn-sm" onclick="openPhotoModal('${it.id}')">사진</button>
          <button class="btn btn-sm" onclick="openHistoryModal('${it.id}','${escapeAttr(it.name)}')">이력</button>
          <button class="btn btn-sm btn-danger" onclick="deleteItemConfirm('${it.id}')">삭제</button>
        </div>
      </td>`}
    </tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th></th><th>물품명</th><th>판매처</th><th>타입</th><th>보관위치</th><th>재고수량</th><th>단가</th><th>유효기간</th>${opts.readonly ? '' : '<th>관리</th>'}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function adjustStock(id, delta) {
  const item = state.itemsCache.find(i => i.id === id);
  if (!item) return;
  const newQty = Math.max(0, Number(item.stockQty) + delta);
  Api.updateItemStock(id, newQty, currentUser().name, delta > 0 ? '수동 증가' : '수동 감소')
    .then(() => loadItems())
    .catch(apiErr);
}
function deleteItemConfirm(id) {
  if (!confirm('이 물품을 삭제하시겠습니까?')) return;
  Api.deleteItem(id).then(() => { toast('삭제되었습니다.', 'success'); loadItems(); }).catch(apiErr);
}

/* ---- 물품추가 모달 ---- */
async function openAddItemModal() {
  try {
    const [{ vendors }, { types }, { locations }] = await Promise.all([Api.getVendors(), Api.getTypes(), Api.getLocations()]);
    state.formVendors = vendors; state.formTypes = types; state.formLocations = locations;
    state.pendingPhoto = null;
    showModal(addItemModalHtml());
    document.getElementById('item-type').onchange = renderTypeValueFields;
  } catch (e) { apiErr(e); }
}
function addItemModalHtml() {
  const vendorOptions = state.formVendors.map(v => `<option value="${escapeAttr(v.name)}">`).join('');
  const typeOptions = state.formTypes.map(t => `<option value="${escapeAttr(t.name)}">${escapeHtml(t.name)}</option>`).join('');
  const mainLocs = [...new Set(state.formLocations.map(l => l.mainLocation))];
  const locOptions = mainLocs.map(m => `<option value="${escapeAttr(m)}">`).join('');
  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal wide">
      <div class="modal-header"><h2>물품 추가</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <div class="field"><label>판매처</label><input list="vendor-list" id="item-vendor"><datalist id="vendor-list">${vendorOptions}</datalist></div>
        <div class="field"><label>카탈로그 번호</label><input id="item-catalog" type="text"></div>
        <div class="field full"><label>물품명 *</label><input id="item-name" type="text"></div>
        <div class="field"><label>단가</label><input id="item-price" type="number" min="0"></div>
        <div class="field"><label>단위</label><input id="item-unit" type="text" placeholder="예: 개, box, mL"></div>
        <div class="field"><label>재고 수량</label><input id="item-qty" type="number" min="0" value="0"></div>
        <div class="field full"><label>URL</label><input id="item-url" type="url"></div>
        <div class="field"><label>타입</label><select id="item-type"><option value="">선택 안함</option>${typeOptions}</select></div>
        <div class="field" id="item-type-values-wrap"></div>
        <div class="field"><label>보관위치</label><input list="loc-list-dl" id="item-location"><datalist id="loc-list-dl">${locOptions}</datalist></div>
        <div class="field"><label>세부 위치</label><input id="item-subloc" type="text"></div>
        <div class="field"><label>유효기간 만료일</label><input id="item-expiry" type="date"></div>
        <div class="field"><label>LOT 번호</label><input id="item-lot" type="text"></div>
        <div class="field"><label>CAS 번호</label><input id="item-cas" type="text"></div>
        <div class="field full"><label>메모</label><textarea id="item-memo"></textarea></div>
        <div class="field full">
          <label>사진 (모바일로 촬영 가능)</label>
          <div class="photo-box" onclick="document.getElementById('item-photo-input').click()" id="item-photo-box">
            <span>📷 사진 촬영 / 선택</span>
          </div>
          <input type="file" id="item-photo-input" accept="image/*" capture="environment" style="display:none" onchange="previewSelectedPhoto(event)">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn btn-primary" onclick="submitAddItem()">등록</button>
      </div>
    </div>
  </div>`;
}
function renderTypeValueFields() {
  const typeName = document.getElementById('item-type').value;
  const type = state.formTypes.find(t => t.name === typeName);
  const wrap = document.getElementById('item-type-values-wrap');
  if (!type || !type.fields.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<label>${escapeHtml(type.name)} 세부 값</label>` + type.fields.map(f => `
    <div style="margin-top:6px;"><input type="text" class="type-value-input" data-field="${escapeAttr(f)}" placeholder="${escapeAttr(f)}"></div>`).join('');
}
function previewSelectedPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.pendingPhoto = { base64: reader.result, filename: file.name, mimeType: file.type };
    document.getElementById('item-photo-box').innerHTML = `<img src="${reader.result}"><button class="remove-photo" onclick="event.stopPropagation(); clearPendingPhoto()">✕</button>`;
  };
  reader.readAsDataURL(file);
}
function clearPendingPhoto() {
  state.pendingPhoto = null;
  document.getElementById('item-photo-box').innerHTML = `<span>📷 사진 촬영 / 선택</span>`;
  document.getElementById('item-photo-input').value = '';
}
async function submitAddItem() {
  const name = document.getElementById('item-name').value.trim();
  if (!name) { toast('물품명을 입력하세요.', 'error'); return; }
  const typeValues = {};
  document.querySelectorAll('.type-value-input').forEach(i => { if (i.value.trim()) typeValues[i.dataset.field] = i.value.trim(); });
  const item = {
    vendor: document.getElementById('item-vendor').value.trim(),
    catalogNo: document.getElementById('item-catalog').value.trim(),
    name,
    unitPrice: Number(document.getElementById('item-price').value) || 0,
    unit: document.getElementById('item-unit').value.trim(),
    stockQty: Number(document.getElementById('item-qty').value) || 0,
    url: document.getElementById('item-url').value.trim(),
    memo: document.getElementById('item-memo').value.trim(),
    type: document.getElementById('item-type').value,
    typeValues,
    location: document.getElementById('item-location').value.trim(),
    subLocation: document.getElementById('item-subloc').value.trim(),
    expiryDate: document.getElementById('item-expiry').value,
    lot: document.getElementById('item-lot').value.trim(),
    cas: document.getElementById('item-cas').value.trim(),
    registeredBy: currentUser().name,
  };
  try {
    const { item: created } = await Api.addItem(item);
    if (state.pendingPhoto) {
      await Api.uploadPhoto(created.id, state.pendingPhoto.base64, state.pendingPhoto.filename, state.pendingPhoto.mimeType);
    }
    state.pendingPhoto = null;
    closeModal();
    toast('물품이 등록되었습니다.', 'success');
    loadItems();
  } catch (e) { apiErr(e); }
}

/* ---- 사진 (기존 물품) ---- */
function openPhotoModal(itemId) {
  const item = state.itemsCache.find(i => i.id === itemId);
  if (!item) return;
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>${escapeHtml(item.name)} 사진</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <div class="photo-box" onclick="document.getElementById('photo-modal-input').click()" id="photo-modal-box">
        ${item.photoUrl ? `<img src="${escapeAttr(item.photoUrl)}"><button class="remove-photo" onclick="event.stopPropagation(); deleteItemPhoto('${item.id}')">✕</button>` : `<span>📷 사진 촬영 / 선택</span>`}
      </div>
      <input type="file" id="photo-modal-input" accept="image/*" capture="environment" style="display:none" onchange="uploadItemPhotoFromModal(event,'${item.id}')">
    </div>
  </div>`);
}
function uploadItemPhotoFromModal(event, itemId) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await Api.uploadPhoto(itemId, reader.result, file.name, file.type);
      toast('사진이 업로드되었습니다.', 'success');
      closeModal();
      loadItems();
    } catch (e) { apiErr(e); }
  };
  reader.readAsDataURL(file);
}
async function deleteItemPhoto(itemId) {
  try { await Api.deletePhoto(itemId); toast('사진이 삭제되었습니다.', 'success'); closeModal(); loadItems(); }
  catch (e) { apiErr(e); }
}

/* ---- 이력 ---- */
async function openHistoryModal(itemId, itemName) {
  try {
    const { history } = await Api.getHistory(itemId);
    showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal wide">
        <div class="modal-header"><h2>${escapeHtml(itemName)} 재고 이력</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
        <div class="table-wrap"><table><thead><tr><th>일시</th><th>구분</th><th>변경 전</th><th>변경 후</th><th>담당자</th><th>메모</th></tr></thead><tbody>
          ${history.length ? history.map(h => `<tr><td>${escapeHtml(formatDateTime(h.timestamp))}</td><td>${escapeHtml(h.changeType)}</td><td>${escapeHtml(String(h.beforeQty))}</td><td>${escapeHtml(String(h.afterQty))}</td><td>${escapeHtml(h.changedBy || '-')}</td><td>${escapeHtml(h.note || '-')}</td></tr>`).join('') : `<tr class="empty-row"><td colspan="6">이력이 없습니다.</td></tr>`}
        </tbody></table></div>
      </div>
    </div>`);
  } catch (e) { apiErr(e); }
}

/* ---- 엑셀 등록 ---- */
function openExcelModal() {
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>엑셀로 등록</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <p class="muted small">먼저 템플릿을 다운로드한 뒤, 내용을 채워서 업로드하세요.</p>
      <button class="btn" style="width:100%;" onclick="downloadExcelTemplate()">📥 템플릿 다운로드</button>
      <div class="field mt-8"><label>엑셀 파일 업로드</label><input type="file" id="excel-upload-input" accept=".xlsx,.xls"></div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn btn-primary" onclick="submitExcelUpload()">등록</button>
      </div>
    </div>
  </div>`);
}
function downloadExcelTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    EXCEL_COLUMNS,
    ['(예) OO사이언스', 'CAT-001', '에탄올', 15000, '병', 10, 'https://example.com', '', '시약', '약품장', '1단', '2026-12-31', 'LOT123', '64-17-5']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '재고템플릿');
  XLSX.writeFile(wb, '재고등록_템플릿.xlsx');
}
function submitExcelUpload() {
  const input = document.getElementById('excel-upload-input');
  const file = input.files[0];
  if (!file) { toast('엑셀 파일을 선택하세요.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const dataRows = rows.slice(1).filter(r => r.length && r[2]);
      const items = dataRows.map(r => ({
        vendor: r[0] || '', catalogNo: r[1] || '', name: r[2] || '', unitPrice: Number(r[3]) || 0, unit: r[4] || '',
        stockQty: Number(r[5]) || 0, url: r[6] || '', memo: r[7] || '', type: r[8] || '', location: r[9] || '',
        subLocation: r[10] || '', expiryDate: r[11] || '', lot: r[12] || '', cas: r[13] || '', registeredBy: currentUser().name
      }));
      if (!items.length) { toast('등록할 데이터가 없습니다.', 'error'); return; }
      await Api.bulkAddItems(items);
      toast(items.length + '개 물품이 등록되었습니다.', 'success');
      closeModal();
      loadItems();
    } catch (err) { apiErr(err); }
  };
  reader.readAsArrayBuffer(file);
}

/* ---- 구매요청 팝업 ---- */
function openPurchaseRequestModal() {
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>구매요청</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <div class="form-grid">
        <div class="field"><label>판매처</label><input id="po-vendor" type="text"></div>
        <div class="field"><label>카탈로그 번호</label><input id="po-catalog" type="text"></div>
        <div class="field full"><label>물품명 *</label><input id="po-name" type="text"></div>
        <div class="field full"><label>URL</label><input id="po-url" type="url"></div>
        <div class="field"><label>단위</label><input id="po-unit" type="text"></div>
        <div class="field"><label>수량</label><input id="po-qty" type="number" min="1" value="1" oninput="updatePoTotal()"></div>
        <div class="field"><label>단가</label><input id="po-price" type="number" min="0" value="0" oninput="updatePoTotal()"></div>
        <div class="field"><label>금액</label><input id="po-total" type="text" value="0원" disabled></div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn btn-primary" onclick="submitPurchaseRequest()">확인</button>
      </div>
    </div>
  </div>`);
}
function updatePoTotal() {
  const qty = Number(document.getElementById('po-qty').value) || 0;
  const price = Number(document.getElementById('po-price').value) || 0;
  document.getElementById('po-total').value = (qty * price).toLocaleString() + '원';
}
async function submitPurchaseRequest() {
  const name = document.getElementById('po-name').value.trim();
  if (!name) { toast('물품명을 입력하세요.', 'error'); return; }
  const request = {
    vendor: document.getElementById('po-vendor').value.trim(),
    catalogNo: document.getElementById('po-catalog').value.trim(),
    name, url: document.getElementById('po-url').value.trim(),
    unit: document.getElementById('po-unit').value.trim(),
    qty: Number(document.getElementById('po-qty').value) || 0,
    unitPrice: Number(document.getElementById('po-price').value) || 0,
    requestedBy: currentUser().name,
  };
  try {
    await Api.addPurchaseRequest(request);
    toast('구매요청이 등록되었습니다.', 'success');
    closeModal();
    if (state.view === 'purchase') loadPurchaseRequests();
  } catch (e) { apiErr(e); }
}

/* ================= 구매관리 ================= */
function renderPurchase() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-header">
    <div><h1>구매관리</h1><p>구매 요청의 진행 상황을 관리합니다.</p></div>
    <button class="btn btn-primary" onclick="downloadPurchaseHistory()">📥 구매관리 내역 다운로드</button>
  </div>
  <div id="purchase-list">불러오는 중...</div>`;
  loadPurchaseRequests();
}
async function loadPurchaseRequests() {
  try {
    const { requests } = await Api.getPurchaseRequests();
    state.purchaseCache = requests;
    document.getElementById('purchase-list').innerHTML = requests.length
      ? `<div class="table-wrap"><table><thead><tr><th>물품명</th><th>판매처</th><th>수량</th><th>단가</th><th>금액</th><th>요청자</th><th>진행상황</th><th></th></tr></thead><tbody>
        ${requests.map(r => `<tr>
          <td><strong>${escapeHtml(r.name)}</strong>${r.catalogNo ? `<div class="small muted">${escapeHtml(r.catalogNo)}</div>` : ''}</td>
          <td>${escapeHtml(r.vendor || '-')}</td>
          <td>${escapeHtml(String(r.qty))} ${escapeHtml(r.unit || '')}</td>
          <td>${Number(r.unitPrice || 0).toLocaleString()}원</td>
          <td>${Number(r.totalPrice || 0).toLocaleString()}원</td>
          <td>${escapeHtml(r.requestedBy || '-')}</td>
          <td>${renderStepper(r)}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deletePoConfirm('${r.id}')">삭제</button></td>
        </tr>`).join('')}
      </tbody></table></div>`
      : `<div class="card"><p class="muted small" style="text-align:center;padding:20px;">등록된 구매요청이 없습니다.</p></div>`;
  } catch (e) { apiErr(e); }
}
function renderStepper(r) {
  return `<div class="stepper">${PO_STATUSES.map((s, i) => `
    ${i > 0 ? '<span class="step-arrow">→</span>' : ''}
    <button class="step-pill ${r.status === s ? 'active' : ''}" onclick="setPoStatus('${r.id}','${s}')">${s}</button>
  `).join('')}</div>`;
}
async function setPoStatus(id, status) {
  try {
    await Api.updatePurchaseStatus(id, status, currentUser().name);
    toast(status === '수령' ? '수령 처리되어 재고에 자동 반영되었습니다.' : '상태가 변경되었습니다.', 'success');
    loadPurchaseRequests();
  } catch (e) { apiErr(e); }
}
function deletePoConfirm(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  Api.deletePurchaseRequest(id).then(() => { toast('삭제되었습니다.', 'success'); loadPurchaseRequests(); }).catch(apiErr);
}
function downloadPurchaseHistory() {
  const requests = state.purchaseCache || [];
  if (!requests.length) { toast('다운로드할 구매 내역이 없습니다.', 'error'); return; }
  const rows = [['물품명', '판매처', '카탈로그번호', '단위', '수량', '단가', '금액', '진행상황', '요청자', '요청일']];
  requests.forEach(r => rows.push([r.name, r.vendor, r.catalogNo, r.unit, r.qty, r.unitPrice, r.totalPrice, r.status, r.requestedBy, formatDate(r.createdAt)]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '구매내역');
  XLSX.writeFile(wb, '구매관리_내역.xlsx');
}

/* ================= 인증 (로그인/회원가입) ================= */
function openLoginModal() {
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>로그인</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <div class="field"><label>이메일</label><input id="login-email" type="email"></div>
      <div class="field mt-8"><label>비밀번호</label><input id="login-pw" type="password" onkeyup="if(event.key==='Enter') submitLogin()"></div>
      <div class="modal-footer">
        <button class="btn" onclick="openSignupModal()">회원가입</button>
        <button class="btn btn-primary" onclick="submitLogin()">로그인</button>
      </div>
    </div>
  </div>`);
}
async function submitLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pw').value;
  if (!email || !password) { toast('이메일과 비밀번호를 입력하세요.', 'error'); return; }
  try {
    const { token, user } = await Api.login({ email, password });
    Session.save({ token, user });
    toast(user.name + '님, 환영합니다.', 'success');
    closeModal();
    renderTopbarRight();
    setView(state.view);
  } catch (e) { apiErr(e); }
}
function openSignupModal() {
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>회원가입</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <div class="field"><label>이름</label><input id="su-name" type="text"></div>
      <div class="field mt-8"><label>이메일</label><input id="su-email" type="email"></div>
      <div class="field mt-8"><label>비밀번호</label><input id="su-pw" type="password"></div>
      <div class="mt-8" style="display:flex; flex-direction:column; gap:8px;">
        <label class="checkbox-row"><input type="checkbox" id="su-age"> 만 14세 이상입니다. (필수)</label>
        <label class="checkbox-row"><input type="checkbox" id="su-privacy"> 개인정보처리방침에 동의합니다. (필수)</label>
        <label class="checkbox-row"><input type="checkbox" id="su-terms"> 이용약관에 동의합니다. (필수)</label>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="openLoginModal()">이미 계정이 있어요</button>
        <button class="btn btn-primary" onclick="submitSignup()">가입 신청</button>
      </div>
    </div>
  </div>`);
}
async function submitSignup() {
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const password = document.getElementById('su-pw').value;
  const agree = document.getElementById('su-age').checked && document.getElementById('su-privacy').checked && document.getElementById('su-terms').checked;
  if (!name || !email || !password) { toast('모든 항목을 입력하세요.', 'error'); return; }
  if (!agree) { toast('필수 약관에 모두 동의해야 합니다.', 'error'); return; }
  try {
    await Api.signup({ email, password, name, agreeTerms: true });
    toast('가입 신청이 완료되었습니다. 관리자 승인을 기다려주세요.', 'success');
    closeModal();
  } catch (e) { apiErr(e); }
}

/* ================= 관리자 ================= */
function openAdminModal() {
  if (AdminSession.get()) { renderAdminPanel(); return; }
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>관리자 인증</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <div class="field"><label>관리자 비밀번호</label><input id="admin-pw" type="password" onkeyup="if(event.key==='Enter') submitAdminLogin()"></div>
      <div class="modal-footer"><button class="btn" onclick="closeModal()">취소</button><button class="btn btn-primary" onclick="submitAdminLogin()">확인</button></div>
    </div>
  </div>`);
}
async function submitAdminLogin() {
  const password = document.getElementById('admin-pw').value;
  try {
    const { adminToken } = await Api.adminLogin({ password });
    AdminSession.save(adminToken);
    toast('관리자 인증되었습니다.', 'success');
    renderTopbarRight();
    renderAdminPanel();
  } catch (e) { apiErr(e); }
}
async function renderAdminPanel() {
  try {
    const { users } = await Api.adminListUsers();
    const pending = users.filter(u => u.status === 'pending');
    const others = users.filter(u => u.status !== 'pending');
    showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
      <div class="modal wide">
        <div class="modal-header"><h2>관리자 패널</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
        <div class="card-title">가입 승인 대기 (${pending.length})</div>
        ${pending.length ? pending.map(u => `
          <div class="flex space-between" style="padding:8px 0; border-bottom:1px solid var(--border);">
            <div><strong>${escapeHtml(u.name)}</strong> <span class="muted small">${escapeHtml(u.email)}</span></div>
            <div class="flex gap-8">
              <button class="btn btn-sm btn-primary" onclick="approveUser('${u.id}')">승인</button>
              <button class="btn btn-sm btn-danger" onclick="rejectUser('${u.id}')">거절</button>
            </div>
          </div>`).join('') : `<p class="muted small">대기 중인 신청이 없습니다.</p>`}
        <div class="card-title" style="margin-top:22px;">전체 회원</div>
        <div class="table-wrap"><table><thead><tr><th>이름</th><th>이메일</th><th>상태</th><th>권한</th><th></th></tr></thead><tbody>
        ${others.map(u => `<tr>
          <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td>
          <td><span class="badge badge-${u.status}">${statusLabel(u.status)}</span></td>
          <td>${escapeHtml(u.role)}</td>
          <td><button class="btn btn-sm" onclick="openEditUserModal('${u.id}','${escapeAttr(u.name)}','${escapeAttr(u.role)}')">수정</button></td>
        </tr>`).join('')}
        </tbody></table></div>
      </div>
    </div>`);
  } catch (e) { apiErr(e); }
}
function statusLabel(s) { return { pending: '대기', approved: '승인', rejected: '거절' }[s] || s; }
async function approveUser(id) {
  try { await Api.adminApproveUser(id); toast('승인되었습니다.', 'success'); renderAdminPanel(); } catch (e) { apiErr(e); }
}
async function rejectUser(id) {
  if (!confirm('가입을 거절하시겠습니까?')) return;
  try { await Api.adminRejectUser(id); toast('거절되었습니다.', 'success'); renderAdminPanel(); } catch (e) { apiErr(e); }
}
function openEditUserModal(id, name, role) {
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>회원 정보 수정</h2><button class="btn btn-ghost btn-sm" onclick="renderAdminPanel()">✕</button></div>
      <div class="field"><label>이름</label><input id="eu-name" type="text" value="${escapeAttr(name)}"></div>
      <div class="field mt-8"><label>권한</label><select id="eu-role"><option value="user" ${role === 'user' ? 'selected' : ''}>일반</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>관리자</option></select></div>
      <div class="field mt-8"><label>새 비밀번호 (변경 시에만 입력)</label><input id="eu-pw" type="password"></div>
      <div class="modal-footer"><button class="btn" onclick="renderAdminPanel()">취소</button><button class="btn btn-primary" onclick="submitEditUser('${id}')">저장</button></div>
    </div>
  </div>`);
}
async function submitEditUser(id) {
  const fields = { name: document.getElementById('eu-name').value.trim(), role: document.getElementById('eu-role').value };
  const pw = document.getElementById('eu-pw').value;
  if (pw) fields.password = pw;
  try { await Api.adminUpdateUser(id, fields); toast('저장되었습니다.', 'success'); renderAdminPanel(); } catch (e) { apiErr(e); }
}

/* ================= 공용 모달 유틸 ================= */
function showModal(html) { document.getElementById('modal-host').innerHTML = html; }
function closeModal() { document.getElementById('modal-host').innerHTML = ''; }
function promptModal(title, placeholder, onSubmit) {
  showModal(`<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header"><h2>${escapeHtml(title)}</h2><button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button></div>
      <div class="field"><input type="text" id="prompt-input" placeholder="${escapeAttr(placeholder)}" autofocus onkeyup="if(event.key==='Enter') document.getElementById('prompt-submit').click()"></div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal()">취소</button>
        <button class="btn btn-primary" id="prompt-submit">확인</button>
      </div>
    </div>
  </div>`);
  document.getElementById('prompt-submit').onclick = () => {
    const val = document.getElementById('prompt-input').value.trim();
    if (!val) { toast('값을 입력하세요.', 'error'); return; }
    onSubmit(val);
  };
}

/* ================= 유틸 ================= */
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('ko-KR');
}
function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString('ko-KR');
}
