/**
 * 과학실 재고 관리 시스템 - 백엔드 (Google Apps Script)
 * ------------------------------------------------------
 * 이 파일을 Google Apps Script 프로젝트에 붙여넣고 "웹 앱"으로 배포하세요.
 * 자세한 설정 방법은 저장소 루트의 README.md 를 참고하세요.
 */

// ============ 기본 설정 ============
const SHEET_NAMES = {
  USERS: 'Users',
  LOCATIONS: 'Locations',
  TYPES: 'Types',
  VENDORS: 'Vendors',
  ITEMS: 'Items',
  HISTORY: 'History',
  PURCHASES: 'Purchases',
  CONFIG: 'Config'
};

const PURCHASE_STATUS = ['요청', '승인', '주문', '수령'];

// ============ 진입점 ============
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  let payload = {};
  try {
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: '잘못된 요청 형식입니다.' });
  }

  const action = payload.action || (e.parameter && e.parameter.action);
  let result;
  try {
    result = routeAction(action, payload);
  } catch (err) {
    result = { ok: false, error: err.message || String(err) };
  }
  return jsonOut(result);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ 액션 라우터 ============
function routeAction(action, p) {
  switch (action) {
    // ---- 최초 1회 설치 ----
    case 'setup': return setupSpreadsheet();

    // ---- 인증 ----
    case 'signup': return signup(p);
    case 'login': return login(p);
    case 'adminLogin': return adminLogin(p);
    case 'adminListUsers': return adminListUsers(p);
    case 'adminApproveUser': return adminSetUserStatus(p, 'approved');
    case 'adminRejectUser': return adminSetUserStatus(p, 'rejected');
    case 'adminUpdateUser': return adminUpdateUser(p);

    // ---- LAB 관리: 보관위치 ----
    case 'getLocations': return getLocations(p);
    case 'addLocation': return addLocation(p);
    case 'addSubLocation': return addSubLocation(p);
    case 'deleteLocation': return deleteLocation(p);

    // ---- LAB 관리: 타입 ----
    case 'getTypes': return getTypes(p);
    case 'addType': return addType(p);
    case 'deleteType': return deleteType(p);

    // ---- LAB 관리: 판매처 ----
    case 'getVendors': return getVendors(p);
    case 'addVendor': return addVendor(p);
    case 'updateVendor': return updateVendor(p);
    case 'deleteVendor': return deleteVendor(p);

    // ---- LAB 관리: 등록자 ----
    case 'getRegistrants': return getRegistrants(p);
    case 'getItemsByRegistrant': return getItemsByRegistrant(p);

    // ---- 재고관리 ----
    case 'getItems': return getItems(p);
    case 'addItem': return addItem(p);
    case 'bulkAddItems': return bulkAddItems(p);
    case 'updateItem': return updateItem(p);
    case 'updateItemStock': return updateItemStock(p);
    case 'deleteItem': return deleteItem(p);
    case 'uploadPhoto': return uploadPhoto(p);
    case 'deletePhoto': return deletePhoto(p);
    case 'getHistory': return getHistory(p);

    // ---- 구매관리 ----
    case 'addPurchaseRequest': return addPurchaseRequest(p);
    case 'getPurchaseRequests': return getPurchaseRequests(p);
    case 'updatePurchaseStatus': return updatePurchaseStatus(p);
    case 'deletePurchaseRequest': return deletePurchaseRequest(p);

    default: return { ok: false, error: '알 수 없는 요청(action)입니다: ' + action };
  }
}

// ============ 스프레드시트/시트 헬퍼 ============
function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const ss = getSS();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function sheetToObjects(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null)) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);
    rows.push(obj);
  }
  return rows;
}

function appendRowObj(sh, headers, obj) {
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sh.appendRow(row);
}

function findRowIndexById(sh, id) {
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function newId(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0] + Date.now().toString(36);
}

function nowIso() {
  return new Date().toISOString();
}

// ============ 최초 설치 ============
function setupSpreadsheet() {
  const headerMap = {
    [SHEET_NAMES.USERS]: ['id', 'email', 'passwordHash', 'salt', 'name', 'status', 'role', 'sessionToken', 'createdAt'],
    [SHEET_NAMES.LOCATIONS]: ['id', 'mainLocation', 'subLocation', 'createdAt'],
    [SHEET_NAMES.TYPES]: ['id', 'name', 'fieldsJson', 'createdAt'],
    [SHEET_NAMES.VENDORS]: ['id', 'name', 'url', 'contactName', 'contactPhone', 'contactEmail', 'memo', 'createdAt'],
    [SHEET_NAMES.ITEMS]: ['id', 'vendor', 'catalogNo', 'name', 'unitPrice', 'unit', 'stockQty', 'url', 'memo',
      'type', 'typeValuesJson', 'location', 'subLocation', 'expiryDate', 'lot', 'cas',
      'registeredBy', 'photoFileId', 'photoUrl', 'createdAt', 'updatedAt'],
    [SHEET_NAMES.HISTORY]: ['id', 'itemId', 'itemName', 'changeType', 'beforeQty', 'afterQty', 'changedBy', 'timestamp', 'note'],
    [SHEET_NAMES.PURCHASES]: ['id', 'vendor', 'catalogNo', 'name', 'url', 'unit', 'qty', 'unitPrice', 'totalPrice',
      'status', 'requestedBy', 'createdAt', 'updatedAt'],
    [SHEET_NAMES.CONFIG]: ['key', 'value']
  };

  Object.keys(headerMap).forEach(name => {
    const sh = getSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(headerMap[name]);
      sh.setFrozenRows(1);
    }
  });

  // 관리자 비밀번호 기본값 설정 (최초 1회만) - 반드시 로그인 후 변경하세요
  const configSh = getSheet(SHEET_NAMES.CONFIG);
  const configs = sheetToObjects(configSh);
  if (!configs.find(c => c.key === 'adminPasswordHash')) {
    const defaultPw = 'admin1234';
    configSh.appendRow(['adminPasswordHash', hashText(defaultPw)]);
  }
  // 사진 저장용 Drive 폴더 생성
  if (!configs.find(c => c.key === 'driveFolderId')) {
    const folder = DriveApp.createFolder('LabInventoryPhotos');
    configSh.appendRow(['driveFolderId', folder.getId()]);
  }

  return { ok: true, message: '초기 설정이 완료되었습니다. 관리자 기본 비밀번호는 admin1234 입니다. 반드시 변경하세요.' };
}

function getConfig(key) {
  const sh = getSheet(SHEET_NAMES.CONFIG);
  const configs = sheetToObjects(sh);
  const c = configs.find(c => c.key === key);
  return c ? c.value : null;
}

function setConfig(key, value) {
  const sh = getSheet(SHEET_NAMES.CONFIG);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

// ============ 비밀번호 해시 ============
function hashText(text, salt) {
  salt = salt || '';
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text + '::' + salt);
  return raw.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  return Utilities.getUuid();
}

// ============ 인증 ============
function signup(p) {
  const { email, password, name, agreeTerms } = p;
  if (!email || !password || !name) return { ok: false, error: '이메일, 비밀번호, 이름을 모두 입력하세요.' };
  if (!agreeTerms) return { ok: false, error: '약관에 동의해야 회원가입이 가능합니다.' };

  const sh = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(sh);
  if (users.find(u => u.email === email)) return { ok: false, error: '이미 가입된 이메일입니다.' };

  const salt = randomSalt();
  const user = {
    id: newId('user'),
    email: email,
    passwordHash: hashText(password, salt),
    salt: salt,
    name: name,
    status: 'pending', // pending -> approved / rejected
    role: 'user',
    sessionToken: '',
    createdAt: nowIso()
  };
  appendRowObj(sh, ['id', 'email', 'passwordHash', 'salt', 'name', 'status', 'role', 'sessionToken', 'createdAt'], user);
  return { ok: true, message: '회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' };
}

function login(p) {
  const { email, password } = p;
  const sh = getSheet(SHEET_NAMES.USERS);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);
    if (obj.email === email) {
      if (obj.status !== 'approved') return { ok: false, error: '아직 관리자 승인이 완료되지 않은 계정입니다.' };
      const hash = hashText(password, obj.salt);
      if (hash !== obj.passwordHash) return { ok: false, error: '비밀번호가 일치하지 않습니다.' };
      const token = Utilities.getUuid();
      sh.getRange(i + 1, headers.indexOf('sessionToken') + 1).setValue(token);
      return { ok: true, token: token, user: { id: obj.id, email: obj.email, name: obj.name, role: obj.role } };
    }
  }
  return { ok: false, error: '등록되지 않은 이메일입니다.' };
}

function verifyUser(token, email) {
  const sh = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(sh);
  const u = users.find(u => u.sessionToken === token && u.email === email);
  return u || null;
}

function requireUser(p) {
  const u = verifyUser(p.token, p.email);
  if (!u) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
  return u;
}

function adminLogin(p) {
  const { password } = p;
  const stored = getConfig('adminPasswordHash');
  if (hashText(password) === stored) {
    return { ok: true, adminToken: hashText('admin::' + new Date().toDateString()) };
  }
  return { ok: false, error: '관리자 비밀번호가 일치하지 않습니다.' };
}

function requireAdmin(p) {
  const expected = hashText('admin::' + new Date().toDateString());
  if (p.adminToken !== expected) throw new Error('관리자 인증이 필요합니다.');
}

function adminListUsers(p) {
  requireAdmin(p);
  const sh = getSheet(SHEET_NAMES.USERS);
  const users = sheetToObjects(sh).map(u => ({
    id: u.id, email: u.email, name: u.name, status: u.status, role: u.role, createdAt: u.createdAt
  }));
  return { ok: true, users: users };
}

function adminSetUserStatus(p, status) {
  requireAdmin(p);
  const sh = getSheet(SHEET_NAMES.USERS);
  const idx = findRowIndexById(sh, p.userId);
  if (idx < 0) return { ok: false, error: '사용자를 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  sh.getRange(idx, headers.indexOf('status') + 1).setValue(status);
  return { ok: true, message: '상태가 변경되었습니다.' };
}

function adminUpdateUser(p) {
  requireAdmin(p);
  const sh = getSheet(SHEET_NAMES.USERS);
  const idx = findRowIndexById(sh, p.userId);
  if (idx < 0) return { ok: false, error: '사용자를 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  const fields = p.fields || {};
  Object.keys(fields).forEach(key => {
    const col = headers.indexOf(key);
    if (col === -1) return;
    if (key === 'password') return; // 비밀번호는 별도 처리
    sh.getRange(idx, col + 1).setValue(fields[key]);
  });
  if (fields.password) {
    const saltCol = headers.indexOf('salt');
    const salt = randomSalt();
    sh.getRange(idx, saltCol + 1).setValue(salt);
    sh.getRange(idx, headers.indexOf('passwordHash') + 1).setValue(hashText(fields.password, salt));
  }
  return { ok: true, message: '회원 정보가 수정되었습니다.' };
}

// ============ LAB 관리: 보관위치 ============
function getLocations(p) {
  const sh = getSheet(SHEET_NAMES.LOCATIONS);
  let list = sheetToObjects(sh);
  if (p.query) {
    const q = p.query.toLowerCase();
    list = list.filter(l => (l.mainLocation + ' ' + l.subLocation).toLowerCase().includes(q));
  }
  if (p.sortBy === 'name') {
    list.sort((a, b) => String(a.mainLocation).localeCompare(String(b.mainLocation)));
  } else if (p.sortBy === 'name_desc') {
    list.sort((a, b) => String(b.mainLocation).localeCompare(String(a.mainLocation)));
  }
  return { ok: true, locations: list };
}

function addLocation(p) {
  const sh = getSheet(SHEET_NAMES.LOCATIONS);
  const obj = { id: newId('loc'), mainLocation: p.mainLocation, subLocation: '', createdAt: nowIso() };
  appendRowObj(sh, ['id', 'mainLocation', 'subLocation', 'createdAt'], obj);
  return { ok: true, location: obj };
}

function addSubLocation(p) {
  const sh = getSheet(SHEET_NAMES.LOCATIONS);
  const parentIdx = findRowIndexById(sh, p.locationId);
  if (parentIdx < 0) return { ok: false, error: '상위 보관위치를 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  const mainLocation = sh.getRange(parentIdx, headers.indexOf('mainLocation') + 1).getValue();
  const obj = { id: newId('loc'), mainLocation: mainLocation, subLocation: p.subLocation, createdAt: nowIso() };
  appendRowObj(sh, headers, obj);
  return { ok: true, location: obj };
}

function deleteLocation(p) {
  const sh = getSheet(SHEET_NAMES.LOCATIONS);
  const idx = findRowIndexById(sh, p.locationId);
  if (idx > 0) sh.deleteRow(idx);
  return { ok: true };
}

// ============ LAB 관리: 타입 ============
function getTypes(p) {
  const sh = getSheet(SHEET_NAMES.TYPES);
  const list = sheetToObjects(sh).map(t => ({ ...t, fields: safeParseJson(t.fieldsJson, []) }));
  return { ok: true, types: list };
}

function addType(p) {
  const sh = getSheet(SHEET_NAMES.TYPES);
  const obj = { id: newId('type'), name: p.name, fieldsJson: JSON.stringify(p.fields || []), createdAt: nowIso() };
  appendRowObj(sh, ['id', 'name', 'fieldsJson', 'createdAt'], obj);
  return { ok: true, type: { ...obj, fields: p.fields || [] } };
}

function deleteType(p) {
  const sh = getSheet(SHEET_NAMES.TYPES);
  const idx = findRowIndexById(sh, p.typeId);
  if (idx > 0) sh.deleteRow(idx);
  return { ok: true };
}

function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

// ============ LAB 관리: 판매처 ============
function getVendors(p) {
  const sh = getSheet(SHEET_NAMES.VENDORS);
  return { ok: true, vendors: sheetToObjects(sh) };
}

function addVendor(p) {
  const sh = getSheet(SHEET_NAMES.VENDORS);
  const obj = {
    id: newId('vendor'), name: p.name, url: p.url || '', contactName: p.contactName || '',
    contactPhone: p.contactPhone || '', contactEmail: p.contactEmail || '', memo: p.memo || '', createdAt: nowIso()
  };
  appendRowObj(sh, ['id', 'name', 'url', 'contactName', 'contactPhone', 'contactEmail', 'memo', 'createdAt'], obj);
  return { ok: true, vendor: obj };
}

function updateVendor(p) {
  const sh = getSheet(SHEET_NAMES.VENDORS);
  const idx = findRowIndexById(sh, p.vendorId);
  if (idx < 0) return { ok: false, error: '판매처를 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  Object.keys(p.fields || {}).forEach(key => {
    const col = headers.indexOf(key);
    if (col > -1) sh.getRange(idx, col + 1).setValue(p.fields[key]);
  });
  return { ok: true };
}

function deleteVendor(p) {
  const sh = getSheet(SHEET_NAMES.VENDORS);
  const idx = findRowIndexById(sh, p.vendorId);
  if (idx > 0) sh.deleteRow(idx);
  return { ok: true };
}

// ============ LAB 관리: 등록자 ============
function getRegistrants(p) {
  const sh = getSheet(SHEET_NAMES.ITEMS);
  const items = sheetToObjects(sh);
  const names = [...new Set(items.map(i => i.registeredBy).filter(Boolean))];
  return { ok: true, registrants: names };
}

function getItemsByRegistrant(p) {
  const sh = getSheet(SHEET_NAMES.ITEMS);
  const items = sheetToObjects(sh).filter(i => i.registeredBy === p.registrant);
  return { ok: true, items: items };
}

// ============ 재고관리 ============
const ITEM_HEADERS = ['id', 'vendor', 'catalogNo', 'name', 'unitPrice', 'unit', 'stockQty', 'url', 'memo',
  'type', 'typeValuesJson', 'location', 'subLocation', 'expiryDate', 'lot', 'cas',
  'registeredBy', 'photoFileId', 'photoUrl', 'createdAt', 'updatedAt'];

function getItems(p) {
  const sh = getSheet(SHEET_NAMES.ITEMS);
  let items = sheetToObjects(sh);
  if (p.query) {
    const q = p.query.toLowerCase();
    items = items.filter(i => JSON.stringify(i).toLowerCase().includes(q));
  }
  return { ok: true, items: items };
}

function addItem(p) {
  const d = p.item || {};
  const sh = getSheet(SHEET_NAMES.ITEMS);
  const obj = {
    id: newId('item'),
    vendor: d.vendor || '', catalogNo: d.catalogNo || '', name: d.name || '',
    unitPrice: d.unitPrice || 0, unit: d.unit || '', stockQty: d.stockQty || 0,
    url: d.url || '', memo: d.memo || '', type: d.type || '',
    typeValuesJson: JSON.stringify(d.typeValues || {}),
    location: d.location || '', subLocation: d.subLocation || '',
    expiryDate: d.expiryDate || '', lot: d.lot || '', cas: d.cas || '',
    registeredBy: d.registeredBy || '', photoFileId: '', photoUrl: '',
    createdAt: nowIso(), updatedAt: nowIso()
  };
  appendRowObj(sh, ITEM_HEADERS, obj);

  logHistory(obj.id, obj.name, '등록', 0, obj.stockQty, d.registeredBy, '신규 물품 등록');
  return { ok: true, item: obj };
}

function bulkAddItems(p) {
  const items = p.items || [];
  const results = [];
  items.forEach(d => {
    results.push(addItem({ item: d }));
  });
  return { ok: true, count: results.length };
}

function updateItem(p) {
  const sh = getSheet(SHEET_NAMES.ITEMS);
  const idx = findRowIndexById(sh, p.itemId);
  if (idx < 0) return { ok: false, error: '물품을 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  const fields = p.fields || {};
  Object.keys(fields).forEach(key => {
    const col = headers.indexOf(key === 'typeValues' ? 'typeValuesJson' : key);
    if (col === -1) return;
    const val = key === 'typeValues' ? JSON.stringify(fields[key]) : fields[key];
    sh.getRange(idx, col + 1).setValue(val);
  });
  sh.getRange(idx, headers.indexOf('updatedAt') + 1).setValue(nowIso());
  return { ok: true };
}

function updateItemStock(p) {
  const sh = getSheet(SHEET_NAMES.ITEMS);
  const idx = findRowIndexById(sh, p.itemId);
  if (idx < 0) return { ok: false, error: '물품을 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  const qtyCol = headers.indexOf('stockQty') + 1;
  const beforeQty = sh.getRange(idx, qtyCol).getValue();
  sh.getRange(idx, qtyCol).setValue(p.newQty);
  sh.getRange(idx, headers.indexOf('updatedAt') + 1).setValue(nowIso());
  const itemName = sh.getRange(idx, headers.indexOf('name') + 1).getValue();

  logHistory(p.itemId, itemName, p.newQty > beforeQty ? '증가' : '감소', beforeQty, p.newQty, p.changedBy, p.note || '');
  return { ok: true };
}

function deleteItem(p) {
  const sh = getSheet(SHEET_NAMES.ITEMS);
  const idx = findRowIndexById(sh, p.itemId);
  if (idx > 0) sh.deleteRow(idx);
  return { ok: true };
}

function logHistory(itemId, itemName, changeType, beforeQty, afterQty, changedBy, note) {
  const sh = getSheet(SHEET_NAMES.HISTORY);
  const obj = {
    id: newId('hist'), itemId: itemId, itemName: itemName, changeType: changeType,
    beforeQty: beforeQty, afterQty: afterQty, changedBy: changedBy || '', timestamp: nowIso(), note: note || ''
  };
  appendRowObj(sh, ['id', 'itemId', 'itemName', 'changeType', 'beforeQty', 'afterQty', 'changedBy', 'timestamp', 'note'], obj);
}

function getHistory(p) {
  const sh = getSheet(SHEET_NAMES.HISTORY);
  let list = sheetToObjects(sh);
  if (p.itemId) list = list.filter(h => h.itemId === p.itemId);
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return { ok: true, history: list };
}

// ---- 사진 업로드 (Drive) ----
function uploadPhoto(p) {
  const folderId = getConfig('driveFolderId');
  const folder = DriveApp.getFolderById(folderId);
  const bytes = Utilities.base64Decode(p.base64.split(',').pop());
  const blob = Utilities.newBlob(bytes, p.mimeType || 'image/jpeg', p.filename || (newId('photo') + '.jpg'));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileUrl = 'https://drive.google.com/uc?id=' + file.getId();

  if (p.itemId) {
    const sh = getSheet(SHEET_NAMES.ITEMS);
    const idx = findRowIndexById(sh, p.itemId);
    if (idx > 0) {
      const headers = sh.getDataRange().getValues()[0];
      sh.getRange(idx, headers.indexOf('photoFileId') + 1).setValue(file.getId());
      sh.getRange(idx, headers.indexOf('photoUrl') + 1).setValue(fileUrl);
    }
  }
  return { ok: true, fileId: file.getId(), url: fileUrl };
}

function deletePhoto(p) {
  const sh = getSheet(SHEET_NAMES.ITEMS);
  const idx = findRowIndexById(sh, p.itemId);
  if (idx < 0) return { ok: false, error: '물품을 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  const fileIdCol = headers.indexOf('photoFileId') + 1;
  const fileId = sh.getRange(idx, fileIdCol).getValue();
  if (fileId) {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
  }
  sh.getRange(idx, fileIdCol).setValue('');
  sh.getRange(idx, headers.indexOf('photoUrl') + 1).setValue('');
  return { ok: true };
}

// ============ 구매관리 ============
function addPurchaseRequest(p) {
  const d = p.request || {};
  const sh = getSheet(SHEET_NAMES.PURCHASES);
  const total = (Number(d.qty) || 0) * (Number(d.unitPrice) || 0);
  const obj = {
    id: newId('po'), vendor: d.vendor || '', catalogNo: d.catalogNo || '', name: d.name || '',
    url: d.url || '', unit: d.unit || '', qty: d.qty || 0, unitPrice: d.unitPrice || 0,
    totalPrice: total, status: '요청', requestedBy: d.requestedBy || '',
    createdAt: nowIso(), updatedAt: nowIso()
  };
  appendRowObj(sh, ['id', 'vendor', 'catalogNo', 'name', 'url', 'unit', 'qty', 'unitPrice', 'totalPrice',
    'status', 'requestedBy', 'createdAt', 'updatedAt'], obj);
  return { ok: true, request: obj };
}

function getPurchaseRequests(p) {
  const sh = getSheet(SHEET_NAMES.PURCHASES);
  let list = sheetToObjects(sh);
  if (p.status) list = list.filter(r => r.status === p.status);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { ok: true, requests: list };
}

function updatePurchaseStatus(p) {
  const sh = getSheet(SHEET_NAMES.PURCHASES);
  const idx = findRowIndexById(sh, p.requestId);
  if (idx < 0) return { ok: false, error: '구매 요청을 찾을 수 없습니다.' };
  const headers = sh.getDataRange().getValues()[0];
  if (PURCHASE_STATUS.indexOf(p.newStatus) === -1) return { ok: false, error: '잘못된 진행 상태입니다.' };
  sh.getRange(idx, headers.indexOf('status') + 1).setValue(p.newStatus);
  sh.getRange(idx, headers.indexOf('updatedAt') + 1).setValue(nowIso());

  // 수령 처리 시 -> 기존 재고에 자동 반영 (동일 판매처+카탈로그번호 물품이 있으면 수량 증가, 없으면 신규 등록)
  if (p.newStatus === '수령') {
    const row = {};
    headers.forEach((h, i) => row[h] = sh.getRange(idx, i + 1).getValue());
    reflectReceivedToStock(row, p.changedBy);
  }
  return { ok: true };
}

function reflectReceivedToStock(po, changedBy) {
  const itemSh = getSheet(SHEET_NAMES.ITEMS);
  const items = sheetToObjects(itemSh);
  const existing = items.find(i => i.vendor === po.vendor && i.catalogNo === po.catalogNo && po.catalogNo);

  if (existing) {
    const idx = findRowIndexById(itemSh, existing.id);
    const headers = itemSh.getDataRange().getValues()[0];
    const qtyCol = headers.indexOf('stockQty') + 1;
    const beforeQty = itemSh.getRange(idx, qtyCol).getValue();
    const afterQty = Number(beforeQty) + Number(po.qty);
    itemSh.getRange(idx, qtyCol).setValue(afterQty);
    itemSh.getRange(idx, headers.indexOf('updatedAt') + 1).setValue(nowIso());
    logHistory(existing.id, existing.name, '수령반영', beforeQty, afterQty, changedBy, '구매요청 수령으로 재고 자동 반영 (PO: ' + po.id + ')');
  } else {
    addItem({
      item: {
        vendor: po.vendor, catalogNo: po.catalogNo, name: po.name, unitPrice: po.unitPrice,
        unit: po.unit, stockQty: po.qty, url: po.url, registeredBy: changedBy,
        memo: '구매요청 수령으로 자동 등록 (PO: ' + po.id + ')'
      }
    });
  }
}

function deletePurchaseRequest(p) {
  const sh = getSheet(SHEET_NAMES.PURCHASES);
  const idx = findRowIndexById(sh, p.requestId);
  if (idx > 0) sh.deleteRow(idx);
  return { ok: true };
}
