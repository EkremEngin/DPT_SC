/**
 * Cross-page event communication utility
 * Uses localStorage storage events to communicate between pages
 */

export const DATA_CHANGE_EVENT = 'leaseguard_data_change';

export type DataType = 'company' | 'lease' | 'campus' | 'block' | 'unit' | 'document' | 'score';
export type ActionType = 'create' | 'update' | 'delete';

export interface DataChangeEvent {
  type: DataType;
  action: ActionType;
  timestamp: number;
}

/**
 * Trigger a data change event that other pages can listen to
 * This uses the storage event which fires in other tabs/windows when localStorage changes
 */
export function triggerDataChange(type: DataType, action: ActionType): void {
  try {
    const event: DataChangeEvent = {
      type,
      action,
      timestamp: Date.now()
    };
    
    // Set the value to trigger the storage event
    localStorage.setItem(DATA_CHANGE_EVENT, JSON.stringify(event));
    
    // Immediately remove to allow triggering the same event again
    // The storage event has already fired in other tabs by this point
    localStorage.removeItem(DATA_CHANGE_EVENT);
  } catch (error) {
    console.error('Failed to trigger data change event:', error);
  }
}

/**
 * Listen for data change events from other pages
 * Returns an unsubscribe function
 */
export function listenForDataChanges(
  callback: (data: DataChangeEvent) => void
): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === DATA_CHANGE_EVENT && e.newValue) {
      try {
        const data = JSON.parse(e.newValue) as DataChangeEvent;
        callback(data);
      } catch (err) {
        console.error('Failed to parse data change event:', err);
      }
    }
  };
  
  window.addEventListener('storage', handler);
  
  // Return unsubscribe function
  return () => {
    window.removeEventListener('storage', handler);
  };
}

/**
 * Trigger a refresh event specifically for dashboard updates
 * This is a convenience function for the most common use case
 */
export function triggerDashboardRefresh(): void {
  triggerDataChange('lease', 'update');
}
