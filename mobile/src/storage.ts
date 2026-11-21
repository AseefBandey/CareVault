import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import type { Attachment, EmergencyProfile, MedicalRecord, PersonProfile, Reminder, Settings } from './types';
import { DEFAULT_SETTINGS, EMPTY_EMERGENCY } from './types';
import { isSupabaseConfigured, supabase } from './supabase';

const ROOT = 'carevault.native.v1';
const keyFor = (owner: string, kind: string) => `${ROOT}:${owner}:${kind}`;
export const newId = () => Crypto.randomUUID();
export const localOwnerKey = (ownerId: string | null, demo: boolean) => demo ? 'demo' : (ownerId || 'signed-out');

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
export async function writeJson<T>(key: string, value: T): Promise<void> { await AsyncStorage.setItem(key, JSON.stringify(value)); }

export function syntheticSeed(): { records: MedicalRecord[]; people: PersonProfile[] } {
  const meId = '00000000-0000-4000-8000-000000000001';
  const parentId = '00000000-0000-4000-8000-000000000002';
  const now = new Date();
  const date = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const people: PersonProfile[] = [
    { id: meId, fullName: 'Alex Morgan', relationship: 'Me', dateOfBirth: '1998-05-12', createdAt: now.toISOString() },
    { id: parentId, fullName: 'Sam Morgan', relationship: 'Parent', dateOfBirth: '1962-08-20', createdAt: now.toISOString() },
  ];
  const base = (id: string, title: string, documentType: MedicalRecord['documentType'], recordDate: string, personId: string, summary: string, doctorName: string, hospitalName: string): MedicalRecord => ({
    id, title, documentType, recordDate, doctorName, hospitalName, summary, extractedText: `${title}. Synthetic sample document for app preview only.`, tags: [], medicines: [], labValues: [], personId, personName: people.find(p => p.id === personId)?.fullName,
    reviewStatus: 'confirmed', confidence: 0.99, mimeType: 'application/pdf', byteSize: 0, filePath: null, attachments: [], createdAt: now.toISOString(), isFavorite: false, isSensitive: false, syncStatus: 'local',
  });
  const records: MedicalRecord[] = [
    { ...base('00000000-0000-4000-8000-000000000101', 'Annual check-up', 'other', date(-18), meId, 'Synthetic visit note; no real health information.', 'Dr. Taylor', 'Community Clinic'), tags: ['sample', 'check-up'] },
    { ...base('00000000-0000-4000-8000-000000000102', 'Blood test report', 'lab_report', date(-45), meId, 'Synthetic sample values shown only to demonstrate lab charts.', 'Dr. Taylor', 'Community Lab'), tags: ['sample', 'blood test'], labValues: [
      { name: 'Haemoglobin', value: '13.8', unit: 'g/dL', referenceRange: '12.0–16.0', reportMarker: '', date: date(-45) },
      { name: 'Fasting glucose', value: '92', unit: 'mg/dL', referenceRange: 'Report range: 70–99', reportMarker: '', date: date(-45) },
      { name: 'HbA1c', value: '5.4', unit: '%', referenceRange: 'Report range: 4.0–5.6', reportMarker: '', date: date(-45) },
    ] },
    { ...base('00000000-0000-4000-8000-000000000103', 'Prescription — sample', 'prescription', date(-76), parentId, 'Synthetic prescription metadata. Always confirm medicine details with the prescribing clinician.', 'Dr. Khan', 'Family Health Centre'), medicines: ['Sample medicine (not a real prescription)'], tags: ['sample', 'needs review'], reviewStatus: 'needs_review', confidence: 0.62 },
    { ...base('00000000-0000-4000-8000-000000000104', 'Vaccination record', 'vaccination', date(-210), meId, 'Synthetic vaccination entry for demonstration.', 'Clinic Nurse', 'Community Clinic'), tags: ['sample', 'vaccination'], isFavorite: true },
  ];
  return { records, people };
}

export async function loadLocalState(owner: string, demo: boolean): Promise<{ records: MedicalRecord[]; people: PersonProfile[]; reminders: Reminder[]; emergency: EmergencyProfile; settings: Settings }> {
  const seeded = syntheticSeed();
  const records = await readJson<MedicalRecord[]>(keyFor(owner, 'records'), demo ? seeded.records : []);
  const people = await readJson<PersonProfile[]>(keyFor(owner, 'people'), demo ? seeded.people : []);
  const reminders = await readJson<Reminder[]>(keyFor(owner, 'reminders'), []);
  const emergency = await readJson<EmergencyProfile>(keyFor(owner, 'emergency'), EMPTY_EMERGENCY);
  const settings = { ...DEFAULT_SETTINGS, ...(await readJson<Settings>(keyFor(owner, 'settings'), DEFAULT_SETTINGS)) };
  if (demo && !(await AsyncStorage.getItem(keyFor(owner, 'seeded')))) {
    await writeJson(keyFor(owner, 'records'), records); await writeJson(keyFor(owner, 'people'), people);
    await AsyncStorage.setItem(keyFor(owner, 'seeded'), '1');
  }
  return { records, people, reminders, emergency, settings };
}
export async function saveLocalState<T>(owner: string, kind: string, value: T): Promise<void> { await writeJson(keyFor(owner, kind), value); }

function safeFileName(value: string) { return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-90) || 'record'; }
async function readBase64(uri: string): Promise<string> { return FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any }); }
export async function persistSelectedFile(uri: string, name: string, mimeType: string, size = 0, pageOrder = 0): Promise<Attachment> {
  const root = `${FileSystem.documentDirectory || ''}carevault-records/`;
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const fileName = `${newId()}-${safeFileName(name)}`;
  const destination = `${root}${fileName}`;
  try { await FileSystem.copyAsync({ from: uri, to: destination }); } catch { /* Keep provider URI if copying is not supported. */ }
  const localUri = (await FileSystem.getInfoAsync(destination)).exists ? destination : uri;
  let contentHash: string | undefined;
  try { contentHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, await readBase64(localUri)); } catch { /* Hash is only a duplicate hint. */ }
  return { id: newId(), fileName: name || fileName, mimeType: mimeType || 'application/octet-stream', byteSize: Math.max(0, size || 0), localUri, pageOrder, contentHash };
}

export async function uploadRecordToCloud(record: MedicalRecord, ownerId: string): Promise<MedicalRecord> {
  if (!supabase || !isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data: sessionInfo } = await supabase.auth.getSession();
  if (!sessionInfo.session || sessionInfo.session.user.id !== ownerId) throw new Error('Your sign-in session expired. Please sign in again.');
  const owner = sessionInfo.session.user.id;
  const remoteFiles: { attachment: Attachment; path: string }[] = [];
  for (const attachment of record.attachments) {
    // Cloud-only attachments survive metadata edits without downloading and re-uploading the file.
    if (attachment.cloudPath && !attachment.localUri) {
      remoteFiles.push({ attachment, path: attachment.cloudPath });
      continue;
    }
    if (!attachment.localUri) throw new Error(`The original file “${attachment.fileName}” is not available locally. Open it from the record first, or upload a fresh copy.`);
    const safe = safeFileName(attachment.fileName);
    const path = `${owner}/${record.personId || 'general'}/${record.id}-${attachment.pageOrder}-${safe}`;
    const base64 = await readBase64(attachment.localUri);
    const { error: upErr } = await supabase.storage.from('medical-records').upload(path, decode(base64), { contentType: attachment.mimeType, upsert: true });
    if (upErr) throw upErr;
    remoteFiles.push({ attachment, path });
  }
  const mainPath = remoteFiles[0]?.path || record.filePath || null;
  const payload = {
    id: record.id, owner_id: owner, person_id: record.personId, title: record.title, document_type: record.documentType,
    record_date: record.recordDate || null, doctor_name: record.doctorName || null, hospital_name: record.hospitalName || null,
    summary: record.summary || '', extracted_text: record.extractedText || '', tags: record.tags || [], medicines: record.medicines || [],
    lab_values: record.labValues || [], confidence: record.confidence, review_status: record.reviewStatus, is_favorite: record.isFavorite,
    is_sensitive: record.isSensitive, file_path: mainPath, mime_type: record.mimeType, byte_size: record.byteSize, content_hash: record.attachments[0]?.contentHash || null,
  };
  const { error: rowErr } = await supabase.from('medical_records').upsert(payload, { onConflict: 'id' });
  if (rowErr) { if (remoteFiles.length) await supabase.storage.from('medical-records').remove(remoteFiles.map(f => f.path)); throw rowErr; }
  if (remoteFiles.length) {
    const rows = remoteFiles.map(({ attachment, path }) => ({ id: attachment.id, owner_id: owner, record_id: record.id, file_path: path, file_name: attachment.fileName, mime_type: attachment.mimeType, byte_size: attachment.byteSize, page_order: attachment.pageOrder, content_hash: attachment.contentHash || null }));
    const { error: attachmentError } = await supabase.from('record_attachments').upsert(rows, { onConflict: 'id' });
    if (attachmentError) throw attachmentError;
  }
  return { ...record, filePath: mainPath, attachments: record.attachments.map((a, i) => ({ ...a, cloudPath: remoteFiles[i]?.path })), syncStatus: 'synced' };
}

function mapCloudRecord(row: any, cache?: MedicalRecord, attachments: Attachment[] = []): MedicalRecord {
  return {
    id: row.id, title: row.title || 'Untitled record', documentType: row.document_type || 'other', recordDate: row.record_date || null,
    doctorName: row.doctor_name || null, hospitalName: row.hospital_name || null, summary: row.summary || '', extractedText: row.extracted_text || '',
    tags: Array.isArray(row.tags) ? row.tags : [], medicines: Array.isArray(row.medicines) ? row.medicines : [], labValues: Array.isArray(row.lab_values) ? row.lab_values : [],
    personId: row.person_id || null, personName: cache?.personName, reviewStatus: row.review_status === 'confirmed' ? 'confirmed' : 'needs_review',
    confidence: typeof row.confidence === 'number' ? row.confidence : row.confidence == null ? null : Number(row.confidence), mimeType: row.mime_type || 'application/octet-stream',
    byteSize: Number(row.byte_size || 0), filePath: row.file_path || null, localUri: cache?.localUri,
    attachments: attachments.length ? attachments.map(a => ({ ...a, localUri: cache?.attachments.find(c => c.id === a.id)?.localUri || a.localUri })) : (cache?.attachments || []),
    createdAt: row.created_at || new Date().toISOString(), isFavorite: Boolean(row.is_favorite), isSensitive: Boolean(row.is_sensitive), syncStatus: 'synced',
  };
}

export async function refreshFromCloud(cachedRecords: MedicalRecord[], cachedPeople: PersonProfile[]): Promise<{ records: MedicalRecord[]; people: PersonProfile[] }> {
  if (!supabase || !isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const [{ data: rows, error: recordError }, { data: peopleRows, error: peopleError }] = await Promise.all([
    supabase.from('medical_records').select('*').order('record_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    supabase.from('people').select('*').order('created_at', { ascending: true }),
  ]);
  if (recordError) throw recordError;
  if (peopleError) throw peopleError;
  const { data: attachmentRows } = await supabase.from('record_attachments').select('*').order('page_order', { ascending: true });
  const people: PersonProfile[] = (peopleRows || []).map((p: any) => ({ id: p.id, fullName: p.full_name || 'Family member', relationship: p.relationship || 'Other', dateOfBirth: p.date_of_birth || null, createdAt: p.created_at || new Date().toISOString(), syncStatus: 'synced' }));
  const records = (rows || []).map((row: any) => {
    const cached = cachedRecords.find(r => r.id === row.id);
    const files = ((attachmentRows || []) as any[]).filter(a => a.record_id === row.id).map(a => ({ id: a.id, fileName: a.file_name || 'medical-record', mimeType: a.mime_type || 'application/octet-stream', byteSize: Number(a.byte_size || 0), localUri: cached?.attachments.find(c => c.id === a.id)?.localUri || '', cloudPath: a.file_path, pageOrder: Number(a.page_order || 0), contentHash: a.content_hash || undefined }));
    return mapCloudRecord(row, { ...(cached as any), personName: people.find(p => p.id === row.person_id)?.fullName }, files);
  });
  for (const record of cachedRecords) if (record.syncStatus !== 'synced' && !records.some(r => r.id === record.id)) records.push(record);
  return { records, people: people.length ? people : cachedPeople };
}

export async function savePersonToCloud(person: PersonProfile): Promise<PersonProfile> {
  if (!supabase) return person;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return person;
  const { error } = await supabase.from('people').upsert({ id: person.id, owner_id: session.session.user.id, full_name: person.fullName, relationship: person.relationship, date_of_birth: person.dateOfBirth || null }, { onConflict: 'id' });
  if (error) throw error;
  return { ...person, syncStatus: 'synced' };
}

export async function deleteLocalRecordFiles(record: MedicalRecord): Promise<void> {
  const root = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}carevault-records/` : '';
  if (!root) return;
  const uris = new Set([record.localUri, record.filePath, ...record.attachments.map(a => a.localUri)].filter((uri): uri is string => Boolean(uri && uri.startsWith(root))));
  await Promise.all([...uris].map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
}

export async function clearLocalOwner(owner: string): Promise<void> {
  const cached = await readJson<MedicalRecord[]>(keyFor(owner, 'records'), []);
  await Promise.all(cached.map(record => deleteLocalRecordFiles(record)));
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(`${ROOT}:${owner}:`)));
}
