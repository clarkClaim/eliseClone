/**
 * Normalize phone number to E.164 format
 * Strips formatting and adds +1 prefix for US numbers if missing
 */
export function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // If starts with +, keep it
  if (normalized.startsWith('+')) {
    // Already has country code, just remove any remaining non-digits after +
    return '+' + normalized.slice(1).replace(/\D/g, '');
  }

  // Remove leading 1 if it's an 11-digit US number
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.slice(1);
  }

  // Assume US (+1) for 10-digit numbers
  if (normalized.length === 10) {
    return '+1' + normalized;
  }

  // For other cases, return with + prefix
  return '+' + normalized;
}
