/**
 * Utility functions for formatting provider information for speech output
 */

/**
 * Formats a provider name for natural speech.
 *
 * OpenMRS stores provider names in format: "role - Name" (e.g., "nurse - Jane Nurse")
 * This extracts the human name and formats it naturally.
 *
 * Examples:
 *   "nurse - Jane Nurse" -> "Jane"
 *   "doctor - John Smith" -> "Dr. Smith"
 *   "Dr. Sarah Johnson" -> "Dr. Johnson"
 *   "Jane Doe" -> "Jane"
 *
 * @param rawName - The raw provider name from the database
 * @returns A name formatted for natural speech, or empty string if unknown
 */
export function formatProviderNameForSpeech(rawName: string | null | undefined): string {
  if (!rawName) return '';

  const nameLower = rawName.toLowerCase();

  // Skip unknown/placeholder providers
  if (nameLower.includes('unknown') || nameLower.includes('placeholder')) {
    return '';
  }

  let name = rawName;
  let isDoctor = false;

  // Handle "role - Name" format from OpenMRS
  if (rawName.includes(' - ')) {
    const parts = rawName.split(' - ');
    const role = parts[0].toLowerCase().trim();
    name = parts.slice(1).join(' - ').trim(); // Everything after the first " - "

    // Check if the role indicates a doctor
    isDoctor = role === 'doctor' || role === 'dr' || role === 'physician';
  }

  // Check if name already has Dr./Dr prefix
  if (name.toLowerCase().startsWith('dr.') || name.toLowerCase().startsWith('dr ')) {
    isDoctor = true;
    name = name.replace(/^dr\.?\s*/i, '').trim();
  }

  // Parse the name into parts
  const nameParts = name.split(/\s+/).filter(Boolean);

  if (nameParts.length === 0) {
    return '';
  }

  // For doctors, use "Dr. LastName"
  if (isDoctor && nameParts.length >= 1) {
    const lastName = nameParts[nameParts.length - 1];
    return `Dr. ${lastName}`;
  }

  // For non-doctors, use first name only (more friendly/informal)
  return nameParts[0];
}

/**
 * Checks if a provider name represents a known provider (not unknown/placeholder)
 */
export function isProviderKnown(name: string | null | undefined): boolean {
  if (!name) return false;
  const nameLower = name.toLowerCase();
  return !nameLower.includes('unknown') && !nameLower.includes('placeholder');
}
