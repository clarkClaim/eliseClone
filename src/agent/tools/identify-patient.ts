import { prisma } from '../../db/client.js';
import { normalizePhone } from '../../utils/phone.js';
import { parseDate, isSameDate } from '../../utils/date.js';

export interface IdentifyPatientParams {
  phone: string;
  dob: string;
  name?: string;
}

export type IdentifyPatientStatus =
  | 'existing'
  | 'new'
  | 'not_found_try_name'
  | 'verification_failed';

export interface IdentifyPatientResult {
  status: IdentifyPatientStatus;
  patient?: {
    id: string;
    name: string;
    givenName: string | null;
  };
  phoneAdded?: boolean;
  message?: string;
}

export async function identifyPatient(
  params: IdentifyPatientParams,
  callId?: string
): Promise<IdentifyPatientResult> {
  const { phone, dob, name } = params;

  // Validate required params
  if (!phone) {
    return {
      status: 'verification_failed',
      message: 'Phone number is required',
    };
  }

  if (!dob) {
    return {
      status: 'verification_failed',
      message: 'Date of birth is required',
    };
  }

  // Parse DOB
  const parsedDob = parseDate(dob);
  if (!parsedDob) {
    return {
      status: 'verification_failed',
      message: 'Could not parse date of birth. Please provide in format MM/DD/YYYY or Month Day, Year.',
    };
  }

  // Normalize phone
  const normalizedPhone = normalizePhone(phone);

  // Step 1: Try to find patient by phone
  const phoneRecord = await prisma.patientPhone.findFirst({
    where: { phone: normalizedPhone },
    include: { patient: true },
  });

  if (phoneRecord) {
    // Phone found - verify DOB
    const patient = phoneRecord.patient;

    if (patient.dob && isSameDate(patient.dob, parsedDob)) {
      // DOB matches - patient identified
      await updateConversationPatient(callId, patient.id);

      return {
        status: 'existing',
        patient: {
          id: patient.id,
          name: patient.name,
          givenName: patient.givenName,
        },
      };
    } else {
      // DOB doesn't match - caller may be using someone else's phone
      // Fall back to name + DOB lookup
      return {
        status: 'not_found_try_name',
        message: 'I couldn\'t verify you by phone number. Could you please tell me your full name?',
      };
    }
  }

  // Step 2: Phone not found - try name + DOB fallback if name provided
  if (name) {
    const patient = await findPatientByNameAndDob(name, parsedDob);

    if (patient) {
      // Found by name + DOB - add phone to their record
      const phoneAdded = await addPhoneToPatient(patient.id, normalizedPhone);
      await updateConversationPatient(callId, patient.id);

      return {
        status: 'existing',
        patient: {
          id: patient.id,
          name: patient.name,
          givenName: patient.givenName,
        },
        phoneAdded,
      };
    } else {
      // Name + DOB didn't match anyone - new patient
      return {
        status: 'new',
        message: 'No patient found with that name and date of birth.',
      };
    }
  }

  // Step 3: Phone not found, no name provided - ask for name
  return {
    status: 'not_found_try_name',
    message: 'I could not find that phone number in our system. Could you please tell me your full name so I can look you up?',
  };
}

// Find patient by name and DOB with flexible matching
async function findPatientByNameAndDob(
  name: string,
  dob: Date
): Promise<{ id: string; name: string; givenName: string | null } | null> {
  const normalizedName = name.toLowerCase().trim();

  // Get all patients with matching DOB
  const patients = await prisma.patient.findMany({
    where: { dob },
    select: {
      id: true,
      name: true,
      givenName: true,
      familyName: true,
    },
  });

  // Flexible name matching
  for (const patient of patients) {
    const patientName = patient.name.toLowerCase();
    const givenName = patient.givenName?.toLowerCase() || '';
    const familyName = patient.familyName?.toLowerCase() || '';

    // Match full name
    if (patientName === normalizedName) {
      return patient;
    }

    // Match "First Last" format
    if (`${givenName} ${familyName}`.trim() === normalizedName) {
      return patient;
    }

    // Match "Last, First" format
    if (`${familyName}, ${givenName}`.trim() === normalizedName) {
      return patient;
    }

    // Match if name contains both first and last (order independent)
    const nameParts = normalizedName.split(/[\s,]+/).filter(Boolean);
    if (nameParts.length >= 2) {
      const hasFirst = nameParts.some(p => p === givenName);
      const hasLast = nameParts.some(p => p === familyName);
      if (hasFirst && hasLast) {
        return patient;
      }
    }
  }

  return null;
}

// Add phone to patient record
async function addPhoneToPatient(patientId: string, phone: string): Promise<boolean> {
  // Check if phone already exists for this patient
  const existing = await prisma.patientPhone.findFirst({
    where: { patientId, phone },
  });

  if (existing) {
    return false; // Already exists
  }

  await prisma.patientPhone.create({
    data: {
      patientId,
      phone,
      phoneType: 'mobile',
      isPrimary: false,
    },
  });

  return true;
}

// Update conversation with patient ID
async function updateConversationPatient(callId: string | undefined, patientId: string): Promise<void> {
  if (!callId) return;

  // Find or create conversation for this call
  const existing = await prisma.conversation.findFirst({
    where: { externalId: callId },
  });

  if (existing) {
    await prisma.conversation.update({
      where: { id: existing.id },
      data: { patientId },
    });
  } else {
    await prisma.conversation.create({
      data: {
        externalId: callId,
        channel: 'voice',
        patientId,
      },
    });
  }
}
