export type DocumentType = 'prescription' | 'lab_report' | 'scan' | 'discharge_summary' | 'bill' | 'vaccination' | 'other';
export type ReviewStatus = 'confirmed' | 'needs_review';
export type SyncStatus = 'local' | 'pending' | 'synced';
export interface LabValue {
  name: string; value: string; unit?: string; referenceRange?: string; reportMarker?: string; date?: string;
}
export interface StructuredMedicine {
  raw: string;
  brandName: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  frequency: string;
  duration: string;
  instructions: string;
  category: string;
  rxcui: string | null;
  verificationStatus: 'verified_catalogue' | 'verified_rxnorm' | 'fuzzy_match' | 'unverified';
  confidence: number;
  consensusSupported: boolean;
  flags: string[];
}
export interface Attachment {
  id: string; fileName: string; mimeType: string; byteSize: number; localUri: string; cloudPath?: string; pageOrder: number; contentHash?: string;
}
export interface MedicalRecord {
  id: string; title: string; documentType: DocumentType; recordDate: string | null; doctorName: string | null;
  hospitalName: string | null; summary: string; extractedText: string; tags: string[]; medicines: string[];
  structuredMedicines?: StructuredMedicine[];
  labValues: LabValue[]; personId: string | null; personName?: string; reviewStatus: ReviewStatus; confidence: number | null;
  mimeType: string; byteSize: number; filePath: string | null; localUri?: string; attachments: Attachment[];
  createdAt: string; isFavorite: boolean; isSensitive: boolean; syncStatus: SyncStatus;
}
export interface PersonProfile { id: string; fullName: string; relationship: string; dateOfBirth: string | null; createdAt: string; syncStatus?: SyncStatus; }
export interface Reminder { id: string; title: string; dueAt: string; note: string; personId: string | null; recordId: string | null; notificationId?: string; done: boolean; }
export interface EmergencyProfile { bloodGroup: string; allergies: string; conditions: string; emergencyContactName: string; emergencyContactPhone: string; notes: string; }
export interface Settings {
  darkMode: boolean; largeText: boolean; simpleMode: boolean; language: 'English' | 'اردو' | 'हिन्दी'; biometrics: boolean;
  showHidden: boolean; aiConsent: boolean; voiceReadout: boolean; hiddenVaultPin?: string;
}
export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'prescription', label: 'Prescription' }, { value: 'lab_report', label: 'Lab report' },
  { value: 'scan', label: 'Scan / imaging' }, { value: 'discharge_summary', label: 'Discharge summary' },
  { value: 'bill', label: 'Bill / insurance' }, { value: 'vaccination', label: 'Vaccination' }, { value: 'other', label: 'Other' },
];
export const EMPTY_EMERGENCY: EmergencyProfile = { bloodGroup: '', allergies: '', conditions: '', emergencyContactName: '', emergencyContactPhone: '', notes: '' };
export const DEFAULT_SETTINGS: Settings = { darkMode: false, largeText: false, simpleMode: false, language: 'English', biometrics: false, showHidden: false, aiConsent: false, voiceReadout: false };
