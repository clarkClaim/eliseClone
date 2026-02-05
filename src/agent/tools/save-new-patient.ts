import { prisma } from '../../db/client.js';
import { normalizePhone } from '../../utils/phone.js';
import { parseDate } from '../../utils/date.js';
import { v4 as uuidv4 } from 'uuid';
import type { MRSAdapter } from '../../mrs/adapter.js';
import type { NewPatient } from '../../mrs/types.js';
import { getSuggestedAvailability, type SuggestedAvailability } from './suggested-availability.js';

export interface SaveNewPatientParams {
  phone: string; // Caller ID by default, or LLM-provided if user gave a different number
  name: string;
  dob: string;
  gender?: string; // "male", "female", or "other" - required by some MRS
}

export interface SaveNewPatientResult {
  success: boolean;
  patient?: {
    id: string;
    name: string;
  };
  message?: string;
  /** Pre-fetched availability so assistant can offer scheduling immediately */
  suggestedAvailability?: SuggestedAvailability;
}

// MRS adapter instance - set by the server
let mrsAdapter: MRSAdapter | null = null;

export function setMRSAdapterForPatient(adapter: MRSAdapter | null): void {
  mrsAdapter = adapter;
}

// Timeout for MRS push (5 seconds)
const MRS_PUSH_TIMEOUT_MS = 5000;

/**
 * Execute a promise with timeout.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('MRS push timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Normalize gender input to standard format.
 * Defaults to 'other' - proper gender can be collected during intake.
 */
function normalizeGender(gender?: string): string {
  if (!gender) return 'other'; // Default - collected during intake questionnaire
  const g = gender.toLowerCase().trim();
  if (g === 'male' || g === 'm' || g === 'man') return 'male';
  if (g === 'female' || g === 'f' || g === 'woman') return 'female';
  return 'other';
}

export async function saveNewPatient(
  params: SaveNewPatientParams,
  callId?: string
): Promise<SaveNewPatientResult> {
  const { phone, name, dob, gender } = params;

  // Validate required params
  if (!name) {
    return { success: false, message: 'Name is required' };
  }
  if (!dob) {
    return { success: false, message: 'Date of birth is required' };
  }
  if (!phone) {
    return { success: false, message: 'Phone number is required. What is your phone number?' };
  }

  // Normalize gender (optional but recommended for MRS)
  const normalizedGender = normalizeGender(gender);

  // Parse DOB
  const parsedDob = parseDate(dob);
  if (!parsedDob) {
    return {
      success: false,
      message: 'Could not parse date of birth. Please provide in format MM/DD/YYYY.',
    };
  }

  // Normalize phone
  const normalizedPhone = normalizePhone(phone);

  // Check if phone already exists
  const existingPhone = await prisma.patientPhone.findFirst({
    where: { phone: normalizedPhone },
    include: { patient: true },
  });

  if (existingPhone) {
    return {
      success: false,
      message: 'This phone number is already registered to another patient. Would you like to use a different phone number?',
    };
  }

  // Parse name into parts
  const nameParts = name.trim().split(/\s+/);
  const givenName = nameParts[0];
  const familyName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  // Create the patient locally first
  const patient = await prisma.patient.create({
    data: {
      mrsId: `local-${uuidv4()}`, // Local patient, not synced to MRS yet
      name: name.trim(),
      givenName,
      familyName: familyName || null,
      dob: parsedDob,
      gender: normalizedGender,
      syncedToMrs: false,
      syncAttempts: 0,
      phones: {
        create: {
          phone: normalizedPhone,
          phoneType: 'mobile',
          isPrimary: true,
        },
      },
    },
  });

  // Attempt real-time push to MRS (non-blocking for response)
  if (mrsAdapter) {
    try {
      const newPatient: NewPatient = {
        givenName,
        familyName: familyName || givenName, // OpenMRS requires familyName
        dateOfBirth: parsedDob,
        gender: normalizedGender,
        phone: normalizedPhone,
        phoneType: 'mobile',
      };

      console.log(`[SaveNewPatient] Pushing patient ${patient.id} to MRS...`);

      // Push with timeout to avoid slow tool responses
      const mrsPatient = await withTimeout(
        mrsAdapter.createPatient(newPatient),
        MRS_PUSH_TIMEOUT_MS
      );

      // Update local patient with MRS ID
      await prisma.patient.update({
        where: { id: patient.id },
        data: {
          mrsId: mrsPatient.mrsId,
          syncedToMrs: true,
          syncedToMrsAt: new Date(),
          lastSyncError: null,
          syncAttempts: 1,
        },
      });

      console.log(`[SaveNewPatient] Patient ${patient.id} pushed to MRS as ${mrsPatient.mrsId}`);
    } catch (error) {
      // Push failed - patient is still created locally, will be synced later
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[SaveNewPatient] Failed to push patient ${patient.id} to MRS:`, errorMessage);

      await prisma.patient.update({
        where: { id: patient.id },
        data: {
          lastSyncError: errorMessage,
          syncAttempts: 1,
        },
      });

      // Don't fail the tool - patient exists locally and will be synced by background job
    }
  } else {
    console.log(`[SaveNewPatient] MRS adapter not available, patient ${patient.id} created locally only`);
  }

  // Update conversation with patient ID if we have a call ID
  if (callId) {
    const conversation = await prisma.conversation.findFirst({
      where: { externalId: callId },
    });

    if (conversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { patientId: patient.id },
      });
    } else {
      await prisma.conversation.create({
        data: {
          externalId: callId,
          channel: 'voice',
          callerPhone: normalizedPhone,
          patientId: patient.id,
        },
      });
    }
  }

  // Fetch suggested availability so assistant can offer scheduling immediately
  const suggestedAvailability = await getSuggestedAvailability();

  return {
    success: true,
    patient: {
      id: patient.id,
      name: patient.name,
    },
    message: `Welcome ${givenName}! You've been registered as a new patient.`,
    suggestedAvailability,
  };
}
