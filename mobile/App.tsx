import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  ScrollView, Share, StatusBar, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import * as Crypto from 'expo-crypto';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import QRCode from 'react-native-qrcode-svg';
import type { Attachment, DocumentType, EmergencyProfile, MedicalRecord, PersonProfile, Reminder, Settings } from './src/types';
import { DEFAULT_SETTINGS, DOCUMENT_TYPES, EMPTY_EMERGENCY } from './src/types';
import { API_BASE, demoLoginEnabled, isSupabaseConfigured, supabase } from './src/supabase';
import { clearLocalOwner, loadLocalState, localOwnerKey, newId, persistSelectedFile, readJson, refreshFromCloud, saveLocalState, savePersonToCloud, uploadRecordToCloud, writeJson, deleteLocalRecordFiles } from './src/storage';
import { answerFromRecords, lookupGlossary } from './src/safety';

WebBrowser.maybeCompleteAuthSession();
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

type ViewName = 'home' | 'records' | 'people' | 'settings' | 'premium' | 'add' | 'detail' | 'doctor' | 'appointment' | 'labs' | 'ask' | 'emergency' | 'reminders' | 'share';
type SelectedFile = { uri: string; name: string; mimeType: string; size: number };
const docLabel = (type: DocumentType) => DOCUMENT_TYPES.find(d => d.value === type)?.label || 'Other';
const dateLabel = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not recorded';
const fileType = (name: string, mime?: string | null) => mime || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : name.toLowerCase().endsWith('.png') ? 'image/png' : name.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const formatBytes = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const PUBLIC_APP_URL = (process.env.EXPO_PUBLIC_PUBLIC_APP_URL || '').replace(/\/$/, '');

const PALETTE = {
  light: { bg: '#F4F7F3', card: '#FFFFFF', surface: '#EAF0E8', text: '#172B22', muted: '#67766E', line: '#DCE5DB', primary: '#286548', primaryText: '#FFFFFF', softGreen: '#E4F2E8', gold: '#A86A16', softGold: '#FFF3DD', danger: '#B42318', softRed: '#FDE9E7', purple: '#6555A4', softPurple: '#EEEAFE', input: '#FFFFFF', shadow: '#183828' },
  dark: { bg: '#101A15', card: '#19271F', surface: '#23362A', text: '#F2F7F3', muted: '#A8B9AE', line: '#30473A', primary: '#76C497', primaryText: '#0C2115', softGreen: '#243E2C', gold: '#F0BB65', softGold: '#49361E', danger: '#FF8C82', softRed: '#4B2826', purple: '#C0B6FF', softPurple: '#302A4B', input: '#15231B', shadow: '#000000' },
};
type Colors = typeof PALETTE.light;

const TRANSLATIONS: Record<string, Record<string, string>> = {
  English: {
    home: 'Home',
    records: 'Records',
    people: 'People',
    settings: 'Settings',
    add_record: 'Add a record',
    history_hero_title: 'Your history, one safe place.',
    history_hero_sub: 'Find records before your next appointment.',
    demo_workspace: 'DEMO WORKSPACE',
    personal_vault: 'PERSONAL HEALTH VAULT',
    search_placeholder: 'Search records, tests or doctor…',
    needs_review: 'Needs review',
    use_records: 'Use your records',
    doctor_summary: 'Doctor summary',
    doctor_summary_sub: 'One-page history',
    appointment_prep: 'Appointment prep',
    appointment_prep_sub: 'Notes and questions',
    lab_trends: 'Lab trends',
    lab_trends_sub: 'Values as printed',
    ask_records: 'Ask my records',
    ask_records_sub: 'Find source documents',
    emergency_card: 'Emergency card',
    emergency_card_sub: 'Key details at a glance',
    reminders: 'Reminders',
    reminders_sub: 'Follow-ups and tests',
    recently_added: 'Recently added',
    all_records: 'All records',
    ai_librarian_title: 'AI is a librarian, not a doctor',
    ai_librarian_sub: 'CareVault organises documents and repeats what was recorded. Confirm medical decisions with your clinician.',
    settings_title: 'Settings & privacy',
    settings_sub: 'Make CareVault comfortable for you',
    accessibility_section: 'Accessibility and appearance',
    dark_mode: 'Dark mode',
    dark_mode_sub: 'Reduce brightness in low light',
    large_text: 'Larger text',
    large_text_sub: 'Use larger text and tap-friendly labels',
    simple_mode: 'Simple mode',
    simple_mode_sub: 'Keep the main actions and hide advanced filters',
    voice_readout: 'Read summaries aloud',
    voice_readout_sub: 'Enable the read-out action on records',
    language_pref: 'Language preference',
    privacy_section: 'Privacy and security',
    biometric_lock: 'Biometric app lock',
    biometric_lock_sub: 'Request Face ID / fingerprint unlock when reopening',
    test_biometric: 'Test biometric prompt now',
    show_sensitive: 'Show sensitive records',
    show_sensitive_sub: 'Sensitive records are hidden by default on Home and Records',
    ai_consent: 'AI processing consent',
    your_data: 'Your data',
    export_all_pdf: 'Export all records as PDF',
    sync_pending: 'Sync pending + refresh',
    delete_everything: 'Delete everything',
    premium_title: 'CareVault Premium',
    exit_demo: 'Exit demo',
    sign_out: 'Sign out',
    unlock_carevault: 'Unlock CareVault',
    carevault_locked: 'CareVault is locked',
    use_biometrics: 'Use Face ID, fingerprint or PIN to continue.',
    try_again: 'Try unlock again',
    dismiss_lock: 'Dismiss lock',
    unlock_device: 'Unlock with Biometrics / PIN',
    demo_unlock: 'One-Tap Demo Unlock',
    matching_docs: 'matching documents',
    add_button: 'Add',
    all_types: 'All types',
    everyone: 'Everyone',
    favourites_filter: '★ Favourites',
    needs_review_filter: 'Needs review',
    show_sensitive_filter: 'Show sensitive records',
    hide_sensitive_filter: 'Hide sensitive records',
    refine_search: 'Refine search',
    doctor_label: 'Doctor',
    hospital_label: 'Hospital / lab',
    from_date_label: 'From date',
    to_date_label: 'To date',
    clear_search: 'Clear search and all filters',
    manage_family: 'Manage family profiles',
    one_account_many: 'One account, many people',
    one_account_sub: 'Keep each person’s documents together. Check the person shown on every document before saving it.',
    add_person_btn: 'Add person',
    new_family_profile: 'New family profile',
    full_name_label: 'Full name',
    relationship_label: 'Relationship',
    dob_label: 'Date of birth (YYYY-MM-DD, optional)',
    cancel_btn: 'Cancel',
    save_person_btn: 'Save person',
  },
  'हिन्दी': {
    home: 'होम',
    records: 'रिकॉर्ड्स',
    people: 'परिवार',
    settings: 'सेटिंग्स',
    add_record: 'रिकॉर्ड जोड़ें',
    history_hero_title: 'आपका इतिहास, एक सुरक्षित जगह।',
    history_hero_sub: 'अपनी अगली डॉक्टर विज़िट से पहले रिकॉर्ड देखें।',
    demo_workspace: 'डेमो वर्कस्पेस',
    personal_vault: 'पर्सनल हेल्थ वॉल्ट',
    search_placeholder: 'रिकॉर्ड, टेस्ट या डॉक्टर खोजें…',
    needs_review: 'समीक्षा चाहिए',
    use_records: 'रिकॉर्ड्स का उपयोग करें',
    doctor_summary: 'डॉक्टर सारांश',
    doctor_summary_sub: 'एक पेज का इतिहास',
    appointment_prep: 'अपॉइंटमेंट तैयारी',
    appointment_prep_sub: 'नोट्स और डॉक्टर से सवाल',
    lab_trends: 'लैब ट्रेंड्स',
    lab_trends_sub: 'रिपोर्ट के अनुसार वैल्यू',
    ask_records: 'रिकॉर्ड्स से पूछें',
    ask_records_sub: 'दस्तावेज़ और तारीख खोजें',
    emergency_card: 'इमरजेंसी कार्ड',
    emergency_card_sub: 'ज़रूरी जानकारी एक नज़र में',
    reminders: 'याद दिलाएं',
    reminders_sub: 'फॉलो-अप और टेस्ट',
    recently_added: 'हाल ही में जोड़े गए',
    all_records: 'सभी रिकॉर्ड्स',
    ai_librarian_title: 'एआई लाइब्रेरियन है, डॉक्टर नहीं',
    ai_librarian_sub: 'केयरवॉल्ट केवल आपके दस्तावेज़ व्यवस्थित करता है। चिकित्सा संबंधी निर्णय अपने डॉक्टर से पूछकर ही लें।',
    settings_title: 'सेटिंग्स और गोपनीयता',
    settings_sub: 'केयरवॉल्ट को अपनी सुविधानुसार बनाएं',
    accessibility_section: 'सुलभता और दिखावट',
    dark_mode: 'डार्क मोड',
    dark_mode_sub: 'कम रोशनी में चमक कम करें',
    large_text: 'बड़ा टेक्स्ट',
    large_text_sub: 'आसानी से पढ़ने योग्य बड़ा टेक्स्ट और बटन',
    simple_mode: 'सरल मोड',
    simple_mode_sub: 'बुजुर्गों के लिए आसान इंटरफ़ेस',
    voice_readout: 'बोलकर सुनाएं',
    voice_readout_sub: 'रिकॉर्ड का सारांश आवाज़ में सुनें',
    language_pref: 'भाषा का चयन',
    privacy_section: 'गोपनीयता और सुरक्षा',
    biometric_lock: 'बायोमेट्रिक ऐप लॉक',
    biometric_lock_sub: 'ऐप खोलने पर फेस आईडी या फिंगरप्रिंट मांगें',
    test_biometric: 'बायोमेट्रिक टेस्ट करें',
    show_sensitive: 'छिपे हुए रिकॉर्ड दिखाएं',
    show_sensitive_sub: 'संवेदनशील रिकॉर्ड्स को होम पर दिखाएं',
    ai_consent: 'एआई सहमति',
    your_data: 'आपका डेटा',
    export_all_pdf: 'सभी रिकॉर्ड PDF में डाउनलोड करें',
    sync_pending: 'सिंक करें और रीफ्रेश करें',
    delete_everything: 'सब कुछ हटाएं',
    premium_title: 'केयरवॉल्ट प्रीमियम',
    exit_demo: 'डेमो से बाहर निकलें',
    sign_out: 'साइन आउट',
    unlock_carevault: 'केयरवॉल्ट अनलॉक करें',
    carevault_locked: 'केयरवॉल्ट लॉक है',
    use_biometrics: 'जारी रखने के लिए फेस आईडी, फिंगरप्रिंट या पिन का उपयोग करें।',
    try_again: 'फिर से अनलॉक करें',
    dismiss_lock: 'लॉक हटाएं',
    unlock_device: 'बायोमेट्रिक / पिन से अनलॉक करें',
    demo_unlock: 'वन-टैप डेमो अनलॉक',
    matching_docs: 'संबंधित दस्तावेज़',
    add_button: 'जोड़ें',
    all_types: 'सभी प्रकार',
    everyone: 'सभी लोग',
    favourites_filter: '★ पसंदीदा',
    needs_review_filter: 'समीक्षा चाहिए',
    show_sensitive_filter: 'संवेदनशील रिकॉर्ड दिखाएं',
    hide_sensitive_filter: 'संवेदनशील रिकॉर्ड छुपाएं',
    refine_search: 'खोज को सीमित करें',
    doctor_label: 'डॉक्टर',
    hospital_label: 'अस्पताल / लैब',
    from_date_label: 'आरंभ तिथि',
    to_date_label: 'अंतिम तिथि',
    clear_search: 'खोज और फ़िल्टर साफ़ करें',
    manage_family: 'पारिवारिक प्रोफ़ाइल प्रबंधित करें',
    one_account_many: 'एक खाता, कई लोग',
    one_account_sub: 'हर व्यक्ति के दस्तावेज़ अलग रखें। सहेजने से पहले जांचें।',
    add_person_btn: 'व्यक्ति जोड़ें',
    new_family_profile: 'नई पारिवारिक प्रोफ़ाइल',
    full_name_label: 'पूरा नाम',
    relationship_label: 'संबंध',
    dob_label: 'जन्म तिथि (YYYY-MM-DD, वैकल्पिक)',
    cancel_btn: 'रद्द करें',
    save_person_btn: 'व्यक्ति सहेजें',
  },
  'اردو': {
    home: 'ہوم',
    records: 'ریکارڈز',
    people: 'خاندان',
    settings: 'ترتیبات',
    add_record: 'نیا ریکارڈ شامل کریں',
    history_hero_title: 'آپ کا طبی ریکارڈ، ایک محفوظ جگہ۔',
    history_hero_sub: 'اگلی ڈاکٹر کی ملاقات سے پہلے ریکارڈ تلاش کریں۔',
    demo_workspace: 'ڈیمو ورک اسپیس',
    personal_vault: 'ذاتی ہیلتھ والٹ',
    search_placeholder: 'ریکارڈ، ٹیسٹ یا ڈاکٹر تلاش کریں…',
    needs_review: 'جائزہ درکار',
    use_records: 'ریکارڈز کا استعمال',
    doctor_summary: 'ڈاکٹر خلاصہ',
    doctor_summary_sub: 'ایک صفحہ پر تاریخ',
    appointment_prep: 'ملاقات کی تیاری',
    appointment_prep_sub: 'ڈاکٹر کے سوالات اور نوٹس',
    lab_trends: 'لیب رجحانات',
    lab_trends_sub: 'رپورٹ کی اصل ویلیوز',
    ask_records: 'ریکارڈ سے پوچھیں',
    ask_records_sub: 'دستاویزات تلاش کریں',
    emergency_card: 'ایمرجنسی کارڈ',
    emergency_card_sub: 'اہم معلومات ایک نظر میں',
    reminders: 'یاد دہانیاں',
    reminders_sub: 'ٹیسٹ اور ڈاکٹر ملاقات',
    recently_added: 'حال ہی میں شامل کردہ',
    all_records: 'تمام ریکارڈز',
    ai_librarian_title: 'اے آئی لائبریرین ہے، ڈاکٹر نہیں',
    ai_librarian_sub: 'کیئر والٹ دستاویزات کو ترتیب دیتا ہے۔ طبی فیصلوں کے لیے اپنے معالج سے رجوع کریں۔',
    settings_title: 'ترتیبات اور پرائیویسی',
    settings_sub: 'کیئر والٹ کو اپنے مطابق بنائیں',
    accessibility_section: 'رسائی اور ظاہری شکل',
    dark_mode: 'ڈارک موڈ',
    dark_mode_sub: 'کم روشنی میں سکرین مدہم کریں',
    large_text: 'بڑا متن',
    large_text_sub: 'پڑھنے میں آسان بڑا متن اور بٹن',
    simple_mode: 'سادہ موڈ',
    simple_mode_sub: 'بزرگوں کے لیے آسان انٹرفیس',
    voice_readout: 'پڑھ کر سنائیں',
    voice_readout_sub: 'خلاصہ آواز میں سنیں',
    language_pref: 'زبان کا انتخاب',
    privacy_section: 'پرائیویسی اور سیکیورٹی',
    biometric_lock: 'بائیو میٹرک ایپ لاک',
    biometric_lock_sub: 'چہرہ شناسی یا فنگر پرنٹ لاک',
    test_biometric: 'بائیو میٹرک ٹیسٹ کریں',
    show_sensitive: 'پوشیدہ ریکارڈ دکھائیں',
    show_sensitive_sub: 'چھپائے گئے ریکارڈز کو سامنے لائیں',
    ai_consent: 'اے آئی رضامندی',
    your_data: 'آپ کا ڈیٹا',
    export_all_pdf: 'تمام ریکارڈ پی ڈی ایف میں ڈاؤن لوڈ کریں',
    sync_pending: 'مطابقت پذیری کریں',
    delete_everything: 'سب کچھ حذف کریں',
    premium_title: 'کیئر والٹ پریمیم',
    exit_demo: 'ڈیمو سے باہر نکلیں',
    sign_out: 'سائن آؤٹ',
    unlock_carevault: 'کیئر والٹ ان لاک کریں',
    carevault_locked: 'کیئر والٹ مقفل ہے',
    use_biometrics: 'جاری رکھنے کے لیے فیس آئی ڈی، فنگر پرنٹ یا پن استعمال کریں۔',
    try_again: 'دوبارہ کوشش کریں',
    dismiss_lock: 'لاک ختم کریں',
    unlock_device: 'بائیو میٹرک / پن سے ان لاک کریں',
    demo_unlock: 'ون ٹیپ ڈیمو ان لاک',
    matching_docs: 'مطابق دستاویزات',
    add_button: 'شامل کریں',
    all_types: 'تمام اقسام',
    everyone: 'سبھی',
    favourites_filter: '★ پسندیدہ',
    needs_review_filter: 'جائزہ درکار',
    show_sensitive_filter: 'پوشیدہ ریکارڈ دکھائیں',
    hide_sensitive_filter: 'پوشیدہ ریکارڈ چھپائیں',
    refine_search: 'تلاش بہتر بنائیں',
    doctor_label: 'ڈاکٹر',
    hospital_label: 'ہسپتال / لیب',
    from_date_label: 'ابتدائی تاریخ',
    to_date_label: 'آخری تاریخ',
    clear_search: 'تمام فلٹرز صاف کریں',
    manage_family: 'خاندانی پروفائلز کا نظم کریں',
    one_account_many: 'ایک اکاؤنٹ، کئی افراد',
    one_account_sub: 'ہر فرد کی دستاویزات الگ رکھیں۔ سहेजنے سے پہلے تصدیق کریں۔',
    add_person_btn: 'فرد شامل کریں',
    new_family_profile: 'نیا خاندانی پروفائل',
    full_name_label: 'مکمل نام',
    relationship_label: 'تعلق',
    dob_label: 'تاریخ پیدائش (اختیاری)',
    cancel_btn: 'منسوخ کریں',
    save_person_btn: 'محفوظ کریں',
  },
};

let currentLang = 'English';
function tr(key: string): string {
  const table = TRANSLATIONS[currentLang] || TRANSLATIONS.English;
  return table[key] || TRANSLATIONS.English[key] || key;
}

let currentColors: Colors = PALETTE.light;
function useColors() { return currentColors; }
let currentScale = 1;
function useFont() { return (size: number) => Math.round(size * currentScale); }

function AppButton({ title, icon, onPress, secondary = false, danger = false, disabled = false, small = false, style }: { title: string; icon?: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean; small?: boolean; style?: any }) {
  const c = useColors();
  const font = useFont();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: danger ? c.softRed : secondary ? c.surface : c.primary, borderColor: danger ? c.danger : secondary ? c.line : c.primary, opacity: disabled ? 0.45 : pressed ? 0.78 : 1, paddingVertical: font(small ? 9 : 13), paddingHorizontal: font(small ? 12 : 16) }, style]}>
    {icon ? <MaterialCommunityIcons name={icon as any} size={font(small ? 17 : 20)} color={danger ? c.danger : secondary ? c.text : c.primaryText} /> : null}
    <Text style={{ color: danger ? c.danger : secondary ? c.text : c.primaryText, fontWeight: '700', fontSize: font(small ? 12 : 15) }}>{title}</Text>
  </Pressable>;
}

function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  const c = useColors();
  const font = useFont();
  return <View style={[styles.screenHeader, { borderBottomColor: c.line }]}>{onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}><MaterialCommunityIcons name="arrow-left" size={font(22)} color={c.text} /></Pressable> : null}<View style={{ flex: 1 }}><Text style={[styles.screenTitle, { color: c.text, fontSize: font(22) }]}>{title}</Text>{subtitle ? <Text style={[styles.subtitle, { color: c.muted, fontSize: font(12) }]}>{subtitle}</Text> : null}</View>{right}</View>;
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType, editable = true, autoCapitalize = 'sentences', secureTextEntry = false }: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any; editable?: boolean; autoCapitalize?: any; secureTextEntry?: boolean }) {
  const c = useColors();
  const font = useFont();
  return <View style={{ gap: 6, marginBottom: 13 }}><Text style={[styles.fieldLabel, { color: c.text, fontSize: font(12) }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder || label} placeholderTextColor={c.muted} editable={editable} multiline={multiline} keyboardType={keyboardType} autoCapitalize={autoCapitalize} secureTextEntry={secureTextEntry} style={[styles.input, { backgroundColor: c.input, color: c.text, borderColor: c.line, fontSize: font(15), minHeight: multiline ? font(90) : font(48), textAlignVertical: multiline ? 'top' : 'center' }]} /></View>;
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, shadowColor: c.shadow }, style]}>{children}</View>;
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  const font = useFont();
  return <View style={styles.sectionTitleRow}><Text style={[styles.sectionTitle, { color: c.text, fontSize: font(16) }]}>{title}</Text>{action && onAction ? <Pressable onPress={onAction}><Text style={{ color: c.primary, fontWeight: '700', fontSize: font(13) }}>{action}</Text></Pressable> : null}</View>;
}

function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const c = useColors();
  const font = useFont();
  return <Pressable onPress={onPress} accessibilityRole="button" style={[styles.chip, { backgroundColor: active ? (color || c.softGreen) : c.surface, borderColor: active ? c.primary : c.line, paddingHorizontal: font(11), paddingVertical: font(7) }]}><Text style={{ color: c.text, fontSize: font(12), fontWeight: active ? '700' : '500' }}>{label}</Text></Pressable>;
}

function EmptyState({ title, body, icon = 'file-document-outline' }: { title: string; body: string; icon?: string }) {
  const c = useColors();
  const font = useFont();
  return <View style={{ alignItems: 'center', paddingVertical: 30, paddingHorizontal: 22, gap: 9 }}><View style={[styles.emptyIcon, { backgroundColor: c.surface }]}><MaterialCommunityIcons name={icon as any} size={font(30)} color={c.primary} /></View><Text style={{ color: c.text, fontSize: font(17), fontWeight: '800', textAlign: 'center' }}>{title}</Text><Text style={{ color: c.muted, fontSize: font(13), lineHeight: font(19), textAlign: 'center' }}>{body}</Text></View>;
}

function RecordTile({ record, onPress, onFavorite, onExplain, largeText }: { record: MedicalRecord; onPress: () => void; onFavorite: () => void; onExplain: () => void; largeText?: boolean }) {
  const c = useColors();
  const font = useFont();
  const icon = record.documentType === 'lab_report' ? 'chart-line' : record.documentType === 'prescription' ? 'pill' : record.documentType === 'scan' ? 'image-outline' : record.documentType === 'vaccination' ? 'needle' : record.documentType === 'discharge_summary' ? 'hospital-box-outline' : record.documentType === 'bill' ? 'receipt-text-outline' : 'file-document-outline';
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.recordTile, { backgroundColor: c.card, borderColor: c.line, opacity: pressed ? 0.82 : 1 }]} accessibilityRole="button" accessibilityLabel={`Open ${record.title}`}>
    <View style={[styles.recordIcon, { backgroundColor: c.softGreen }]}><MaterialCommunityIcons name={icon as any} size={font(22)} color={c.primary} /></View>
    <View style={{ flex: 1, gap: 4 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: font(15) }} numberOfLines={2}>{record.title}</Text><Text style={{ color: c.muted, fontSize: font(12) }}>{docLabel(record.documentType)} · {dateLabel(record.recordDate)}</Text><View style={styles.inlineWrap}>{record.personName ? <Text style={{ color: c.muted, fontSize: font(11) }}>{record.personName}</Text> : null}{record.reviewStatus === 'needs_review' ? <View style={[styles.statusPill, { backgroundColor: c.softGold }]}><Text style={{ color: c.gold, fontSize: font(10), fontWeight: '700' }}>Needs review</Text></View> : null}{record.isSensitive ? <View style={[styles.statusPill, { backgroundColor: c.softPurple }]}><Text style={{ color: c.purple, fontSize: font(10), fontWeight: '700' }}>Hidden</Text></View> : null}{record.syncStatus !== 'synced' ? <View style={[styles.statusPill, { backgroundColor: c.surface }]}><Text style={{ color: c.muted, fontSize: font(10), fontWeight: '700' }}>{record.syncStatus === 'pending' ? 'Sync pending' : 'On device'}</Text></View> : null}</View></View>
    <View style={{ alignItems: 'center', gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel={record.isFavorite ? 'Remove favourite' : 'Add favourite'} onPress={(e: any) => { e?.stopPropagation?.(); onFavorite(); }} hitSlop={8}><MaterialCommunityIcons name={record.isFavorite ? 'star' : 'star-outline'} size={font(21)} color={record.isFavorite ? c.gold : c.muted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Explain this term" onPress={(e: any) => { e?.stopPropagation?.(); onExplain(); }} hitSlop={8}><MaterialCommunityIcons name="help-circle-outline" size={font(20)} color={c.muted} /></Pressable></View>
  </Pressable>;
}

export default function App() {
  const [screen, setScreen] = useState<ViewName>('home');
  const [premiumPeriod, setPremiumPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [tab, setTab] = useState<'home' | 'records' | 'people'>('home');
  const [ownerKey, setOwnerKey] = useState('signed-out');
  const [demoMode, setDemoMode] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [emergency, setEmergency] = useState<EmergencyProfile>(EMPTY_EMERGENCY);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [query, setQuery] = useState('');
  const [remoteSearchIds, setRemoteSearchIds] = useState<string[] | null>(null);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [filterType, setFilterType] = useState<DocumentType | 'all'>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [fileDrafts, setFileDrafts] = useState<SelectedFile[]>([]);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<DocumentType>('other');
  const [draftDate, setDraftDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftDoctor, setDraftDoctor] = useState('');
  const [draftHospital, setDraftHospital] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftText, setDraftText] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftMedicines, setDraftMedicines] = useState('');
  const [draftStructuredMeds, setDraftStructuredMeds] = useState<any[]>([]);
  const [draftLabs, setDraftLabs] = useState('');
  const [draftPerson, setDraftPerson] = useState('');
  const [draftSensitive, setDraftSensitive] = useState(false);
  const [draftReviewed, setDraftReviewed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonRelationship, setNewPersonRelationship] = useState('Parent');
  const [newPersonDob, setNewPersonDob] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [appointmentQuestions, setAppointmentQuestions] = useState('');
  const [askQuestion, setAskQuestion] = useState('');
  const [askResult, setAskResult] = useState<{ answer: string; sources: MedicalRecord[]; redirected: boolean; emergency: boolean } | null>(null);
  const [glossaryTerm, setGlossaryTerm] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareId, setShareId] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState('');
  const [shareExpires, setShareExpires] = useState('7');
  const [sharedRecord, setSharedRecord] = useState<any>(null);
  const [lockPending, setLockPending] = useState(false);
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [labFilter, setLabFilter] = useState('HbA1c');
  const scrollRef = useRef<any>(null);
  const appStateRef = useRef(AppState.currentState);
  const isAuthenticatingRef = useRef(false);
  const hasAutoPromptedRef = useRef(false);
  currentColors = settings.darkMode ? PALETTE.dark : PALETTE.light;
  const c = currentColors;
  currentScale = settings.largeText ? 1.25 : 1;
  currentLang = settings.language;
  const font = (size: number) => Math.round(size * currentScale);
  const isRealUser = Boolean(session?.user?.id && !demoMode);

  const loadOwnerData = useCallback(async (nextOwner: string, demo: boolean, nextSession?: any) => {
    setLoading(true);
    try {
      setOwnerKey(nextOwner); setDemoMode(demo); setSession(nextSession || null);
      const local = await loadLocalState(nextOwner, demo);
      setRecords(local.records); setPeople(local.people); setReminders(local.reminders); setEmergency(local.emergency); setSettings(local.settings);
      setReady(true); setScreen('home'); setTab('home');
      if (!demo && nextSession && supabase && isSupabaseConfigured) {
        try {
          const cloud = await refreshFromCloud(local.records, local.people);
          setRecords(cloud.records); setPeople(cloud.people);
          await saveLocalState(nextOwner, 'records', cloud.records); await saveLocalState(nextOwner, 'people', cloud.people);
          const [{ data: reminderRows }, { data: emergencyRow }] = await Promise.all([
            supabase.from('follow_up_reminders').select('*').order('remind_at', { ascending: true }),
            supabase.from('emergency_profiles').select('*').maybeSingle(),
          ]);
          if (reminderRows) {
            const cloudReminders: Reminder[] = reminderRows.map((r: any) => ({ id: r.id, title: r.title, dueAt: r.remind_at, note: r.note || '', personId: r.person_id || null, recordId: r.record_id || null, notificationId: r.notification_id || undefined, done: r.status === 'done' }));
            setReminders(cloudReminders); await saveLocalState(nextOwner, 'reminders', cloudReminders);
          }
          if (emergencyRow) {
            const profile: EmergencyProfile = { bloodGroup: emergencyRow.blood_group || '', allergies: emergencyRow.allergies || '', conditions: emergencyRow.conditions || '', emergencyContactName: emergencyRow.emergency_contact_name || '', emergencyContactPhone: emergencyRow.emergency_contact_phone || '', notes: emergencyRow.notes || '' };
            setEmergency(profile); await saveLocalState(nextOwner, 'emergency', profile);
          }
        } catch (e) { console.warn('Offline mode: cloud records could not be refreshed.'); }
      }
      const nextSettings = local.settings;
      if (!demo && nextSettings.biometrics) { setBiometricUnlocked(false); setLockPending(true); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void readJson<boolean>('carevault.mobile.onboarding.v1', false).then(done => { if (!done) setOnboardingVisible(true); });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      if (supabase && isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        if (mounted && data.session) await loadOwnerData(data.session.user.id, false, data.session);
        else if (mounted) setReady(true);
      } else if (mounted) setReady(true);
    })().finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [loadOwnerData]);

  useEffect(() => { if (ready) void saveLocalState(ownerKey, 'records', records); }, [ownerKey, ready, records]);
  useEffect(() => { if (ready) void saveLocalState(ownerKey, 'people', people); }, [ownerKey, ready, people]);
  useEffect(() => { if (ready) void saveLocalState(ownerKey, 'reminders', reminders); }, [ownerKey, ready, reminders]);
  useEffect(() => { if (ready) void saveLocalState(ownerKey, 'emergency', emergency); }, [ownerKey, ready, emergency]);
  useEffect(() => { if (ready) void saveLocalState(ownerKey, 'settings', settings); }, [ownerKey, ready, settings]);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !supabase) return;
      try {
        const parsed = ExpoLinking.parse(url);
        const token = typeof parsed.path === 'string' ? parsed.path.split('/').filter(Boolean).pop() : undefined;
        if (token && (url.includes('/share/') || url.includes('share='))) {
          const { data, error } = await supabase.rpc('get_shared_record', { p_token: token });
          if (!error && data) setSharedRecord(data);
          else Alert.alert('Share link unavailable', 'This link may have expired or been revoked.');
        }
      } catch { /* Ignore unrelated deep links. */ }
    };
    void ExpoLinking.getInitialURL().then((url: string | null) => handleUrl(url ?? null));
    const sub = ExpoLinking.addEventListener('url', (e: { url: string }) => void handleUrl(e.url));
    return () => sub.remove();
  }, []);

  const authenticateUser = useCallback(async () => {
    if (isAuthenticatingRef.current) return;
    isAuthenticatingRef.current = true;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const secLevel = await LocalAuthentication.getEnrolledLevelAsync();
      if (!hasHardware && secLevel === 0) {
        Alert.alert('Device Lock', 'No biometric hardware detected. Unlocking app for preview.');
        setBiometricUnlocked(true);
        setLockPending(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: tr('unlock_carevault'),
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use device passcode',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setBiometricUnlocked(true);
        setLockPending(false);
      } else if ((result.error as string) === 'missing_usage_description') {
        Alert.alert(
          'Face ID in Expo Go',
          'Apple requires an Expo Development Build (npx expo run:ios) to show native Face ID sensor dialog. In Expo Go, iOS falls back to device passcode.\n\nUse One-Tap Demo Unlock to enter.',
          [
            { text: 'Unlock Now', onPress: () => { setBiometricUnlocked(true); setLockPending(false); } },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
    } catch (e: any) {
      console.warn('Authentication error:', e);
    } finally {
      setTimeout(() => {
        isAuthenticatingRef.current = false;
      }, 500);
    }
  }, []);

  useEffect(() => {
    if (lockPending && !biometricUnlocked) {
      if (!hasAutoPromptedRef.current) {
        hasAutoPromptedRef.current = true;
        void authenticateUser();
      }
    } else {
      hasAutoPromptedRef.current = false;
    }
  }, [lockPending, biometricUnlocked, authenticateUser]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const wasBackground = appStateRef.current === 'background';
      appStateRef.current = nextState;
      // Only lock when returning from ACTUAL background, and not during an active dialog
      if (wasBackground && nextState === 'active' && settings.biometrics && !isAuthenticatingRef.current) {
        setBiometricUnlocked(false);
        setLockPending(true);
      }
    });
    return () => sub.remove();
  }, [settings.biometrics]);

  const openView = (view: ViewName) => { setScreen(view); scrollRef.current?.scrollTo({ y: 0, animated: false }); };
  const saveRecords = async (next: MedicalRecord[]) => { setRecords(next); await saveLocalState(ownerKey, 'records', next); };
  const savePeople = async (next: PersonProfile[]) => { setPeople(next); await saveLocalState(ownerKey, 'people', next); };

  const handleSignOut = async () => {
    if (supabase && isRealUser) await supabase.auth.signOut();
    setSession(null); setDemoMode(false); setOwnerKey('signed-out'); setReady(true); setRecords([]); setPeople([]); setReminders([]); setScreen('home'); setTab('home'); setLockPending(false); setBiometricUnlocked(false);
  };
  const signInEmail = async () => {
    if (!supabase || !isSupabaseConfigured) { setAuthError('Configure Supabase first, or use the local demo login.'); return; }
    if (!email.trim() || !password.trim()) { setAuthError('Enter your email and password.'); return; }
    setLoading(true); setAuthError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (data.session) await loadOwnerData(data.session.user.id, false, data.session);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('email not confirmed')) {
        Alert.alert(
          'Confirm Email in Supabase',
          'To sign in immediately without verification links:\n\n1. Supabase Dashboard > Authentication > Providers > Email: Turn OFF "Confirm email" and Save.\n2. Under Authentication > Users: Click "•••" next to your email and select "Confirm email".'
        );
        setAuthError('Email not confirmed! Turn OFF "Confirm email" in Supabase (Auth > Providers > Email) or confirm the user in Auth > Users.');
      } else {
        setAuthError(msg || 'Could not sign in with email.');
      }
    } finally { setLoading(false); }
  };

  const signUpEmail = async () => {
    if (!supabase || !isSupabaseConfigured) { setAuthError('Configure Supabase first, or use the local demo login.'); return; }
    if (!email.trim() || !password.trim()) { setAuthError('Enter an email and password to register.'); return; }
    if (password.length < 6) { setAuthError('Password must be at least 6 characters.'); return; }
    setLoading(true); setAuthError('');
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      if (data.session) {
        await loadOwnerData(data.session.user.id, false, data.session);
      } else {
        Alert.alert(
          'Account Created! 🎉',
          'Tip: In Supabase Dashboard (Authentication > Providers > Email) turn OFF "Confirm email" for instant login without verification links!'
        );
        setIsSignUp(false);
      }
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('rate limit')) {
        Alert.alert(
          'Email Rate Limit Reached',
          'Supabase free email limit was reached.\n\nFix in 10 seconds:\n1. Open Supabase Dashboard > Authentication > Providers > Email\n2. Toggle OFF "Confirm email" and click Save.\n\nThen you can sign up and log in instantly with no emails needed!'
        );
        setAuthError('Turn OFF "Confirm email" in Supabase Dashboard (Auth > Providers > Email) to sign up instantly without email limits.');
      } else {
        setAuthError(msg || 'Could not register account.');
      }
    } finally { setLoading(false); }
  };

function parseOAuthCallback(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!url) return params;

  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    if (parsed.hash) {
      const hashStr = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
      const hashParams = new URLSearchParams(hashStr);
      hashParams.forEach((v, k) => {
        if (!params[k]) params[k] = v;
      });
    }
  } catch {
    // Ignore URL constructor errors on custom schemes
  }

  const qIndex = url.indexOf('?');
  const hIndex = url.indexOf('#');

  if (qIndex !== -1) {
    const rawQuery = hIndex > qIndex ? url.substring(qIndex + 1, hIndex) : url.substring(qIndex + 1);
    rawQuery.split('&').forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const k = decodeURIComponent(pair.substring(0, eq));
        const v = decodeURIComponent(pair.substring(eq + 1));
        if (!params[k]) params[k] = v;
      }
    });
  }

  if (hIndex !== -1) {
    const rawHash = qIndex > hIndex ? url.substring(hIndex + 1, qIndex) : url.substring(hIndex + 1);
    rawHash.split('&').forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const k = decodeURIComponent(pair.substring(0, eq));
        const v = decodeURIComponent(pair.substring(eq + 1));
        if (!params[k]) params[k] = v;
      }
    });
  }

  return params;
}

  const signInGoogle = async () => {
    if (!supabase || !isSupabaseConfigured) { setAuthError('Configure Supabase first, or use the local demo login.'); return; }
    setAuthError('');
    try {
      const redirectTo = AuthSession.makeRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw error || new Error('Could not start Google sign in.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return;

      const params = parseOAuthCallback(result.url);

      // 1. Check for errors returned by provider or Supabase
      if (params.error || params.error_description) {
        const errDesc = (params.error_description || params.error || 'Authentication failed or was denied.').replace(/\+/g, ' ');
        throw new Error(errDesc);
      }

      // 2. Check for PKCE authorization code
      if (params.code) {
        const exchanged = await supabase.auth.exchangeCodeForSession(params.code);
        if (exchanged.error || !exchanged.data.session) {
          throw exchanged.error || new Error('Could not exchange authorization code for session.');
        }
        await loadOwnerData(exchanged.data.session.user.id, false, exchanged.data.session);
        return;
      }

      // 3. Check for implicit flow tokens
      if (params.access_token && params.refresh_token) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (sessionError || !sessionData.session) {
          throw sessionError || new Error('Could not restore session from tokens.');
        }
        await loadOwnerData(sessionData.session.user.id, false, sessionData.session);
        return;
      }

      // 4. Alert exact URL so neither user nor developer is left blind
      Alert.alert(
        'Callback Received',
        `Returned URL:\n${result.url}\n\nNo authorization code or session tokens found. You can also sign in directly using your Email and Password above!`
      );
      throw new Error(`The sign-in response did not return valid session tokens. (URL: ${result.url})`);
    } catch (e: any) {
      const msg = e?.message || 'Google sign-in failed.';
      if (msg.includes('unable to exchange external code')) {
        Alert.alert(
          'Google Handshake Issue',
          'Supabase received Google\'s code but could not exchange it with Google.\n\nTwo quick checks:\n1. Supabase Dashboard > Providers > Google: Ensure "Client Secret" matches your Google Cloud Console secret.\n2. Google Cloud Console > Credentials: Ensure Authorized redirect URIs includes:\nhttps://iucxfrvhlryjnhvtguqm.supabase.co/auth/v1/callback\n\nQuickest fix right now: Turn OFF "Confirm email" in Supabase to use Email login immediately!'
        );
        setAuthError('Google code exchange failed: check Client Secret in Supabase Providers > Google, or use Email sign-in.');
      } else if (msg.includes('not enabled') || msg.includes('Unsupported provider') || (e as any).code === 'validation_failed') {
        Alert.alert(
          'Google Provider Not Configured',
          'Google OAuth is not enabled in your Supabase dashboard yet.\n\nQuickest solution: Use Email & Password with your Gmail address to sign in immediately!'
        );
        setAuthError('To use Google login: enable Google in Supabase Dashboard > Authentication > Providers > Google, or use Email with your Gmail address.');
      } else {
        setAuthError(msg);
      }
    }
  };

  const updateRecord = async (record: MedicalRecord) => {
    const next = records.map(r => r.id === record.id ? record : r);
    await saveRecords(next);
    if (supabase && isRealUser && record.syncStatus === 'synced') {
      const { error } = await supabase.from('medical_records').update({ title: record.title, document_type: record.documentType, record_date: record.recordDate, doctor_name: record.doctorName, hospital_name: record.hospitalName, summary: record.summary, extracted_text: record.extractedText, tags: record.tags, medicines: record.medicines, lab_values: record.labValues, confidence: record.confidence, review_status: record.reviewStatus, is_favorite: record.isFavorite, is_sensitive: record.isSensitive }).eq('id', record.id);
      if (error) {
        const pending = next.map(r => r.id === record.id ? { ...record, syncStatus: 'pending' as const } : r);
        await saveRecords(pending);
        Alert.alert('Saved on device', 'Your edit is saved locally, but cloud sync failed. It is marked for another sync attempt.');
      }
    }
  };
  const toggleFavorite = (record: MedicalRecord) => void updateRecord({ ...record, isFavorite: !record.isFavorite });
  const markReviewed = (record: MedicalRecord) => void updateRecord({ ...record, reviewStatus: 'confirmed' });
  const explainTerm = (term: string) => { setGlossaryTerm(term); openView('detail'); setSelectedRecord(null); };

  useEffect(() => {
    if (!isRealUser || !supabase || query.trim().length < 2) { setRemoteSearchIds(null); return; }
    let active = true;
    const client = supabase;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await client.rpc('search_medical_records', { search_text: query.trim(), person_filter: personFilter === 'all' ? null : personFilter });
        if (active) setRemoteSearchIds(error ? null : (data || []).map((row: any) => row.id));
      } catch {
        if (active) setRemoteSearchIds(null);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, isRealUser, personFilter]);

  const labValues = useMemo(() => records.filter(r => !r.isSensitive).flatMap(r => r.labValues.map(v => ({ ...v, recordTitle: r.title, recordDate: v.date || r.recordDate || '' }))).filter(v => v.name.toLowerCase().includes(labFilter.toLowerCase()) || labFilter === 'All tests').sort((a, b) => a.recordDate.localeCompare(b.recordDate)), [records, labFilter]);

  const filteredRecords = useMemo(() => records.filter(r => {
    if (!settings.showHidden && r.isSensitive) return false;
    if (filterType !== 'all' && r.documentType !== filterType) return false;
    if (personFilter !== 'all' && r.personId !== personFilter) return false;
    if (doctorFilter.trim() && !(r.doctorName || '').toLowerCase().includes(doctorFilter.trim().toLowerCase())) return false;
    if (hospitalFilter.trim() && !(r.hospitalName || '').toLowerCase().includes(hospitalFilter.trim().toLowerCase())) return false;
    if (dateFrom && (!r.recordDate || r.recordDate < dateFrom)) return false;
    if (dateTo && (!r.recordDate || r.recordDate > dateTo)) return false;
    if (tagFilter && !r.tags.some(tag => tag.toLowerCase() === tagFilter.toLowerCase())) return false;
    if (showFavouritesOnly && !r.isFavorite) return false;
    if (showReviewOnly && r.reviewStatus !== 'needs_review') return false;
    const q = query.trim().toLowerCase();
    if (q) {
      const synonyms: Record<string, string[]> = { sugar: ['glucose', 'hba1c', 'a1c', 'fbs', 'fasting'], thyroid: ['tsh', 't3', 't4'], medicine: ['medicines', 'prescription', 'tablet'] };
      const terms = [q, ...Object.entries(synonyms).filter(([key, vals]) => key.includes(q) || q.includes(key) || vals.some(v => v.includes(q) || q.includes(v))).flatMap(([key, vals]) => [key, ...vals]), ...(synonyms[q] || [])];
      const content = [r.title, r.recordDate, r.doctorName, r.hospitalName, r.summary, r.extractedText, ...r.tags, ...r.medicines, ...r.labValues.map(v => `${v.name} ${v.value} ${v.unit || ''}`), r.personName].join(' ').toLowerCase();
      if (!(remoteSearchIds?.includes(r.id) || terms.some(t => content.includes(t)))) return false;
    }
    return true;
  }).sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt)), [records, settings.showHidden, filterType, personFilter, showFavouritesOnly, showReviewOnly, query, remoteSearchIds, doctorFilter, hospitalFilter, dateFrom, dateTo, tagFilter]);

  const startAddRecord = () => {
    setEditingRecordId(null); setFileDrafts([]); setDraftTitle(''); setDraftType('other'); setDraftDate(new Date().toISOString().slice(0, 10)); setDraftDoctor(''); setDraftHospital(''); setDraftSummary(''); setDraftText(''); setDraftTags(''); setDraftMedicines(''); setDraftStructuredMeds([]); setDraftLabs(''); setDraftPerson(people[0]?.id || ''); setDraftSensitive(false); setDraftReviewed(false); openView('add');
  };
  const startEditRecord = (record: MedicalRecord) => {
    setEditingRecordId(record.id); setFileDrafts([]); setDraftTitle(record.title); setDraftType(record.documentType); setDraftDate(record.recordDate || '');
    setDraftDoctor(record.doctorName || ''); setDraftHospital(record.hospitalName || ''); setDraftSummary(record.summary || ''); setDraftText(record.extractedText || '');
    setDraftTags(record.tags.join(', ')); setDraftMedicines(record.medicines.join(', ')); setDraftStructuredMeds(record.structuredMedicines || []);
    setDraftLabs(record.labValues.map(v => [v.name, v.value, v.unit || '', v.referenceRange || '', v.reportMarker || ''].join(' | ')).join('\n'));
    setDraftPerson(record.personId || ''); setDraftSensitive(record.isSensitive); setDraftReviewed(record.reviewStatus === 'confirmed'); openView('add');
  };
  const appendFiles = (files: SelectedFile[]) => {
    if (!files.length) return;
    setFileDrafts(prev => [...prev, ...files].slice(0, 20));
    if (!draftTitle) setDraftTitle(files[0].name.replace(/\.[^.]+$/, '').slice(0, 160));
  };
  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], multiple: true, copyToCacheDirectory: true });
      if (!result.canceled) appendFiles(result.assets.map((f: any) => ({ uri: f.uri, name: f.name || 'medical-record', mimeType: fileType(f.name || '', f.mimeType), size: f.size || 0 })));
    } catch (e: any) { Alert.alert('Could not open files', e?.message || 'Try selecting the file again.'); }
  };
  const pickPhotos = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsMultipleSelection: true, quality: 0.9 });
      if (!result.canceled) appendFiles(result.assets.map((f: any, i: number) => ({ uri: f.uri, name: f.fileName || `photo-${Date.now()}-${i + 1}.jpg`, mimeType: fileType(f.fileName || '', f.mimeType), size: f.fileSize || 0 })));
    } catch (e: any) { Alert.alert('Could not open photos', e?.message || 'Try again.'); }
  };
  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Camera permission', 'Allow camera access in your phone settings to photograph a record.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, allowsEditing: true, quality: 0.85 });
      if (!result.canceled) appendFiles(result.assets.map((f: any) => ({ uri: f.uri, name: f.fileName || `scan-${Date.now()}.jpg`, mimeType: fileType(f.fileName || '', f.mimeType), size: f.fileSize || 0 })));
    } catch (e: any) { Alert.alert('Camera unavailable', e?.message || 'Try again.'); }
  };
  const scanPages = async () => {
    try {
      const result: any = await (CameraView as any).scanDocumentAsync({ requestPdf: true });
      if (!result) return;
      if (result.pdfUri) appendFiles([{ uri: result.pdfUri, name: `scanned-record-${Date.now()}.pdf`, mimeType: 'application/pdf', size: 0 }]);
      else if (result.pages?.length) appendFiles(result.pages.map((page: any, i: number) => { const uri = typeof page === 'string' ? page : page.uri; return { uri, name: `scanned-page-${Date.now()}-${i + 1}.jpg`, mimeType: 'image/jpeg', size: 0 }; }));
      else await takePhoto();
    } catch { Alert.alert('Scanner unavailable', 'The native multi-page scanner requires a compatible Expo SDK 58 development build. You can still use Take photo or Choose file.'); }
  };

  const runAIExtraction = async () => {
    if (!fileDrafts.length) { Alert.alert('Add a file first', 'Choose a PDF or image before running AI extraction.'); return; }
    if (!API_BASE) { Alert.alert('AI not connected', 'API server URL is not configured. Configure EXPO_PUBLIC_API_BASE_URL. You can still enter details manually.'); return; }
    const doAnalyze = async () => {
      setAnalyzing(true);
      try {
        // Analyze every selected attachment sequentially to keep memory use bounded and ensure
        // every page/file contributes searchable text. Extraction is still only a draft.
        const analyses: any[] = [];
        for (const file of fileDrafts) {
          const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' as any });
          const token = session?.access_token || 'demo';
          const response = await fetch(`${API_BASE}/records/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fileName: file.name, mimeType: file.mimeType, base64: b64 }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(`${file.name}: ${data?.message || `AI extraction failed (${response.status}).`}`);
          analyses.push({ ...data, sourceFileName: file.name });
        }
        const first = analyses[0] || {};
        const mergedTags = [...new Set(analyses.flatMap(d => Array.isArray(d.tags) ? d.tags : []))];
        const mergedMedicines = [...new Set(analyses.flatMap(d => Array.isArray(d.medicines) ? d.medicines : []))];
        const mergedStructured = analyses.flatMap(d => Array.isArray(d.structuredMedicines) ? d.structuredMedicines : []);
        const mergedLabs = analyses.flatMap(d => Array.isArray(d.labValues) ? d.labValues : []);
        const extractedText = analyses.map((d, i) => `--- ${d.sourceFileName} (${i + 1}/${analyses.length}) ---\n${d.extractedText || d.extracted_text || 'No text extracted; review the original file.'}`).join('\n\n');
        const summaries = analyses.map(d => d.summary).filter((v: any) => typeof v === 'string' && v.trim());
        const minConfidence = analyses.map(d => Number(d.confidence)).filter(Number.isFinite).reduce((min, n) => Math.min(min, n), 1);
        setDraftTitle(analyses.length > 1 ? `${first.title || fileDrafts[0].name.replace(/\.[^.]+$/, '')} (${analyses.length} files)` : (first.title || draftTitle || fileDrafts[0].name));
        setDraftType(first.documentType || first.document_type || 'other'); setDraftDate(first.recordDate || first.record_date || ''); setDraftDoctor(first.doctorName || first.doctor_name || ''); setDraftHospital(first.hospitalName || first.hospital_name || '');
        setDraftSummary(summaries.join(' ')); setDraftText(extractedText); setDraftTags(mergedTags.join(', ')); setDraftMedicines(mergedMedicines.join(', ')); setDraftStructuredMeds(mergedStructured);
        setDraftLabs(mergedLabs.map((v: any) => [v.name, v.value, v.unit, v.referenceRange || v.reference_range, v.reportMarker || v.report_marker].join(' | ')).join('\n'));
        setDraftReviewed(false); Alert.alert('Extraction ready', `${analyses.length} file${analyses.length === 1 ? '' : 's'} processed. Review all extracted fields against the original file(s) before saving. Confidence is only a readability estimate${minConfidence < 0.65 ? '; at least one file may need careful manual review' : ''}. Nothing has been saved yet.`);
      } catch (e: any) { Alert.alert('AI extraction unavailable', `${e?.message || 'Could not read this file.'}\n\nYou can complete the review fields manually.`); }
      finally { setAnalyzing(false); }
    };
    const startAnalysis = () => void doAnalyze();
    if (settings.aiConsent) return startAnalysis();
    Alert.alert('AI document processing consent', 'If you continue, the selected document is sent to the AI service configured by this app’s operator to extract text and metadata. Do not upload anyone’s records without permission. You can cancel and enter details manually.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Agree and continue', onPress: () => { const next = { ...settings, aiConsent: true }; setSettings(next); void saveLocalState(ownerKey, 'settings', next); startAnalysis(); } },
    ]);
  };

  const parseLabs = (raw: string) => raw.split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 2 && parts[0] && parts[1]).slice(0, 100).map(parts => ({ name: parts[0], value: parts[1], unit: parts[2] || '', referenceRange: parts[3] || '', reportMarker: parts[4] || '', date: draftDate || '' }));

  const reverifyMedicines = async () => {
    const list = draftMedicines.split(',').map(s => s.trim()).filter(Boolean);
    if (!list.length) {
      Alert.alert('No medicines entered', 'Type medicine names separated by commas to verify.');
      return;
    }
    setLoading(true);
    try {
      const token = session?.access_token || 'demo';
      const res = await fetch(`${API_BASE}/medicines/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ medicines: list, ocrText: draftText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.verified) && data.verified.length > 0) {
          setDraftStructuredMeds(data.verified);
          Alert.alert('Verification updated', `${data.verified.length} medicine(s) verified against RxNorm and Pharmacopeia.`);
        }
      } else {
        Alert.alert('Verification unavailable', 'Could not connect to verification service.');
      }
    } catch (e: any) {
      Alert.alert('Verification error', e?.message || 'Could not verify medicines.');
    } finally {
      setLoading(false);
    }
  };

  const commitRecord = async () => {
    if (!draftTitle.trim()) { Alert.alert('Title required', 'Give this record a short title.'); return; }
    if (editingRecordId) {
      const old = records.find(r => r.id === editingRecordId);
      if (!old) { setEditingRecordId(null); Alert.alert('Record unavailable', 'This record could not be found. Reopen it from Records and try again.'); return; }
      setLoading(true);
      try {
        const nextType = draftType;
        let updated: MedicalRecord = { ...old, title: draftTitle.trim(), documentType: nextType, recordDate: /^\d{4}-\d{2}-\d{2}$/.test(draftDate) ? draftDate : null,
          doctorName: draftDoctor.trim() || null, hospitalName: draftHospital.trim() || null, summary: draftSummary.trim(), extractedText: draftText.trim(),
          tags: draftTags.split(',').map(v => v.trim()).filter(Boolean).slice(0, 20), medicines: draftMedicines.split(',').map(v => v.trim()).filter(Boolean).slice(0, 80),
          structuredMedicines: draftStructuredMeds,
          labValues: parseLabs(draftLabs), personId: draftPerson || null, personName: people.find(p => p.id === draftPerson)?.fullName, isSensitive: draftSensitive,
          reviewStatus: draftReviewed ? 'confirmed' : 'needs_review', syncStatus: isRealUser ? (old.syncStatus === 'synced' ? 'synced' : 'pending') : old.syncStatus };
        if (isRealUser && supabase && old.syncStatus === 'synced') {
          const { error } = await supabase.from('medical_records').update({ title: updated.title, document_type: updated.documentType, record_date: updated.recordDate, doctor_name: updated.doctorName, hospital_name: updated.hospitalName, summary: updated.summary, extracted_text: updated.extractedText, tags: updated.tags, medicines: updated.medicines, lab_values: updated.labValues, review_status: updated.reviewStatus, is_sensitive: updated.isSensitive }).eq('id', old.id);
          if (error) updated = { ...updated, syncStatus: 'pending' };
        } else if (isRealUser) updated = { ...updated, syncStatus: 'pending' };
        const next = records.map(r => r.id === updated.id ? updated : r); await saveRecords(next); setSelectedRecord(updated); setEditingRecordId(null); openView('detail');
        if (updated.syncStatus === 'pending') Alert.alert('Saved on device', 'Your corrections are saved locally and marked for cloud sync. Use Sync pending + refresh in Settings when connected.');
      } catch (e: any) { Alert.alert('Could not save changes', e?.message || 'Try again.'); }
      finally { setLoading(false); }
      return;
    }
    setLoading(true);
    try {
      const attachments: Attachment[] = [];
      for (let i = 0; i < fileDrafts.length; i++) attachments.push(await persistSelectedFile(fileDrafts[i].uri, fileDrafts[i].name, fileDrafts[i].mimeType, fileDrafts[i].size, i));
      const duplicate = attachments.find(a => a.contentHash && records.some(r => r.attachments.some(old => old.contentHash === a.contentHash)));
      const proceed = async () => {
        const personName = people.find(p => p.id === draftPerson)?.fullName;
        const labs = parseLabs(draftLabs);
        let record: MedicalRecord = {
          id: newId(), title: draftTitle.trim(), documentType: draftType, recordDate: /^\d{4}-\d{2}-\d{2}$/.test(draftDate) ? draftDate : null,
          doctorName: draftDoctor.trim() || null, hospitalName: draftHospital.trim() || null, summary: draftSummary.trim(), extractedText: draftText.trim(),
          tags: draftTags.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20), medicines: draftMedicines.split(',').map(s => s.trim()).filter(Boolean).slice(0, 80), labValues: labs,
          structuredMedicines: draftStructuredMeds,
          personId: draftPerson || null, personName, reviewStatus: draftReviewed ? 'confirmed' : 'needs_review', confidence: null,
          mimeType: attachments[0]?.mimeType || 'application/octet-stream', byteSize: attachments.reduce((sum, a) => sum + a.byteSize, 0), filePath: null,
          localUri: attachments[0]?.localUri, attachments, createdAt: new Date().toISOString(), isFavorite: false, isSensitive: draftSensitive, syncStatus: isRealUser ? 'pending' : 'local',
        };
        const existing = [record, ...records];
        setRecords(existing); await saveLocalState(ownerKey, 'records', existing);
        if (isRealUser && supabase) {
          try { record = await uploadRecordToCloud(record, session.user.id); setRecords(prev => prev.map(r => r.id === record.id ? record : r)); }
          catch (e: any) { record = { ...record, syncStatus: 'pending' }; setRecords(prev => prev.map(r => r.id === record.id ? record : r)); Alert.alert('Saved on this device', 'Cloud sync did not complete. The record remains on this device and is marked Sync pending. Check your connection and backend setup before relying on it across devices.'); }
        }
        setSelectedRecord(record); setScreen('detail'); setLoading(false);
      };
      if (duplicate) Alert.alert('Possible duplicate', `“${duplicate.fileName}” matches an existing saved attachment. Save another copy anyway?`, [{ text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) }, { text: 'Save another copy', onPress: () => void proceed() }]);
      else await proceed();
    } catch (e: any) { setLoading(false); Alert.alert('Could not save record', e?.message || 'Try again.'); }
  };

  const addPerson = async () => {
    if (!newPersonName.trim()) { Alert.alert('Name required', 'Enter the family member’s name.'); return; }
    let person: PersonProfile = { id: newId(), fullName: newPersonName.trim(), relationship: newPersonRelationship.trim() || 'Other', dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(newPersonDob) ? newPersonDob : null, createdAt: new Date().toISOString(), syncStatus: isRealUser ? 'pending' : 'local' };
    const next = [...people, person]; setPeople(next); await saveLocalState(ownerKey, 'people', next);
    if (isRealUser) { try { person = await savePersonToCloud(person); setPeople(prev => prev.map(p => p.id === person.id ? person : p)); } catch { Alert.alert('Saved on device', 'This profile is pending cloud sync.'); } }
    setNewPersonName(''); setNewPersonDob(''); setShowPersonForm(false);
  };

  const openFile = async (record: MedicalRecord, attachment?: Attachment) => {
    const localUri = attachment?.localUri || record.localUri;
    if (localUri) { try { await Linking.openURL(localUri); return; } catch { /* Try signed URL. */ } }
    const cloudPath = attachment?.cloudPath || record.filePath;
    if (cloudPath && supabase && isRealUser) {
      const { data, error } = await supabase.storage.from('medical-records').createSignedUrl(cloudPath, 120);
      if (!error && data?.signedUrl) { await Linking.openURL(data.signedUrl); return; }
    }
    Alert.alert('Original file not available', 'This sample record has no original document attached. Add a PDF or image to try this feature.');
  };
  const deleteRecord = (record: MedicalRecord) => Alert.alert('Delete this record?', 'This removes its metadata and stored attachments from the active account. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void (async () => {
    const paths = [record.filePath, ...record.attachments.map(a => a.cloudPath)].filter((p): p is string => Boolean(p));
    if (paths.length && supabase && isRealUser) await supabase.storage.from('medical-records').remove(paths);
    if (supabase && isRealUser) { const { error } = await supabase.from('medical_records').delete().eq('id', record.id); if (error) throw error; }
    await deleteLocalRecordFiles(record);
    const next = records.filter(r => r.id !== record.id); await saveRecords(next); setSelectedRecord(null); openView('records');
  })().catch(e => Alert.alert('Delete failed', e?.message || 'Could not delete the record.')); } }]);

  const exportPdf = async (kind: 'doctor' | 'all' | 'appointment') => {
    const rows = kind === 'all' ? filteredRecords : records.filter(r => !r.isSensitive);
    const heading = kind === 'all' ? 'Medical records export' : kind === 'appointment' ? 'Appointment preparation' : 'Doctor summary';
    const bodyRows = rows.map(r => `<section><h3>${escapeHtml(r.title)}</h3><p><b>Type:</b> ${escapeHtml(docLabel(r.documentType))} &nbsp; <b>Date:</b> ${escapeHtml(r.recordDate || 'Not recorded')}</p><p><b>Doctor:</b> ${escapeHtml(r.doctorName || 'Not recorded')} &nbsp; <b>Hospital:</b> ${escapeHtml(r.hospitalName || 'Not recorded')}</p><p>${escapeHtml(r.summary || 'No summary recorded')}</p>${r.medicines.length ? `<p><b>Medicines as written:</b> ${escapeHtml(r.medicines.join(', '))}</p>` : ''}${r.labValues.length ? `<p><b>Lab values as printed:</b> ${escapeHtml(r.labValues.map(v => `${v.name}: ${v.value} ${v.unit || ''} (reference: ${v.referenceRange || 'not recorded'}; marker: ${v.reportMarker || 'not recorded'})`).join('; '))}</p>` : ''}</section>`).join('');
    const extra = kind === 'appointment' ? `<h2>Questions to ask</h2><p>${escapeHtml(appointmentQuestions || 'Add your questions before exporting if needed.')}</p>` : '';
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;padding:24px;color:#183226}h1{color:#286548}h2{margin-top:28px}section{border-bottom:1px solid #ddd;padding:10px 0;page-break-inside:avoid}p{line-height:1.45;font-size:12px}.note{margin-top:28px;color:#555;font-size:11px}</style></head><body><h1>CareVault</h1><h2>${heading}</h2><p>Prepared on ${new Date().toLocaleDateString()}. This document contains information recorded in the vault and is not medical advice.</p>${extra}${bodyRows}<p class="note">General information from your records. Please confirm details with your doctor. Verify against original records; OCR/extracted text may contain errors.</p></body></html>`;
    try { const file = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: `Share ${heading}` }); else Alert.alert('PDF created', file.uri); }
    catch (e: any) { Alert.alert('Export failed', e?.message || 'Could not create the PDF.'); }
  };
  function escapeHtml(value: string) { return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch)); }

  const saveReminder = async () => {
    const due = new Date(reminderDate);
    if (!reminderTitle.trim() || !reminderDate || Number.isNaN(due.getTime()) || due <= new Date()) { Alert.alert('Check reminder details', 'Enter a reminder title and a future date/time, for example 2026-12-20T09:00.'); return; }
    let notificationId: string | undefined;
    try {
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.granted) notificationId = await Notifications.scheduleNotificationAsync({ content: { title: reminderTitle.trim(), body: reminderNote.trim() || 'A follow-up reminder you added in CareVault.' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due } as any });
    } catch { /* Keep the reminder in the app even if notifications are not available in Expo Go. */ }
    const item: Reminder = { id: newId(), title: reminderTitle.trim(), dueAt: due.toISOString(), note: reminderNote.trim(), personId: selectedRecord?.personId || null, recordId: selectedRecord?.id || null, notificationId, done: false };
    const next = [...reminders, item].sort((a, b) => a.dueAt.localeCompare(b.dueAt)); setReminders(next); await saveLocalState(ownerKey, 'reminders', next); let cloudNote = ''; if (supabase && isRealUser) { const { error } = await supabase.from('follow_up_reminders').upsert({ id: item.id, owner_id: session.user.id, person_id: item.personId, record_id: item.recordId, title: item.title, note: item.note, remind_at: item.dueAt, status: 'pending', notification_id: item.notificationId || null }, { onConflict: 'id' }); if (error) cloudNote = ' The reminder remains on this device; cloud sync failed.'; } setReminderTitle(''); setReminderDate(''); setReminderNote(''); Alert.alert('Reminder saved', (notificationId ? 'Your reminder is saved and a device notification was scheduled.' : 'Your reminder is saved in CareVault. Device notifications were not available; check this screen for upcoming reminders.') + cloudNote);
  };

  const openEmergency = () => openView('emergency');
  const askFromRecords = () => { setAskResult(answerFromRecords(askQuestion, records.filter(r => !r.isSensitive))); };
  const shareRecord = async (record: MedicalRecord) => {
    if (!supabase || !isRealUser) { Alert.alert('Secure sharing needs an account', 'Connect Supabase and sign in with a real account to create a revocable, expiring share token. Demo records must not be shared.'); return; }
    try {
      const token = Crypto.randomUUID().replaceAll('-', '') + Crypto.randomUUID().replaceAll('-', '');
      const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
      const expiresAt = new Date(Date.now() + Number(shareExpires) * 24 * 60 * 60 * 1000).toISOString();
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('record_shares').insert({ owner_id: auth.user?.id, record_id: record.id, token_hash: tokenHash, expires_at: expiresAt }).select('id').single();
      if (error) throw error;
      const url = PUBLIC_APP_URL ? `${PUBLIC_APP_URL.replace(/\/$/, '')}/api/share/${token}` : `carevault://share/${token}`;
      setShareId(data?.id || ''); setShareExpiresAt(expiresAt); setShareUrl(url); openView('share');
    } catch (e: any) { Alert.alert('Could not create share link', e?.message || 'Apply the latest Supabase schema and try again.'); }
  };

  const deleteEverything = () => Alert.alert('Delete everything?', 'This permanently deletes all records, attachments, family profiles, reminders, and the emergency card associated with this local workspace. Cloud deletion is attempted for a signed-in account. Export anything you need first.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete everything', style: 'destructive', onPress: () => { void (async () => {
    if (supabase && isRealUser) {
      const { data: fileRows } = await supabase.from('record_attachments').select('file_path');
      const paths = (fileRows || []).map((r: any) => r.file_path).filter(Boolean);
      const { data: rows } = await supabase.from('medical_records').select('file_path');
      const allPaths = [...paths, ...(rows || []).map((r: any) => r.file_path).filter(Boolean)];
      if (allPaths.length) await supabase.storage.from('medical-records').remove(allPaths);
      await supabase.from('record_shares').delete().eq('owner_id', session.user.id);
      await supabase.from('follow_up_reminders').delete().eq('owner_id', session.user.id);
      await supabase.from('emergency_profiles').delete().eq('owner_id', session.user.id);
      await supabase.from('medical_records').delete().eq('owner_id', session.user.id);
      await supabase.from('people').delete().eq('owner_id', session.user.id);
    }
    await clearLocalOwner(ownerKey); setRecords([]); setPeople([]); setReminders([]); setEmergency(EMPTY_EMERGENCY); Alert.alert('Deleted', 'The current workspace has been cleared.'); openView('home');
  })().catch(e => Alert.alert('Could not fully delete', `Some cloud items may remain. Sign in and retry after reviewing the database setup. ${e?.message || ''}`)); } }]);

  const syncCloudNow = useCallback(async (showSuccess = true) => {
    if (!supabase || !isRealUser || !session?.user?.id) { if (showSuccess) Alert.alert('Sign in required', 'Cloud synchronisation is available after connecting Supabase and signing in.'); return; }
    setLoading(true);
    try {
      let nextRecords = [...records];
      for (const record of nextRecords.filter(r => r.syncStatus !== 'synced')) {
        const synced = await uploadRecordToCloud(record, session.user.id);
        nextRecords = nextRecords.map(r => r.id === synced.id ? synced : r);
      }
      let nextPeople = [...people];
      for (const person of nextPeople.filter(p => p.syncStatus !== 'synced')) {
        const synced = await savePersonToCloud(person);
        nextPeople = nextPeople.map(p => p.id === synced.id ? synced : p);
      }
      for (const reminder of reminders) {
        const { error } = await supabase.from('follow_up_reminders').upsert({ id: reminder.id, owner_id: session.user.id, person_id: reminder.personId, record_id: reminder.recordId, title: reminder.title, note: reminder.note, remind_at: reminder.dueAt, status: reminder.done ? 'done' : 'pending', notification_id: reminder.notificationId || null }, { onConflict: 'id' });
        if (error) throw error;
      }
      const { error: emergencyError } = await supabase.from('emergency_profiles').upsert({ owner_id: session.user.id, blood_group: emergency.bloodGroup, allergies: emergency.allergies, conditions: emergency.conditions, emergency_contact_name: emergency.emergencyContactName, emergency_contact_phone: emergency.emergencyContactPhone, notes: emergency.notes, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' });
      if (emergencyError) throw emergencyError;
      const cloud = await refreshFromCloud(nextRecords, nextPeople);
      setRecords(cloud.records); setPeople(cloud.people);
      await saveLocalState(ownerKey, 'records', cloud.records); await saveLocalState(ownerKey, 'people', cloud.people);
      if (showSuccess) Alert.alert('Sync complete', 'Pending records and family profiles were uploaded; cloud records were refreshed. Check the Sync status labels for any local-only items.');
    } catch (e: any) { if (showSuccess) Alert.alert('Sync incomplete', e?.message || 'Some data remains on this device. Check your connection and Supabase configuration, then retry.'); }
    finally { setLoading(false); }
  }, [isRealUser, session, records, people, reminders, emergency, ownerKey]);

  useEffect(() => {
    if (!isRealUser) return;
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void syncCloudNow(false); });
    return () => sub.remove();
  }, [isRealUser, syncCloudNow]);

  const recordCount = records.filter(r => !r.isSensitive || settings.showHidden).length;
  const recordsNeedingReview = records.filter(r => r.reviewStatus === 'needs_review' && (!r.isSensitive || settings.showHidden)).length;
  const nextReminder = reminders.find(r => !r.done && new Date(r.dueAt) > new Date());
  const recentRecords = [...records].filter(r => !r.isSensitive || settings.showHidden).sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt)).slice(0, 3);

  if (!ready || loading && !records.length && screen === 'home') {
    return <SafeAreaView style={[styles.fullScreen, { backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }]}><View style={[styles.brandMark, { backgroundColor: c.softGreen }]}><MaterialCommunityIcons name="heart-pulse" size={34} color={c.primary} /></View><Text style={[styles.brandTitle, { color: c.text }]}>CareVault</Text><Text style={{ color: c.muted, marginTop: 6 }}>Your medical history, one tap away.</Text>{loading ? <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} /> : null}<Text style={{ color: c.muted, marginTop: 18 }}>Opening the sign-in screen…</Text></SafeAreaView>;
  }
  if (!demoMode && !session && ready) {
    return <SafeAreaView style={[styles.fullScreen, { backgroundColor: c.bg }]}><ScrollView contentContainerStyle={styles.authScreen}><View style={[styles.brandMark, { backgroundColor: c.softGreen }]}><MaterialCommunityIcons name="heart-pulse" size={36} color={c.primary} /></View><Text style={[styles.brandTitle, { color: c.text }]}>CareVault</Text><Text style={[styles.authSubtitle, { color: c.muted }]}>Your whole medical history, one tap away.</Text><Card><Text style={[styles.sectionTitle, { color: c.text }]}>{isSignUp ? 'Create an account' : 'Sign in with Email'}</Text><View style={{ height: 10 }} /><Field label="Email address" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" /><Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" autoCapitalize="none" secureTextEntry />{isSignUp ? (<><AppButton title="Create Account" icon="account-plus-outline" onPress={() => void signUpEmail()} disabled={loading || !isSupabaseConfigured} /><Pressable onPress={() => { setIsSignUp(false); setAuthError(''); }} style={{ paddingTop: 12, alignItems: 'center' }}><Text style={{ color: c.primary, fontWeight: '700' }}>Already have an account? Sign in</Text></Pressable></>) : (<><AppButton title="Sign In" icon="login" onPress={() => void signInEmail()} disabled={loading || !isSupabaseConfigured} /><Pressable onPress={() => { setIsSignUp(true); setAuthError(''); }} style={{ paddingTop: 12, alignItems: 'center' }}><Text style={{ color: c.primary, fontWeight: '700' }}>Don't have an account? Create one</Text></Pressable></>)}<AppButton title="Continue with Google" icon="google" onPress={() => void signInGoogle()} secondary disabled={!isSupabaseConfigured || loading} style={{ marginTop: 10 }} />{authError ? <Text style={{ color: c.danger, fontSize: 12, marginTop: 12 }}>{authError}</Text> : null}{!isSupabaseConfigured ? <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 14 }}>Real sign-in is disabled until Supabase is configured.</Text> : null}</Card><Text style={{ color: c.muted, fontSize: 11, textAlign: 'center', lineHeight: 17 }}>CareVault organises records. It does not diagnose or recommend treatment.</Text></ScrollView></SafeAreaView>;
  }
  if (lockPending && !biometricUnlocked) {
    return (
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <View style={[styles.brandMark, { backgroundColor: c.softGreen, marginBottom: 12 }]}>
          <MaterialCommunityIcons name="shield-lock-outline" size={38} color={c.primary} />
        </View>
        <Text style={[styles.screenTitle, { color: c.text, marginTop: 4, fontSize: font(21), textAlign: 'center' }]}>
          {tr('carevault_locked')}
        </Text>
        <Text style={{ color: c.muted, textAlign: 'center', marginTop: 6, marginBottom: 24, fontSize: font(13) }}>
          {tr('use_biometrics')}
        </Text>

        <AppButton
          title={tr('unlock_device')}
          icon="fingerprint"
          onPress={() => void authenticateUser()}
          style={{ width: '100%', maxWidth: 260, marginBottom: 10 }}
        />
        <AppButton
          title={demoMode ? tr('exit_demo') : tr('sign_out')}
          secondary
          danger
          small
          icon="logout"
          onPress={() => void handleSignOut()}
          style={{ width: '100%', maxWidth: 260 }}
        />
      </SafeAreaView>
    );
  }

  const renderHome = () => <>
    <View style={[styles.homeHero, { backgroundColor: c.primary }]}>
      <View style={styles.heroTop}><View><Text style={{ color: '#D7EEE0', fontWeight: '700', fontSize: font(12) }}>{demoMode ? tr('demo_workspace') : tr('personal_vault')}</Text><Text style={[styles.heroTitle, { fontSize: font(27) }]}>{tr('history_hero_title')}</Text><Text style={{ color: '#E2F3E8', fontSize: font(13), lineHeight: font(19), marginTop: 8 }}>{tr('history_hero_sub')}</Text></View><MaterialCommunityIcons name="heart-pulse" size={font(42)} color="#D7EEE0" /></View>
      <Pressable onPress={startAddRecord} style={styles.heroPrimaryAction}><MaterialCommunityIcons name="plus-circle" size={font(22)} color={c.primary} /><Text style={{ color: c.primary, fontWeight: '800', fontSize: font(15) }}>{tr('add_record')}</Text><MaterialCommunityIcons name="arrow-right" size={font(20)} color={c.primary} /></Pressable>
    </View>
    <Pressable onPress={() => { setQuery(''); openView('records'); }} style={[styles.searchEntry, { backgroundColor: c.card, borderColor: c.line }]}><MaterialCommunityIcons name="magnify" size={font(21)} color={c.muted} /><Text style={{ flex: 1, color: c.muted, fontSize: font(14) }}>{tr('search_placeholder')}</Text><MaterialCommunityIcons name="tune-variant" size={font(18)} color={c.muted} /></Pressable>
    <View style={styles.statsGrid}>
      <Card style={styles.statCard}><MaterialCommunityIcons name="file-multiple-outline" size={font(24)} color={c.primary} /><Text style={[styles.statNumber, { color: c.text, fontSize: font(23) }]}>{recordCount}</Text><Text style={[styles.statCaption, { color: c.muted, fontSize: font(11) }]}>{tr('records')}</Text></Card>
      <Card style={styles.statCard}><MaterialCommunityIcons name="account-group-outline" size={font(24)} color={c.purple} /><Text style={[styles.statNumber, { color: c.text, fontSize: font(23) }]}>{people.length}</Text><Text style={[styles.statCaption, { color: c.muted, fontSize: font(11) }]}>{tr('people')}</Text></Card>
      <Pressable onPress={() => { setShowReviewOnly(true); openView('records'); }} style={[styles.statCard, styles.card, { backgroundColor: c.card, borderColor: c.line }]}><MaterialCommunityIcons name="clipboard-alert-outline" size={font(24)} color={recordsNeedingReview ? c.gold : c.muted} /><Text style={[styles.statNumber, { color: c.text, fontSize: font(23) }]}>{recordsNeedingReview}</Text><Text style={[styles.statCaption, { color: c.muted, fontSize: font(11) }]}>{tr('needs_review')}</Text></Pressable>
    </View>
    <SectionTitle title={tr('use_records')} />
    <View style={styles.quickGrid}>
      <QuickAction icon="account-heart-outline" title={tr('doctor_summary')} subtitle={tr('doctor_summary_sub')} onPress={() => openView('doctor')} />
      <QuickAction icon="calendar-check-outline" title={tr('appointment_prep')} subtitle={tr('appointment_prep_sub')} onPress={() => openView('appointment')} />
      <QuickAction icon="chart-timeline-variant" title={tr('lab_trends')} subtitle={tr('lab_trends_sub')} onPress={() => openView('labs')} />
      <QuickAction icon="message-question-outline" title={tr('ask_records')} subtitle={tr('ask_records_sub')} onPress={() => openView('ask')} />
      <QuickAction icon="card-account-details-outline" title={tr('emergency_card')} subtitle={tr('emergency_card_sub')} onPress={openEmergency} />
      <QuickAction icon="bell-badge-outline" title={tr('reminders')} subtitle={nextReminder ? `Next: ${dateLabel(nextReminder.dueAt)}` : tr('reminders_sub')} onPress={() => openView('reminders')} />
    </View>
    {nextReminder ? <Card style={{ marginTop: 14 }}><View style={styles.rowBetween}><View style={{ flex: 1 }}><Text style={[styles.fieldLabel, { color: c.muted }]}>UP NEXT</Text><Text style={{ color: c.text, fontWeight: '800', fontSize: font(15), marginTop: 5 }}>{nextReminder.title}</Text><Text style={{ color: c.muted, fontSize: font(12), marginTop: 3 }}>{new Date(nextReminder.dueAt).toLocaleString()}</Text></View><MaterialCommunityIcons name="bell-ring-outline" size={font(27)} color={c.primary} /></View></Card> : null}
    <SectionTitle title={tr('recently_added')} action={tr('all_records')} onAction={() => { setShowReviewOnly(false); openView('records'); }} />
    {recentRecords.length ? recentRecords.map(r => <RecordTile key={r.id} record={r} onPress={() => { setSelectedRecord(r); setGlossaryTerm(''); openView('detail'); }} onFavorite={() => toggleFavorite(r)} onExplain={() => { setGlossaryTerm(r.labValues[0]?.name || r.medicines[0] || r.title); setSelectedRecord(null); openView('detail'); }} />) : <Card><EmptyState title="No records yet" body="Scan your first prescription, lab report or discharge note." /></Card>}
    <Card style={{ marginTop: 12, backgroundColor: c.surface }}><View style={styles.rowStart}><MaterialCommunityIcons name="shield-check-outline" size={font(25)} color={c.primary} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: font(14) }}>{tr('ai_librarian_title')}</Text><Text style={{ color: c.muted, lineHeight: font(18), fontSize: font(12), marginTop: 4 }}>{tr('ai_librarian_sub')}</Text></View></View></Card>
  </>;

  const renderRecords = () => <>
    <ScreenHeader title={tr('records')} subtitle={`${filteredRecords.length} ${tr('matching_docs')}`} right={<AppButton title={tr('add_button')} icon="plus" small onPress={startAddRecord} />} />
    <View style={[styles.searchEntry, { backgroundColor: c.card, borderColor: c.line, marginTop: 12 }]}><MaterialCommunityIcons name="magnify" size={21} color={c.muted} /><TextInput accessibilityLabel="Search medical records" value={query} onChangeText={setQuery} placeholder={tr('search_placeholder')} placeholderTextColor={c.muted} style={{ flex: 1, color: c.text, paddingVertical: 0 }} /><Pressable onPress={() => { setQuery(''); setDoctorFilter(''); setHospitalFilter(''); setDateFrom(''); setDateTo(''); setTagFilter(''); setFilterType('all'); setPersonFilter('all'); setShowFavouritesOnly(false); setShowReviewOnly(false); }} accessibilityRole="button" accessibilityLabel={tr('clear_search')}><MaterialCommunityIcons name="close-circle-outline" size={19} color={c.muted} /></Pressable></View>
    {!settings.simpleMode ? <Card style={{ marginTop: 8, paddingVertical: 12 }}><SectionTitle title={tr('refine_search')} /><Field label={tr('doctor_label')} value={doctorFilter} onChangeText={setDoctorFilter} placeholder="Filter by doctor name" /><Field label={tr('hospital_label')} value={hospitalFilter} onChangeText={setHospitalFilter} placeholder="Filter by hospital or lab" /><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Text style={[styles.fieldLabel, { color: c.text, marginBottom: 6 }]}>{tr('from_date_label')}</Text><TextInput accessibilityLabel="From date" value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} autoCapitalize="none" style={[styles.input, { backgroundColor: c.input, color: c.text, borderColor: c.line, minHeight: 44 }]} /></View><View style={{ flex: 1 }}><Text style={[styles.fieldLabel, { color: c.text, marginBottom: 6 }]}>{tr('to_date_label')}</Text><TextInput accessibilityLabel="To date" value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} autoCapitalize="none" style={[styles.input, { backgroundColor: c.input, color: c.text, borderColor: c.line, minHeight: 44 }]} /></View></View></Card> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 13 }}>{[{ value: 'all', label: tr('all_types') }, ...DOCUMENT_TYPES].map(opt => <Chip key={opt.value} label={opt.label} active={filterType === opt.value} onPress={() => setFilterType(opt.value as any)} />)}</ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 12 }}><Chip label={tr('everyone')} active={personFilter === 'all'} onPress={() => setPersonFilter('all')} />{people.map(p => <Chip key={p.id} label={p.fullName} active={personFilter === p.id} onPress={() => setPersonFilter(p.id)} />)}</ScrollView>
    <View style={styles.inlineWrap}><Chip label={tr('favourites_filter')} active={showFavouritesOnly} onPress={() => { setShowFavouritesOnly(!showFavouritesOnly); setShowReviewOnly(false); }} /><Chip label={tr('needs_review_filter')} active={showReviewOnly} onPress={() => { setShowReviewOnly(!showReviewOnly); setShowFavouritesOnly(false); }} /><Chip label={settings.showHidden ? tr('hide_sensitive_filter') : tr('show_sensitive_filter')} active={settings.showHidden} onPress={() => setSettings(p => ({ ...p, showHidden: !p.showHidden }))} /></View>
    {records.some(r => r.tags.length) && !settings.simpleMode ? <><Text style={[styles.fieldLabel, { color: c.muted, marginTop: 12 }]}>{tr('condition_tags')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 9 }}><Chip label={tr('all_tags')} active={!tagFilter} onPress={() => setTagFilter('')} />{[...new Set(records.flatMap(r => r.tags))].filter(Boolean).slice(0, 30).map(tag => <Chip key={tag} label={tag} active={tagFilter === tag} onPress={() => setTagFilter(tagFilter === tag ? '' : tag)} />)}</ScrollView></> : null}
    {filteredRecords.length ? <View style={{ marginTop: 10 }}>{filteredRecords.map(r => <RecordTile key={r.id} record={r} largeText={settings.largeText} onPress={() => { setSelectedRecord(r); setGlossaryTerm(''); openView('detail'); }} onFavorite={() => toggleFavorite(r)} onExplain={() => { setGlossaryTerm(r.labValues[0]?.name || r.medicines[0] || r.title); setSelectedRecord(null); openView('detail'); }} />)}</View> : <Card style={{ marginTop: 10 }}><EmptyState title={tr('no_records_found')} body="Try a different word or filter. Add a document to start building your timeline." /></Card>}
    <Text style={[styles.tinyNote, { color: c.muted }]}>Search includes saved text and metadata. Handwriting and semantic search depend on configured extraction/search services.</Text>
  </>;

  const renderPeople = () => <>
    <ScreenHeader title={tr('people')} subtitle={tr('manage_family')} right={<AppButton title={tr('add_person_btn')} icon="account-plus-outline" small onPress={() => setShowPersonForm(p => !p)} />} />
    <Card style={{ marginTop: 14 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>{tr('one_account_many')}</Text><Text style={{ color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{tr('one_account_sub')}</Text></Card>
    {showPersonForm ? <Card><SectionTitle title={tr('new_family_profile')} /><Field label={tr('full_name_label')} value={newPersonName} onChangeText={setNewPersonName} placeholder="Person's name" /><Field label={tr('relationship_label')} value={newPersonRelationship} onChangeText={setNewPersonRelationship} placeholder="Me, Parent, Spouse, Child…" /><Field label={tr('dob_label')} value={newPersonDob} onChangeText={setNewPersonDob} placeholder="1990-01-31" /><View style={styles.rowBetween}><AppButton title={tr('cancel_btn')} secondary onPress={() => setShowPersonForm(false)} /><AppButton title={tr('save_person_btn')} icon="check" onPress={() => void addPerson()} /></View></Card> : null}
    {people.map(person => { const personRecords = records.filter(r => r.personId === person.id); return <Card key={person.id} style={{ marginTop: 12 }}><View style={styles.rowStart}><View style={[styles.personAvatar, { backgroundColor: c.softPurple }]}><MaterialCommunityIcons name={person.relationship === 'Me' ? 'account' : person.relationship.toLowerCase().includes('child') ? 'human-child' : 'account-heart-outline'} size={26} color={c.purple} /></View><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>{person.fullName}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{person.relationship}{person.dateOfBirth ? ` · Born ${dateLabel(person.dateOfBirth)}` : ''}</Text><Text style={{ color: c.primary, fontSize: 12, fontWeight: '700', marginTop: 6 }}>{personRecords.length} record{personRecords.length === 1 ? '' : 's'}</Text></View><Pressable onPress={() => { setPersonFilter(person.id); openView('records'); }}><MaterialCommunityIcons name="chevron-right" size={24} color={c.muted} /></Pressable></View></Card>; })}
    <Card style={{ marginTop: 12, backgroundColor: c.softGold, borderColor: c.softGold }}><View style={styles.rowStart}><MaterialCommunityIcons name="alert-circle-outline" size={24} color={c.gold} /><Text style={{ flex: 1, color: c.text, fontSize: 12, lineHeight: 18 }}>These profiles belong to this account. Secure invitations and delegated access require a separate permissions workflow before production.</Text></View></Card>
  </>;

  const renderAddRecord = () => <>
    <ScreenHeader title={editingRecordId ? "Edit record details" : "Add a record"} subtitle={editingRecordId ? "Correct extracted information" : "Import, check and save"} onBack={() => openView(editingRecordId ? 'detail' : 'home')} />
    {!editingRecordId ? <Card style={{ marginTop: 14 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>1. Add the document</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 }}>PDFs and images work best. You can select multiple pages/images for one record, up to 20 files.</Text>
      <View style={styles.buttonGrid}><AppButton title="Scan pages" icon="scanner" onPress={() => void scanPages()} secondary style={{ flex: 1 }} /><AppButton title="Take photo" icon="camera-outline" onPress={() => void takePhoto()} secondary style={{ flex: 1 }} /></View>
      <View style={[styles.buttonGrid, { marginTop: 9 }]}><AppButton title="Choose photos" icon="image-multiple-outline" onPress={() => void pickPhotos()} secondary style={{ flex: 1 }} /><AppButton title="Choose files" icon="file-pdf-box" onPress={() => void pickDocuments()} secondary style={{ flex: 1 }} /></View>
      {fileDrafts.map((f, i) => <View key={`${f.uri}-${i}`} style={[styles.fileRow, { borderColor: c.line }]}><MaterialCommunityIcons name={f.mimeType === 'application/pdf' ? 'file-pdf-box' : 'file-image-outline'} size={22} color={c.primary} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{f.name}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{f.size ? formatBytes(f.size) : 'Size unavailable'} · {f.mimeType}</Text></View><Pressable onPress={() => setFileDrafts(prev => prev.filter((_, ix) => ix !== i))}><MaterialCommunityIcons name="close-circle-outline" size={21} color={c.muted} /></Pressable></View>)}
      {fileDrafts.length ? <AppButton title={analyzing ? 'Reading document…' : 'Read with AI (optional)'} icon="text-box-search-outline" onPress={() => void runAIExtraction()} disabled={analyzing} secondary style={{ marginTop: 12 }} /> : null}
      <Text style={[styles.tinyNote, { color: c.muted, marginTop: 10 }]}>Camera scanning uses the native document scanner when available. A requested AI extraction sends the selected file to the configured server only after consent.</Text>
    </Card> : <Card style={{ marginTop: 14, backgroundColor: c.surface }}><Text style={{ color: c.text, fontSize: 12, lineHeight: 18 }}>The original file stays attached. This screen edits record metadata only; to add a separate document, create another record.</Text></Card>}
    <Card><Text style={{ color: c.text, fontWeight: '800', fontSize: 16, marginBottom: 12 }}>{editingRecordId ? 'Edit details' : '2. Review the details'}</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginBottom: 13 }}>Check and correct the fields against the original. Unreadable content should be marked “unclear”; never guess.</Text>
      <Field label="Record title *" value={draftTitle} onChangeText={setDraftTitle} placeholder="e.g. Blood test — October 2026" />
      <Text style={[styles.fieldLabel, { color: c.text, marginBottom: 7 }]}>Document type</Text><View style={styles.inlineWrap}>{DOCUMENT_TYPES.map(t => <Chip key={t.value} label={t.label} active={draftType === t.value} onPress={() => setDraftType(t.value)} />)}</View><View style={{ height: 12 }} />
      <Field label="Document date (YYYY-MM-DD)" value={draftDate} onChangeText={setDraftDate} placeholder="2026-10-25" />
      <Field label="Doctor" value={draftDoctor} onChangeText={setDraftDoctor} placeholder="Name as printed" />
      <Field label="Hospital / clinic / lab" value={draftHospital} onChangeText={setDraftHospital} placeholder="Name as printed" />
      <Field label="Short neutral summary" value={draftSummary} onChangeText={setDraftSummary} placeholder="What this document contains, not what it means" multiline />
      <Field label="Extracted text (mark unclear words)" value={draftText} onChangeText={setDraftText} placeholder="Text visible on the document" multiline />
      <Field label="Tags (comma-separated)" value={draftTags} onChangeText={setDraftTags} placeholder="thyroid, lab report" />
      {draftStructuredMeds.length > 0 ? (
        <View style={{ marginVertical: 8, padding: 10, borderRadius: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <View style={[styles.rowBetween, { marginBottom: 8 }]}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 13 }}>Verified medicines ({draftStructuredMeds.length})</Text>
            <Text style={{ color: c.primary, fontSize: 11, fontWeight: '700' }}>RxNorm &amp; Catalogue</Text>
          </View>
          {draftStructuredMeds.map((med: any, i: number) => {
            const isVerified = med.verificationStatus === 'verified_catalogue' || med.verificationStatus === 'verified_rxnorm';
            const isFuzzy = med.verificationStatus === 'fuzzy_match';
            const badgeColor = isVerified ? '#1e6834' : isFuzzy ? '#976100' : '#b3261e';
            const badgeBg = isVerified ? '#eaf5eb' : isFuzzy ? '#fef7e6' : '#fdf0ee';
            return (
              <View key={`${med.brandName || med.name}-${i}`} style={{ padding: 8, borderRadius: 8, backgroundColor: c.card, marginBottom: 6, borderWidth: 1, borderColor: c.line }}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>{med.brandName || med.name}</Text>
                    {med.genericName && med.genericName !== (med.brandName || med.name) ? (
                      <Text style={{ color: c.muted, fontSize: 11 }}>({med.genericName})</Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: badgeBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                      <Text style={{ color: badgeColor, fontSize: 10, fontWeight: '700' }}>
                        {isVerified ? (med.rxcui ? `RxNorm #${med.rxcui}` : 'Verified') : isFuzzy ? 'Fuzzy match' : 'Check review'}
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        const next = draftStructuredMeds.filter((_: any, idx: number) => idx !== i);
                        setDraftStructuredMeds(next);
                        setDraftMedicines(next.map((m: any) => m.raw || `${m.dosageForm || 'Tab'} ${m.brandName || m.name} ${m.strength !== 'Unspecified' ? m.strength : ''}`.trim()).join(', '));
                      }}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons name="close" size={16} color={c.muted} />
                    </Pressable>
                  </View>
                </View>
                <Text style={{ color: c.primary, fontSize: 12, marginTop: 3 }}>
                  {med.dosageForm || 'Tablet'} {med.strength || ''} · {med.frequency || ''} · {med.duration || ''}
                </Text>
                {Array.isArray(med.flags) && med.flags.length > 0 ? (
                  <View style={{ marginTop: 4, padding: 4, borderRadius: 4, backgroundColor: '#fff5f4' }}>
                    {med.flags.map((f: string, fi: number) => (
                      <Text key={fi} style={{ color: '#b3261e', fontSize: 10 }}>• {f}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <Field label="Medicine names exactly as written" value={draftMedicines} onChangeText={setDraftMedicines} placeholder="Comma-separated, no dosing advice" multiline />
      {draftMedicines.trim().length > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -4, marginBottom: 8 }}>
          <Pressable
            onPress={() => void reverifyMedicines()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}
          >
            <MaterialCommunityIcons name="check-decagram-outline" size={15} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 11, fontWeight: '700' }}>Re-verify with RxNorm</Text>
          </Pressable>
        </View>
      ) : null}
      <Field label="Lab values (one per line: Test | value | unit | printed reference range | marker)" value={draftLabs} onChangeText={setDraftLabs} placeholder={'HbA1c | 5.4 | % | 4.0–5.6 |\nGlucose | 92 | mg/dL | 70–99 |'} multiline />
      <Text style={[styles.fieldLabel, { color: c.text, marginBottom: 8 }]}>Belongs to</Text><View style={styles.inlineWrap}>{people.map(p => <Chip key={p.id} label={p.fullName} active={draftPerson === p.id} onPress={() => setDraftPerson(p.id)} />)}</View>
      <View style={styles.settingRow}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '700' }}>Mark as sensitive / hidden</Text><Text style={{ color: c.muted, fontSize: 11 }}>Hidden from standard lists until you reveal sensitive records.</Text></View><Switch value={draftSensitive} onValueChange={setDraftSensitive} trackColor={{ true: c.primary }} /></View>
      <Pressable onPress={() => setDraftReviewed(p => !p)} style={styles.settingRow}><MaterialCommunityIcons name={draftReviewed ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={23} color={draftReviewed ? c.primary : c.muted} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '700' }}>I checked these details against the original</Text><Text style={{ color: c.muted, fontSize: 11 }}>Unconfirmed or low-confidence records go to Needs review.</Text></View></Pressable>
      <AppButton title={loading ? 'Saving…' : editingRecordId ? 'Save changes' : 'Save record'} icon="content-save-check-outline" onPress={() => void commitRecord()} disabled={loading} style={{ marginTop: 8 }} />
    </Card>
  </>;

  const renderDetail = () => {
    if (glossaryTerm && !selectedRecord) {
      const item = lookupGlossary(glossaryTerm);
      return <><ScreenHeader title="What is this?" subtitle="General information, not a personal interpretation" onBack={() => { setGlossaryTerm(''); openView('records'); }} />{item ? <Card style={{ marginTop: 14 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }}>{glossaryTerm}</Text><Text style={{ color: c.text, fontSize: 14, lineHeight: 22, marginTop: 12 }}>{item.description}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 14 }}>Source: {item.source}</Text><AppButton title="Open trusted source" icon="open-in-new" secondary onPress={() => void Linking.openURL(item.url)} style={{ marginTop: 12 }} /></Card> : <Card style={{ marginTop: 14 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 17 }}>{glossaryTerm}</Text><Text style={{ color: c.muted, fontSize: 13, lineHeight: 20, marginVertical: 10 }}>I do not have a verified reference for this term in the built-in glossary. Do not rely on generated explanations from memory. Ask a pharmacist or clinician, or use an official reference.</Text><AppButton title="Search saved records" icon="magnify" onPress={() => { setQuery(glossaryTerm); setGlossaryTerm(''); openView('records'); }} /></Card>}<Text style={[styles.tinyNote, { color: c.muted }]}>General information from trusted sources. Please confirm with your doctor.</Text></>;
    }
    if (!selectedRecord) return <><ScreenHeader title="Record" onBack={() => openView('records')} /><Card><EmptyState title="Select a record" body="Choose a document from the Records list." /></Card></>;
    const r = selectedRecord;
    return <><ScreenHeader title="Record details" subtitle={r.reviewStatus === 'needs_review' ? 'Check this record' : 'Saved record'} onBack={() => openView('records')} right={<Pressable onPress={() => void deleteRecord(r)}><MaterialCommunityIcons name="delete-outline" size={23} color={c.danger} /></Pressable>} />
      {r.reviewStatus === 'needs_review' ? <View style={[styles.warningBanner, { backgroundColor: c.softGold }]}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={c.gold} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800' }}>Needs review</Text><Text style={{ color: c.text, fontSize: 12, lineHeight: 17 }}>Verify extracted fields against the original document before relying on them.</Text></View><AppButton title="Mark checked" small onPress={() => { markReviewed(r); setSelectedRecord({ ...r, reviewStatus: 'confirmed' }); }} /></View> : null}
      <Card style={{ marginTop: 12 }}><View style={styles.rowStart}><View style={[styles.recordIcon, { backgroundColor: c.softGreen }]}><MaterialCommunityIcons name="file-document-outline" size={26} color={c.primary} /></View><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '900', fontSize: font(19) }}>{r.title}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 5 }}>{docLabel(r.documentType)} · {dateLabel(r.recordDate)}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{r.personName || people.find(p => p.id === r.personId)?.fullName || 'Person not selected'}</Text></View><Pressable onPress={() => toggleFavorite(r)}><MaterialCommunityIcons name={r.isFavorite ? 'star' : 'star-outline'} size={25} color={r.isFavorite ? c.gold : c.muted} /></Pressable></View><View style={[styles.detailDivider, { backgroundColor: c.line }]} /><InfoPair label="Doctor" value={r.doctorName || 'Not recorded'} /><InfoPair label="Hospital / clinic" value={r.hospitalName || 'Not recorded'} /><InfoPair label="Summary" value={r.summary || 'No summary entered'} /><InfoPair label="Tags" value={r.tags.join(', ') || 'None'} /><InfoPair label="Sync status" value={r.syncStatus === 'synced' ? 'Synced to account' : r.syncStatus === 'pending' ? 'Waiting for cloud sync' : 'Stored on this device'} /></Card>
      <View style={styles.buttonGrid}><AppButton title="Edit record details" icon="file-document-edit-outline" secondary onPress={() => startEditRecord(r)} style={{ flex: 1 }} /><AppButton title="Create share link" icon="qrcode" secondary onPress={() => void shareRecord(r)} style={{ flex: 1 }} /></View>
      <Card><SectionTitle title="Original documents" />{r.attachments.length ? r.attachments.map((a, i) => <Pressable key={a.id} onPress={() => void openFile(r, a)} style={[styles.fileRow, { borderColor: c.line }]}><MaterialCommunityIcons name={a.mimeType === 'application/pdf' ? 'file-pdf-box' : 'file-image-outline'} size={23} color={c.primary} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '700', fontSize: 12 }}>{a.fileName}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{a.byteSize ? formatBytes(a.byteSize) : 'Size unknown'} · file {i + 1}</Text></View><MaterialCommunityIcons name="open-in-new" size={19} color={c.muted} /></Pressable>) : <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>No original file is attached to this sample/manual record.</Text>}{r.attachments.length ? <AppButton title="Open original file" icon="open-in-new" secondary onPress={() => void openFile(r)} style={{ marginTop: 10 }} /> : null}</Card>
      {r.structuredMedicines && r.structuredMedicines.length > 0 ? (
        <Card>
          <SectionTitle title={`Verified medicines (${r.structuredMedicines.length})`} />
          {r.structuredMedicines.map((med: any, i: number) => {
            const isVerified = med.verificationStatus === 'verified_catalogue' || med.verificationStatus === 'verified_rxnorm';
            const isFuzzy = med.verificationStatus === 'fuzzy_match';
            const badgeColor = isVerified ? '#1e6834' : isFuzzy ? '#976100' : '#b3261e';
            const badgeBg = isVerified ? '#eaf5eb' : isFuzzy ? '#fef7e6' : '#fdf0ee';
            return (
              <View key={`${med.brandName || med.name}-${i}`} style={[styles.listLine, { borderBottomColor: c.line, paddingVertical: 8 }]}>
                <MaterialCommunityIcons name="pill" size={20} color={c.primary} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={styles.rowBetween}>
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>{med.brandName || med.name}</Text>
                    <View style={{ backgroundColor: badgeBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                      <Text style={{ color: badgeColor, fontSize: 10, fontWeight: '700' }}>
                        {isVerified ? (med.rxcui ? `RxNorm #${med.rxcui}` : 'Verified') : isFuzzy ? 'Fuzzy match' : 'Check review'}
                      </Text>
                    </View>
                  </View>
                  {med.genericName && med.genericName !== (med.brandName || med.name) ? (
                    <Text style={{ color: c.muted, fontSize: 11 }}>({med.genericName})</Text>
                  ) : null}
                  <Text style={{ color: c.primary, fontSize: 12, marginTop: 2 }}>
                    {med.dosageForm || 'Tablet'} {med.strength || ''} · {med.frequency || ''} · {med.duration || ''}
                  </Text>
                </View>
                <Pressable onPress={() => { setGlossaryTerm(med.brandName || med.name); setSelectedRecord(null); }} style={{ paddingLeft: 8 }}>
                  <MaterialCommunityIcons name="help-circle-outline" size={20} color={c.muted} />
                </Pressable>
              </View>
            );
          })}
          <Text style={[styles.tinyNote, { color: c.muted }]}>Verified against NIH RxNorm and essential medicine catalogue. Always consult your doctor before changing medications.</Text>
        </Card>
      ) : r.medicines.length ? (
        <Card><SectionTitle title="Medicines as printed" />{r.medicines.map((m, i) => <View key={`${m}-${i}`} style={[styles.listLine, { borderBottomColor: c.line }]}><MaterialCommunityIcons name="pill" size={20} color={c.primary} /><Text style={{ color: c.text, flex: 1, fontSize: 13 }}>{m}</Text><Pressable onPress={() => { setGlossaryTerm(m); setSelectedRecord(null); }}><MaterialCommunityIcons name="help-circle-outline" size={20} color={c.muted} /></Pressable></View>)}<Text style={[styles.tinyNote, { color: c.muted }]}>Names copied from the record do not confirm what you should take. Ask the prescribing clinician or pharmacist before changing a medicine.</Text></Card>
      ) : null}
      {r.labValues.length ? <Card><SectionTitle title="Lab values as printed" action="View trends" onAction={() => openView('labs')} />{r.labValues.map((v, i) => <View key={`${v.name}-${i}`} style={[styles.labValueRow, { borderBottomColor: c.line }]}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800' }}>{v.name}</Text><Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>Reference printed: {v.referenceRange || 'not recorded'}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={{ color: c.text, fontWeight: '800' }}>{v.value} {v.unit || ''}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{v.reportMarker ? `Marker: ${v.reportMarker}` : 'No marker copied'}</Text></View><Pressable onPress={() => { setGlossaryTerm(v.name); setSelectedRecord(null); }} style={{ padding: 5 }}><MaterialCommunityIcons name="help-circle-outline" size={20} color={c.muted} /></Pressable></View>)}<Text style={[styles.tinyNote, { color: c.muted }]}>Values as printed on your reports. Discuss changes with your doctor.</Text></Card> : null}
      {r.extractedText ? <Card><SectionTitle title="Extracted text" /><Text selectable style={{ color: c.text, fontSize: 13, lineHeight: 20 }}>{r.extractedText}</Text></Card> : null}
      <View style={styles.buttonGrid}><AppButton title="Create share link" icon="qrcode" secondary onPress={() => void shareRecord(r)} style={{ flex: 1 }} /><AppButton title="Read summary aloud" icon="volume-high" secondary onPress={() => Speech.speak(`${r.title}. ${r.summary}`, { language: settings.language === 'اردو' ? 'ur' : settings.language === 'हिन्दी' ? 'hi' : 'en' })} style={{ flex: 1 }} /></View>
    </>;
  };

  const renderDoctorSummary = () => {
    const active = records.filter(r => !r.isSensitive).sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt));
    const medicines = [...new Set(active.flatMap(r => r.medicines))];
    const conditions = [...new Set(active.flatMap(r => r.tags).filter(t => !['sample', 'check-up', 'blood test', 'vaccination'].includes(t.toLowerCase())))];
    return <><ScreenHeader title="Doctor summary" subtitle="Built only from your saved records" onBack={() => openView('home')} /><Card style={{ marginTop: 14 }}><View style={styles.rowStart}><MaterialCommunityIcons name="file-account-outline" size={29} color={c.primary} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 18, fontWeight: '900' }}>Medical history summary</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>Prepared {new Date().toLocaleDateString()}</Text></View></View><View style={[styles.detailDivider, { backgroundColor: c.line }]} /><InfoPair label="People in vault" value={people.map(p => `${p.fullName} (${p.relationship})`).join(', ') || 'Not recorded'} /><InfoPair label="Emergency blood group" value={emergency.bloodGroup || 'Not recorded'} /><InfoPair label="Recorded allergies" value={emergency.allergies || 'Not recorded'} /><InfoPair label="Recorded conditions / tags" value={conditions.join(', ') || 'Not recorded'} /><InfoPair label="Medicines listed in records" value={medicines.join(', ') || 'Not recorded'} /><InfoPair label="Records included" value={String(active.length)} /><Text style={{ color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }}>This summary lists only information found in your vault. It does not establish whether a medicine is current, diagnose a condition, or interpret a test.</Text></Card>
      <SectionTitle title="Recent records" />{active.slice(0, 8).map(r => <Card key={r.id}><Text style={{ color: c.text, fontWeight: '800' }}>{r.title}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>{dateLabel(r.recordDate)} · {r.doctorName || 'Doctor not recorded'}</Text><Text style={{ color: c.text, fontSize: 12, lineHeight: 18, marginTop: 6 }}>{r.summary || 'No summary recorded'}</Text></Card>)}
      <AppButton title="Export doctor summary as PDF" icon="file-pdf-box" onPress={() => void exportPdf('doctor')} /></>;
  };

  const renderAppointment = () => <><ScreenHeader title="Appointment prep" subtitle="Bring the right records and questions" onBack={() => openView('home')} /><Card style={{ marginTop: 14 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>Before you go</Text><Text style={{ color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>This view collects recent record summaries and your own questions. It does not recommend tests or treatment.</Text><View style={{ marginTop: 12, gap: 9 }}>{['Confirm current medicines with the clinician', 'Bring original reports for any values that matter', 'Mention allergies recorded in your emergency card', 'Ask which follow-up date or test is written in the plan'].map((label, i) => <View key={label} style={styles.rowStart}><MaterialCommunityIcons name="checkbox-blank-circle-outline" size={19} color={c.primary} /><Text style={{ color: c.text, fontSize: 13, flex: 1 }}>{label}</Text></View>)}</View></Card><Card><Field label="Questions you want to ask" value={appointmentQuestions} onChangeText={setAppointmentQuestions} placeholder="Write your questions here…" multiline /><AppButton title="Export appointment pack as PDF" icon="file-pdf-box" onPress={() => void exportPdf('appointment')} /></Card><SectionTitle title="Latest relevant records" />{records.filter(r => !r.isSensitive).sort((a, b) => (b.recordDate || b.createdAt).localeCompare(a.recordDate || a.createdAt)).slice(0, 8).map(r => <RecordTile key={r.id} record={r} onPress={() => { setSelectedRecord(r); openView('detail'); }} onFavorite={() => toggleFavorite(r)} onExplain={() => { setGlossaryTerm(r.title); setSelectedRecord(null); openView('detail'); }} />)}</>;

  const renderLabs = () => {
    const tests = [...new Set(records.filter(r => !r.isSensitive).flatMap(r => r.labValues.map(v => v.name)))];
    const numeric = labValues.map(v => ({ ...v, numeric: Number(v.value.replace(/,/g, '')) })).filter(v => Number.isFinite(v.numeric));
    const max = Math.max(1, ...numeric.map(v => Math.abs(v.numeric)));
    return <><ScreenHeader title="Lab trends" subtitle="Numbers and ranges as printed on reports" onBack={() => openView('home')} /><Card style={{ marginTop: 14 }}><View style={styles.rowStart}><MaterialCommunityIcons name="chart-line" size={27} color={c.primary} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>Values over time</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>No app-generated good/bad labels. Unit changes can make values incomparable; check each original report.</Text></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 13 }}><Chip label="All tests" active={labFilter === 'All tests'} onPress={() => setLabFilter('All tests')} />{tests.map(t => <Chip key={t} label={t} active={labFilter === t} onPress={() => setLabFilter(t)} />)}</ScrollView>
      {numeric.length ? numeric.map((v, i) => <View key={`${v.name}-${v.recordDate}-${i}`} style={{ marginTop: 14 }}><View style={styles.rowBetween}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800' }}>{v.name}</Text><Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>{dateLabel(v.recordDate)} · {v.recordTitle}</Text></View><Text style={{ color: c.text, fontWeight: '900' }}>{v.value} {v.unit || ''}</Text></View><View style={[styles.barTrack, { backgroundColor: c.surface }]}><View style={[styles.barValue, { width: `${Math.max(4, Math.min(100, Math.abs(v.numeric) / max * 100))}%`, backgroundColor: c.primary }]} /></View><Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>Reference range: {v.referenceRange || 'not printed / not recorded'} · Report marker: {v.reportMarker || 'none copied'}</Text></View>) : <EmptyState icon="chart-line" title="No numeric lab values found" body="Add a lab report and review its printed test values and reference ranges to build a timeline." />}
    </Card><Text style={[styles.tinyNote, { color: c.muted }]}>Values as printed on your reports. Discuss changes with your doctor. Values with different units or tests should not be compared by bar length.</Text></>;
  };

  const renderAsk = () => <><ScreenHeader title="Ask my records" subtitle="Search your documents, not medical advice" onBack={() => openView('home')} /><Card style={{ marginTop: 14 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>What are you looking for?</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 12 }}>Examples: “my last thyroid test”, “2024 blood report”, or “Dr. Taylor”. Answers come only from your locally available record text and metadata.</Text><Field label="Your question" value={askQuestion} onChangeText={setAskQuestion} placeholder="Search in my medical records…" multiline /><AppButton title="Find matching records" icon="magnify" onPress={askFromRecords} /></Card>
    {askResult ? <Card><View style={styles.rowStart}><MaterialCommunityIcons name={askResult.emergency ? 'alert-circle' : askResult.redirected ? 'doctor' : 'file-search-outline'} size={24} color={askResult.emergency ? c.danger : c.primary} /><Text style={{ color: c.text, fontWeight: '800', flex: 1 }}>Result</Text></View><Text style={{ color: c.text, fontSize: 13, lineHeight: 20, marginTop: 10 }}>{askResult.answer}</Text>{askResult.sources.map(r => <Pressable key={r.id} onPress={() => { setSelectedRecord(r); setGlossaryTerm(''); openView('detail'); }} style={[styles.sourceRow, { borderColor: c.line }]}><MaterialCommunityIcons name="file-document-outline" size={22} color={c.primary} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 13 }}>{r.title}</Text><Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>{dateLabel(r.recordDate)} · {r.doctorName || 'Doctor not recorded'} · page-level highlighting is not available in this version</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={c.muted} /></Pressable>)}</Card> : null}
    <Card style={{ backgroundColor: c.surface }}><Text style={{ color: c.text, fontWeight: '800' }}>Medical question?</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Questions such as “Do I have diabetes?” or “Can I stop this tablet?” are redirected to your doctor. CareVault cannot diagnose or recommend medicine changes.</Text></Card></>;

  const renderEmergency = () => <><ScreenHeader title="Emergency card" subtitle="Keep key details ready" onBack={() => openView('home')} /><Card style={{ marginTop: 14 }}><View style={[styles.emergencyHeader, { backgroundColor: c.softRed }]}><MaterialCommunityIcons name="alert-decagram-outline" size={29} color={c.danger} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '900', fontSize: 18 }}>Emergency information</Text><Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>Keep these details accurate and current.</Text></View></View><Field label="Blood group (as confirmed)" value={emergency.bloodGroup} onChangeText={v => setEmergency(p => ({ ...p, bloodGroup: v }))} placeholder="e.g. O+ or Unknown" /><Field label="Recorded allergies" value={emergency.allergies} onChangeText={v => setEmergency(p => ({ ...p, allergies: v }))} placeholder="Write 'Unknown' if not confirmed" multiline /><Field label="Conditions / important notes" value={emergency.conditions} onChangeText={v => setEmergency(p => ({ ...p, conditions: v }))} placeholder="Only confirmed information" multiline /><Field label="Emergency contact name" value={emergency.emergencyContactName} onChangeText={v => setEmergency(p => ({ ...p, emergencyContactName: v }))} /><Field label="Emergency contact phone" value={emergency.emergencyContactPhone} onChangeText={v => setEmergency(p => ({ ...p, emergencyContactPhone: v }))} keyboardType="phone-pad" /><Field label="Other note (optional)" value={emergency.notes} onChangeText={v => setEmergency(p => ({ ...p, notes: v }))} multiline /><AppButton title="Save emergency card" icon="content-save-check-outline" onPress={() => { void (async () => { await saveLocalState(ownerKey, 'emergency', emergency); if (supabase && isRealUser) { const { error } = await supabase.from('emergency_profiles').upsert({ owner_id: session.user.id, blood_group: emergency.bloodGroup, allergies: emergency.allergies, conditions: emergency.conditions, emergency_contact_name: emergency.emergencyContactName, emergency_contact_phone: emergency.emergencyContactPhone, notes: emergency.notes, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' }); if (error) Alert.alert('Saved on device', 'Cloud sync failed. Use Sync pending and refresh from Settings.'); else Alert.alert('Saved', 'Emergency card saved on this device and synced to your account.'); } else Alert.alert('Saved on device', 'Emergency information is saved locally. Demo data is not sent to a server.'); })().catch((e: any) => Alert.alert('Save failed', e?.message || 'Could not save the emergency card.')); }} /></Card><Card style={{ backgroundColor: c.softGold, borderColor: c.softGold }}><Text style={{ color: c.text, fontWeight: '800' }}>Important limitation</Text><Text style={{ color: c.text, fontSize: 12, lineHeight: 18, marginTop: 5 }}>This is an in-app emergency card. It is not automatically visible on your phone’s lock screen. Add critical information to Android Emergency information / iPhone Medical ID for lock-screen access.</Text></Card></>;

  const renderReminders = () => <><ScreenHeader title="Follow-up reminders" subtitle="User-confirmed reminders only" onBack={() => openView('home')} /><Card style={{ marginTop: 14 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>Add a reminder</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 12 }}>For example, “Repeat thyroid test”. Enter a local date and time, e.g. 2026-12-20T09:00. No reminder is created from a doctor note unless you confirm it.</Text><Field label="Reminder title" value={reminderTitle} onChangeText={setReminderTitle} placeholder="Repeat thyroid test" /><Field label="Date/time (YYYY-MM-DDTHH:MM)" value={reminderDate} onChangeText={setReminderDate} placeholder="2026-12-20T09:00" autoCapitalize="none" /><Field label="Note (optional)" value={reminderNote} onChangeText={setReminderNote} placeholder="Ask the clinic about preparation…" multiline /><AppButton title="Save reminder" icon="bell-plus-outline" onPress={() => void saveReminder()} /></Card>
    <SectionTitle title="Scheduled reminders" />{reminders.length ? reminders.map(reminder => <Card key={reminder.id}><View style={styles.rowBetween}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800' }}>{reminder.title}</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>{new Date(reminder.dueAt).toLocaleString()}</Text>{reminder.note ? <Text style={{ color: c.text, fontSize: 12, marginTop: 6 }}>{reminder.note}</Text> : null}</View><Pressable onPress={() => Alert.alert('Reminder complete?', 'Mark this reminder as done?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Done', onPress: () => { if (reminder.notificationId) void Notifications.cancelScheduledNotificationAsync(reminder.notificationId); setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, done: true } : r)); if (supabase && isRealUser) void supabase.from('follow_up_reminders').update({ status: 'done' }).eq('id', reminder.id).then(({ error }) => { if (error) Alert.alert('Saved on device', 'Reminder completion could not be synced yet. Use Sync pending + refresh in Settings.'); }); } }])}><MaterialCommunityIcons name={reminder.done ? 'check-circle' : 'circle-outline'} size={25} color={reminder.done ? c.primary : c.muted} /></Pressable></View></Card>) : <Card><EmptyState icon="bell-outline" title="No reminders yet" body="Set a follow-up date or test reminder above." /></Card>}
    <Text style={[styles.tinyNote, { color: c.muted }]}>Device notifications are scheduled on this phone. Reminder metadata is synced to Supabase when configured; verify permissions and re-schedule notifications on each device after signing in.</Text></>;

  const changeBiometric = async (enabled: boolean) => {
    if (enabled) {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const secLevel = await LocalAuthentication.getEnrolledLevelAsync();
        if (!hasHardware && secLevel === 0) {
          Alert.alert('Biometrics Unavailable', 'This device does not report biometric hardware or PIN lock.');
          return;
        }
        isAuthenticatingRef.current = true;
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: tr('unlock_carevault'),
          cancelLabel: 'Cancel',
          fallbackLabel: 'Use device passcode',
          disableDeviceFallback: false,
        });
        isAuthenticatingRef.current = false;
        if (!auth.success) {
          if ((auth.error as string) === 'missing_usage_description') {
            Alert.alert(
              'Face ID in Expo Go',
              'Apple limits direct Face ID camera access inside Expo Go. Full Face ID requires an Expo Development Build (npx expo run:ios).\n\nEnable lock with device passcode/PIN for testing?',
              [
                { text: 'Enable Lock', onPress: () => setSettings(p => ({ ...p, biometrics: true })) },
                { text: 'Cancel', style: 'cancel' }
              ]
            );
          }
          return;
        }
      } catch (err: any) {
        isAuthenticatingRef.current = false;
        Alert.alert('Biometric lock error', err?.message || 'Could not authenticate.');
        return;
      }
    }
    setSettings(p => ({ ...p, biometrics: enabled }));
  };

  const testBiometricPrompt = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const secLevel = await LocalAuthentication.getEnrolledLevelAsync();
      const authTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const typeNames: string[] = [];
      if (authTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) typeNames.push('Face ID');
      if (authTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) typeNames.push('Fingerprint');
      if (authTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) typeNames.push('Iris');
      if (secLevel > 0 && !typeNames.length) typeNames.push('PIN / Screen Lock');
      const typesStr = typeNames.join(', ') || 'Passcode / Biometrics';

      isAuthenticatingRef.current = true;
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: tr('unlock_carevault'),
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use device passcode',
        disableDeviceFallback: false,
      });
      isAuthenticatingRef.current = false;

      if (res.success) {
        Alert.alert('Verified! ✅', `${typesStr} / Passcode verified successfully!`);
      } else if (res.error === 'user_cancel' || res.error === 'system_cancel' || res.error === 'app_cancel') {
        // user dismissed prompt, no error alert needed
      } else if ((res.error as string) === 'missing_usage_description') {
        Alert.alert(
          'Expo Go Face ID Notice',
          'Supported hardware: Face ID.\n\nApple requires NSFaceIDUsageDescription in a custom Development Build (npx expo run:ios) to show the native Face ID dialog. In Expo Go, iOS falls back to device passcode.'
        );
      } else {
        Alert.alert('Authentication Notice', `Device response: ${res.error || 'Canceled'}`);
      }
    } catch (err: any) {
      isAuthenticatingRef.current = false;
      Alert.alert('Biometric Error', err?.message || 'Authentication error.');
    }
  };

  const renderSettings = () => <><ScreenHeader title={tr('settings_title')} subtitle={tr('settings_sub')} onBack={() => openView(tab)} />
    <Card style={{ marginTop: 14 }}><SectionTitle title={tr('accessibility_section')} />
      <SettingToggle title={tr('dark_mode')} subtitle={tr('dark_mode_sub')} value={settings.darkMode} onChange={v => setSettings(p => ({ ...p, darkMode: v }))} />
      <SettingToggle title={tr('large_text')} subtitle={tr('large_text_sub')} value={settings.largeText} onChange={v => setSettings(p => ({ ...p, largeText: v }))} />
      <SettingToggle title={tr('simple_mode')} subtitle={tr('simple_mode_sub')} value={settings.simpleMode} onChange={v => setSettings(p => ({ ...p, simpleMode: v }))} />
      <SettingToggle title={tr('voice_readout')} subtitle={tr('voice_readout_sub')} value={settings.voiceReadout} onChange={v => setSettings(p => ({ ...p, voiceReadout: v }))} />
      <Text style={[styles.fieldLabel, { color: c.text, marginBottom: 8, marginTop: 10 }]}>{tr('language_pref')}</Text>
      <View style={styles.inlineWrap}>
        <Chip label="English" active={settings.language === 'English'} onPress={() => setSettings(p => ({ ...p, language: 'English' }))} />
        <Chip label="اردو" active={settings.language === 'اردو'} onPress={() => setSettings(p => ({ ...p, language: 'اردو' }))} />
        <Chip label="हिन्दी" active={settings.language === 'हिन्दी'} onPress={() => setSettings(p => ({ ...p, language: 'हिन्दी' }))} />
      </View>
    </Card>
    <Card><SectionTitle title={tr('privacy_section')} />
      <SettingToggle title={tr('biometric_lock')} subtitle={tr('biometric_lock_sub')} value={settings.biometrics} onChange={v => void changeBiometric(v)} />
      <AppButton small secondary title={tr('test_biometric')} icon="fingerprint" onPress={() => void testBiometricPrompt()} style={{ marginTop: 8 }} />
      <SettingToggle title={tr('show_sensitive')} subtitle={tr('show_sensitive_sub')} value={settings.showHidden} onChange={v => setSettings(p => ({ ...p, showHidden: v }))} />
      <SettingToggle title={tr('ai_consent')} subtitle="Allow selected documents to be sent to the configured AI server when you explicitly ask it to read them" value={settings.aiConsent} onChange={v => { if (v) Alert.alert('AI processing consent', 'Only selected documents are sent to the configured AI service when you explicitly request extraction. Check the provider’s data terms before using real health records.', [{ text: 'Cancel', style: 'cancel' }, { text: 'I understand', onPress: () => setSettings(p => ({ ...p, aiConsent: true })) }]); else setSettings(p => ({ ...p, aiConsent: false })); }} />
      <View style={[styles.infoLine, { backgroundColor: c.surface }]}><MaterialCommunityIcons name="shield-lock-outline" size={22} color={c.primary} /><Text style={{ color: c.text, fontSize: font(12), lineHeight: font(18), flex: 1 }}>Authentication session tokens use device secure storage. Cached records and original files are stored in app-private local storage, but this app does not yet implement a user-held encryption key / end-to-end encryption. Do not use real patient records until the security review is complete.</Text></View>
    </Card>
    <Card><SectionTitle title={tr('your_data')} />
      <AppButton title={tr('export_all_pdf')} icon="file-pdf-box" secondary onPress={() => void exportPdf('all')} />
      <AppButton title={tr('sync_pending')} icon="cloud-sync-outline" secondary disabled={!isRealUser || loading} onPress={() => void syncCloudNow(true)} />
      <AppButton title={tr('delete_everything')} icon="delete-sweep-outline" danger onPress={deleteEverything} />
      <Text style={[styles.tinyNote, { color: c.muted }]}>Delete-all is irreversible. Cloud deletion requires the latest schema and valid sign-in. Back up records that you need first.</Text>
    </Card>
    <Card><View style={styles.rowBetween}><SectionTitle title={tr('premium_title')} /><MaterialCommunityIcons name="crown-outline" size={25} color={c.gold} /></View><Text style={{ color: c.muted, fontSize: font(12), lineHeight: font(18), marginTop: 4 }}>More room for your family's medical history, faster document processing and tools for doctor visits.</Text><View style={styles.planRow}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800' }}>Free</Text><Text style={{ color: c.muted, fontSize: font(12), marginTop: 4 }}>Basic record organisation, manual search, emergency card and PDF export.</Text></View><Chip label="Current preview" active /></View><View style={styles.planRow}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800' }}>Premium</Text><Text style={{ color: c.muted, fontSize: font(12), marginTop: 4 }}>Expanded family profiles, higher AI limits, smart search, lab trends, doctor summaries, translations and secure sharing.</Text></View><Chip label="Explore" /></View><AppButton title="Explore Premium plans" icon="crown-outline" onPress={() => openView('premium')} style={{ marginTop: 10 }} /><Text style={[styles.tinyNote, { color: c.muted }]}>Premium is currently a preview. No payment is taken and no paid entitlement is activated until store billing and server-side entitlement verification are connected.</Text></Card>
    <AppButton title={demoMode ? tr('exit_demo') : tr('sign_out')} icon="logout" secondary onPress={() => void handleSignOut()} />
    <Text style={[styles.tinyNote, { color: c.muted, textAlign: 'center' }]}>CareVault is an organiser, not a medical device. General information from your records and trusted sources. Please confirm with your doctor.</Text>
  </>;

  const renderPremium = () => {
    const monthly = premiumPeriod === 'monthly';
    const price = monthly ? '₹199' : '₹1,499';
    const period = monthly ? 'per month' : 'per year';
    const premiumFeatures = [
      ['cloud-upload-outline', 'Automatic cloud backup', 'Keep records synced across your signed-in devices once cloud sync is configured.'],
      ['account-multiple-outline', 'Whole-family vault', 'Organise records for parents, spouse and children in one place.'],
      ['text-search', 'Smart document search', 'Find relevant terms across saved document text when OCR and indexing are configured.'],
      ['chart-line', 'Lab trends and doctor summaries', 'Review values as printed and prepare a concise history for appointments.'],
      ['brain', 'Higher AI reading allowance', 'Extract and organise more records with a review step before saving.'],
      ['link-variant', 'Temporary doctor-sharing links', 'Share selected record summaries with expiry and revocation when backend sharing is configured.'],
      ['translate', 'Plain-language explanations and translation', 'Access explanations with source references when trusted-source integrations are configured.'],
    ];
    return <><ScreenHeader title="CareVault Premium" subtitle="More organised care for the whole family" onBack={() => openView('settings')} />
      <Card style={{ marginTop: 14, backgroundColor: c.softGreen, borderColor: c.softGreen }}><View style={{ alignItems: 'center', paddingVertical: 8 }}><View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}><MaterialCommunityIcons name="crown" size={34} color={c.gold} /></View><Text style={{ color: c.text, fontSize: 24, fontWeight: '900', marginTop: 12 }}>Your family's health history, together.</Text><Text style={{ color: c.text, opacity: 0.82, fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>Less time searching for reports. Better organised information for the next doctor visit.</Text></View></Card>
      <Card><SectionTitle title="Choose a plan" /><View style={styles.inlineWrap}><Chip label="Monthly" active={monthly} onPress={() => setPremiumPeriod('monthly')} /><Chip label="Yearly · Save 37%" active={!monthly} onPress={() => setPremiumPeriod('yearly')} /></View><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 16 }}><Text style={{ color: c.text, fontSize: 34, fontWeight: '900' }}>{price}</Text><Text style={{ color: c.muted, fontSize: 13 }}>{period}</Text></View><Text style={{ color: c.muted, fontSize: 11, marginTop: 3 }}>Illustrative India pricing; final pricing may change before launch.</Text><AppButton title="Notify me when Premium launches" icon="bell-ring-outline" onPress={() => Alert.alert('Premium preview', 'Purchases are not enabled yet. No payment has been taken. After store billing and server-side receipt verification are connected, this button will start the purchase flow.')} style={{ marginTop: 15 }} /><AppButton title="Restore purchases" icon="restore" secondary onPress={() => Alert.alert('Restore unavailable', 'There are no store purchases to restore in this preview. Restore will be enabled with Google Play / App Store billing.')} style={{ marginTop: 8 }} /><Text style={[styles.tinyNote, { color: c.muted }]}>No payment is taken in this build. Do not treat a preview selection as an active subscription.</Text></Card>
      <Card><SectionTitle title="Included with Premium" />{premiumFeatures.map(([icon, title, description]) => <View key={title} style={[styles.listLine, { borderBottomColor: c.line, alignItems: 'flex-start' }]}><MaterialCommunityIcons name={icon as any} size={22} color={c.primary} style={{ marginTop: 1 }} /><View style={{ flex: 1, gap: 4 }}><Text style={{ color: c.text, fontWeight: '800' }}>{title}</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{description}</Text></View></View>)}</Card>
      <Card><SectionTitle title="Fair and clear" /><Text style={{ color: c.text, fontSize: 13, lineHeight: 20 }}>CareVault Premium organises records; it does not diagnose or replace a clinician. AI extraction can make mistakes, so check extracted details before saving. Your documents should remain private, and payment status must be verified by the server—not trusted from a phone setting.</Text></Card>
    </>;
  };

  const renderShare = () => <><ScreenHeader title="Secure share" subtitle="Expires automatically" onBack={() => openView('detail')} /><Card style={{ marginTop: 14, alignItems: 'center' }}><View style={{ padding: 15, backgroundColor: '#FFFFFF', borderRadius: 12 }}><QRCode value={shareUrl || 'carevault://share/unavailable'} size={206} color="#163A28" backgroundColor="#FFFFFF" /></View><Text style={{ color: c.text, fontWeight: '800', fontSize: 17, marginTop: 16 }}>Temporary share link created</Text><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 7 }}>The link displays a limited record summary and automatically expires. Anyone who has the link can view the limited shared fields until it expires or you revoke it. Do not send it to someone you do not trust.</Text><View style={[styles.shareUrl, { borderColor: c.line, backgroundColor: c.surface }]}><Text selectable style={{ color: c.text, fontSize: 11, lineHeight: 17 }}>{shareUrl}</Text></View><AppButton title="Share link" icon="share-variant" onPress={() => void Share.share({ message: shareUrl, url: shareUrl, title: 'CareVault medical record' })} style={{ width: '100%', marginTop: 10 }} /><AppButton title="Copy link" icon="content-copy" secondary onPress={() => void Clipboard.setStringAsync(shareUrl).then(() => Alert.alert('Link copied', 'The temporary share link has been copied to your clipboard.')).catch(() => Alert.alert('Copy unavailable', 'Use Share link to send or copy the URL.'))} style={{ width: '100%', marginTop: 8 }} /><Text style={{ color: c.muted, fontSize: 11, marginTop: 8 }}>Expires: {shareExpiresAt ? new Date(shareExpiresAt).toLocaleString() : `in ${shareExpires} days`}</Text><AppButton title="Revoke this link now" icon="link-off" danger onPress={() => void (async () => { if (!supabase || !shareId) return; const { error } = await supabase.from('record_shares').update({ revoked_at: new Date().toISOString() }).eq('id', shareId); if (error) Alert.alert('Could not revoke', error.message); else { setShareUrl(''); setShareId(''); Alert.alert('Link revoked', 'This link can no longer be used.'); } })()} style={{ width: '100%', marginTop: 8 }} /><Text style={[styles.tinyNote, { color: c.muted }]}>If using a public web URL, deploy the server share-view endpoint and set EXPO_PUBLIC_PUBLIC_APP_URL to the API host. The carevault:// scheme requires the app to be installed.</Text></Card></>;

  const mainScreen = screen === 'home' ? renderHome() : screen === 'records' ? renderRecords() : screen === 'people' ? renderPeople() : screen === 'settings' ? renderSettings() : screen === 'premium' ? renderPremium() : screen === 'add' ? renderAddRecord() : screen === 'detail' ? renderDetail() : screen === 'doctor' ? renderDoctorSummary() : screen === 'appointment' ? renderAppointment() : screen === 'labs' ? renderLabs() : screen === 'ask' ? renderAsk() : screen === 'emergency' ? renderEmergency() : screen === 'reminders' ? renderReminders() : renderShare();

  return <SafeAreaView style={[styles.fullScreen, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
    <StatusBar barStyle={settings.darkMode ? 'light-content' : 'dark-content'} {...(Platform.OS === 'android' ? { backgroundColor: c.bg } : {})} />
    {['home', 'records', 'people'].includes(screen) ? <View style={[styles.topBar, { borderBottomColor: c.line }]}><View style={styles.rowStart}><View style={[styles.smallBrandMark, { backgroundColor: c.softGreen }]}><MaterialCommunityIcons name="heart-pulse" size={22} color={c.primary} /></View><View><Text style={{ color: c.text, fontWeight: '900', fontSize: 19 }}>CareVault</Text><Text style={{ color: c.muted, fontSize: 10 }}>{demoMode ? 'DEMO · sample data only' : 'Personal medical records'}</Text></View></View><Pressable onPress={() => openView('settings')} accessibilityRole="button" accessibilityLabel="Open settings" style={[styles.roundIcon, { backgroundColor: c.card, borderColor: c.line }]}><MaterialCommunityIcons name="cog-outline" size={23} color={c.text} /></Pressable></View> : null}
    {demoMode ? <View style={[styles.demoBanner, { backgroundColor: c.softGold }]}><MaterialCommunityIcons name="flask-outline" size={16} color={c.gold} /><Text style={{ color: c.text, fontSize: 11, flex: 1 }}>Demo uses synthetic data. Do not enter real medical records.</Text><Pressable onPress={() => openView('settings')}><Text style={{ color: c.primary, fontWeight: '800', fontSize: 11 }}>Privacy</Text></Pressable></View> : null}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[styles.screenContent, { paddingBottom: 28 }]} keyboardShouldPersistTaps="handled">{mainScreen}</ScrollView>
    </KeyboardAvoidingView>
    {['home', 'records', 'people'].includes(screen) ? <View style={[styles.bottomNav, { backgroundColor: c.card, borderTopColor: c.line }]}>
      <TabButton label={tr('home')} icon="home-variant-outline" active={tab === 'home' && screen === 'home'} onPress={() => { setTab('home'); openView('home'); }} />
      <TabButton label={tr('records')} icon="file-multiple-outline" active={screen === 'records'} onPress={() => { setTab('records'); setShowReviewOnly(false); openView('records'); }} />
      <TabButton label={tr('people')} icon="account-group-outline" active={screen === 'people'} onPress={() => { setTab('people'); openView('people'); }} />
    </View> : null}
    <Modal visible={Boolean(sharedRecord)} transparent animationType="slide" onRequestClose={() => setSharedRecord(null)}><View style={[styles.modalShade, { backgroundColor: '#0009' }]}><View style={[styles.modalPanel, { backgroundColor: c.card }]}><Pressable style={{ alignSelf: 'flex-end' }} onPress={() => setSharedRecord(null)}><MaterialCommunityIcons name="close" size={24} color={c.text} /></Pressable><Text style={{ color: c.text, fontSize: 21, fontWeight: '900' }}>Shared medical record</Text><Text style={{ color: c.muted, fontSize: 12, marginVertical: 8 }}>Limited information shared by the record owner. Confirm details with the original document and clinician.</Text><Text style={{ color: c.text, fontSize: 17, fontWeight: '800', marginTop: 8 }}>{sharedRecord?.title || 'Medical record'}</Text><InfoPair label="Date" value={sharedRecord?.record_date || 'Not recorded'} /><InfoPair label="Doctor" value={sharedRecord?.doctor_name || 'Not recorded'} /><InfoPair label="Facility" value={sharedRecord?.hospital_name || 'Not recorded'} /><InfoPair label="Summary" value={sharedRecord?.summary || 'No summary provided'} /><AppButton title="Close shared record" onPress={() => setSharedRecord(null)} /></View></View></Modal>
    <Modal visible={onboardingVisible} transparent animationType="fade" onRequestClose={() => {}}><View style={[styles.modalShade, { backgroundColor: '#000B', justifyContent: 'center', padding: 22 }]}><View style={[styles.modalPanel, { backgroundColor: c.card, alignSelf: 'center', width: '100%', maxWidth: 440 }]}><View style={[styles.quickIcon, { backgroundColor: c.softGreen, alignSelf: 'center', width: 58, height: 58, borderRadius: 18 }]}><MaterialCommunityIcons name={onboardingStep === 0 ? 'folder-heart-outline' : onboardingStep === 1 ? 'shield-lock-outline' : 'account-heart-outline'} size={30} color={c.primary} /></View><Text style={{ color: c.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 15 }}>{['Your medical history, one tap away', 'Know where your records go', 'AI helps organise — not diagnose'][onboardingStep]}</Text><Text style={{ color: c.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 }}>{[
      'Keep prescriptions, lab reports, scans, discharge notes and family records together. Start with the synthetic demo account to explore the app.',
      'The demo uses fake sample records. A real account needs your Supabase configuration. Local cache is app-private, but this build is not end-to-end encrypted; do not use real patient documents before security review.',
      'AI extraction is optional and asks for consent. You must compare every extracted field with the original. CareVault never replaces your clinician or recommends changing a medicine.',
    ][onboardingStep]}</Text><View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginVertical: 18 }}>{[0, 1, 2].map(step => <View key={step} style={{ width: step === onboardingStep ? 22 : 7, height: 7, borderRadius: 6, backgroundColor: step === onboardingStep ? c.primary : c.line }} />)}</View><AppButton title={onboardingStep < 2 ? 'Next' : 'Start using CareVault'} icon={onboardingStep < 2 ? 'arrow-right' : 'check'} onPress={() => { if (onboardingStep < 2) setOnboardingStep(step => step + 1); else { void writeJson('carevault.mobile.onboarding.v1', true); setOnboardingVisible(false); } }} /></View></View></Modal>
  </SafeAreaView>;
}

function QuickAction({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  const c = useColors();
  const font = useFont();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, { backgroundColor: c.card, borderColor: c.line, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`}><View style={[styles.quickIcon, { backgroundColor: c.softGreen }]}><MaterialCommunityIcons name={icon as any} size={font(23)} color={c.primary} /></View><Text style={{ color: c.text, fontWeight: '800', fontSize: font(13), marginTop: 10 }}>{title}</Text><Text style={{ color: c.muted, fontSize: font(11), lineHeight: font(15), marginTop: 3 }}>{subtitle}</Text></Pressable>;
}
function InfoPair({ label, value }: { label: string; value: string }) {
  const c = useColors();
  const font = useFont();
  return <View style={[styles.infoPair, { borderBottomColor: c.line }]}><Text style={{ color: c.muted, fontSize: font(12), width: '35%' }}>{label}</Text><Text selectable style={{ color: c.text, fontWeight: '600', fontSize: font(13), flex: 1, lineHeight: font(19) }}>{value}</Text></View>;
}
function SettingToggle({ title, subtitle, value, onChange, disabled = false }: { title: string; subtitle: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  const c = useColors();
  const font = useFont();
  return <View style={styles.settingRow}><View style={{ flex: 1, paddingRight: 12 }}><Text style={{ color: c.text, fontWeight: '700', fontSize: font(14) }}>{title}</Text><Text style={{ color: c.muted, fontSize: font(12), lineHeight: font(17), marginTop: 3 }}>{subtitle}</Text></View><Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.primary, false: c.line }} thumbColor={value ? c.primaryText : undefined} /></View>;
}
function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  const c = useColors();
  const font = useFont();
  return <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.tabButton}><MaterialCommunityIcons name={icon as any} size={font(23)} color={active ? c.primary : c.muted} /><Text style={{ color: active ? c.primary : c.muted, fontSize: font(11), fontWeight: active ? '800' : '600', marginTop: 3 }}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1 }, authScreen: { padding: 22, paddingTop: 30, paddingBottom: 50, gap: 16 }, brandMark: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, smallBrandMark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, brandTitle: { textAlign: 'center', fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: 13 }, authSubtitle: { textAlign: 'center', fontSize: 14, marginTop: -8, marginBottom: 9 },
  topBar: { minHeight: 64, paddingHorizontal: 17, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth }, screenContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 }, screenHeader: { paddingTop: 4, paddingBottom: 12, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, screenTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 }, subtitle: { fontSize: 12, marginTop: 3 }, backButton: { height: 40, width: 36, alignItems: 'center', justifyContent: 'center' }, roundIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, demoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  homeHero: { padding: 18, borderRadius: 25, marginTop: 7, marginBottom: 2 }, heroTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, heroTitle: { color: '#FFFFFF', fontWeight: '900', letterSpacing: -0.7, marginTop: 8, maxWidth: 260 }, heroPrimaryAction: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  card: { borderWidth: 1, borderRadius: 19, padding: 15, marginBottom: 10, shadowOpacity: 0.035, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, borderWidth: 1, minHeight: 42 }, buttonGrid: { flexDirection: 'row', gap: 9, alignItems: 'stretch' }, rowStart: { flexDirection: 'row', alignItems: 'center', gap: 11 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2 }, sectionTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -0.2 }, searchEntry: { height: 52, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, marginTop: 11 }, statsGrid: { flexDirection: 'row', gap: 8, marginVertical: 2 }, statCard: { flex: 1, paddingHorizontal: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 0, borderRadius: 16 }, statNumber: { fontSize: 23, fontWeight: '900', marginTop: 1 }, statCaption: { fontSize: 11, fontWeight: '600' }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, quickAction: { borderWidth: 1, borderRadius: 17, padding: 12, width: '31.7%', minHeight: 128 }, quickIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recordTile: { padding: 12, borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginTop: 9 }, recordIcon: { height: 44, width: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, inlineWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' }, statusPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7 }, chip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 }, fieldLabel: { fontSize: 12, fontWeight: '800' }, input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  fileRow: { flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 }, tinyNote: { fontSize: 11, lineHeight: 17, marginTop: 8 }, emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000010' }, infoLine: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, marginTop: 8 }, planRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000010', gap: 10 },
  personAvatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, warningBanner: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 11, borderRadius: 14, marginTop: 12 }, detailDivider: { height: 1, marginVertical: 12 }, infoPair: { flexDirection: 'row', gap: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth }, listLine: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth }, labValueRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth }, barTrack: { height: 9, borderRadius: 10, overflow: 'hidden', marginTop: 8 }, barValue: { height: 9, borderRadius: 10 }, sourceRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth }, emergencyHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 13, borderRadius: 13, marginBottom: 15 }, shareUrl: { borderWidth: 1, borderRadius: 12, padding: 12, width: '100%', marginTop: 13 },
  bottomNav: { height: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: Platform.OS === 'ios' ? 4 : 0 }, tabButton: { width: '33.33%', height: '100%', alignItems: 'center', justifyContent: 'center' }, modalShade: { flex: 1, justifyContent: 'flex-end' }, modalPanel: { padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', gap: 8 },
});
