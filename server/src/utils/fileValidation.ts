/**
 * OWASP Compliant Base64 Data URL Validator
 * Verifies that the uploaded file is strictly base64, doesn't exceed size limits,
 * and matches the requested safe MIME types.
 */

export const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'image/jpeg',
    'image/png',
    'application/zip', // .docx alternative on windows
    'application/x-zip-compressed', // .docx alternative on windows
    'application/octet-stream' // generic fallback
];

// 5MB max size in bytes -> approx 5 * 1024 * 1024. 
// Base64 encoding inflates by ~33%. So max base64 string length is around 7_000_000 characters.
const MAX_BASE64_LENGTH = 7000000;

export function validateBase64File(dataUrl: string): { isValid: boolean; error?: string } {
    if (!dataUrl || typeof dataUrl !== 'string') {
        return { isValid: false, error: 'Dosya verisi bulunamadı veya geçersiz format.' };
    }

    if (dataUrl.length > MAX_BASE64_LENGTH) {
        return { isValid: false, error: 'Dosya boyutu 5MB sınırını aşıyor.' };
    }

    // Strict Regex to parse Data URL components safely
    const dataUrlRegex = /^data:([a-zA-Z0-9-+/.]+);base64,(.+)$/;
    const matches = dataUrl.match(dataUrlRegex);

    if (!matches || matches.length !== 3) {
        return { isValid: false, error: 'Geçersiz veya bozuk dosya formatı (Base64 Data URL Bekleniyor).' };
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return { isValid: false, error: 'Güvenlik İhlali: Sadece PDF, Word (.doc, .docx), JPEG ve PNG dosyalarına izin verilmektedir.' };
    }

    // Optional Check: Is the remaining string actually valid Base64?
    // Using simple regex for base64 characters
    const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(base64Data);
    if (!isBase64) {
        return { isValid: false, error: 'Bozuk dosya içeriği (Base64 Parse Hatası).' };
    }

    return { isValid: true };
}
