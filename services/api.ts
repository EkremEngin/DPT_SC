import {
    Campus, Block, Unit, Company, Lease, AuditLog, ExtendedLeaseData,
    RollbackPreview, ScoreEntry, LeaseDocument, FloorCapacity
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Helper for requests
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        headers,
        ...options
    });

    if (!response.ok) {
        // Auto-logout on auth errors (expired/invalid token)
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            throw new Error('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
        }
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        let errMsg = error.error || `Request failed: ${response.statusText}`;
        if (error.details && Array.isArray(error.details)) {
            errMsg += ': ' + error.details.map((d: any) => `${d.field} - ${d.message}`).join(', ');
        }
        throw new Error(errMsg);
    }

    // Handle 204 No Content
    if (response.status === 204) return {} as T;

    return response.json();
}

export const api = {
    // Campuses
    getCampuses: () => request<Campus[]>('/campuses'),
    addCampus: (campus: Omit<Campus, 'id'>) => request<Campus>('/campuses', { method: 'POST', body: JSON.stringify(campus) }),
    deleteCampus: (id: string) => request<void>(`/campuses/${id}`, { method: 'DELETE' }),

    // Blocks
    getBlocks: (campusId?: string) => request<Block[]>(`/blocks${campusId ? `?campusId=${campusId}` : ''}`),
    addBlock: (block: Omit<Block, 'id'>, floorCapacities: FloorCapacity[]) =>
        request<Block>('/blocks', {
            method: 'POST',
            body: JSON.stringify({ ...block, floorCapacities })
        }),
    updateBlock: (id: string, updates: Partial<Block>) => request<void>(`/blocks/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    updateBlockName: (id: string, name: string) => request<void>(`/blocks/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

    // Units
    getUnits: (blockId?: string) => request<Unit[]>(`/units${blockId ? `?blockId=${blockId}` : ''}`),
    assignCompanyToFloor: (payload: { blockId: string, companyId: string, floor: string, areaSqM: number, isReserved?: boolean, reservationFee?: number, reservationDuration?: string }) =>
        request<Unit>('/units/assign', { method: 'POST', body: JSON.stringify(payload) }),
    removeAllocation: (id: string) => request<void>(`/units/${id}`, { method: 'DELETE' }),
    updateUnitAndCompany: (unitId: string, updates: any) => request<void>(`/units/${unitId}`, { method: 'PUT', body: JSON.stringify(updates) }),

    // Companies
    getCompanies: (limit?: number) => request<any>(`/companies${limit ? `?limit=${limit}` : ''}`), // Returns { data, pagination }
    getCompany: (id: string) => request<Company>(`/companies/${id}`),
    registerCompany: (data: any) => request<Company>('/companies', { method: 'POST', body: JSON.stringify(data) }),
    updateCompany: (id: string, updates: any) => request<void>(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),

    addCompanyScore: (companyId: string, score: Omit<ScoreEntry, 'id' | 'date'>) =>
        request<ScoreEntry>(`/companies/${companyId}/scores`, { method: 'POST', body: JSON.stringify(score) }),
    deleteCompanyScore: (companyId: string, scoreId: string) =>
        request<void>(`/companies/${companyId}/scores/${scoreId}`, { method: 'DELETE' }),

    // Documents
    addDocument: (id: string, doc: LeaseDocument, isPending: boolean) => {
        // Company documents (pending contracts)
        if (isPending) {
            return request<void>(`/companies/${id}/documents`, { method: 'POST', body: JSON.stringify(doc) });
        } else {
            // Lease documents (active leases)
            return request<void>(`/leases/${id}/documents`, { method: 'POST', body: JSON.stringify(doc) });
        }
    },
    deleteDocument: (id: string, docName: string, isPending: boolean = true) => {
        // Company documents (pending contracts)
        if (isPending) {
            return request<void>(`/companies/${id}/documents/${encodeURIComponent(docName)}`, { method: 'DELETE' });
        } else {
            // Lease documents (active leases)
            return request<void>(`/leases/${id}/documents/${encodeURIComponent(docName)}`, { method: 'DELETE' });
        }
    },
    getLeaseDocuments: (id: string) => request<LeaseDocument[]>(`/leases/${id}/documents`),

    // Leases
    getLeases: () => request<Lease[]>('/leases'),
    getAllLeaseDetails: () => request<ExtendedLeaseData[]>(`/leases/details?t=${Date.now()}`),
    updateLeaseDates: (companyId: string, startDate: string, endDate: string) =>
        request<void>(`/leases/${companyId}`, { method: 'PUT', body: JSON.stringify({ startDate, endDate }) }),
    updateLease: (companyId: string, updates: { monthlyRent?: number, operatingFee?: number }) =>
        request<void>(`/leases/${companyId}`, { method: 'PUT', body: JSON.stringify(updates) }),
    deleteLease: (companyId: string) => request<void>(`/leases/${companyId}`, { method: 'DELETE' }),

    // Dashboard
    getDashboardMetrics: (campusIdFilter?: string) => request<any>(`/dashboard${campusIdFilter ? `?campusId=${campusIdFilter}` : ''}`),

    // Audit
    getLogs: () => request<any>('/audit'), // Returns { data, pagination }
    getRollbackPreview: (logId: string) => request<any>(`/rollback/${logId}/preview`),
    rollbackTransaction: (logId: string) => request<any>(`/rollback/${logId}`, { method: 'POST' }),

    // Sectors
    getSectors: () => request<string[]>('/sectors'),
    addSector: (sector: string) => request<void>('/sectors', { method: 'POST', body: JSON.stringify({ sector }) }),
    deleteSector: (sector: string, cascade: boolean) => request<void>(`/sectors/${sector}?cascade=${cascade}`, { method: 'DELETE' }),

    // Business Areas
    getBusinessAreas: () => request<string[]>('/business-areas'),
    addBusinessArea: (name: string) => request<void>('/business-areas', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteBusinessArea: (name: string) => request<void>(`/business-areas/${name}`, { method: 'DELETE' }),

    // Auth
    login: (credentials: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    getMe: () => request<any>('/auth/me'),
    updateProfile: (data: { newPassword?: string; currentPassword?: string }) =>
        request<{ message: string }>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    registerUser: (data: any) => request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
    getUsers: () => request<any[]>('/users'),
    deleteUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),

    // Utils
    sanitizeInput: (input: any) => input,
    generateUnitId: () => 'AUTO',
};
