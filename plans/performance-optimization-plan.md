# LeaseGuard Performance Optimization Plan
## Professional Software Architecture Analysis

**Date:** 2025-02-16
**Status:** Ready for Implementation
**Priority:** Critical & High-Impact Optimizations

---

## Executive Summary

This document outlines a comprehensive performance optimization strategy for the LeaseGuard system. The analysis identified **critical bugs** and **performance bottlenecks** across frontend, backend, and database layers. All optimizations are designed to be **non-breaking** and maintain existing functionality.

### Key Findings

| Category | Issues Found | Impact | Est. Improvement |
|----------|--------------|--------|------------------|
| Critical Bugs | 2 | High | User Experience |
| Frontend Performance | 4 | High | 40-60% faster UI |
| Backend API | 3 | Medium | 50-70% faster API |
| Database | 5 | Medium | 30-50% faster queries |

---

## Part 1: Critical Bug Fixes (Priority: CRITICAL)

### 1.1 Company Update Validation Error

**File:** `server/src/routes/companies.ts:197-202`

**Problem:**
```typescript
// Current - FAILS on empty strings
body('managerPhone').optional().matches(/^(\+90|0)?[0-9]{10}$/)
```

When frontend sends `managerPhone: ""`, the `optional()` validator doesn't skip it because empty string is not `undefined` or `null`. This causes validation to fail.

**Solution:**
```typescript
// Fixed - Properly handles empty strings
body('managerPhone')
    .optional({ values: 'undefined', null: true, checkFalsy: true })
    .trim()
    .matches(/^(\+90|0)?[0-9]{10}$/)
```

**Files to Modify:**
- `server/src/routes/companies.ts` (lines 197-202)

**Testing:**
- Update company with empty optional fields
- Update company with valid data
- Update company with invalid data format

---

### 1.2 PhysicalStructure Modal Opening Delay

**File:** `pages/PhysicalStructure.tsx:727-767`

**Problem:**
```typescript
// Current - 3 SEQUENTIAL API calls
const handleUnitClick = async (unitId: string) => {
    const blockUnits = await api.getUnits(selectedBlockId);        // ~300ms
    const allLeases = await api.getAllLeaseDetails();              // ~400ms
    const campusBlocks = await api.getBlocks(selectedCampus?.id);  // ~300ms
    setEditingUnitId(unitId);  // Modal opens after ~1 second
};
```

**Solution:**
```typescript
// Optimized - Parallel calls + immediate modal opening
const handleUnitClick = async (unitId: string) => {
    // Open modal immediately with loading state
    setEditingUnitId(unitId);
    setIsLoadingModal(true);

    try {
        // Parallel API calls
        const [blockUnits, allLeases, campusBlocks] = await Promise.all([
            api.getUnits(selectedBlockId),
            api.getAllLeaseDetails(),
            api.getBlocks(selectedCampus?.id)
        ]);

        // Update form data
        setEditFormData({ /* ... */ });
    } finally {
        setIsLoadingModal(false);
    }
};
```

**Files to Modify:**
- `pages/PhysicalStructure.tsx` (handleUnitClick function)

**Expected Improvement:** 1s → ~300ms (70% faster)

---

## Part 2: Frontend Performance Optimization

### 2.1 Implement Data Caching Layer

**Problem:** Every component fetches data independently, causing redundant API calls.

**Solution:** Implement React Query for intelligent caching.

```typescript
// Installation
npm install @tanstack/react-query

// Implementation in App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            cacheTime: 10 * 60 * 1000, // 10 minutes
            retry: 1,
        },
    },
});

// Usage in components
const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.getCompanies(),
});
```

**Files to Create:**
- `src/queries/index.ts` - Query hooks
- `src/contexts/QueryContext.tsx` - Provider setup

**Expected Improvement:** 50-70% reduction in API calls

---

### 2.2 Optimize Component Re-renders

**Problem:** Large components re-render unnecessarily on every state change.

**Solution:** Apply React.memo and useMemo strategically.

```typescript
// Before - Re-renders on every parent update
const FloorRow = ({ block, floorCap, currentUnits, allCompanies, onRefresh, highlightedUnitId, onUnitClick, onEmptyClick }) => {
    // ...
};

// After - Only re-renders when props actually change
const FloorRow = React.memo(({ block, floorCap, currentUnits, allCompanies, onRefresh, highlightedUnitId, onUnitClick, onEmptyClick }) => {
    // ...
}, (prevProps, nextProps) => {
    return prevProps.highlightedUnitId === nextProps.highlightedUnitId &&
           prevProps.currentUnits === nextProps.currentUnits;
});
```

**Files to Modify:**
- `pages/PhysicalStructure.tsx` - FloorRow component
- `pages/LeasingManagement.tsx` - LeaseRowItem component
- `components/AnimatedList.tsx` - List optimization

---

### 2.3 Add Loading States and Optimistic UI

**Problem:** Users wait without feedback during operations.

**Solution:** Implement optimistic updates and loading indicators.

```typescript
// Optimistic update pattern
const handleDelete = async (id: string) => {
    // Immediately update UI
    setItems(prev => prev.filter(item => item.id !== id));
    
    try {
        await api.deleteItem(id);
    } catch (error) {
        // Rollback on error
        setItems(prev => [...prev, originalItem]);
        showError('Failed to delete item');
    }
};
```

---

### 2.4 Implement Virtual Scrolling

**Problem:** Rendering large lists (1000+ items) causes UI lag.

**Solution:** Use react-window for virtual scrolling.

```typescript
import { FixedSizeList } from 'react-window';

const Row = ({ index, style }) => (
    <div style={style}>
        {items[index].name}
    </div>
);

<FixedSizeList
    height={600}
    itemCount={items.length}
    itemSize={50}
    width="100%"
>
    {Row}
</FixedSizeList>
```

**Files to Modify:**
- `pages/LeasingManagement.tsx` - Company list
- `pages/AuditLogs.tsx` - Audit log list

---

## Part 3: Backend API Optimization

### 3.1 Fix N+1 Query Problem in companies.ts

**File:** `server/src/routes/companies.ts:46-47`

**Problem:**
```typescript
// Current - Fetches ALL scores and documents for every request
const scoresResult = await query('SELECT * FROM company_score_entries');
const docsResult = await query('SELECT * FROM company_documents');

// Then filters in memory
companies.forEach(c => {
    c.scoreEntries = scoresResult.rows.filter(s => s.company_id === c.id);
    c.documents = docsResult.rows.filter(d => d.company_id === c.id);
});
```

**Solution:** Use SQL JOINs or separate endpoint for details.

```typescript
// Option 1: Use LEFT JOIN (for list view)
const result = await query(`
    SELECT 
        c.*,
        COALESCE(SUM(cse.points), 0) as total_score,
        COUNT(cd.id) as document_count
    FROM companies c
    LEFT JOIN company_score_entries cse ON c.id = cse.company_id
    LEFT JOIN company_documents cd ON c.id = cd.company_id
    GROUP BY c.id
    ORDER BY c.name
    LIMIT $1 OFFSET $2
`, [limit, offset]);

// Option 2: Separate endpoint for full details
// GET /companies/:id/full - includes all scores and documents
```

**Expected Improvement:** 60-80% faster for large datasets

---

### 3.2 Optimize dashboard.ts with SQL Aggregates

**File:** `server/src/routes/dashboard.ts`

**Problem:** Fetches all data and calculates in memory.

**Solution:** Use SQL aggregate functions.

```typescript
// Before - Memory calculation
const totalArea = blocks.reduce((sum, b) => sum + parseFloat(b.max_area_sqm), 0);
const usedArea = units.filter(u => u.status === 'OCCUPIED').reduce((sum, u) => sum + parseFloat(u.area_sqm), 0);

// After - SQL calculation
const result = await query(`
    SELECT 
        COALESCE(SUM(b.max_area_sqm), 0) as total_area,
        COALESCE(SUM(u.area_sqm), 0) as used_area
    FROM blocks b
    LEFT JOIN units u ON u.block_id = b.id AND u.status = 'OCCUPIED'
    ${campusId ? 'WHERE b.campus_id = $1' : ''}
`, campusId ? [campusId] : []);
```

**Expected Improvement:** 70-90% faster dashboard load

---

### 3.3 Add Database Indexes

**File:** `server/src/db/migrations/002_add_performance_indexes.sql`

**Problem:** Queries scan full tables instead of using indexes.

**Solution:** Add strategic indexes.

```sql
-- Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_units_block_id ON units(block_id);
CREATE INDEX IF NOT EXISTS idx_units_company_id ON units(company_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
CREATE INDEX IF NOT EXISTS idx_blocks_campus_id ON blocks(campus_id);
CREATE INDEX IF NOT EXISTS idx_leases_company_id ON leases(company_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_units_block_status ON units(block_id, status);
CREATE INDEX IF NOT EXISTS idx_units_company_block ON units(company_id, block_id);

-- Score entries for company queries
CREATE INDEX IF NOT EXISTS idx_score_entries_company_id ON company_score_entries(company_id);

-- Audit logs for pagination
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Documents lookup
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON company_documents(company_id);
```

**Expected Improvement:** 50-80% faster queries

---

### 3.4 Implement Response Caching

**Problem:** Same data fetched repeatedly without caching.

**Solution:** Add HTTP caching headers.

```typescript
// In server/src/middleware/cacheMiddleware.ts
export const cacheMiddleware = (maxAge: number) => {
    return (req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
        next();
    };
};

// Usage
router.get('/campuses', cacheMiddleware(300), async (req, res) => {
    // Campus data rarely changes, cache for 5 minutes
});
```

---

## Part 4: Database Optimization

### 4.1 Connection Pooling

**File:** `server/src/db/index.ts`

**Current:** Single connection per query.

**Solution:** Implement connection pooling.

```typescript
import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
```

---

### 4.2 Query Optimization Analysis

**Slow Queries Identified:**

1. `SELECT * FROM companies` - Fetches unnecessary columns
2. `SELECT * FROM units` without WHERE clause - Full table scan
3. Multiple queries in loops (N+1 problem)

**Optimization Strategy:**
- Select only required columns
- Add WHERE clauses for filtering
- Use JOINs instead of separate queries
- Implement prepared statements

---

## Part 5: Code Quality Improvements

### 5.1 Error Boundaries

**Problem:** Unhandled errors crash entire UI.

**Solution:** Add React Error Boundaries.

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
    state = { hasError: false };
    
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    
    render() {
        if (this.state.hasError) {
            return <ErrorFallback onReset={() => this.setState({ hasError: false })} />;
        }
        return this.props.children;
    }
}
```

---

### 5.2 Retry Logic for API Calls

**Problem:** Network failures cause permanent errors.

**Solution:** Implement exponential backoff retry.

```typescript
// In services/api.ts
async function requestWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
    throw new Error('Max retries exceeded');
}
```

---

### 5.3 Request Debouncing

**Problem:** Search inputs trigger API on every keystroke.

**Solution:** Debounce search requests.

```typescript
import { useDebouncedCallback } from 'use-debounce';

const debouncedSearch = useDebouncedCallback(
    (value) => {
        api.searchCompanies(value).then(setResults);
    },
    500 // 500ms delay
);

<input onChange={(e) => debouncedSearch(e.target.value)} />
```

---

## Implementation Order

### Phase 1: Critical Fixes (Day 1)
1. Fix Company Update Validation Error
2. Fix PhysicalStructure Modal Delay

### Phase 2: Quick Wins (Day 2-3)
1. Add database indexes
2. Fix N+1 query in companies.ts
3. Optimize dashboard.ts with SQL aggregates

### Phase 3: Frontend Optimization (Day 4-5)
1. Implement React Query
2. Add loading states
3. Optimize re-renders with React.memo

### Phase 4: Advanced Optimization (Day 6-7)
1. Implement virtual scrolling
2. Add response caching
3. Connection pooling

### Phase 5: Code Quality (Day 8)
1. Error boundaries
2. Retry logic
3. Request debouncing

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Modal Open Time | ~1000ms | ~300ms | 70% improvement |
| Dashboard Load | ~800ms | ~200ms | 75% improvement |
| Company List Load | ~600ms | ~150ms | 75% improvement |
| API Response Time | Variable | Consistent | <200ms p95 |
| Bundle Size | Current | -10% | Code splitting |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Database Indexes | Low | Test on staging first |
| SQL Query Changes | Medium | Compare results before/after |
| React Query Integration | Low | Gradual rollout per component |
| Virtual Scrolling | Low | A/B test with users |

---

## Rollback Plan

Each optimization can be independently rolled back:

1. **Database changes:** Version-controlled migrations
2. **API changes:** Feature flags
3. **Frontend changes:** Git revert per commit

---

## Next Steps

1. Review this plan with the team
2. Create feature branch for each phase
3. Implement Phase 1 (Critical Fixes)
4. Measure and validate improvements
5. Proceed to Phase 2

---

**Document Version:** 1.0
**Last Updated:** 2025-02-16
**Author:** Architecture Analysis
