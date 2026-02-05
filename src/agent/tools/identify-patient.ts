import { prisma } from '../../db/client.js';
import { normalizePhone } from '../../utils/phone.js';
import { parseDate, isSameDate, formatDateForSpeech, formatTimeForSpeech } from '../../utils/date.js';
import { searchAvailability } from '../../scheduling/index.js';

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

export interface UpcomingAppointment {
  id: string;
  dateForSpeech: string;
  timeForSpeech: string;
  providerName: string;
  serviceName: string;
  highlight: boolean;
}

export interface SuggestedSlot {
  dateForSpeech: string;
  timeForSpeech: string;
  providerName: string;
}

export interface IdentifyPatientResult {
  status: IdentifyPatientStatus;
  patient?: {
    id: string;
    name: string;
    givenName: string | null;
  };
  phoneAdded?: boolean;
  message?: string;
  upcomingAppointments?: UpcomingAppointment[];
  /** Guides the assistant on what to do next */
  nextAction?: 'discuss_appointments' | 'offer_scheduling' | 'ask_name' | 'register_new';
  /** Pre-fetched availability when patient has no appointments (so assistant doesn't need to call get_availability) */
  suggestedAvailability?: {
    slots: SuggestedSlot[];
    summary: string;
  };
}

async function getUpcomingAppointments(patientId: string): Promise<UpcomingAppointment[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      patientId,
      startTime: { gt: new Date() },
      status: { notIn: ['cancelled', 'no_show'] },
    },
    include: {
      provider: true,
      service: true,
    },
    orderBy: { startTime: 'asc' },
    take: 5,
  });

  return appointments.map((apt, index) => {
    const providerName = apt.provider?.name?.toLowerCase().includes('unknown')
      ? ''
      : apt.provider?.name ?? '';

    return {
      id: apt.id,
      dateForSpeech: formatDateForSpeech(apt.startTime),
      timeForSpeech: formatTimeForSpeech(apt.startTime),
      providerName,
      serviceName: apt.service?.name ?? '',
      highlight: index < 2,
    };
  });
}

/**
 * Get a few suggested availability slots for patients with no upcoming appointments.
 * This allows the assistant to offer scheduling without a separate get_availability call.
 */
async function getSuggestedAvailability(): Promise<{ slots: SuggestedSlot[]; summary: string }> {
  const result = await searchAvailability({
    startDate: new Date(),
    maxDays: 14,
    findFirst: false,
  });

  // Get provider names
  const providerIds = new Set<string>();
  for (const windows of result.availabilityByDate.values()) {
    for (const w of windows) {
      if (w.providerId) providerIds.add(w.providerId);
    }
  }
  const providers = await prisma.provider.findMany({
    where: { id: { in: [...providerIds] } },
    select: { id: true, name: true },
  });
  const providerMap = new Map(providers.map(p => [p.id, p.name]));

  // Take first 3 slots across different days for variety
  const slots: SuggestedSlot[] = [];
  const seenDates = new Set<string>();

  for (const [isoDate, windows] of [...result.availabilityByDate.entries()].sort()) {
    if (slots.length >= 3) break;
    if (seenDates.has(isoDate)) continue;

    const firstWindow = windows[0];
    if (!firstWindow) continue;

    const rawName = firstWindow.providerId ? providerMap.get(firstWindow.providerId) : undefined;
    const providerName = rawName?.toLowerCase().includes('unknown') ? '' : rawName ?? '';

    slots.push({
      dateForSpeech: formatDateForSpeech(firstWindow.startTime),
      timeForSpeech: formatTimeForSpeech(firstWindow.startTime),
      providerName,
    });
    seenDates.add(isoDate);
  }

  if (slots.length === 0) {
    return { slots: [], summary: 'No appointments are currently available. Please check back later.' };
  }

  const slotDescriptions = slots.map(s => `${s.dateForSpeech} at ${s.timeForSpeech}`);
  const summary = slots.length === 1
    ? `The next available appointment is ${slotDescriptions[0]}.`
    : `I have openings on ${slotDescriptions.slice(0, -1).join(', ')} or ${slotDescriptions[slotDescriptions.length - 1]}.`;

  return { slots, summary };
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
      const upcomingAppointments = await getUpcomingAppointments(patient.id);

      // If patient has appointments, focus on those; otherwise, offer scheduling
      if (upcomingAppointments.length > 0) {
        return {
          status: 'existing',
          patient: {
            id: patient.id,
            name: patient.name,
            givenName: patient.givenName,
          },
          upcomingAppointments,
          nextAction: 'discuss_appointments',
        };
      } else {
        // No appointments - pre-fetch availability so assistant can offer scheduling
        const suggestedAvailability = await getSuggestedAvailability();
        return {
          status: 'existing',
          patient: {
            id: patient.id,
            name: patient.name,
            givenName: patient.givenName,
          },
          upcomingAppointments,
          nextAction: 'offer_scheduling',
          suggestedAvailability,
        };
      }
    } else {
      // DOB doesn't match - caller may be using someone else's phone
      // Fall back to name + DOB lookup
      return {
        status: 'not_found_try_name',
        message: 'I couldn\'t verify you by phone number. Could you please tell me your full name?',
        nextAction: 'ask_name',
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
      const upcomingAppointments = await getUpcomingAppointments(patient.id);

      if (upcomingAppointments.length > 0) {
        return {
          status: 'existing',
          patient: {
            id: patient.id,
            name: patient.name,
            givenName: patient.givenName,
          },
          phoneAdded,
          upcomingAppointments,
          nextAction: 'discuss_appointments',
        };
      } else {
        const suggestedAvailability = await getSuggestedAvailability();
        return {
          status: 'existing',
          patient: {
            id: patient.id,
            name: patient.name,
            givenName: patient.givenName,
          },
          phoneAdded,
          upcomingAppointments,
          nextAction: 'offer_scheduling',
          suggestedAvailability,
        };
      }
    } else {
      // Name + DOB didn't match anyone - new patient
      return {
        status: 'new',
        message: 'No patient found with that name and date of birth.',
        nextAction: 'register_new',
      };
    }
  }

  // Step 3: Phone not found, no name provided - ask for name
  return {
    status: 'not_found_try_name',
    message: 'I could not find that phone number in our system. Could you please tell me your full name so I can look you up?',
    nextAction: 'ask_name',
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
