

// Physical Domain
export interface Campus {
  id: string;
  name: string;
  address: string;
  maxOfficeCap: number; // Total capacity for resource planning
  maxAreaCap: number;   // Total area capacity for resource planning
  maxFloorsCap: number; // Total floor capacity for resource planning
}

export interface FloorCapacity {
  floor: string;
  totalSqM: number;
}

export interface Block {
  id: string;
  campusId: string;
  name: string;
  maxFloors: number;
  maxOffices: number;
  maxAreaSqM: number;
  floorCapacities?: FloorCapacity[]; // New: Per-floor reference capacities
  defaultOperatingFee?: number; // Block-level default aidat (operating fee)
  sqMPerEmployee?: number; // m² per employee ratio (default 5)
}

export type UnitStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

export interface Unit {
  id: string;
  blockId: string;
  number: string;
  floor: string;
  areaSqM: number;
  status: UnitStatus;
  isMaintenance: boolean;
  companyId?: string; // New: Direct link to assigned company for Floor Allocation model
  reservationCompanyId?: string;
  reservationFee?: number;
  reservedAt?: string;
  company?: {
    id: string;
    name: string;
    sector: string;
    managerName: string;
    managerPhone: string;
    managerEmail: string;
    employeeCount: number;
    businessAreas: string[];
  } | null;
}

// Commercial Domain
export interface LeaseDocument {
  url: string;
  name: string;
  type: string;
}

export interface ScoreEntry {
  id: string;
  type: string; // 'TUBITAK', 'KOSGEB', 'PATENT', 'ARGE', 'OTHER'
  description: string;
  points: number;
  date: string;
  documents?: LeaseDocument[]; // Updated to support multiple docs
  note?: string; // New: Optional user note/description
}

export interface ContractTemplate {
  rentPerSqM: number;
  startDate: string;
  endDate: string;
}

export interface Company {
  id: string;
  name: string;
  registrationNumber: string;
  sector: string;
  businessAreas: string[]; // New: Multiple specific business areas
  workArea?: string; // New field from CSV
  managerName: string;
  managerPhone: string;
  managerEmail: string;
  employeeCount: number;
  score: number; // Computed Karne Puanı (Achievement Score)
  scoreEntries: ScoreEntry[]; // History of scores
  contractTemplate?: ContractTemplate; // New: Stores agreed terms before physical allocation
  documents?: LeaseDocument[]; // New: Documents attached to the company (e.g. pending contracts)
}

export interface Lease {
  id: string;
  unitId: string;
  companyId: string;
  startDate: string; // ISO Date
  endDate: string; // ISO Date
  monthlyRent: number;
  unitPricePerSqm?: number; // New: Preserved original unit price
  operatingFee?: number; // New: Monthly operating fee (default 400)
  contractUrl?: string; // Legacy Reference
  documents?: LeaseDocument[]; // Updated: Support for file metadata
  createdAt: string;
}

// Data Transfer / AI Types
export interface ContractExtractionResult {
  companyName: string;
  registrationNumber?: string;
  industry?: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  operatingFee?: number; // New: Monthly operating fee (default 400)
}

export interface AuditLog {
  id: string;
  traceId: string;
  timestamp: string;
  entityType: 'LEASE' | 'UNIT' | 'BLOCK' | 'CAMPUS' | 'COMPANY' | 'AUTH';
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN';
  details: string;
  user: string;     // New: Who performed the action
  userRole: string; // New: Role of the user
  rollbackData?: string; // New: JSON snapshot for undo
  impact?: string;       // New: Summary of potential side effects
}

export interface RollbackPreview {
  type: 'SAFE' | 'CONFLICT' | 'DESTRUCTIVE';
  messages: string[];
}

export interface ExtendedLeaseData {
  id: string;
  lease: Lease;
  company: Company;
  unit: Unit;
  block: Block;
  campus: Campus;
}
