export type DocumentType =
  | 'prescription'
  | 'lab_report'
  | 'scan'
  | 'discharge_summary'
  | 'bill'
  | 'vaccination'
  | 'other';

export type ReviewStatus = 'confirmed' | 'needs_review';

export interface LabValue {
  name: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  reportMarker?: string;
  date?: string;
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

export interface MedicalRecord {
  id: string;
  title: string;
  documentType: DocumentType;
  recordDate: string | null;
  doctorName: string | null;
  hospitalName: string | null;
  summary: string;
  extractedText: string;
  tags: string[];
  medicines: string[];
  structuredMedicines?: StructuredMedicine[];
  labValues: LabValue[];
  personId: string | null;
  personName?: string;
  reviewStatus: ReviewStatus;
  confidence: number | null;
  mimeType: string;
  byteSize: number;
  filePath: string | null;
  createdAt: string;
  isFavorite: boolean;
}

export interface PersonProfile {
  id: string;
  fullName: string;
  relationship: string;
  dateOfBirth: string | null;
  createdAt: string;
}

export interface RecordDraft {
  title: string;
  documentType: DocumentType;
  recordDate: string;
  doctorName: string;
  hospitalName: string;
  summary: string;
  extractedText: string;
  tags: string[];
  medicines: string[];
  structuredMedicines?: StructuredMedicine[];
  labValues: LabValue[];
  personId: string;
  confidence: number | null;
}

export interface EmergencyProfile {
  bloodGroup: string;
  allergies: string;
  conditions: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
}

export const EMPTY_EMERGENCY: EmergencyProfile = {
  bloodGroup: '',
  allergies: '',
  conditions: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  notes: '',
};

export interface Reminder {
  id: string;
  title: string;
  dueAt: string;
  note: string;
  personId?: string | null;
  recordId?: string | null;
  done: boolean;
}

export interface TermExplanation {
  term: string;
  category: string;
  purpose: string;
  description: string;
  source: string;
  url: string;
  disclaimer: string;
}

export interface QAResult {
  answer: string;
  sources: MedicalRecord[];
  redirected: boolean;
  emergency: boolean;
}

export interface ShareLinkInfo {
  id: string;
  recordId: string;
  url: string;
  expiresAt: string;
}

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'lab_report', label: 'Lab report' },
  { value: 'scan', label: 'Scan or imaging' },
  { value: 'discharge_summary', label: 'Discharge summary' },
  { value: 'bill', label: 'Bill or insurance' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'other', label: 'Other' },
];
