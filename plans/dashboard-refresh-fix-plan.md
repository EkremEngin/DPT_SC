# Dashboard Refresh Fix Plan

## Problem Statement

When a lease/company is deleted from the Leasing Management page, the Dashboard page doesn't reflect the changes immediately when navigated back. The user has to wait up to 30 seconds for the polling interval to trigger a refresh.

**Affected Areas:**
- Campus info cards
- General summary (m², revenue, occupancy rate)
- Sector distribution charts
- Total company count

## Root Cause

The Dashboard component uses a 30-second polling interval for live updates. When navigating between pages, there's no mechanism to trigger an immediate refresh.

## Solution Options

### Option 1: Window Event-Based Refresh (Recommended)
Use browser's `storage` event to communicate between pages without a shared state manager.

**Pros:**
- No additional dependencies
- Simple to implement
- Works with HashRouter
- Lightweight

**Cons:**
- Limited to same-origin communication
- Requires localStorage usage

### Option 2: Custom Event Bus
Create a simple event bus using a global variable and CustomEvent API.

**Pros:**
- More flexible event types
- No localStorage dependency
- Can pass data with events

**Cons:**
- Events don't persist across page navigations
- More complex setup

### Option 3: React Context with State Manager
Use React Context or a lightweight state manager (Zustand/Jotai).

**Pros:**
- Proper React patterns
- Shared state across components
- Type-safe

**Cons:**
- Requires wrapping app with provider
- More code changes
- Overkill for simple refresh trigger

## Recommended Solution: Option 1 (Window Event-Based)

### Implementation Plan

#### Step 1: Create Event Utility
Create a simple utility for cross-page communication:

**File:** `utils/events.ts` (NEW)
```typescript
export const DATA_CHANGE_EVENT = 'leaseguard_data_change';

export function triggerDataChange(type: 'company' | 'lease' | 'campus' | 'block' | 'unit', action: 'create' | 'update' | 'delete') {
  const timestamp = Date.now();
  localStorage.setItem(DATA_CHANGE_EVENT, JSON.stringify({ type, action, timestamp }));
  // Clear immediately to trigger event in other tabs
  localStorage.removeItem(DATA_CHANGE_EVENT);
}

export function listenForDataChanges(callback: (data: { type: string; action: string; timestamp: number }) => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === DATA_CHANGE_EVENT && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        callback(data);
      } catch (err) {
        console.error('Failed to parse data change event:', err);
      }
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
```

#### Step 2: Update Dashboard Component
Add event listener to trigger refresh on data changes:

**File:** `pages/Dashboard.tsx`
```typescript
import { listenForDataChanges } from '../utils/events';

// Inside Dashboard component, add new useEffect:
useEffect(() => {
  const unsubscribe = listenForDataChanges((data) => {
    console.log('Data changed:', data);
    // Trigger immediate refresh
    fetchData();
  });
  return unsubscribe;
}, []);
```

#### Step 3: Update Leasing Management Component
Trigger event after successful delete:

**File:** `pages/LeasingManagement.tsx`
```typescript
import { triggerDataChange } from '../utils/events';

// In handleConfirmDelete function, after successful delete:
const handleConfirmDelete = async () => {
  // ... existing delete logic ...
  await api.deleteLease(selectedLease.company_id);
  
  // Trigger event for Dashboard
  triggerDataChange('lease', 'delete');
  
  // ... rest of the logic ...
};
```

#### Step 4: Update Physical Structure Component
Trigger event after campus/block/unit changes:

**File:** `pages/PhysicalStructure.tsx`
```typescript
import { triggerDataChange } from '../utils/events';

// After delete operations:
await api.deleteCampus(selectedCampus.id);
triggerDataChange('campus', 'delete');

await api.deleteBlock(blockId);
triggerDataChange('block', 'delete');

await api.removeAllocation(unitId);
triggerDataChange('unit', 'update');
```

### Alternative Quick Fix: Reduce Polling Interval

If the event-based solution is too complex, a simpler fix is to reduce the polling interval:

**File:** `pages/Dashboard.tsx`
```typescript
// Change from 30000ms (30s) to 5000ms (5s)
pollingIntervalRef.current = setInterval(() => {
  fetchData();
}, 5000);
```

**Pros:**
- One-line change
- Immediate improvement

**Cons:**
- More API calls
- Not truly instant
- Still has delay

## Implementation Checklist

- [ ] Create `utils/events.ts` with event utilities
- [ ] Update `pages/Dashboard.tsx` to listen for data changes
- [ ] Update `pages/LeasingManagement.tsx` to trigger events on delete
- [ ] Update `pages/PhysicalStructure.tsx` to trigger events on changes
- [ ] Test delete from Leasing Management → Dashboard refresh
- [ ] Test delete from Physical Structure → Dashboard refresh
- [ ] Test campus/block changes → Dashboard refresh
- [ ] Verify no performance issues

## Testing Steps

1. **Test Lease Delete:**
   - Open Dashboard in one tab
   - Open Leasing Management in another tab
   - Delete a company/lease
   - Switch to Dashboard tab
   - Verify metrics update immediately

2. **Test Campus Delete:**
   - Open Dashboard
   - Go to Physical Structure
   - Delete a campus
   - Return to Dashboard
   - Verify campus count and metrics update

3. **Test Multiple Changes:**
   - Make several changes in quick succession
   - Verify Dashboard updates correctly
   - Check for race conditions

## Success Criteria

- [ ] Dashboard updates within 1 second of returning from Leasing Management
- [ ] All metrics (m², revenue, occupancy) reflect deleted items
- [ ] Campus info cards update correctly
- [ ] No console errors
- [ ] No performance degradation
- [ ] Works across all page navigation scenarios

## Rollback Plan

If issues arise:
1. Remove event listener from Dashboard
2. Remove trigger calls from other pages
3. Delete `utils/events.ts`
4. Consider reducing polling interval as alternative
