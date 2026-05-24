export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'url'
  | 'tel'
  | 'password'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'datetime-local'
  | 'time'
  | 'month'
  | 'week'
  | 'color'
  | 'range'
  | 'custom'
  | 'contenteditable';

export interface FieldSelector {
  name?: string;
  id?: string;
  testId?: string;
  ariaLabel?: string;
  cssPath?: string;
}

export interface FieldSnapshot {
  selector: FieldSelector;
  type: FieldType;
  value: string | string[] | boolean | null;
  visibleLabel?: string;
  underlyingValue?: string;
  inShadowRoot?: boolean;
  htmlContent?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface Preset {
  id: string;
  label: string;
  url: string;
  origin: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  fields: FieldSnapshot[];
  formId: string | null;
  stepOrder: number | null;
  projectId: string | null;
}

export interface FormDef {
  id: string;
  label: string;
  projectId: string | null;
  entryUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  autoPromptOnSubmit: boolean;
  preventSubmitOnCapture: boolean;
  capturePasswords: boolean;
  fillEventBlur: boolean;
  perFieldTimeoutMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autoPromptOnSubmit: true,
  preventSubmitOnCapture: false,
  capturePasswords: false,
  fillEventBlur: true,
  perFieldTimeoutMs: 3000,
};

export type FillStatus = 'filled' | 'not-found' | 'skipped' | 'error';

export interface FillResult {
  selector: FieldSelector;
  type: FieldType;
  status: FillStatus;
  detail?: string;
}

export interface FillReport {
  presetId: string;
  total: number;
  filled: number;
  notFound: number;
  skipped: number;
  errored: number;
  results: FillResult[];
}

export interface CandidateForm {
  index: number;
  label: string;
  fieldCount: number;
  selector: string;
}

export interface CaptureResult {
  url: string;
  origin: string;
  path: string;
  fields: FieldSnapshot[];
  candidates?: CandidateForm[];
}

export interface PageInfo {
  url: string;
  origin: string;
  path: string;
  title: string;
}
