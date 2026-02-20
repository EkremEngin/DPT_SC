
/**
 * Formats a number as currency (TRY).
 * @param value The amount to format.
 * @param isPresentationMode If true, hides the value with "****".
 * @returns Formatted string.
 */
export const formatCurrency = (value: number, isPresentationMode: boolean = false): string => {
    if (isPresentationMode) {
        return '****';
    }
    return value.toLocaleString('tr-TR');
};
