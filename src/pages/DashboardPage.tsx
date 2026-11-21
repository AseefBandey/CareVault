import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Activity, ArrowUpRight, Bell, BookOpenText, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleAlert, Clock3, Copy, Crown, ExternalLink, FileCheck2, FileImage,
  FileText, Filter, Globe, HeartPulse, HelpCircle, House, LockKeyhole, LogOut, Menu,
  Moon, MoreHorizontal, Phone, Plus, QrCode, Search, Share2, ShieldAlert, ShieldCheck,
  Sparkles, Star, Sun, Trash2, RotateCcw, Upload, UserRound, Users, Volume2, X, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { vaultApi } from '../services/vaultApi';
import {
  DOCUMENT_TYPES,
  type DocumentType,
  type EmergencyProfile,
  EMPTY_EMERGENCY,
  type MedicalRecord,
  type PersonProfile,
  type QAResult,
  type RecordDraft,
  type Reminder,
  type ShareLinkInfo,
  type TermExplanation,
} from '../types/medical';
import type { VaultUser } from '../services/authService';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

type MainPlace = 'home' | 'records' | 'people';
type ModalName =
  | 'auth'
  | 'upload'
  | 'detail'
  | 'person'
  | 'summary'
  | 'privacy'
  | 'labs'
  | 'ask'
  | 'explain'
  | 'emergency'
  | 'reminders'
  | 'share'
  | 'doctor_share_preview'
  | 'premium'
  | 'appointment'
  | 'settings'
  | 'tech_stack'
  | null;

const DEMO_PEOPLE: PersonProfile[] = [
  { id: 'demo-self', fullName: 'Alex Morgan', relationship: 'Me', dateOfBirth: '1998-04-12', createdAt: '2026-01-02T10:00:00.000Z' },
  { id: 'demo-parent', fullName: 'Sam Morgan', relationship: 'Parent', dateOfBirth: '1964-09-21', createdAt: '2026-01-02T10:00:00.000Z' },
];

const DEMO_EMERGENCY: EmergencyProfile = {
  bloodGroup: 'B+',
  allergies: 'Penicillin (mild skin rash recorded 2021)',
  conditions: 'Mild Hypothyroidism (diagnosed March 2023)',
  emergencyContactName: 'Sam Morgan (Parent)',
  emergencyContactPhone: '+91 98765 43210',
  notes: 'All medical records are organised in CareVault.',
};

const PREVIEW_RECORDS_KEY = 'carevault.preview.records';
const PREVIEW_PEOPLE_KEY = 'carevault.preview.people';
const PREVIEW_REMINDERS_KEY = 'carevault.preview.reminders';
const PREVIEW_EMERGENCY_KEY = 'carevault.preview.emergency';

function getInitialPreviewRecords(): MedicalRecord[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(PREVIEW_RECORDS_KEY) : null;
    return raw ? (JSON.parse(raw) as MedicalRecord[]) : DEMO_RECORDS;
  } catch {
    return DEMO_RECORDS;
  }
}

function getInitialPreviewPeople(): PersonProfile[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(PREVIEW_PEOPLE_KEY) : null;
    return raw ? (JSON.parse(raw) as PersonProfile[]) : DEMO_PEOPLE;
  } catch {
    return DEMO_PEOPLE;
  }
}

function getInitialPreviewReminders(): Reminder[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(PREVIEW_REMINDERS_KEY) : null;
    return raw ? (JSON.parse(raw) as Reminder[]) : DEMO_REMINDERS;
  } catch {
    return DEMO_REMINDERS;
  }
}

function getInitialPreviewEmergency(): EmergencyProfile {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(PREVIEW_EMERGENCY_KEY) : null;
    return raw ? (JSON.parse(raw) as EmergencyProfile) : DEMO_EMERGENCY;
  } catch {
    return DEMO_EMERGENCY;
  }
}

const DEMO_REMINDERS: Reminder[] = [
  { id: 'rem-1', title: 'Repeat Thyroid test (TSH & Free T4)', dueAt: '2026-12-15T09:00:00.000Z', note: 'Fasting sample required by lab', personId: 'demo-self', done: false },
  { id: 'rem-2', title: 'Cardiology follow-up with Dr. Sharma', dueAt: '2027-01-20T10:30:00.000Z', note: 'Bring latest ECG and blood pressure log', personId: 'demo-parent', done: false },
];

const DEMO_RECORDS: MedicalRecord[] = [
  {
    id: 'demo-1', title: 'Comprehensive Metabolic & Lipid Panel', documentType: 'lab_report', recordDate: '2026-10-12',
    doctorName: 'Dr. A. Shah', hospitalName: 'Apex Diagnostics & Lab', summary: 'Routine fasting metabolic and blood sugar panel.',
    extractedText: 'Patient: Alex Morgan. HbA1c: 5.4%, Fasting Glucose: 92 mg/dL, Total Cholesterol: 182 mg/dL, TSH: 2.4 uIU/mL.',
    tags: ['Blood test', 'Check-up', 'Thyroid'], medicines: [],
    labValues: [
      { name: 'HbA1c', value: '5.4', unit: '%', referenceRange: '4.0–5.6 % (Normal)', date: '2026-10-12' },
      { name: 'Fasting Blood Glucose', value: '92', unit: 'mg/dL', referenceRange: '70–99 mg/dL', date: '2026-10-12' },
      { name: 'TSH', value: '2.4', unit: 'uIU/mL', referenceRange: '0.45–4.5 uIU/mL', date: '2026-10-12' },
      { name: 'Total Cholesterol', value: '182', unit: 'mg/dL', referenceRange: '< 200 mg/dL', date: '2026-10-12' },
    ],
    personId: 'demo-self', personName: 'Alex Morgan', reviewStatus: 'confirmed', confidence: 0.98,
    mimeType: 'application/pdf', byteSize: 482000, filePath: null, createdAt: '2026-10-12T09:00:00.000Z', isFavorite: true,
  },
  {
    id: 'demo-2', title: 'Annual Health Check & Blood Chemistry', documentType: 'lab_report', recordDate: '2026-05-18',
    doctorName: 'Dr. A. Shah', hospitalName: 'Apex Diagnostics & Lab', summary: 'Prior laboratory values from six months ago.',
    extractedText: 'HbA1c: 5.7%, Fasting Glucose: 104 mg/dL, TSH: 3.8 uIU/mL.', tags: ['Blood test', 'Check-up'], medicines: [],
    labValues: [
      { name: 'HbA1c', value: '5.7', unit: '%', referenceRange: '4.0–5.6 %', reportMarker: 'Borderline', date: '2026-05-18' },
      { name: 'Fasting Blood Glucose', value: '104', unit: 'mg/dL', referenceRange: '70–99 mg/dL', reportMarker: 'High', date: '2026-05-18' },
      { name: 'TSH', value: '3.8', unit: 'uIU/mL', referenceRange: '0.45–4.5 uIU/mL', date: '2026-05-18' },
    ],
    personId: 'demo-self', personName: 'Alex Morgan', reviewStatus: 'confirmed', confidence: 0.96,
    mimeType: 'application/pdf', byteSize: 310000, filePath: null, createdAt: '2026-05-18T10:00:00.000Z', isFavorite: false,
  },
  {
    id: 'demo-3', title: 'Prescription — Endocrinology Consultation', documentType: 'prescription', recordDate: '2026-09-24',
    doctorName: 'Dr. M. Khan', hospitalName: 'City Endocrine & Family Care', summary: 'Prescription for thyroid hormone replacement and maintenance.',
    extractedText: 'Rx: Levothyroxine 25 mcg OD in morning on empty stomach. Paracetamol 500 mg as needed for headache.', tags: ['Thyroid', 'Prescription'],
    medicines: ['Levothyroxine 25 mcg', 'Paracetamol 500 mg'], labValues: [],
    personId: 'demo-self', personName: 'Alex Morgan', reviewStatus: 'confirmed', confidence: 0.94,
    mimeType: 'image/jpeg', byteSize: 1240000, filePath: null, createdAt: '2026-09-24T11:30:00.000Z', isFavorite: true,
  },
  {
    id: 'demo-4', title: 'Cardiology Consultation & Prescription', documentType: 'prescription', recordDate: '2026-09-10',
    doctorName: 'Dr. V. Sharma', hospitalName: 'Heart & Vascular Institute', summary: 'Hypertension evaluation prescription for parent.',
    extractedText: 'Rx: Amlodipine 5 mg OD after breakfast. Atorvastatin 10 mg at bedtime. Check BP weekly.', tags: ['Cardiology', 'Hypertension'],
    medicines: ['Amlodipine 5 mg', 'Atorvastatin 10 mg'], labValues: [],
    personId: 'demo-parent', personName: 'Sam Morgan', reviewStatus: 'needs_review', confidence: 0.72,
    mimeType: 'image/jpeg', byteSize: 1540000, filePath: null, createdAt: '2026-09-10T14:15:00.000Z', isFavorite: false,
  },
  {
    id: 'demo-5', title: 'Vaccination Certificate — Adult Boosters', documentType: 'vaccination', recordDate: '2026-08-03',
    doctorName: 'Dr. S. Iqbal', hospitalName: 'Community Health Centre', summary: 'Annual influenza booster and Tdap renewal certificate.',
    extractedText: 'Influenza vaccine (quadrivalent) administered. Tdap booster administered left arm.', tags: ['Vaccination', 'Immunity'], medicines: [],
    labValues: [], personId: 'demo-parent', personName: 'Sam Morgan', reviewStatus: 'confirmed', confidence: 0.95,
    mimeType: 'application/pdf', byteSize: 290000, filePath: null, createdAt: '2026-08-03T08:00:00.000Z', isFavorite: false,
  },
  {
    id: 'demo-6', title: 'Discharge Summary — Daycare Endoscopy', documentType: 'discharge_summary', recordDate: '2026-03-12',
    doctorName: 'Dr. R. Kapoor', hospitalName: 'Metro Specialty Hospital', summary: 'Upper GI endoscopy discharge note with mild gastritis findings.',
    extractedText: 'Procedure: Diagnostic upper GI endoscopy. Impression: Mild antral gastritis. Recommended Omeprazole 20 mg for 4 weeks.',
    tags: ['Gastroenterology', 'Hospital'], medicines: ['Omeprazole 20 mg'], labValues: [],
    personId: 'demo-self', personName: 'Alex Morgan', reviewStatus: 'confirmed', confidence: 0.91,
    mimeType: 'application/pdf', byteSize: 640000, filePath: null, createdAt: '2026-03-12T16:00:00.000Z', isFavorite: false,
  },
];

const TYPE_ICON: Record<DocumentType, LucideIcon> = {
  prescription: FileText, lab_report: Activity, scan: FileImage, discharge_summary: BookOpenText,
  bill: FileCheck2, vaccination: ShieldCheck, other: FileText,
};
const TYPE_LABEL: Record<DocumentType, string> = Object.fromEntries(DOCUMENT_TYPES.map(item => [item.value, item.label])) as Record<DocumentType, string>;

const QUERY_SYNONYMS: Record<string, string[]> = {
  sugar: ['glucose', 'hba1c', 'a1c', 'fbs', 'fasting glucose', 'diabetes'],
  glucose: ['sugar', 'hba1c', 'a1c', 'fbs', 'fasting blood sugar'],
  thyroid: ['tsh', 't3', 't4', 'thyroid', 'levothyroxine'],
  pressure: ['hypertension', 'bp', 'blood pressure', 'amlodipine', 'losartan'],
  cholesterol: ['lipid', 'triglycerides', 'ldl', 'hdl', 'atorvastatin'],
  medicine: ['medicines', 'prescription', 'tablet', 'pill', 'rx'],
};

const emptyDraft = (file: File, personId: string): RecordDraft => ({
  title: file.name.replace(/\.[^.]+$/, ''), documentType: 'other', recordDate: new Date().toISOString().slice(0, 10), doctorName: '',
  hospitalName: '', summary: '', extractedText: '', tags: [], medicines: [], structuredMedicines: [], labValues: [], personId, confidence: null,
});

function displayName(user: VaultUser | null): string {
  const metadata = user?.user_metadata || {};
  const name = metadata.full_name || metadata.name || metadata.display_name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return user?.phone || user?.email || 'Your account';
}

function formatDate(date: string | null | undefined): string {
  if (!date) return 'Date not recorded';
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function recordSearchText(record: MedicalRecord): string {
  return [
    record.title, record.doctorName, record.hospitalName, record.summary, record.extractedText,
    ...record.tags, ...record.medicines,
    ...record.labValues.map(value => `${value.name} ${value.value} ${value.unit || ''}`),
  ].join(' ').toLowerCase();
}

const DashboardPage: React.FC = () => {
  const { user, session, loading: authLoading, configured, authError, signInWithEmail, signUpWithEmail, sendPhoneCode, verifyPhoneCode, signInWithGoogle, logout, clearAuthError } = useAuth();
  const [place, setPlace] = useState<MainPlace>('home');
  const [records, setRecords] = useState<MedicalRecord[]>(getInitialPreviewRecords);
  const [people, setPeople] = useState<PersonProfile[]>(getInitialPreviewPeople);
  const [reminders, setReminders] = useState<Reminder[]>(getInitialPreviewReminders);
  const [emergency, setEmergency] = useState<EmergencyProfile>(getInitialPreviewEmergency);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [query, setQuery] = useState('');
  const [remoteMatches, setRemoteMatches] = useState<MedicalRecord[] | null>(null);
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // Modals & UI States
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<RecordDraft | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [duplicate, setDuplicate] = useState<Pick<MedicalRecord, 'id' | 'title' | 'recordDate' | 'documentType'> | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Appearance & Accessibility
  const [isDark, setIsDark] = useState(false);
  const [isLargeText, setIsLargeText] = useState(false);
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'English' | 'اردو' | 'हिन्दी'>('English');

  // Menus & Auth
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [personForm, setPersonForm] = useState({ fullName: '', relationship: 'Parent', dateOfBirth: '' });
  const [personSaving, setPersonSaving] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');

  // Lab Trends State
  const [activeLabTest, setActiveLabTest] = useState<string>('All tests');

  // Grounded Q&A State
  const [askQuestion, setAskQuestion] = useState('');
  const [askResult, setAskResult] = useState<QAResult | null>(null);
  const [asking, setAsking] = useState(false);

  // Term Explainer State
  const [explainTermQuery, setExplainTermQuery] = useState('');
  const [termExplanation, setTermExplanation] = useState<TermExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);

  // Reminders Form State
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');

  // Secure Sharing State
  const [shareLinkInfo, setShareLinkInfo] = useState<ShareLinkInfo | null>(null);
  const [shareDays, setShareDays] = useState(7);
  const [shareQrUrl, setShareQrUrl] = useState('');
  const [sharingBusy, setSharingBusy] = useState(false);

  // Appointment Prep State
  const [appointmentQuestions, setAppointmentQuestions] = useState('');
  const [appointmentPersonId, setAppointmentPersonId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const name = displayName(user);
  const firstName = name.split(/[\s@]/)[0] || 'there';
  const previewMode = !configured;
  const signedIn = Boolean(user && session);
  const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase();

  // Load Data
  useEffect(() => {
    if (!configured) {
      setRecords(getInitialPreviewRecords());
      setPeople(getInitialPreviewPeople());
      setReminders(getInitialPreviewReminders());
      setEmergency(getInitialPreviewEmergency());
      setDataError('');
      return;
    }
    if (!user || !session) {
      setRecords([]);
      setPeople([]);
      setReminders([]);
      setEmergency(EMPTY_EMERGENCY);
      setDataError('');
      return;
    }
    let active = true;
    setDataLoading(true);
    setDataError('');
    Promise.all([
      vaultApi.listRecords(session),
      vaultApi.listPeople(session),
      vaultApi.listReminders(session).catch(() => []),
      vaultApi.getEmergencyProfile(session).catch(() => null),
    ])
      .then(([loadedRecords, loadedPeople, loadedReminders, loadedEmergency]) => {
        if (!active) return;
        const names = new Map(loadedPeople.map(person => [person.id, person.fullName]));
        setRecords(loadedRecords.map(record => ({ ...record, personName: record.personId ? names.get(record.personId) : undefined })));
        setPeople(loadedPeople);
        if (loadedReminders.length) setReminders(loadedReminders);
        if (loadedEmergency) setEmergency(loadedEmergency);
      })
      .catch(error => { if (active) setDataError(error instanceof Error ? error.message : 'Could not load your vault.'); })
      .finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [configured, user, session]);

  // Persist preview data to localStorage
  useEffect(() => {
    if (!configured) {
      try { window.localStorage.setItem(PREVIEW_RECORDS_KEY, JSON.stringify(records)); } catch { /* ignore storage error */ }
    }
  }, [configured, records]);

  useEffect(() => {
    if (!configured) {
      try { window.localStorage.setItem(PREVIEW_PEOPLE_KEY, JSON.stringify(people)); } catch { /* ignore storage error */ }
    }
  }, [configured, people]);

  useEffect(() => {
    if (!configured) {
      try { window.localStorage.setItem(PREVIEW_REMINDERS_KEY, JSON.stringify(reminders)); } catch { /* ignore storage error */ }
    }
  }, [configured, reminders]);

  useEffect(() => {
    if (!configured) {
      try { window.localStorage.setItem(PREVIEW_EMERGENCY_KEY, JSON.stringify(emergency)); } catch { /* ignore storage error */ }
    }
  }, [configured, emergency]);

  const handleResetDemoData = () => {
    try {
      window.localStorage.removeItem(PREVIEW_RECORDS_KEY);
      window.localStorage.removeItem(PREVIEW_PEOPLE_KEY);
      window.localStorage.removeItem(PREVIEW_REMINDERS_KEY);
      window.localStorage.removeItem(PREVIEW_EMERGENCY_KEY);
    } catch { /* ignore storage error */ }
    setRecords(DEMO_RECORDS);
    setPeople(DEMO_PEOPLE);
    setReminders(DEMO_REMINDERS);
    setEmergency(DEMO_EMERGENCY);
    setNotice({ kind: 'success', text: 'Sample records restored.' });
  };

  // Remote Search Debounce
  useEffect(() => {
    if (!configured || !session || !signedIn || query.trim().length < 2) {
      setRemoteMatches(null);
      setRemoteSearchLoading(false);
      return;
    }
    let active = true;
    setRemoteSearchLoading(true);
    const timer = window.setTimeout(() => {
      vaultApi.listRecords(session, query.trim())
        .then(result => { if (active) setRemoteMatches(result); })
        .catch(error => {
          if (active) {
            setRemoteMatches([]);
            setNotice({ kind: 'warning', text: error instanceof Error ? error.message : 'Search is temporarily unavailable.' });
          }
        })
        .finally(() => { if (active) setRemoteSearchLoading(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [configured, session, signedIn, query]);

  // Notice Auto-dismiss
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Filtered Records with Synonym Expansion
  const filteredRecords = useMemo(() => {
    const rawList = configured && signedIn && query.trim().length >= 2 && remoteMatches ? remoteMatches : records;
    const q = query.trim().toLowerCase();

    return rawList.filter(record => {
      if (typeFilter !== 'all' && record.documentType !== typeFilter) return false;
      if (personFilter !== 'all' && record.personId !== personFilter) return false;
      if (reviewFilter === 'review' && record.reviewStatus !== 'needs_review') return false;
      if (reviewFilter === 'favorites' && !record.isFavorite) return false;
      if (doctorFilter.trim() && !(record.doctorName || '').toLowerCase().includes(doctorFilter.trim().toLowerCase())) return false;
      if (hospitalFilter.trim() && !(record.hospitalName || '').toLowerCase().includes(hospitalFilter.trim().toLowerCase())) return false;
      if (dateFrom && (!record.recordDate || record.recordDate < dateFrom)) return false;
      if (dateTo && (!record.recordDate || record.recordDate > dateTo)) return false;
      if (tagFilter && !record.tags.some(tag => tag.toLowerCase() === tagFilter.toLowerCase())) return false;

      if (q) {
        const expandedTerms = [
          q,
          ...Object.entries(QUERY_SYNONYMS).filter(([key]) => key.includes(q) || q.includes(key)).flatMap(([, vals]) => vals),
        ];
        const content = recordSearchText(record);
        if (!expandedTerms.some(term => content.includes(term))) return false;
      }
      return true;
    }).sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt));
  }, [records, remoteMatches, configured, signedIn, query, typeFilter, personFilter, reviewFilter, doctorFilter, hospitalFilter, dateFrom, dateTo, tagFilter]);

  // Derived Values
  const needsReviewCount = records.filter(record => record.reviewStatus === 'needs_review').length;
  const favoriteCount = records.filter(record => record.isFavorite).length;
  const latestRecords = [...records].sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt)).slice(0, 4);
  const nextReminder = reminders.find(r => !r.done && new Date(r.dueAt) > new Date());

  // Lab trend items extracted from records
  const allLabItems = useMemo(() => {
    return records.flatMap(r => r.labValues.map(v => ({
      ...v,
      recordTitle: r.title,
      recordDate: v.date || r.recordDate || '',
      recordId: r.id,
      numeric: Number(v.value.replace(/,/g, '')),
    }))).filter(v => v.name && v.name.trim().length > 0).sort((a, b) => a.recordDate.localeCompare(b.recordDate));
  }, [records]);

  const uniqueLabTestNames = useMemo(() => {
    return [...new Set(allLabItems.map(item => item.name))];
  }, [allLabItems]);

  const filteredLabItems = useMemo(() => {
    if (activeLabTest === 'All tests') return allLabItems;
    return allLabItems.filter(item => item.name.toLowerCase() === activeLabTest.toLowerCase() || item.name.toLowerCase().includes(activeLabTest.toLowerCase()));
  }, [allLabItems, activeLabTest]);

  const maxLabNumeric = useMemo(() => {
    const valid = filteredLabItems.map(v => v.numeric).filter(Number.isFinite);
    return Math.max(1, ...(valid.length ? valid : [100]));
  }, [filteredLabItems]);

  // Handlers
  const openAuth = () => { clearAuthError(); setModal('auth'); };
  const addRecordClick = () => {
    if (configured && !signedIn) { openAuth(); return; }
    fileInputRef.current?.click();
  };

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowed = file.type === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!allowed) {
      setNotice({ kind: 'error', text: 'Choose a PDF, JPG, PNG or WebP file.' });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setNotice({ kind: 'error', text: 'Files must be 15 MB or smaller. Try compressing the scan first.' });
      return;
    }
    setSelectedFile(file);
    setDuplicate(null);
    setAnalysisMessage('');
    setDraft(emptyDraft(file, people[0]?.id || 'demo-self'));
    setTagDraft('');
    setModal('upload');

    if (configured && session && user) {
      setAnalysisConsent(false);
      setAnalysisMessage('AI reading is optional. Choose “Read with AI” to send a copy of this document to the server for transcription.');
      vaultApi.findDuplicate(session, file)
        .then(foundDuplicate => setDuplicate(foundDuplicate))
        .catch(() => {});
    } else {
      setAnalysisConsent(true);
      setAnalysisMessage('Ready to extract details with CareVault AI Pipeline. Click “Read with AI” or edit fields below.');
    }
  };

  const loadSampleFile = async (preset: 'prescription' | 'lab' | 'discharge') => {
    let file: File;
    if (preset === 'prescription') {
      file = new File(
        ['City Endocrine & Family Care. Rx: Levothyroxine 25 mcg OD in morning on empty stomach. Paracetamol 500 mg PRN. Dr. M. Khan'],
        'Prescription_Endocrinology_DrKhan.pdf',
        { type: 'application/pdf' }
      );
    } else if (preset === 'lab') {
      file = new File(
        ['Apex Diagnostics Panel: Fasting Glucose 94 mg/dL, HbA1c 5.5 %, TSH 2.1 uIU/mL, Total Cholesterol 178 mg/dL. Dr. A. Shah'],
        'LabReport_ComprehensiveMetabolic_Apex.pdf',
        { type: 'application/pdf' }
      );
    } else {
      file = new File(
        ['Metro Specialty Hospital Discharge: Daycare Endoscopy. Omeprazole 20 mg OD for 4 weeks. Dr. R. Kapoor'],
        'DischargeSummary_Endoscopy_MetroHospital.pdf',
        { type: 'application/pdf' }
      );
    }
    setSelectedFile(file);
    setDuplicate(null);
    const initialDraft = emptyDraft(file, people[0]?.id || 'demo-self');
    setDraft(initialDraft);
    setTagDraft('');
    setAnalysisConsent(true);
    setAnalyzing(true);
    setModal('upload');
    setAnalysisMessage('Analyzing document structure with CareVault AI Pipeline…');
    try {
      const analysis = await vaultApi.analyzeFile(session, file);
      setDraft({
        ...initialDraft,
        title: analysis.title || initialDraft.title,
        documentType: analysis.documentType || 'other',
        recordDate: analysis.recordDate || initialDraft.recordDate,
        doctorName: analysis.doctorName || '',
        hospitalName: analysis.hospitalName || '',
        summary: analysis.summary || '',
        extractedText: analysis.extractedText || '',
        tags: analysis.tags || [],
        medicines: analysis.medicines || [],
        structuredMedicines: analysis.structuredMedicines || [],
        labValues: analysis.labValues || [],
        confidence: typeof analysis.confidence === 'number' ? analysis.confidence : 0.96,
      });
      setAnalysisMessage('AI extraction complete! Review extracted values below before saving.');
    } catch (e: any) {
      setAnalysisMessage(e?.message || 'AI extraction failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const runAiReading = async () => {
    if (!selectedFile || !draft || !analysisConsent || analyzing) return;
    setAnalyzing(true);
    setAnalysisMessage('Checking AI service… Nothing is saved until you confirm.');
    try {
      await vaultApi.checkAIAvailable();
      setAnalysisMessage('Extracting visible details… Nothing is saved until you confirm.');
      const analysis = await vaultApi.analyzeFile(session, selectedFile);
      setDraft(current => current ? {
        ...current,
        title: analysis.title || current.title,
        documentType: analysis.documentType || 'other',
        recordDate: analysis.recordDate || current.recordDate,
        doctorName: analysis.doctorName || '',
        hospitalName: analysis.hospitalName || '',
        summary: analysis.summary || '',
        extractedText: analysis.extractedText || '',
        tags: analysis.tags || [],
        medicines: analysis.medicines || [],
        structuredMedicines: analysis.structuredMedicines || [],
        labValues: analysis.labValues || [],
        confidence: typeof analysis.confidence === 'number' ? analysis.confidence : 0.95,
      } : current);
      setAnalysisMessage('AI extraction is ready for your review. Check all fields against the original document.');
    } catch (error) {
      setAnalysisMessage(error instanceof Error ? `${error.message} You can enter details manually.` : 'AI reading failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateDraft = <K extends keyof RecordDraft>(key: K, value: RecordDraft[K]) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
  };

  const closeModal = () => {
    setModal(null);
    setSelectedFile(null);
    setDraft(null);
    setSelectedRecord(null);
    setAnalysisMessage('');
    setAnalysisConsent(false);
    setDuplicate(null);
    setShareLinkInfo(null);
    setShareQrUrl('');
  };

  const handleSaveRecord = async () => {
    if (!selectedFile || !draft) return;
    if (!draft.personId) {
      setNotice({ kind: 'warning', text: 'Select a family profile before saving.' });
      return;
    }
    setSaving(true);
    try {
      let created: MedicalRecord;
      if (configured && session && user) {
        created = await vaultApi.saveRecord(session, selectedFile, draft);
        created.personName = people.find(person => person.id === draft.personId)?.fullName;
      } else {
        created = {
          id: `preview-${crypto.randomUUID()}`,
          title: draft.title.trim() || selectedFile.name,
          documentType: draft.documentType,
          recordDate: draft.recordDate || null,
          doctorName: draft.doctorName || null,
          hospitalName: draft.hospitalName || null,
          summary: draft.summary,
          extractedText: draft.extractedText,
          tags: draft.tags,
          medicines: draft.medicines,
          labValues: draft.labValues,
          personId: draft.personId,
          personName: people.find(person => person.id === draft.personId)?.fullName,
          reviewStatus: draft.confidence === null || draft.confidence < 0.86 ? 'needs_review' : 'confirmed',
          confidence: draft.confidence,
          mimeType: selectedFile.type || 'application/octet-stream',
          byteSize: selectedFile.size,
          filePath: null,
          createdAt: new Date().toISOString(),
          isFavorite: false,
        };
      }
      setRecords(current => [created, ...current]);
      setPlace('records');
      closeModal();
      setNotice({ kind: 'success', text: configured ? 'Record saved securely to your vault.' : 'Added to preview timeline.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save the record.' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReviewed = async (record: MedicalRecord) => {
    if (configured && session && user) {
      try { await vaultApi.markReviewed(session, record); }
      catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update review status.' }); return; }
    }
    const updated = { ...record, reviewStatus: 'confirmed' as const };
    setRecords(current => current.map(item => item.id === record.id ? updated : item));
    setSelectedRecord(current => current?.id === record.id ? updated : current);
    setNotice({ kind: 'success', text: 'Marked as reviewed.' });
  };

  const handleToggleFavorite = async (record: MedicalRecord) => {
    if (configured && session && user) {
      try { await vaultApi.toggleFavorite(session, record); }
      catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update favourite.' }); return; }
    }
    setRecords(current => current.map(item => item.id === record.id ? { ...item, isFavorite: !item.isFavorite } : item));
  };

  const handleAddPerson = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!personForm.fullName.trim()) return;
    if (configured && !signedIn) { openAuth(); return; }
    setPersonSaving(true);
    try {
      let added: PersonProfile;
      if (configured && session && user) added = await vaultApi.addPerson(session, personForm);
      else added = { id: `preview-${crypto.randomUUID()}`, fullName: personForm.fullName.trim(), relationship: personForm.relationship, dateOfBirth: personForm.dateOfBirth || null, createdAt: new Date().toISOString() };
      setPeople(current => [...current, added]);
      setPersonForm({ fullName: '', relationship: 'Parent', dateOfBirth: '' });
      setModal(null);
      setNotice({ kind: 'success', text: 'Family profile added.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not add profile.' });
    } finally { setPersonSaving(false); }
  };

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
        setNotice({ kind: 'success', text: 'Account created! If confirmation is required, please check your email.' });
      } else {
        await signInWithEmail(email, password);
        setModal(null);
        setNotice({ kind: 'success', text: 'You are signed in.' });
      }
    } catch { /* context error */ }
    finally { setAuthBusy(false); }
  };

  const openRecord = (record: MedicalRecord) => { setSelectedRecord(record); setModal('detail'); };

  const handleOpenOriginal = async (record: MedicalRecord) => {
    if (!session) return;
    try { const url = await vaultApi.signedFileUrl(session, record); window.open(url, '_blank', 'noopener,noreferrer'); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not open original file.' }); }
  };

  const handleDeleteEverything = async () => {
    if (deletePhrase !== 'DELETE') return;
    if (configured && session && user) {
      setSaving(true);
      try {
        await vaultApi.deleteEverything(session);
        setRecords([]);
        setPeople([]);
        setReminders([]);
        setEmergency(EMPTY_EMERGENCY);
        setModal(null);
        setDeletePhrase('');
        setNotice({ kind: 'success', text: 'All data deleted permanently.' });
      } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not delete.' }); }
      finally { setSaving(false); }
    } else {
      setRecords([]);
      setPeople([]);
      setReminders([]);
      setEmergency(EMPTY_EMERGENCY);
      setModal(null);
      setDeletePhrase('');
      setNotice({ kind: 'success', text: 'Preview records cleared.' });
    }
  };

  // Term Explainer Handler ("What is this?")
  const handleExplainTerm = async (termToLookup?: string) => {
    const queryTerm = (termToLookup || explainTermQuery).trim();
    if (!queryTerm) return;
    setExplaining(true);
    setExplainTermQuery(queryTerm);
    setModal('explain');
    try {
      const result = await vaultApi.explainTerm(session, queryTerm);
      setTermExplanation(result);
    } catch {
      setTermExplanation({
        term: queryTerm,
        category: 'term',
        purpose: 'General medical term.',
        description: `Explanations are provided for general reference. Please confirm details with your doctor or pharmacist.`,
        source: 'MedlinePlus',
        url: 'https://medlineplus.gov/',
        disclaimer: 'General information from your records and trusted sources. Please confirm with your doctor.',
      });
    } finally {
      setExplaining(false);
    }
  };

  // Grounded Ask Records Handler
  const handleAskRecords = async (presetQuestion?: string) => {
    const q = (presetQuestion || askQuestion).trim();
    if (!q) return;
    setAsking(true);
    setAskQuestion(q);
    setModal('ask');
    try {
      const result = await vaultApi.askRecords(session, q, records);
      setAskResult(result);
    } catch {
      setAskResult({
        answer: "I couldn't complete this query right now. Try searching your records in the Records tab or verify backend status.",
        sources: [],
        redirected: false,
        emergency: false,
      });
    } finally {
      setAsking(false);
    }
  };

  // Secure Sharing Creator
  const handleCreateShare = async (record: MedicalRecord) => {
    setSelectedRecord(record);
    setModal('share');
    setSharingBusy(true);
    try {
      let info: ShareLinkInfo;
      if (configured && session && user) {
        info = await vaultApi.createShareLink(session, record.id, shareDays);
      } else {
        const fakeToken = crypto.randomUUID().replaceAll('-', '');
        info = {
          id: `share-${crypto.randomUUID()}`,
          recordId: record.id,
          url: `${window.location.origin}/api/share/${fakeToken}`,
          expiresAt: new Date(Date.now() + shareDays * 24 * 60 * 60 * 1000).toISOString(),
        };
      }
      setShareLinkInfo(info);
      const qrData = await QRCode.toDataURL(info.url, { width: 220, margin: 2, color: { dark: '#147d71', light: '#ffffff' } });
      setShareQrUrl(qrData);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create share link.' });
    } finally {
      setSharingBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!shareLinkInfo) return;
    if (configured && session && user) {
      try {
        await vaultApi.revokeShareLink(session, shareLinkInfo.id);
        setShareLinkInfo(null);
        setShareQrUrl('');
        setNotice({ kind: 'success', text: 'Share link revoked.' });
      } catch (e: any) {
        setNotice({ kind: 'error', text: e?.message || 'Could not revoke share link.' });
      }
    } else {
      setShareLinkInfo(null);
      setShareQrUrl('');
      setNotice({ kind: 'success', text: 'Preview share link cleared.' });
    }
  };

  // Reminders Handler
  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTitle.trim() || !reminderDate) return;
    const newRem: Reminder = {
      id: crypto.randomUUID(),
      title: reminderTitle.trim(),
      dueAt: new Date(reminderDate).toISOString(),
      note: reminderNote.trim(),
      personId: people[0]?.id || null,
      done: false,
    };
    if (configured && session && user) {
      try {
        const saved = await vaultApi.saveReminder(session, newRem);
        setReminders(prev => [...prev, saved].sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
      } catch {
        setReminders(prev => [...prev, newRem].sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
      }
    } else {
      setReminders(prev => [...prev, newRem].sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
    }
    setReminderTitle('');
    setReminderDate('');
    setReminderNote('');
    setNotice({ kind: 'success', text: 'Follow-up reminder scheduled.' });
  };

  const handleToggleReminderDone = async (rem: Reminder) => {
    const nextDone = !rem.done;
    setReminders(prev => prev.map(r => r.id === rem.id ? { ...r, done: nextDone } : r));
    if (configured && session && user) {
      await vaultApi.updateReminderStatus(session, rem.id, nextDone).catch(() => {});
    }
  };

  // Text-To-Speech Read Aloud
  const speakRecord = (record: MedicalRecord) => {
    if (!('speechSynthesis' in window)) {
      setNotice({ kind: 'warning', text: 'Text-to-speech is not supported on this browser.' });
      return;
    }
    window.speechSynthesis.cancel();
    const text = `${record.title}. Recorded on ${formatDate(record.recordDate)}. ${record.summary}. Medicines: ${record.medicines.join(', ') || 'none listed'}.`;
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedLanguage === 'اردو') utterance.lang = 'ur';
    else if (selectedLanguage === 'हिन्दी') utterance.lang = 'hi';
    else utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
    setNotice({ kind: 'success', text: 'Reading summary aloud…' });
  };

  // Summary builder
  const buildDoctorSummary = (personId?: string | null) => {
    const person = people.find(item => item.id === personId) || people[0];
    const selected = records.filter(record => !personId || record.personId === personId).sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt));
    const medicines = Array.from(new Set(selected.flatMap(record => record.medicines))).filter(Boolean);
    const allergies = Array.from(new Set(selected.flatMap(record => record.tags.filter(tag => /allerg/i.test(tag)))));
    const conditions = Array.from(new Set(selected.flatMap(record => record.tags.filter(t => !/sample|check-up|blood test/i.test(t)))));
    const recentLabs = selected.flatMap(r => r.labValues).slice(0, 8);
    return { person, selected, medicines, allergies, conditions, recentLabs };
  };

  if (authLoading) {
    return <div className="boot-screen"><div className="brand-mark"><HeartPulse size={25} /></div><p>Opening your medical vault…</p></div>;
  }

  const navItems: { id: MainPlace; label: string; icon: LucideIcon }[] = [
    { id: 'home', label: 'Home', icon: House },
    { id: 'records', label: 'Records', icon: FileText },
    { id: 'people', label: 'People', icon: Users },
  ];

  return (
    <div className={`app-shell ${isDark ? 'theme-dark' : ''} ${isLargeText ? 'theme-large-text' : ''} ${isSimpleMode ? 'theme-simple-mode' : ''}`}>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onFileSelected} />

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <button type="button" className="brand-lockup" onClick={() => { setPlace('home'); setMobileNavOpen(false); }} aria-label="CareVault home">
          <span className="brand-mark"><HeartPulse size={23} strokeWidth={2.3} /></span>
          <span className="brand-copy"><strong>CareVault</strong><small>Whole medical history, one tap away.</small></span>
        </button>

        <div className="sidebar-caption">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.id} className={`nav-item ${place === item.id ? 'nav-item-active' : ''}`} onClick={() => { setPlace(item.id); setMobileNavOpen(false); }}>
                <Icon size={19} strokeWidth={2} /><span>{item.label}</span>
                {item.id === 'records' && needsReviewCount > 0 && <span className="nav-count">{needsReviewCount}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-caption" style={{ marginTop: '22px' }}>TOOLS</div>
        <nav className="main-nav">
          <button type="button" className="nav-item" onClick={() => { setModal('labs'); setMobileNavOpen(false); }}>
            <Activity size={18} /><span>Lab trends</span>
          </button>
          <button type="button" className="nav-item" onClick={() => { setModal('ask'); setMobileNavOpen(false); }}>
            <Search size={18} /><span>Ask my records</span>
          </button>
          <button type="button" className="nav-item" onClick={() => { setModal('reminders'); setMobileNavOpen(false); }}>
            <Bell size={18} /><span>Reminders</span>{nextReminder && <span className="nav-count">1</span>}
          </button>
          <button type="button" className="nav-item" onClick={() => { setModal('emergency'); setMobileNavOpen(false); }}>
            <ShieldAlert size={18} /><span>Emergency card</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon"><LockKeyhole size={17} /></span>
            <div>
              <strong>Librarian, not a doctor</strong>
              <p>AI organizes your paperwork. You review every extracted field before saving.</p>
            </div>
          </div>
          <button type="button" className="sidebar-action" onClick={() => setModal('settings')}><Globe size={17} /> Accessibility & settings</button>
          <button type="button" className="sidebar-action" onClick={() => setModal('privacy')}><ShieldCheck size={17} /> Privacy & security</button>
          <div className="sidebar-footer">
            <span className="online-dot" /> {previewMode ? 'Local preview' : 'Cloud account'}
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button type="button" className="mobile-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <div className="main-column">
        {/* Topbar */}
        <header className="topbar">
          <button type="button" className="icon-button mobile-menu-button" onClick={() => setMobileNavOpen(open => !open)} aria-label="Toggle navigation"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Vault</span><ChevronRight size={14} /><strong>{navItems.find(item => item.id === place)?.label}</strong></div>
          <div className="topbar-actions">
            <label className="top-search">
              <Search size={17} />
              <input aria-label="Search records" value={query} onChange={event => { setQuery(event.target.value); if (event.target.value.trim()) setPlace('records'); }} placeholder="Search tests, drugs, doctors…" />
              <kbd>⌘ K</kbd>
            </label>
            {previewMode && <span className="preview-pill"><span /> Local Vault</span>}
            <button type="button" className="icon-button" aria-label={isDark ? 'Light mode' : 'Dark mode'} onClick={() => setIsDark(value => !value)} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="icon-button" aria-label="System Architecture & Specs" onClick={() => setModal('tech_stack')} title="System Architecture & Specifications">
              <BookOpenText size={18} />
            </button>
            <button type="button" className="icon-button" aria-label="Settings" onClick={() => setModal('settings')} title="Accessibility settings">
              <Globe size={18} />
            </button>
            {signedIn ? (
              <div className="profile-wrap">
                <button type="button" className="profile-button" onClick={() => setProfileMenuOpen(open => !open)} aria-expanded={profileMenuOpen}>
                  <span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span className="profile-name">{firstName}</span><ChevronDown size={15} />
                </button>
                {profileMenuOpen && (
                  <div className="profile-menu">
                    <div className="profile-menu-identity"><strong>{name}</strong><small>{user?.email || user?.phone}</small></div>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setModal('tech_stack'); }}><BookOpenText size={16} /> System Architecture</button>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setModal('emergency'); }}><ShieldAlert size={16} /> Emergency card</button>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setModal('reminders'); }}><Bell size={16} /> Follow-up reminders</button>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setModal('premium'); }}><Crown size={16} /> CareVault Premium</button>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setModal('privacy'); }}><ShieldCheck size={16} /> Privacy & data</button>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); handleResetDemoData(); }}><RotateCcw size={16} /> Reset sample records</button>
                    <button type="button" onClick={async () => { setProfileMenuOpen(false); await logout(); setRecords([]); setPeople([]); setNotice({ kind: 'success', text: 'Signed out.' }); }}><LogOut size={16} /> Sign out</button>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" className="top-signin" onClick={openAuth}><UserRound size={16} /> Sign in</button>
            )}
          </div>
        </header>

        {dataError && <div className="inline-alert inline-alert-error"><CircleAlert size={17} /><span>{dataError}</span><button type="button" onClick={() => window.location.reload()}>Retry</button></div>}
        {notice && (
          <div className={`toast-notice toast-${notice.kind}`} role="status">
            <span>{notice.kind === 'success' ? <CheckCircle2 size={17} /> : notice.kind === 'error' ? <CircleAlert size={17} /> : <Bell size={17} />}</span>
            {notice.text}
            <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={16} /></button>
          </div>
        )}

        {/* Main Content Area */}
        <main className="main-content">
          {place === 'home' && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">{todayLabel}</div>
                  <h1>{signedIn ? `Welcome back, ${firstName}` : 'Your medical history, one tap away'}<span className="greeting-dot">.</span></h1>
                  <p className="page-lede">Prescriptions, lab reports, doctor notes and family health organised in one calm place.</p>
                </div>
                <button type="button" className="button button-primary button-add" onClick={addRecordClick}><Plus size={18} /> Add record</button>
              </section>

              {configured && !signedIn ? (
                <SignInPrompt onSignIn={openAuth} />
              ) : (
                <>
                  {/* Summary Metric Cards */}
                  <section className="metric-grid" aria-label="Vault summary">
                    <div className="metric-card">
                      <div className="metric-top"><span className="metric-icon icon-mint"><FileText size={19} /></span><span className="metric-note">Timeline</span></div>
                      <div className="metric-number">{records.length}</div>
                      <div className="metric-label">Medical records</div>
                      <div className="metric-foot">Prescriptions, labs & scans</div>
                    </div>
                    <button type="button" className="metric-card metric-card-action" onClick={() => { setPlace('records'); setReviewFilter('review'); }}>
                      <div className="metric-top"><span className="metric-icon icon-amber"><CircleAlert size={19} /></span><span className="metric-note note-amber">Needs attention</span></div>
                      <div className="metric-number">{needsReviewCount}</div>
                      <div className="metric-label">Needs review</div>
                      <div className="metric-foot">Check unconfirmed fields <ArrowUpRight size={13} /></div>
                    </button>
                    <div className="metric-card">
                      <div className="metric-top"><span className="metric-icon icon-lavender"><Users size={19} /></span><span className="metric-note">Family</span></div>
                      <div className="metric-number">{people.length}</div>
                      <div className="metric-label">Family profiles</div>
                      <div className="metric-foot">Parents, children & self</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-top"><span className="metric-icon icon-blue"><Star size={19} /></span><span className="metric-note">Priority</span></div>
                      <div className="metric-number">{favoriteCount}</div>
                      <div className="metric-label">Favourites</div>
                      <div className="metric-foot">Key documents pinned</div>
                    </div>
                  </section>

                  {/* Upcoming Reminder Alert */}
                  {nextReminder && (
                    <div className="preview-banner" style={{ background: '#f5faf7', borderColor: '#c4e5d9', color: '#1a5647' }}>
                      <Bell size={17} style={{ color: '#1b8a6f' }} />
                      <span><strong>Upcoming Reminder:</strong> {nextReminder.title} · {new Date(nextReminder.dueAt).toLocaleDateString()} ({nextReminder.note || 'Scheduled follow-up'})</span>
                      <button type="button" onClick={() => setModal('reminders')} style={{ color: '#147d71' }}>View reminders <ChevronRight size={14} /></button>
                    </div>
                  )}

                  {/* Core Features Quick Grid */}
                  <div style={{ marginTop: '22px' }}>
                    <div className="panel-heading">
                      <div>
                        <h2>Using your records</h2>
                        <p>Essential tools designed for doctor visits, emergencies, and care.</p>
                      </div>
                    </div>
                    <div className="quick-grid">
                      <button type="button" className="quick-card" onClick={() => { setSelectedRecord(null); setModal('summary'); }}>
                        <span className="quick-card-icon icon-teal"><FileCheck2 size={20} /></span>
                        <div className="quick-card-body">
                          <strong>Doctor summary</strong>
                          <small>One-page medical life history ready for new clinicians.</small>
                        </div>
                      </button>

                      <button type="button" className="quick-card" onClick={() => { setAppointmentPersonId(people[0]?.id || ''); setModal('appointment'); }}>
                        <span className="quick-card-icon icon-purple"><Clock3 size={20} /></span>
                        <div className="quick-card-body">
                          <strong>Appointment prep</strong>
                          <small>Summary + recent labs + space for your questions.</small>
                        </div>
                      </button>

                      <button type="button" className="quick-card" onClick={() => setModal('labs')}>
                        <span className="quick-card-icon icon-blue"><Activity size={20} /></span>
                        <div className="quick-card-body">
                          <strong>Lab trends</strong>
                          <small>Values as printed on reports charted over time.</small>
                        </div>
                      </button>

                      <button type="button" className="quick-card" onClick={() => setModal('ask')}>
                        <span className="quick-card-icon icon-orange"><Search size={20} /></span>
                        <div className="quick-card-body">
                          <strong>Ask my records</strong>
                          <small>Search with grounded answers; no medical advice.</small>
                        </div>
                      </button>

                      <button type="button" className="quick-card" onClick={() => setModal('emergency')}>
                        <span className="quick-card-icon icon-red"><ShieldAlert size={20} /></span>
                        <div className="quick-card-body">
                          <strong>Emergency card</strong>
                          <small>Blood group, allergies & emergency contact.</small>
                        </div>
                      </button>

                      <button type="button" className="quick-card" onClick={() => setModal('reminders')}>
                        <span className="quick-card-icon icon-amber"><Bell size={20} /></span>
                        <div className="quick-card-body">
                          <strong>Reminders</strong>
                          <small>Follow-up test dates and clinician appointments.</small>
                        </div>
                      </button>

                      <button type="button" className="quick-card" onClick={() => { setExplainTermQuery(''); setTermExplanation(null); setModal('explain'); }}>
                        <span className="quick-card-icon icon-teal"><HelpCircle size={20} /></span>
                        <div className="quick-card-body">
                          <strong>What is this?</strong>
                          <small>Explain medicines & lab terms using verified sources.</small>
                        </div>
                      </button>

                      <button type="button" className="quick-card" onClick={() => setModal('premium')}>
                        <span className="quick-card-icon icon-purple"><Crown size={20} /></span>
                        <div className="quick-card-body">
                          <strong>CareVault Pro</strong>
                          <small>Family vault, unlimited AI filing & smart search.</small>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Recently Added & Right Rail */}
                  <section className="home-grid" style={{ marginTop: '24px' }}>
                    <div className="panel recent-panel">
                      <div className="panel-heading">
                        <div><h2>Recently added</h2><p>Your latest records, newest first.</p></div>
                        <button type="button" className="text-link" onClick={() => { setPlace('records'); setTypeFilter('all'); setReviewFilter('all'); }}>View all <ArrowUpRight size={15} /></button>
                      </div>
                      {dataLoading ? <LoadingRows /> : latestRecords.length ? (
                        <div className="record-list compact-list">
                          {latestRecords.map(record => (
                            <RecordRow key={record.id} record={record} onClick={() => openRecord(record)} onFavorite={() => handleToggleFavorite(record)} onExplain={() => handleExplainTerm(record.medicines[0] || record.labValues[0]?.name || record.title)} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState icon={FileText} title="No records yet" body="Add a prescription, lab report, scan or discharge note." action="Add record" onAction={addRecordClick} />
                      )}
                    </div>

                    <div className="right-rail">
                      <div className="panel quick-panel">
                        <div className="panel-heading">
                          <div><h2>At a glance</h2><p>Quick lookup.</p></div>
                          <MoreHorizontal size={19} className="muted-icon" />
                        </div>
                        <button type="button" className="quick-action" onClick={addRecordClick}>
                          <span className="quick-icon quick-teal"><Upload size={18} /></span>
                          <span><strong>Add document</strong><small>Upload PDF or photograph</small></span>
                          <ChevronRight size={17} />
                        </button>
                        <button type="button" className="quick-action" onClick={() => handleAskRecords('recent blood reports')}>
                          <span className="quick-icon quick-orange"><Search size={18} /></span>
                          <span><strong>Find blood reports</strong><small>One tap to recent labs</small></span>
                          <ChevronRight size={17} />
                        </button>
                        <button type="button" className="quick-action" onClick={() => setPlace('people')}>
                          <span className="quick-icon quick-purple"><Users size={18} /></span>
                          <span><strong>Family profiles</strong><small>Manage parents and children</small></span>
                          <ChevronRight size={17} />
                        </button>
                      </div>

                      <div className="reassurance-card">
                        <div className="reassurance-symbol"><ShieldCheck size={22} /></div>
                        <div>
                          <strong>Guiding principle</strong>
                          <p>AI reads, sorts and finds. It never diagnoses, predicts or replaces your clinician. Review all extracted facts before saving.</p>
                        </div>
                        <span className="reassurance-spark"><Sparkles size={17} /></span>
                      </div>
                    </div>
                  </section>

                  {/* Medical Timeline */}
                  <section className="panel timeline-panel" style={{ marginTop: '20px' }}>
                    <div className="panel-heading">
                      <div><h2>Timeline</h2><p>Follow your health journey over time.</p></div>
                      <button type="button" className="button button-secondary button-small" onClick={() => setPlace('records')}>Open full timeline <ChevronRight size={15} /></button>
                    </div>
                    <Timeline records={records.slice(0, 5)} onOpen={openRecord} />
                  </section>
                </>
              )}
            </>
          )}

          {/* RECORDS TAB */}
          {place === 'records' && (
            <>
              <section className="welcome-row page-heading-row">
                <div>
                  <div className="eyebrow">YOUR MEDICAL TIMELINE</div>
                  <h1>Medical records<span className="greeting-dot">.</span></h1>
                  <p className="page-lede">Search, filter and access prescriptions, labs and discharge notes in seconds.</p>
                </div>
                <button type="button" className="button button-primary" onClick={addRecordClick}><Plus size={18} /> Add record</button>
              </section>

              {configured && !signedIn ? (
                <SignInPrompt onSignIn={openAuth} />
              ) : (
                <div className="panel records-panel">
                  {/* Search and primary filters */}
                  <div className="records-toolbar">
                    <div className="records-search">
                      <Search size={17} />
                      <input aria-label="Filter records" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search test name, doctor, medicine (e.g. sugar, thyroid, amlodipine)…" />
                      {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
                    </div>

                    <div className="filter-control">
                      <Filter size={16} />
                      <select aria-label="Filter by document type" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
                        <option value="all">All document types</option>
                        {DOCUMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </div>

                    <div className="filter-control">
                      <Users size={16} />
                      <select aria-label="Filter by person" value={personFilter} onChange={event => setPersonFilter(event.target.value)}>
                        <option value="all">All family members</option>
                        {people.map(person => <option key={person.id} value={person.id}>{person.fullName} ({person.relationship})</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Advanced Filters (Doctor, Hospital, Dates) - hidden in simple mode */}
                  {!isSimpleMode && (
                    <div className="advanced-filter-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginTop: '10px' }}>
                      <input className="input-filter" placeholder="Filter doctor…" value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)} style={{ padding: '7px 9px', fontSize: '11px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)' }} />
                      <input className="input-filter" placeholder="Filter hospital / lab…" value={hospitalFilter} onChange={e => setHospitalFilter(e.target.value)} style={{ padding: '7px 9px', fontSize: '11px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)' }} />
                      <input className="input-filter" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" style={{ padding: '7px 9px', fontSize: '11px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)' }} />
                      <input className="input-filter" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" style={{ padding: '7px 9px', fontSize: '11px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)' }} />
                      {(doctorFilter || hospitalFilter || dateFrom || dateTo || tagFilter) && (
                        <button type="button" className="button button-secondary button-small" onClick={() => { setDoctorFilter(''); setHospitalFilter(''); setDateFrom(''); setDateTo(''); setTagFilter(''); }}>Reset filters</button>
                      )}
                    </div>
                  )}

                  {/* Filter chips */}
                  <div className="filter-chips">
                    <button type="button" className={`filter-chip ${reviewFilter === 'all' ? 'filter-chip-active' : ''}`} onClick={() => setReviewFilter('all')}>All records <span>{records.length}</span></button>
                    <button type="button" className={`filter-chip ${reviewFilter === 'review' ? 'filter-chip-active' : ''}`} onClick={() => setReviewFilter(reviewFilter === 'review' ? 'all' : 'review')}>Needs review <span>{needsReviewCount}</span></button>
                    <button type="button" className={`filter-chip ${reviewFilter === 'favorites' ? 'filter-chip-active' : ''}`} onClick={() => setReviewFilter(reviewFilter === 'favorites' ? 'all' : 'favorites')}><Star size={13} /> Favourites <span>{favoriteCount}</span></button>
                    <div className="record-count">{remoteSearchLoading ? 'Searching…' : `${filteredRecords.length} ${filteredRecords.length === 1 ? 'record' : 'records'}`}</div>
                  </div>

                  {/* Records List */}
                  {dataLoading ? <LoadingRows /> : filteredRecords.length ? (
                    <div className="record-list full-record-list">
                      {filteredRecords.map(record => (
                        <RecordRow key={record.id} record={record} onClick={() => openRecord(record)} onFavorite={() => handleToggleFavorite(record)} onExplain={() => handleExplainTerm(record.medicines[0] || record.labValues[0]?.name || record.title)} showPerson />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Search}
                      title={query ? 'No matching records' : 'Your timeline starts here'}
                      body={query ? "Try another search term or clear the active filters." : 'Upload a record to create a searchable medical history.'}
                      action={query ? 'Clear search' : 'Add first record'}
                      onAction={query ? (() => { setQuery(''); setTypeFilter('all'); setPersonFilter('all'); setReviewFilter('all'); setDoctorFilter(''); setHospitalFilter(''); setDateFrom(''); setDateTo(''); }) : addRecordClick}
                    />
                  )}

                  <div className="records-footnote">
                    <LockKeyhole size={14} /> Values & ranges are shown as printed on original reports. AI transcription does not diagnose or interpret clinical results.
                  </div>
                </div>
              )}
            </>
          )}

          {/* PEOPLE (FAMILY PROFILES) TAB */}
          {place === 'people' && (
            <>
              <section className="welcome-row page-heading-row">
                <div>
                  <div className="eyebrow">FAMILY HEALTH PROFILES</div>
                  <h1>People<span className="greeting-dot">.</span></h1>
                  <p className="page-lede">One account, separate histories for parents, children, spouse and self.</p>
                </div>
                <button type="button" className="button button-primary" onClick={() => { if (configured && !signedIn) { openAuth(); return; } setPersonForm({ fullName: '', relationship: 'Parent', dateOfBirth: '' }); setModal('person'); }}><Plus size={18} /> Add person</button>
              </section>

              {configured && !signedIn ? (
                <SignInPrompt onSignIn={openAuth} />
              ) : (
                <>
                  <div className="people-intro">
                    <span className="people-intro-icon"><Users size={20} /></span>
                    <p><strong>Organised by person.</strong> Keep each family member's records separate so you can pull up a clean, complete history before their next doctor visit.</p>
                  </div>

                  {people.length ? (
                    <div className="people-grid">
                      {people.map((person, index) => {
                        const personRecords = records.filter(record => record.personId === person.id);
                        const latest = personRecords.slice().sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt))[0];
                        return (
                          <article key={person.id} className="person-card">
                            <div className={`person-avatar person-avatar-${index % 4}`}><UserRound size={25} /></div>
                            <div className="person-card-top">
                              <div>
                                <h2>{person.fullName}</h2>
                                <p>{person.relationship}{person.dateOfBirth ? ` · Born ${formatDate(person.dateOfBirth)}` : ''}</p>
                              </div>
                              <button type="button" className="icon-button subtle-icon" aria-label={`Show records for ${person.fullName}`} onClick={() => { setPlace('records'); setPersonFilter(person.id); setTypeFilter('all'); setReviewFilter('all'); }}>
                                <ArrowUpRight size={17} />
                              </button>
                            </div>
                            <div className="person-stats">
                              <div><strong>{personRecords.length}</strong><span>{personRecords.length === 1 ? 'record' : 'records'}</span></div>
                              <div><strong>{personRecords.filter(record => record.reviewStatus === 'needs_review').length}</strong><span>to review</span></div>
                            </div>
                            <div className="person-latest">
                              <span className="latest-dot" />
                              <span>{latest ? `Latest: ${latest.title}` : 'No records added yet'}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                              <button type="button" className="person-open-button" style={{ flex: 1 }} onClick={() => { setPlace('records'); setPersonFilter(person.id); setTypeFilter('all'); setReviewFilter('all'); }}>
                                View timeline <ChevronRight size={16} />
                              </button>
                              <button type="button" className="button button-secondary button-small" onClick={() => { setAppointmentPersonId(person.id); setModal('appointment'); }} title="Prepare for appointment">
                                Appointment prep
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState icon={Users} title="No profiles yet" body="Create a profile for yourself or someone you help care for." action="Add a person" onAction={() => setModal('person')} />
                  )}

                  <div className="family-safety-note">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>Privacy isolation</strong>
                      <p>Family profiles in this workspace remain isolated to your signed-in account. Only upload records with the person's consent.</p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </main>

        <footer className="app-footer">
          <span>CareVault · Personal Medical History Vault</span>
          <span><LockKeyhole size={13} /> Your whole medical history, one tap away.</span>
        </footer>
      </div>

      {/* MODALS */}
      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && modal !== 'upload' && modal !== 'privacy') closeModal(); }}>
          {/* Auth Modal */}
          {modal === 'auth' && (
            <section className="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-brand"><span className="brand-mark"><HeartPulse size={22} /></span></div>
              <div className="modal-eyebrow">YOUR PRIVATE HEALTH SPACE</div>
              <h2 id="auth-title">Sign in to your vault</h2>
              <p className="modal-lede">Sign in or create an account with email or Google.</p>
              <form onSubmit={handleEmailAuth} className="form-stack">
                <label className="field-label">
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="field-label">
                  Password
                  <input
                    type="password"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Minimum 6 characters"
                  />
                </label>
                <button type="submit" className="button button-primary button-full" disabled={authBusy || !email.trim() || password.length < 6}>
                  {authBusy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in to vault'}
                </button>
                <button
                  type="button"
                  className="text-link center-link"
                  onClick={() => setIsSignUp(prev => !prev)}
                  style={{ marginTop: 4, cursor: 'pointer', background: 'none', border: 'none', color: '#166555', fontSize: 12 }}
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </form>

              <div className="auth-divider" style={{ marginTop: 16 }}><span>or continue with</span></div>
              <button
                type="button"
                className="google-button"
                disabled={authBusy}
                onClick={async () => {
                  setAuthBusy(true);
                  try {
                    await signInWithGoogle();
                    setModal(null);
                    setNotice({
                      kind: 'success',
                      text: configured
                        ? 'Connecting to Google OAuth…'
                        : 'Signed in with Google as Alex Morgan.',
                    });
                  } catch {
                    /* context error */
                  } finally {
                    setAuthBusy(false);
                  }
                }}
              >
                <GoogleGlyph /> Continue with Google
              </button>
              {authError && <div className="form-error"><CircleAlert size={15} /> {authError}</div>}
            </section>
          )}

          {/* Upload & Review Record Modal */}
          {modal === 'upload' && (
            <section className="modal-card upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">DOCUMENT INGESTION</div>
              <h2 id="upload-title">Review record details</h2>
              <p className="modal-lede">Verify all extracted fields against the document before saving.</p>

              <div className="sample-presets-panel">
                <span className="sample-presets-label">Sample clinical documents for preview:</span>
                <div className="sample-presets-buttons">
                  <button type="button" className="sample-preset-btn" onClick={() => loadSampleFile('prescription')}>
                    <FileText size={13} /> Sample Prescription (Dr. Khan)
                  </button>
                  <button type="button" className="sample-preset-btn" onClick={() => loadSampleFile('lab')}>
                    <Activity size={13} /> Sample Blood Panel (Apex Labs)
                  </button>
                  <button type="button" className="sample-preset-btn" onClick={() => loadSampleFile('discharge')}>
                    <BookOpenText size={13} /> Sample Discharge Note (Metro)
                  </button>
                </div>
              </div>

              {selectedFile && (
                <div className="selected-file-card">
                  <span className="file-icon"><FileText size={21} /></span>
                  <div><strong>{selectedFile.name}</strong><small>{formatSize(selectedFile.size)} · {selectedFile.type || 'Document'}</small></div>
                  <CheckCircle2 size={18} className="file-ready" />
                </div>
              )}

              {analyzing && (
                <div className="ai-progress">
                  <span className="ai-spinner"><Sparkles size={18} /></span>
                  <div><strong>Reading your document with AI</strong><p>Extracting date, doctor, hospital, medicines, and lab values with reference ranges. Nothing is saved until you review.</p></div>
                </div>
              )}

              {analysisMessage && <div className={`analysis-message ${analysisMessage.startsWith('AI extraction') ? 'analysis-message-success' : ''}`}><Sparkles size={15} /> <span>{analysisMessage}</span></div>}

              {selectedFile && !analysisMessage.startsWith('AI extraction') && (
                <div className="ai-consent-panel">
                  <label>
                    <input type="checkbox" checked={analysisConsent} onChange={event => setAnalysisConsent(event.target.checked)} />
                    <span><strong>I consent to AI reading for this document.</strong><small>Extracts text, medications, and lab tables using CareVault's clinical AI pipeline.</small></span>
                  </label>
                  <button type="button" className="button button-secondary button-small" disabled={!analysisConsent || analyzing} onClick={runAiReading}><Sparkles size={14} /> {analyzing ? 'Reading…' : 'Read with AI'}</button>
                </div>
              )}

              {duplicate && (
                <div className="duplicate-warning">
                  <CircleAlert size={18} />
                  <div>
                    <strong>Possible duplicate warning</strong>
                    <p>An identical document is already saved as <b>{duplicate.title}</b> ({formatDate(duplicate.recordDate)}). Check before saving another copy.</p>
                  </div>
                </div>
              )}

              {draft && (
                <div className="review-form">
                  <div className="form-grid">
                    <label className="field-label field-span-2">Record name *<input value={draft.title} onChange={event => updateDraft('title', event.target.value)} maxLength={160} required /></label>
                    <label className="field-label">Document type<select value={draft.documentType} onChange={event => updateDraft('documentType', event.target.value as DocumentType)}>{DOCUMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    <label className="field-label">Date on document<input type="date" value={draft.recordDate} onChange={event => updateDraft('recordDate', event.target.value)} /></label>
                    <label className="field-label">Doctor<input value={draft.doctorName} onChange={event => updateDraft('doctorName', event.target.value)} placeholder="As printed (optional)" /></label>
                    <label className="field-label">Hospital / Clinic / Lab<input value={draft.hospitalName} onChange={event => updateDraft('hospitalName', event.target.value)} placeholder="As printed (optional)" /></label>
                    <label className="field-label field-span-2">Belongs to *<select value={draft.personId} onChange={event => updateDraft('personId', event.target.value)} required><option value="" disabled>Select profile</option>{people.map(person => <option key={person.id} value={person.id}>{person.fullName} ({person.relationship})</option>)}</select></label>
                    <label className="field-label field-span-2">Short neutral summary<textarea value={draft.summary} onChange={event => updateDraft('summary', event.target.value)} rows={2} placeholder="Factual description, no medical interpretation" /></label>
                  </div>

                  <div className="tag-editor">
                    <label className="field-label">Condition / topic tags<div className="tag-input-line"><input value={tagDraft} onChange={event => setTagDraft(event.target.value)} placeholder="e.g. Thyroid, Blood sugar, Annual visit" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); const val = tagDraft.trim(); if (val && !draft.tags.includes(val)) updateDraft('tags', [...draft.tags, val]); setTagDraft(''); } }} /><button type="button" className="button button-secondary button-small" onClick={() => { const val = tagDraft.trim(); if (val && !draft.tags.includes(val)) updateDraft('tags', [...draft.tags, val]); setTagDraft(''); }}>Add tag</button></div></label>
                    {draft.tags.length > 0 && <div className="tags-line">{draft.tags.map(tag => <button key={tag} type="button" className="tag-chip" onClick={() => updateDraft('tags', draft.tags.filter(item => item !== tag))}>{tag} <X size={12} /></button>)}</div>}
                  </div>

                  {draft.structuredMedicines && draft.structuredMedicines.length > 0 && (
                    <div className="verified-medicines-section" style={{ margin: '14px 0', border: '1px solid #dce5db', borderRadius: '12px', padding: '12px', background: '#fafcf9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div>
                          <strong style={{ fontSize: '13px', color: '#172b22' }}>Prescription Medicines · Multi-Stage Verified</strong>
                          <div style={{ fontSize: '11px', color: '#67766e' }}>Cross-checked against RxNorm & essential pharmacopeia</div>
                        </div>
                        <span style={{ fontSize: '11px', background: '#eaf5eb', color: '#1e6834', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                          {draft.structuredMedicines.filter(m => m.verificationStatus !== 'unverified').length}/{draft.structuredMedicines.length} verified
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {draft.structuredMedicines.map((med, idx) => (
                          <div key={`${med.brandName}-${idx}`} style={{ border: '1px solid #e1e9e0', borderRadius: '8px', padding: '8px 10px', background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#172b22' }}>{med.brandName}</span>
                                  {med.genericName && med.genericName !== med.brandName && (
                                    <span style={{ fontSize: '11px', color: '#67766e' }}>({med.genericName})</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '12px', color: '#286548', marginTop: '2px' }}>
                                  <b>{med.dosageForm}</b> {med.strength} · <b>{med.frequency}</b> · {med.duration}
                                  {med.instructions && med.instructions !== 'Standard administration' ? ` · ${med.instructions}` : ''}
                                </div>
                              </div>
                              <div>
                                {med.verificationStatus === 'verified_catalogue' || med.verificationStatus === 'verified_rxnorm' ? (
                                  <span style={{ background: '#eaf5eb', color: '#1e6834', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600 }}>
                                    ✓ {med.rxcui ? `RxNorm #${med.rxcui}` : 'Catalogue'}
                                  </span>
                                ) : med.verificationStatus === 'fuzzy_match' ? (
                                  <span style={{ background: '#fef7e6', color: '#976100', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600 }}>
                                    ⚠ Fuzzy match
                                  </span>
                                ) : (
                                  <span style={{ background: '#fdf0ee', color: '#b3261e', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600 }}>
                                    ? Review
                                  </span>
                                )}
                              </div>
                            </div>
                            {med.flags && med.flags.length > 0 && (
                              <div style={{ marginTop: '6px', fontSize: '11px', color: '#b3261e', background: '#fff5f4', padding: '4px 6px', borderRadius: '4px' }}>
                                {med.flags.map((flag, fIdx) => <div key={fIdx}>• {flag}</div>)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <label className="field-label">Medicines as written <span className="optional-text">· one per line</span><textarea rows={2} value={draft.medicines.join('\n')} onChange={event => updateDraft('medicines', event.target.value.split('\n').map(s => s.trim()).filter(Boolean))} placeholder="Enter medicine names exactly as printed on the prescription" /></label>

                  {draft.labValues.length > 0 && (
                    <div className="draft-lab-editor">
                      <div className="draft-lab-heading"><strong>Lab values as printed</strong><span className="optional-text">· verify numbers & ranges</span></div>
                      {draft.labValues.map((lab, index) => (
                        <div className="draft-lab-row" key={`${lab.name}-${index}`}>
                          <input aria-label="Test name" value={lab.name} onChange={e => updateDraft('labValues', draft.labValues.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} placeholder="Test name" />
                          <input aria-label="Value" value={lab.value} onChange={e => updateDraft('labValues', draft.labValues.map((item, i) => i === index ? { ...item, value: e.target.value } : item))} placeholder="Value" />
                          <input aria-label="Unit" value={lab.unit || ''} onChange={e => updateDraft('labValues', draft.labValues.map((item, i) => i === index ? { ...item, unit: e.target.value } : item))} placeholder="Unit" />
                          <input aria-label="Reference range" value={lab.referenceRange || ''} onChange={e => updateDraft('labValues', draft.labValues.map((item, i) => i === index ? { ...item, referenceRange: e.target.value } : item))} placeholder="Ref range" />
                          <button type="button" className="remove-lab-button" onClick={() => updateDraft('labValues', draft.labValues.filter((_, i) => i !== index))}><X size={14} /></button>
                        </div>
                      ))}
                      <button type="button" className="text-link add-lab-link" onClick={() => updateDraft('labValues', [...draft.labValues, { name: '', value: '', unit: '', referenceRange: '', reportMarker: '', date: draft.recordDate }])}><Plus size={13} /> Add lab test row</button>
                    </div>
                  )}

                  {draft.extractedText && (
                    <details className="extracted-text-details"><summary>Extracted full text <ChevronDown size={15} /></summary><textarea rows={4} value={draft.extractedText} onChange={e => updateDraft('extractedText', e.target.value)} /></details>
                  )}

                  <p className="medical-disclaimer">General information from your records. Please confirm with your doctor. AI is an assistant, not a clinician.</p>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={closeModal}>Cancel</button>
                <button type="button" className="button button-primary" disabled={!draft || !selectedFile || analyzing || saving || !draft.title.trim()} onClick={handleSaveRecord}>
                  {saving ? 'Saving…' : <><Check size={17} /> Save record</>}
                </button>
              </div>
            </section>
          )}

          {/* Record Detail Modal */}
          {modal === 'detail' && selectedRecord && (
            <section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
              <ModalClose onClick={closeModal} />
              <div className="detail-type-line">
                <span className="file-icon"><TypeIcon type={selectedRecord.documentType} /></span>
                <span>{TYPE_LABEL[selectedRecord.documentType]}</span>
                <span className={selectedRecord.reviewStatus === 'needs_review' ? 'status-pill status-review' : 'status-pill status-confirmed'}>{selectedRecord.reviewStatus === 'needs_review' ? 'Needs review' : 'Confirmed'}</span>
                <button type="button" className={`favorite-detail ${selectedRecord.isFavorite ? 'favorited' : ''}`} onClick={() => handleToggleFavorite(selectedRecord)} aria-label={selectedRecord.isFavorite ? 'Remove favourite' : 'Add favourite'}><Star size={18} fill={selectedRecord.isFavorite ? 'currentColor' : 'none'} /></button>
              </div>

              <h2 id="detail-title">{selectedRecord.title}</h2>
              <p className="modal-lede">{formatDate(selectedRecord.recordDate)} · {selectedRecord.personName || 'Unassigned'}</p>

              <div className="detail-information">
                <div><span>Doctor</span><strong>{selectedRecord.doctorName || 'Not recorded'}</strong></div>
                <div><span>Hospital / clinic</span><strong>{selectedRecord.hospitalName || 'Not recorded'}</strong></div>
                <div><span>Size</span><strong>{formatSize(selectedRecord.byteSize)}</strong></div>
                <div><span>Added</span><strong>{formatDate(selectedRecord.createdAt)}</strong></div>
              </div>

              {selectedRecord.summary && <div className="detail-section"><h3>Summary</h3><p>{selectedRecord.summary}</p></div>}

              {selectedRecord.medicines.length > 0 && (
                <div className="detail-section">
                  <h3>Medicines as printed</h3>
                  <div className="detail-tags">
                    {selectedRecord.medicines.map(med => (
                      <button key={med} type="button" className="tag-chip" style={{ background: '#eaf6f3', color: '#147d71', borderColor: '#bfe4dc', cursor: 'pointer' }} onClick={() => handleExplainTerm(med)} title="Click to explain purpose">
                        {med} <HelpCircle size={12} style={{ marginLeft: '4px' }} />
                      </button>
                    ))}
                  </div>
                  <p className="small-caution">Copied from the record; not an instruction to take or stop. Tap any medicine to learn its common purpose.</p>
                </div>
              )}

              {selectedRecord.labValues.length > 0 && (
                <div className="detail-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3>Lab values as printed</h3>
                    <button type="button" className="text-link" onClick={() => { setActiveLabTest(selectedRecord.labValues[0]?.name || 'All tests'); setModal('labs'); }}>View trends <ArrowUpRight size={13} /></button>
                  </div>
                  <div className="lab-values-table">
                    {selectedRecord.labValues.map((lab, index) => (
                      <div key={`${lab.name}-${index}`} className="lab-value-row">
                        <span>
                          {lab.name}
                          <button type="button" onClick={() => handleExplainTerm(lab.name)} title="What is this test?" style={{ border: 0, background: 'transparent', color: '#147d71', cursor: 'pointer', marginLeft: '5px' }}>
                            <HelpCircle size={13} />
                          </button>
                        </span>
                        <strong>{lab.value} {lab.unit}</strong>
                        <small>{lab.referenceRange ? `Ref: ${lab.referenceRange}` : 'No ref printed'} {lab.reportMarker ? `· ${lab.reportMarker}` : ''}</small>
                      </div>
                    ))}
                  </div>
                  <p className="small-caution">Values as printed on your reports. Discuss changes with your doctor.</p>
                </div>
              )}

              {selectedRecord.tags.length > 0 && <div className="detail-tags">{selectedRecord.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}

              {selectedRecord.extractedText && (
                <details className="extracted-text-details detail-extracted"><summary>Visible document text <ChevronDown size={15} /></summary><pre>{selectedRecord.extractedText}</pre></details>
              )}

              <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="button button-secondary" onClick={() => speakRecord(selectedRecord)}><Volume2 size={16} /> Read aloud</button>
                <button type="button" className="button button-secondary" onClick={() => handleCreateShare(selectedRecord)}><Share2 size={16} /> Share link & QR</button>
                {selectedRecord.reviewStatus === 'needs_review' && <button type="button" className="button button-secondary" onClick={() => handleMarkReviewed(selectedRecord)}><CheckCircle2 size={16} /> Mark reviewed</button>}
                <button type="button" className="button button-primary" disabled={!selectedRecord.filePath || !session} onClick={() => handleOpenOriginal(selectedRecord)}><FileText size={17} /> Open original</button>
              </div>
            </section>
          )}

          {/* Lab Trends Modal */}
          {modal === 'labs' && (
            <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="labs-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">CHRONOLOGICAL LAB CHARTS</div>
              <h2 id="labs-title">Lab values over time</h2>
              <p className="modal-lede">Track test values exactly as recorded across your timeline.</p>

              {/* Test selector chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '14px 0 10px' }}>
                <button type="button" className={`prompt-chip ${activeLabTest === 'All tests' ? 'filter-chip-active' : ''}`} onClick={() => setActiveLabTest('All tests')}>All tests</button>
                {uniqueLabTestNames.map(testName => (
                  <button key={testName} type="button" className={`prompt-chip ${activeLabTest === testName ? 'filter-chip-active' : ''}`} onClick={() => setActiveLabTest(testName)}>{testName}</button>
                ))}
              </div>

              {filteredLabItems.length ? (
                <div className="lab-trend-chart">
                  {filteredLabItems.map((item, idx) => {
                    const pct = Number.isFinite(item.numeric) ? Math.max(8, Math.min(100, Math.round((Math.abs(item.numeric) / maxLabNumeric) * 100))) : 40;
                    return (
                      <div className="lab-trend-item" key={`${item.name}-${item.recordDate}-${idx}`}>
                        <div className="lab-trend-top">
                          <span className="lab-trend-name">{item.name}</span>
                          <span className="lab-trend-val">{item.value} {item.unit || ''}</span>
                        </div>
                        <div className="lab-trend-bar-track">
                          <div className="lab-trend-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="lab-trend-meta">
                          <span>📅 {formatDate(item.recordDate)}</span>
                          <span>📄 {item.recordTitle}</span>
                          <span>Printed range: {item.referenceRange || 'Not recorded'}</span>
                          {item.reportMarker && <span>Marker: {item.reportMarker}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={Activity} title="No numeric lab values" body="Upload a lab report with printed values to see your timeline." action="Add record" onAction={addRecordClick} />
              )}

              <p className="medical-disclaimer" style={{ marginTop: '16px' }}>Values as printed on your reports. Discuss changes with your doctor. Tests with different units should not be compared by bar length.</p>
              <div className="modal-actions"><button type="button" className="button button-primary" onClick={closeModal}>Done</button></div>
            </section>
          )}

          {/* Ask My Records Modal */}
          {modal === 'ask' && (
            <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="ask-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">GROUNDED SEARCH & RETRIEVAL</div>
              <h2 id="ask-title">Ask my records</h2>
              <p className="modal-lede">Answers come strictly from your documents. Medical advice questions are redirected to your doctor.</p>

              <div className="ask-box">
                <div className="ask-prompts">
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Try asking:</span>
                  <button type="button" className="prompt-chip" onClick={() => handleAskRecords('my last thyroid test')}>my last thyroid test</button>
                  <button type="button" className="prompt-chip" onClick={() => handleAskRecords('blood pressure medicines')}>blood pressure medicines</button>
                  <button type="button" className="prompt-chip" onClick={() => handleAskRecords('Dr. Shah prescriptions')}>Dr. Shah prescriptions</button>
                </div>

                <div className="ask-input-wrap">
                  <textarea rows={2} value={askQuestion} onChange={e => setAskQuestion(e.target.value)} placeholder="e.g. When was my last fasting glucose test? What medicines are listed?" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskRecords(); } }} />
                  <button type="button" className="button button-primary" disabled={asking || !askQuestion.trim()} onClick={() => handleAskRecords()}>{asking ? 'Searching…' : 'Search'}</button>
                </div>
              </div>

              {askResult && (
                <div className={`ask-response-card ${askResult.emergency ? 'ask-response-emergency' : askResult.redirected ? 'ask-response-redirect' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {askResult.emergency ? <ShieldAlert size={20} color="#b42318" /> : askResult.redirected ? <ShieldCheck size={20} color="#b86214" /> : <Sparkles size={18} color="#147d71" />}
                    <strong>{askResult.emergency ? 'Medical Emergency Notice' : askResult.redirected ? 'Doctor Discussion Guidance' : 'Found in your records'}</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text)' }}>{askResult.answer}</p>

                  {askResult.sources.length > 0 && (
                    <div className="ask-sources">
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>CITED SOURCE DOCUMENTS:</span>
                      {askResult.sources.map(s => (
                        <button key={s.id} type="button" className="source-item" onClick={() => openRecord(s)}>
                          <div>
                            <strong style={{ fontSize: '12px', display: 'block' }}>{s.title}</strong>
                            <small style={{ color: 'var(--muted)', fontSize: '10px' }}>{formatDate(s.recordDate)} · {s.doctorName || 'Doctor not recorded'}</small>
                          </div>
                          <ChevronRight size={15} color="#8c9c99" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="medical-disclaimer" style={{ marginTop: '14px' }}>Answers are drawn strictly from your saved records and trusted references. CareVault never diagnoses conditions.</p>
              <div className="modal-actions"><button type="button" className="button button-secondary" onClick={closeModal}>Close</button></div>
            </section>
          )}

          {/* Term Explainer ("What is this?") Modal */}
          {modal === 'explain' && (
            <section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="explain-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">TRUSTED DRUG & LAB REFERENCE</div>
              <h2 id="explain-title">What is this?</h2>
              <p className="modal-lede">Neutral, plain-language explanations of medications and laboratory terms from authoritative sources.</p>

              <div style={{ display: 'flex', gap: '8px', margin: '14px 0' }}>
                <input style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '9px', fontSize: '12px', background: 'var(--panel)', color: 'var(--text)' }} value={explainTermQuery} onChange={e => setExplainTermQuery(e.target.value)} placeholder="Enter drug name or lab test (e.g. Metformin, TSH, Amlodipine)" onKeyDown={e => { if (e.key === 'Enter') handleExplainTerm(); }} />
                <button type="button" className="button button-primary button-small" disabled={explaining || !explainTermQuery.trim()} onClick={() => handleExplainTerm()}>{explaining ? 'Looking up…' : 'Lookup'}</button>
              </div>

              {termExplanation && (
                <div className="term-explain-card">
                  <span className="term-badge">{termExplanation.category}</span>
                  <h3 style={{ margin: '4px 0 8px', fontSize: '16px', color: 'var(--text)' }}>{termExplanation.term}</h3>
                  <div className="term-purpose">{termExplanation.purpose}</div>
                  <div className="term-desc">{termExplanation.description}</div>
                  <div className="term-source">
                    Authoritative reference: <a href={termExplanation.url} target="_blank" rel="noopener noreferrer">{termExplanation.source} <ExternalLink size={10} style={{ display: 'inline' }} /></a>
                  </div>
                  <p className="small-caution" style={{ marginTop: '12px' }}>{termExplanation.disclaimer}</p>
                </div>
              )}

              <div className="modal-actions"><button type="button" className="button button-primary" onClick={closeModal}>Done</button></div>
            </section>
          )}

          {/* Appointment Prep Modal */}
          {modal === 'appointment' && (() => {
            const prep = buildDoctorSummary(appointmentPersonId);
            return (
              <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title">
                <ModalClose onClick={closeModal} />
                <div className="modal-eyebrow">APPOINTMENT PREPARATION PACK</div>
                <h2 id="appointment-title">Prepare for my appointment</h2>
                <p className="modal-lede">Bring the right records, current medicines and your questions to your next visit.</p>

                <div style={{ margin: '12px 0' }}>
                  <label className="field-label">Family member
                    <select value={appointmentPersonId} onChange={e => setAppointmentPersonId(e.target.value)}>
                      {people.map(p => <option key={p.id} value={p.id}>{p.fullName} ({p.relationship})</option>)}
                    </select>
                  </label>
                </div>

                <div className="print-sheet">
                  <div className="print-sheet-brand">
                    <span className="brand-mark"><HeartPulse size={20} /></span>
                    <div><strong>CareVault · Appointment Preparation</strong><small>{prep.person?.fullName || 'Patient'} ({prep.person?.relationship || 'Self'})</small></div>
                  </div>

                  <div className="print-section">
                    <h4>Pre-Visit Checklist</h4>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', lineHeight: 1.6 }}>
                      <li>Confirm all current medicines and dosages with clinician.</li>
                      <li>Review recorded allergies: <b>{emergency.allergies || 'None specifically recorded'}</b>.</li>
                      <li>Bring hard copy reports for any critical values.</li>
                    </ul>
                  </div>

                  <div className="print-section">
                    <h4>Recorded Medicines</h4>
                    {prep.medicines.length ? (
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px' }}>{prep.medicines.map(m => <li key={m}>{m}</li>)}</ul>
                    ) : <p style={{ fontSize: '11px', margin: 0 }}>No medicines extracted.</p>}
                  </div>

                  {prep.recentLabs.length > 0 && (
                    <div className="print-section">
                      <h4>Recent Laboratory Results</h4>
                      <div className="lab-values-table" style={{ fontSize: '11px' }}>
                        {prep.recentLabs.slice(0, 6).map((l, i) => (
                          <div key={i} className="lab-value-row">
                            <span>{l.name}</span>
                            <strong>{l.value} {l.unit}</strong>
                            <small>Ref: {l.referenceRange || 'Not recorded'}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="print-section">
                    <h4>Questions to ask the doctor</h4>
                    <textarea rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #d0dcd7', borderRadius: '6px', fontSize: '11px', background: '#fff' }} value={appointmentQuestions} onChange={e => setAppointmentQuestions(e.target.value)} placeholder="Type the questions you want to ask your doctor (e.g. Should we adjust thyroid dose? Can I stop this tablet?)" />
                  </div>

                  <p className="print-disclaimer">Compiled from vault records only. This document does not constitute clinical advice. Discuss all questions with your physician.</p>
                </div>

                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeModal}>Close</button>
                  <button type="button" className="button button-primary" onClick={() => window.print()}><FileCheck2 size={17} /> Print / export pack</button>
                </div>
              </section>
            );
          })()}

          {/* Emergency Card Modal */}
          {modal === 'emergency' && (
            <section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="emergency-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">CRITICAL MEDICAL ID</div>
              <h2 id="emergency-title">Emergency medical card</h2>
              <p className="modal-lede">Keep your blood group, confirmed allergies and emergency contact accessible.</p>

              <div className="emergency-sheet">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldAlert size={22} color="#b42318" />
                    <strong style={{ color: '#b42318', fontSize: '14px' }}>EMERGENCY MEDICAL ID</strong>
                  </div>
                  <span className="blood-group-badge">{emergency.bloodGroup || 'Blood: ?'}</span>
                </div>

                <div className="emergency-grid">
                  <div className="emergency-field-box">
                    <span>Blood Group</span>
                    <input style={{ padding: '6px', fontSize: '12px', border: '1px solid #f9cac5', borderRadius: '6px', background: '#fff' }} value={emergency.bloodGroup} onChange={e => setEmergency({ ...emergency, bloodGroup: e.target.value })} placeholder="e.g. O+ or B+" />
                  </div>
                  <div className="emergency-field-box">
                    <span>Contact Name</span>
                    <input style={{ padding: '6px', fontSize: '12px', border: '1px solid #f9cac5', borderRadius: '6px', background: '#fff' }} value={emergency.emergencyContactName} onChange={e => setEmergency({ ...emergency, emergencyContactName: e.target.value })} placeholder="Family member name" />
                  </div>
                  <div className="emergency-field-box">
                    <span>Contact Phone</span>
                    <input style={{ padding: '6px', fontSize: '12px', border: '1px solid #f9cac5', borderRadius: '6px', background: '#fff' }} value={emergency.emergencyContactPhone} onChange={e => setEmergency({ ...emergency, emergencyContactPhone: e.target.value })} placeholder="+91 98765 00000" />
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label className="field-label" style={{ color: '#8c4c47' }}>Recorded allergies (foods / drugs)
                    <textarea rows={2} style={{ width: '100%', padding: '6px', border: '1px solid #f9cac5', borderRadius: '6px', background: '#fff', fontSize: '12px' }} value={emergency.allergies} onChange={e => setEmergency({ ...emergency, allergies: e.target.value })} placeholder="e.g. Penicillin, Sulfa drugs, Peanuts" />
                  </label>
                </div>

                <div style={{ marginTop: '10px' }}>
                  <label className="field-label" style={{ color: '#8c4c47' }}>Important chronic conditions
                    <textarea rows={2} style={{ width: '100%', padding: '6px', border: '1px solid #f9cac5', borderRadius: '6px', background: '#fff', fontSize: '12px' }} value={emergency.conditions} onChange={e => setEmergency({ ...emergency, conditions: e.target.value })} placeholder="e.g. Type 2 Diabetes, Hypertension, Asthma" />
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => window.print()}><FileCheck2 size={16} /> Print card</button>
                <button type="button" className="button button-primary" onClick={async () => {
                  if (configured && session && user) {
                    await vaultApi.saveEmergencyProfile(session, emergency).catch(() => {});
                  }
                  setNotice({ kind: 'success', text: 'Emergency profile updated.' });
                  closeModal();
                }}>Save card</button>
              </div>
            </section>
          )}

          {/* Follow-up Reminders Modal */}
          {modal === 'reminders' && (
            <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="reminders-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">PREVENTIVE CARE & TESTS</div>
              <h2 id="reminders-title">Follow-up & test reminders</h2>
              <p className="modal-lede">Set reminders for repeat lab tests and clinician check-ups.</p>

              <form onSubmit={handleAddReminder} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', padding: '14px', background: 'var(--panel-soft)', border: '1px solid var(--line)', borderRadius: '12px', marginTop: '12px' }}>
                <input placeholder="Reminder title (e.g. Repeat TSH test)" required value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} style={{ padding: '8px 10px', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)' }} />
                <input type="datetime-local" required value={reminderDate} onChange={e => setReminderDate(e.target.value)} style={{ padding: '8px 10px', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)' }} />
                <input placeholder="Notes (e.g. Fasting sample needed)" value={reminderNote} onChange={e => setReminderNote(e.target.value)} style={{ padding: '8px 10px', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)' }} />
                <button type="submit" className="button button-primary button-small" style={{ alignSelf: 'stretch' }}><Plus size={15} /> Add reminder</button>
              </form>

              <div className="reminder-list">
                {reminders.length ? (
                  reminders.map(rem => (
                    <div key={rem.id} className={`reminder-item ${rem.done ? 'reminder-item-done' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button type="button" onClick={() => handleToggleReminderDone(rem)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: rem.done ? '#147d71' : '#a1b1ad' }}>
                          <CheckCircle2 size={20} />
                        </button>
                        <div>
                          <strong>{rem.title}</strong>
                          <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px' }}>{new Date(rem.dueAt).toLocaleString()} {rem.note ? `· ${rem.note}` : ''}</small>
                        </div>
                      </div>
                      <span className={`status-pill ${rem.done ? 'status-confirmed' : 'status-review'}`}>{rem.done ? 'Done' : 'Upcoming'}</span>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={Bell} title="No reminders set" body="Add upcoming doctor appointments or repeat lab tests." action="Add reminder" onAction={() => setReminderTitle('Repeat lab test')} />
                )}
              </div>

              <div className="modal-actions"><button type="button" className="button button-primary" onClick={closeModal}>Done</button></div>
            </section>
          )}

          {/* Secure Share Link Modal with Real QR Code */}
          {modal === 'share' && selectedRecord && (
            <section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">SECURE TEMPORARY SHARING</div>
              <h2 id="share-title">Share with your doctor</h2>
              <p className="modal-lede">Creates a temporary link with automatic expiration so you never have to hand over your phone.</p>

              <div className="qr-container">
                {sharingBusy ? (
                  <div style={{ padding: '40px' }}><Sparkles size={24} className="ai-spinner" /> Generating secure QR code…</div>
                ) : shareQrUrl ? (
                  <img src={shareQrUrl} alt="Secure QR Code" className="qr-code-svg" />
                ) : (
                  <div style={{ padding: '20px', color: 'var(--muted)' }}><QrCode size={48} /></div>
                )}

                <div style={{ textAlign: 'center' }}>
                  <strong>{selectedRecord.title}</strong>
                  <small style={{ display: 'block', color: 'var(--muted)', marginTop: '4px' }}>Expires automatically on: {shareLinkInfo ? new Date(shareLinkInfo.expiresAt).toLocaleDateString() : `in ${shareDays} days`}</small>
                </div>

                {shareLinkInfo && (
                  <div className="share-url-box">
                    <input readOnly value={shareLinkInfo.url} />
                    <button type="button" className="button button-secondary button-small" onClick={() => { navigator.clipboard.writeText(shareLinkInfo.url); setNotice({ kind: 'success', text: 'Link copied to clipboard.' }); }}><Copy size={14} /> Copy</button>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setModal('doctor_share_preview')}><ExternalLink size={15} /> Preview doctor view</button>
                <button type="button" className="button button-danger" onClick={handleRevokeShare}>Revoke link now</button>
                <button type="button" className="button button-primary" onClick={closeModal}>Done</button>
              </div>
            </section>
          )}

          {/* Clinician Doctor Share Preview Modal */}
          {modal === 'doctor_share_preview' && selectedRecord && (
            <section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="doctor-preview-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">CLINICIAN SECURE REVIEW PORTAL</div>
              <h2 id="doctor-preview-title">Doctor's View (Read-Only Preview)</h2>
              <p className="modal-lede">This is the secure, view-only interface a clinician sees when opening your shared link or scanning your QR code.</p>

              <div className="doctor-view-sheet">
                <div className="doctor-view-header">
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CareVault Secure Doctor Review</span>
                    <h3 style={{ fontSize: '18px', color: '#17423c', margin: '4px 0' }}>{selectedRecord.title}</h3>
                    <span style={{ fontSize: '12px', color: '#527067' }}>Patient: <strong>{selectedRecord.personName || 'Alex Morgan'}</strong> · Recorded {formatDate(selectedRecord.recordDate)}</span>
                  </div>
                  <span className="doctor-status-badge">
                    <CheckCircle2 size={13} /> Active Token · Expiring Link
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px', fontSize: '12px' }}>
                  <div><b>Document Type:</b> {TYPE_LABEL[selectedRecord.documentType] || selectedRecord.documentType}</div>
                  <div><b>Attending Doctor:</b> {selectedRecord.doctorName || 'Not recorded'}</div>
                  <div><b>Hospital / Clinic:</b> {selectedRecord.hospitalName || 'Not recorded'}</div>
                </div>

                {selectedRecord.summary && (
                  <div style={{ marginBottom: '14px' }}>
                    <strong style={{ fontSize: '12px', color: '#17423c', display: 'block', marginBottom: '4px' }}>Neutral Clinical Summary:</strong>
                    <p style={{ margin: 0, fontSize: '12px', color: '#3d524d', lineHeight: 1.5, background: 'var(--panel-soft)', padding: '10px', borderRadius: '8px' }}>{selectedRecord.summary}</p>
                  </div>
                )}

                {selectedRecord.medicines.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <strong style={{ fontSize: '12px', color: '#17423c', display: 'block', marginBottom: '6px' }}>Prescribed Medications:</strong>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#25443d' }}>
                      {selectedRecord.medicines.map((med, idx) => (
                        <li key={idx} style={{ marginBottom: '3px' }}><strong>{med}</strong></li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedRecord.labValues.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <strong style={{ fontSize: '12px', color: '#17423c', display: 'block', marginBottom: '6px' }}>Laboratory Observations & Reference Ranges:</strong>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ background: 'var(--panel-soft)', textAlign: 'left' }}>
                            <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>Test Name</th>
                            <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>Observed Value</th>
                            <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>Reference Range</th>
                            <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>Marker</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRecord.labValues.map((lab, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                              <td style={{ padding: '6px 10px', fontWeight: 600 }}>{lab.name}</td>
                              <td style={{ padding: '6px 10px' }}>{lab.value} {lab.unit || ''}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{lab.referenceRange || '—'}</td>
                              <td style={{ padding: '6px 10px' }}>{lab.reportMarker ? <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#fff2db', color: '#976100', fontSize: '10px' }}>{lab.reportMarker}</span> : 'Normal'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedRecord.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {selectedRecord.tags.map(tag => (
                      <span key={tag} className="tag-chip">{tag}</span>
                    ))}
                  </div>
                )}

                <p className="medical-disclaimer" style={{ marginTop: '14px' }}>
                  Notice to Clinicians: This view displays patient-curated records for consultation reference. Please verify findings with source diagnostics and the attending laboratory or pharmacy.
                </p>
              </div>

              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => window.print()}><FileCheck2 size={16} /> Print clinical note</button>
                <button type="button" className="button button-primary" onClick={() => setModal('share')}>Back to Share options</button>
              </div>
            </section>
          )}

          {/* Architecture & Tech Stack Modal */}
          {modal === 'tech_stack' && (
            <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="tech-stack-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">SYSTEM ARCHITECTURE & SPECIFICATIONS</div>
              <h2 id="tech-stack-title">CareVault Architecture & Tech Stack</h2>
              <p className="modal-lede">A deep-dive technical overview of CareVault's architecture, clinical safety barriers, and engineering implementation.</p>

              <div className="tech-stack-grid">
                <div className="tech-stack-card">
                  <div className="tech-stack-card-header">
                    <span className="tech-stack-card-icon"><Activity size={18} /></span>
                    <div>
                      <strong>Frontend Architecture</strong>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>React 19 · TypeScript · Vite · Tailwind</div>
                    </div>
                  </div>
                  <ul>
                    <li><b>Local-First State Machine:</b> Instant sub-millisecond UI rendering with localStorage fallback and offline data resilience.</li>
                    <li><b>Accessibility (WCAG AA):</b> Dark mode, large font scaling, senior-friendly simple mode, and speech synthesis in English, Hindi, and Urdu.</li>
                    <li><b>Interactive Visualizations:</b> Zero-dependency SVG longitudinal lab trend charts with normal reference ranges and abnormal marker indicators.</li>
                  </ul>
                </div>

                <div className="tech-stack-card">
                  <div className="tech-stack-card-header">
                    <span className="tech-stack-card-icon"><Sparkles size={18} /></span>
                    <div>
                      <strong>Grounded Clinical AI Pipeline</strong>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Google Gemini 2.5 Flash · RAG · Guardrails</div>
                    </div>
                  </div>
                  <ul>
                    <li><b>Multimodal Document OCR:</b> Extracts date, doctor, hospital, structured prescription lines, and tabular lab values with confidence scores.</li>
                    <li><b>Multi-Stage Rx Verification:</b> Cross-checks medications against RxNorm and pharmacopeia catalogs for dosage form, strength, and frequency.</li>
                    <li><b>Strict Advice-Trap Barriers:</b> Automatically intercepts and neutralizes diagnostic queries or dose modifications, redirecting users safely to physicians.</li>
                    <li><b>Emergency Detection:</b> Flags acute symptoms (chest pain, stroke signs, severe hemorrhage) with emergency 911/112 routing.</li>
                  </ul>
                </div>

                <div className="tech-stack-card">
                  <div className="tech-stack-card-header">
                    <span className="tech-stack-card-icon"><LockKeyhole size={18} /></span>
                    <div>
                      <strong>Security, Auth & Storage</strong>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>PostgreSQL RLS · Supabase · Cryptography</div>
                    </div>
                  </div>
                  <ul>
                    <li><b>Zero-Trust Row-Level Security:</b> Strict PostgreSQL RLS policies guarantee tenant isolation; users can only query their own records.</li>
                    <li><b>Private Cloud Buckets:</b> Uploaded files stored in private buckets accessible only via short-lived signed URLs (120-second TTL).</li>
                    <li><b>Revocable Time-Limited Shares:</b> Cryptographic tokenized links and QR codes with user-controlled expiration (1, 7, or 30 days) and instant revocation.</li>
                    <li><b>Right to be Forgotten:</b> One-click atomic cascading purge (`DELETE EVERYTHING`) removes all records, profiles, and files permanently.</li>
                  </ul>
                </div>

                <div className="tech-stack-card">
                  <div className="tech-stack-card-header">
                    <span className="tech-stack-card-icon"><Phone size={18} /></span>
                    <div>
                      <strong>Native Android Companion</strong>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Expo SDK 58 · React Native · SQLite</div>
                    </div>
                  </div>
                  <ul>
                    <li><b>Hardware Document Scanner:</b> Auto-detects paper edges, corrects perspective distortion, and applies document contrast filters.</li>
                    <li><b>Biometric Authentication:</b> Fingerprint and Face Unlock via native Android Biometrics API for fast, secure local unlocking.</li>
                    <li><b>Offline-First SQLite Cache:</b> Full local synchronization with background retry queue for low-connectivity environments.</li>
                  </ul>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="button button-primary" onClick={closeModal}>Done</button>
              </div>
            </section>
          )}

          {/* CareVault Premium (Free vs Pro) Modal */}
          {modal === 'premium' && (
            <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="premium-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">CAREVAULT TIERS</div>
              <h2 id="premium-title">CareVault Free & Pro</h2>
              <p className="modal-lede">Transparent plans designed for personal health and family care.</p>

              <div className="pricing-table-wrap">
                <table className="pricing-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Free Plan</th>
                      <th>Pro Plan (Family)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Document Storage</strong></td>
                      <td>Basic document storage</td>
                      <td>Unlimited encrypted storage</td>
                    </tr>
                    <tr>
                      <td><strong>AI Reading & Ingestion</strong></td>
                      <td>Manual entry + trial reads</td>
                      <td>Unlimited AI reading & auto-filing</td>
                    </tr>
                    <tr>
                      <td><strong>Family Profiles</strong></td>
                      <td>1–2 profiles</td>
                      <td>Profiles for the whole family</td>
                    </tr>
                    <tr>
                      <td><strong>Search Capability</strong></td>
                      <td>Manual title & tag search</td>
                      <td>Smart search inside document contents</td>
                    </tr>
                    <tr>
                      <td><strong>Doctor Summaries & Prep</strong></td>
                      <td>Standard summary</td>
                      <td>Appointment pack + questions export</td>
                    </tr>
                    <tr>
                      <td><strong>Lab Trends & Visual Charts</strong></td>
                      <td>Latest values</td>
                      <td>Chronological trend charts & markers</td>
                    </tr>
                    <tr>
                      <td><strong>Secure Doctor Sharing</strong></td>
                      <td>Basic export</td>
                      <td>Expiring links with revocable QR codes</td>
                    </tr>
                    <tr>
                      <td><strong>Emergency Card</strong></td>
                      <td>Included</td>
                      <td>Included + Printable wallet pack</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--panel-soft)', border: '1px solid var(--line)', borderRadius: '10px', fontSize: '11px', color: 'var(--muted)' }}>
                You never need to manage API keys. Pro subscription covers verified cloud storage and AI librarianship behind the scenes.
              </div>

              <div className="modal-actions"><button type="button" className="button button-primary" onClick={closeModal}>Close</button></div>
            </section>
          )}

          {/* Settings & Accessibility Modal */}
          {modal === 'settings' && (
            <section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">ACCESSIBILITY & PREFERENCES</div>
              <h2 id="settings-title">Display & comfort</h2>
              <p className="modal-lede">Make CareVault comfortable for every age group.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--panel-soft)', borderRadius: '10px', border: '1px solid var(--line)', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px' }}>Larger text mode</strong>
                    <small style={{ color: 'var(--muted)', fontSize: '11px' }}>Increases font sizes and tap targets for easier reading.</small>
                  </div>
                  <input type="checkbox" checked={isLargeText} onChange={e => setIsLargeText(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#147d71' }} />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--panel-soft)', borderRadius: '10px', border: '1px solid var(--line)', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px' }}>Simple mode for seniors</strong>
                    <small style={{ color: 'var(--muted)', fontSize: '11px' }}>Hides complex filters, showing only high-priority buttons.</small>
                  </div>
                  <input type="checkbox" checked={isSimpleMode} onChange={e => setIsSimpleMode(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#147d71' }} />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--panel-soft)', borderRadius: '10px', border: '1px solid var(--line)', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px' }}>Dark mode</strong>
                    <small style={{ color: 'var(--muted)', fontSize: '11px' }}>High contrast dark theme to reduce eye strain.</small>
                  </div>
                  <input type="checkbox" checked={isDark} onChange={e => setIsDark(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#147d71' }} />
                </label>

                <div style={{ padding: '12px', background: 'var(--panel-soft)', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <strong style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Speech read-out language</strong>
                  <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginBottom: '8px' }}>Select language for "Read aloud" record summaries.</small>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['English', 'اردو', 'हिन्दी'] as const).map(lang => (
                      <button key={lang} type="button" className={`prompt-chip ${selectedLanguage === lang ? 'filter-chip-active' : ''}`} onClick={() => setSelectedLanguage(lang)}>{lang}</button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '12px', background: 'var(--panel-soft)', borderRadius: '10px', border: '1px solid var(--line)', marginTop: '4px' }}>
                  <strong style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Sample Clinical Records</strong>
                  <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginBottom: '8px' }}>Reset your local records, family profiles, and reminders to default sample health data.</small>
                  <button type="button" className="button button-secondary button-small" onClick={handleResetDemoData}>
                    <RotateCcw size={13} /> Restore Default Records
                  </button>
                </div>
              </div>

              <div className="modal-actions"><button type="button" className="button button-primary" onClick={closeModal}>Done</button></div>
            </section>
          )}

          {/* Doctor Summary Modal */}
          {modal === 'summary' && (() => {
            const summary = buildDoctorSummary(selectedRecord?.personId || people[0]?.id);
            return (
              <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="summary-title">
                <ModalClose onClick={closeModal} />
                <div className="modal-eyebrow">ONE-PAGE CLINICAL SUMMARY</div>
                <h2 id="summary-title">Doctor summary</h2>
                <p className="modal-lede">A concise one-page overview compiled strictly from your saved records.</p>
                <div className="print-sheet">
                  <div className="print-sheet-brand">
                    <span className="brand-mark"><HeartPulse size={20} /></span>
                    <div><strong>CareVault</strong><small>Medical history summary</small></div>
                  </div>
                  <h3>{summary.person?.fullName || 'Medical history'}</h3>
                  <p className="print-meta">Prepared on {new Date().toLocaleDateString()} · {summary.person?.relationship || 'Profile not set'}</p>

                  <div className="print-section">
                    <h4>Emergency Details</h4>
                    <p style={{ margin: 0, fontSize: '11px' }}>Blood Group: <b>{emergency.bloodGroup || 'Not recorded'}</b> · Allergies: <b>{emergency.allergies || 'None recorded'}</b> · Contact: <b>{emergency.emergencyContactName} ({emergency.emergencyContactPhone})</b></p>
                  </div>

                  <div className="print-section">
                    <h4>Recorded Medicines</h4>
                    {summary.medicines.length ? <ul>{summary.medicines.map(item => <li key={item}>{item}</li>)}</ul> : <p>No medicines were extracted from the available records.</p>}
                  </div>

                  <div className="print-section">
                    <h4>Recorded Conditions or Tags</h4>
                    <p>{summary.conditions.length ? summary.conditions.join(', ') : 'None specifically recorded.'}</p>
                  </div>

                  <div className="print-section">
                    <h4>Recent Records on File</h4>
                    {summary.selected.slice(0, 8).length ? (
                      <ul className="summary-record-list">
                        {summary.selected.slice(0, 8).map(record => (
                          <li key={record.id}>
                            <strong>{record.title}</strong>
                            <span>{formatDate(record.recordDate)} · {TYPE_LABEL[record.documentType]}{record.doctorName ? ` · ${record.doctorName}` : ''}</span>
                            {record.summary && <small>{record.summary}</small>}
                          </li>
                        ))}
                      </ul>
                    ) : <p>No records saved for this profile yet.</p>}
                  </div>

                  <p className="print-disclaimer">Compiled from saved records only. Missing items do not confirm absence of an allergy or condition. Please confirm all details with your clinician.</p>
                </div>

                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeModal}>Close</button>
                  <button type="button" className="button button-primary" onClick={() => window.print()}><FileCheck2 size={17} /> Print / Save as PDF</button>
                </div>
              </section>
            );
          })()}

          {/* Add Person Modal */}
          {modal === 'person' && (
            <section className="modal-card person-modal" role="dialog" aria-modal="true" aria-labelledby="person-title">
              <ModalClose onClick={closeModal} />
              <div className="modal-eyebrow">FAMILY PROFILE</div>
              <h2 id="person-title">Add family profile</h2>
              <p className="modal-lede">Create a dedicated timeline for someone in your family.</p>
              <form onSubmit={handleAddPerson} className="form-stack">
                <label className="field-label">Full name<input autoFocus required value={personForm.fullName} onChange={event => setPersonForm({ ...personForm, fullName: event.target.value })} placeholder="Full name as printed on documents" maxLength={120} /></label>
                <label className="field-label">Relationship
                  <select value={personForm.relationship} onChange={event => setPersonForm({ ...personForm, relationship: event.target.value })}>
                    <option>Me</option><option>Parent</option><option>Spouse</option><option>Child</option><option>Sibling</option><option>Other</option>
                  </select>
                </label>
                <label className="field-label">Date of birth <span className="optional-text">· optional</span><input type="date" value={personForm.dateOfBirth} onChange={event => setPersonForm({ ...personForm, dateOfBirth: event.target.value })} /></label>
                <div className="modal-actions">
                  <button type="button" className="button button-secondary" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="button button-primary" disabled={personSaving || !personForm.fullName.trim()}>{personSaving ? 'Adding…' : 'Add profile'}</button>
                </div>
              </form>
            </section>
          )}

          {/* Privacy & Data Deletion Modal */}
          {modal === 'privacy' && (
            <section className="modal-card privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
              <ModalClose onClick={closeModal} />
              <div className="privacy-modal-mark"><ShieldCheck size={25} /></div>
              <div className="modal-eyebrow">DATA PROTECTION & TRUST</div>
              <h2 id="privacy-title">Your health data is private.</h2>
              <p className="modal-lede">CareVault is designed with explicit privacy boundaries and user data control.</p>

              <div className="privacy-check-list">
                <div><CheckCircle2 size={18} /><span><strong>No API key on client</strong><small>Private AI keys live on the server only.</small></span></div>
                <div><CheckCircle2 size={18} /><span><strong>Account isolation (RLS)</strong><small>Row Level Security ensures only you see your records.</small></span></div>
                <div><CheckCircle2 size={18} /><span><strong>Review before saving</strong><small>AI acts as a librarian draft; you confirm every fact.</small></span></div>
                <div><CheckCircle2 size={18} /><span><strong>Private file storage</strong><small>Original PDFs & images use short-lived signed URLs.</small></span></div>
              </div>

              {previewMode && (
                <div className="setup-steps">
                  <strong>Connect external services</strong>
                  <p>
                    1. Create a Supabase project and execute <code>supabase/schema.sql</code>.<br />
                    2. In <code>.env</code>, enter your Supabase URL, anon key and server <code>GEMINI_API_KEY</code>.<br />
                    3. Restart server with <code>npm run server</code>.
                  </p>
                </div>
              )}

              <div className="delete-zone">
                <div className="delete-zone-heading">
                  <Trash2 size={17} />
                  <div>
                    <strong>Delete everything</strong>
                    <small>Permanently delete all records, attachments, family profiles and reminders.</small>
                  </div>
                </div>
                <label className="field-label">Type DELETE to confirm
                  <input value={deletePhrase} onChange={event => setDeletePhrase(event.target.value)} placeholder="DELETE" />
                </label>
                <button type="button" className="button button-danger button-full" disabled={deletePhrase !== 'DELETE' || saving} onClick={handleDeleteEverything}>{saving ? 'Deleting…' : 'Delete everything'}</button>
              </div>

              <div className="modal-actions"><button type="button" className="button button-primary" onClick={closeModal}>Done</button></div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

const TypeIcon: React.FC<{ type: DocumentType }> = ({ type }) => {
  const Icon = TYPE_ICON[type] || FileText;
  return <Icon size={20} />;
};

const RecordRow: React.FC<{
  record: MedicalRecord;
  onClick: () => void;
  onFavorite: () => void;
  onExplain?: () => void;
  showPerson?: boolean;
}> = ({ record, onClick, onFavorite, onExplain, showPerson = false }) => (
  <div className="record-row">
    <button type="button" className="record-row-main" onClick={onClick}>
      <span className={`record-type-icon type-${record.documentType}`}><TypeIcon type={record.documentType} /></span>
      <span className="record-row-copy">
        <strong>{record.title}</strong>
        <span>{TYPE_LABEL[record.documentType]}{record.doctorName ? ` · ${record.doctorName}` : ''}{showPerson && record.personName ? ` · ${record.personName}` : ''}</span>
      </span>
      <span className="record-row-date">{formatDate(record.recordDate)}</span>
      {record.reviewStatus === 'needs_review' && <span className="status-pill status-review">Review</span>}
      <ChevronRight size={17} className="record-chevron" />
    </button>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {onExplain && (
        <button type="button" className="icon-button" onClick={event => { event.stopPropagation(); onExplain(); }} title="What is this? Explain terms" aria-label="Explain terms in this record">
          <HelpCircle size={15} />
        </button>
      )}
      <button type="button" className={`favorite-button ${record.isFavorite ? 'is-favorite' : ''}`} onClick={event => { event.stopPropagation(); onFavorite(); }} aria-label={record.isFavorite ? 'Remove favourite' : 'Add favourite'}>
        <Star size={16} fill={record.isFavorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  </div>
);

const Timeline: React.FC<{ records: MedicalRecord[]; onOpen: (record: MedicalRecord) => void }> = ({ records, onOpen }) => {
  if (!records.length) return <div className="timeline-empty"><Clock3 size={18} /><span>Records will appear here, newest first.</span></div>;
  return (
    <div className="timeline-list">
      {records.map(record => (
        <button type="button" key={record.id} className="timeline-item" onClick={() => onOpen(record)}>
          <span className="timeline-line"><span /></span>
          <span className="timeline-date">{formatDate(record.recordDate)}</span>
          <span className="timeline-content">
            <strong>{record.title}</strong>
            <small>{TYPE_LABEL[record.documentType]}{record.personName ? ` · ${record.personName}` : ''}</small>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ icon: LucideIcon; title: string; body: string; action: string; onAction: () => void }> = ({ icon: Icon, title, body, action, onAction }) => (
  <div className="empty-state">
    <span className="empty-state-icon"><Icon size={25} /></span>
    <h3>{title}</h3>
    <p>{body}</p>
    <button type="button" className="button button-secondary" onClick={onAction}>{action} <ArrowUpRight size={15} /></button>
  </div>
);

const LoadingRows: React.FC = () => <div className="loading-rows" aria-label="Loading records"><span /><span /><span /></div>;

const SignInPrompt: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => (
  <section className="sign-in-prompt">
    <span className="sign-in-lock"><LockKeyhole size={23} /></span>
    <h2>Sign in to open your private vault</h2>
    <p>Your records are kept private. Sign in with passwordless SMS or Google to access your medical timeline.</p>
    <button type="button" className="button button-primary" onClick={onSignIn}>Sign in securely <ChevronRight size={16} /></button>
    <div className="sign-in-foot"><ShieldCheck size={15} /> Passwordless phone verification or Google sign-in</div>
  </section>
);

const ModalClose: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" className="modal-close icon-button" onClick={onClick} aria-label="Close dialog"><X size={19} /></button>
);

const GoogleGlyph: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.62 5.91c4.45-4.1 7.14-10.14 7.14-17.56Z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.86.93 7.5 2.56 10.78l7.97-6.19Z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.84 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>
);

export default DashboardPage;
