import { prisma } from '../../db/client.js';
import { parseDate, parseTime, formatTimeForSpeech, formatDateForSpeech } from '../../utils/date.js';
import { bookAppointmentByDatetime, isWithinSchedule } from '../../scheduling/index.js';
import type { MRSAdapter } from '../../mrs/adapter.js';

export interface BookAppointmentParams {
  date: string; // e.g., "tomorrow", "Monday", "March 5th"
  time: string; // e.g., "10am", "2:30 PM"
  serviceType?: string; // e.g., "checkup", "follow-up" - optional, will use default
  providerName?: string; // e.g., "Dr. Smith" - optional
}

export interface BookAppointmentResult {
  success: boolean;
  appointment?: {
    date: string;
    time: string;
    provider: string;
    service: string;
  };
  message: string;
  error?: string;
}

// MRS adapter instance - can be set by the server
let mrsAdapter: MRSAdapter | null = null;

export function setMRSAdapter(adapter: MRSAdapter | null): void {
  mrsAdapter = adapter;
}

export async function bookAppointment(
  params: BookAppointmentParams,
  callId?: string
): Promise<BookAppointmentResult> {
  const { date, time, serviceType, providerName } = params;

  // Get patient from conversation
  const patientId = await getPatientFromConversation(callId);
  if (!patientId) {
    return {
      success: false,
      message: 'I need to verify your identity first. Could you please confirm your date of birth?',
      error: 'patient_not_identified',
    };
  }

  // Parse date
  const parsedDate = parseDate(date);
  if (!parsedDate) {
    return {
      success: false,
      message: 'I didn\'t understand that date. Could you say it again? For example, "tomorrow" or "next Monday".',
      error: 'invalid_date',
    };
  }

  // Parse time
  const parsedTime = parseTime(time);
  if (!parsedTime) {
    return {
      success: false,
      message: 'I didn\'t understand that time. Could you say it again? For example, "10 AM" or "2:30 PM".',
      error: 'invalid_time',
    };
  }

  // Build start and end times
  const startTime = new Date(parsedDate);
  startTime.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

  // Don't allow booking in the past
  if (startTime < new Date()) {
    return {
      success: false,
      message: 'That time has already passed. Please choose a future time.',
      error: 'time_in_past',
    };
  }

  // Find service type (default to general checkup if not specified)
  const service = await findService(serviceType);
  if (!service) {
    return {
      success: false,
      message: 'I couldn\'t find that service type. We offer general checkups, follow-up visits, and new patient consultations.',
      error: 'service_not_found',
    };
  }

  // Calculate end time based on service duration
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + service.durationMinutes);

  // Find provider - if specified by name, use that; otherwise find one available at the requested time
  const providerExplicitlyRequested = !!providerName;
  const provider = providerName
    ? await findProviderByName(providerName)
    : await findAvailableProvider(startTime, endTime);

  if (!provider) {
    return {
      success: false,
      message: providerName
        ? `I couldn't find a provider named ${providerName}. Would you like me to book with any available provider?`
        : `No providers are available at that time. Would you like me to suggest another time?`,
      error: providerName ? 'provider_not_found' : 'outside_schedule',
    };
  }

  // Attempt to book
  const result = await bookAppointmentByDatetime(mrsAdapter, {
    patientId,
    providerId: provider.id,
    serviceId: service.id,
    startTime,
    endTime,
  });

  if (!result.success) {
    // Check if provider name is known for error messages
    const providerNameLower = provider.name.toLowerCase();
    const isProviderKnown = !providerNameLower.includes('unknown') && !providerNameLower.includes('placeholder');

    // Only mention provider by name if user explicitly requested them AND name is known
    const shouldMentionProvider = providerExplicitlyRequested && isProviderKnown;

    // Map errors to user-friendly messages
    const errorMessages: Record<string, string> = {
      conflict: 'That time slot was just taken. Would you like to try a different time?',
      outside_schedule: shouldMentionProvider
        ? `${provider.name} isn't available at that time. Would you like me to check their availability?`
        : `That time isn't available. Would you like me to suggest another time?`,
      validation_error: 'There was an issue with the booking. Could you try again?',
    };

    return {
      success: false,
      message: result.error ? errorMessages[result.error] || result.message : result.message,
      error: result.error,
    };
  }

  // Store appointment reference in conversation
  if (callId && result.appointmentId) {
    await updateConversationAppointment(callId, result.appointmentId);
  }

  // Success!
  const dateStr = formatDateForSpeech(startTime);
  const timeStr = formatTimeForSpeech(startTime);

  // Check if provider name is known (not "unknown" placeholder)
  const providerNameLower = provider.name.toLowerCase();
  const isProviderKnown = !providerNameLower.includes('unknown') && !providerNameLower.includes('placeholder');

  // Build confirmation message - skip provider if unknown
  const confirmationMessage = isProviderKnown
    ? `Great! I've booked your ${service.name.toLowerCase()} with ${provider.name} for ${dateStr} at ${timeStr}. Is there anything else I can help you with?`
    : `Great! I've booked your ${service.name.toLowerCase()} for ${dateStr} at ${timeStr}. Is there anything else I can help you with?`;

  return {
    success: true,
    appointment: {
      date: dateStr,
      time: timeStr,
      provider: isProviderKnown ? provider.name : '',
      service: service.name,
    },
    message: confirmationMessage,
  };
}

async function getPatientFromConversation(callId?: string): Promise<string | null> {
  if (!callId) return null;

  const conversation = await prisma.conversation.findFirst({
    where: { externalId: callId },
    select: { patientId: true },
  });

  return conversation?.patientId ?? null;
}

async function findProviderByName(name: string): Promise<{ id: string; name: string; mrsId: string } | null> {
  // Search by name (case-insensitive, partial match)
  const normalizedName = name.toLowerCase().trim();
  const providers = await prisma.provider.findMany({
    where: {
      scheduleTemplates: { some: {} },
    },
  });

  for (const provider of providers) {
    const providerNameLower = provider.name.toLowerCase();
    if (
      providerNameLower.includes(normalizedName) ||
      normalizedName.includes(providerNameLower) ||
      providerNameLower.includes(normalizedName.replace(/^dr\.?\s*/i, ''))
    ) {
      return provider;
    }
  }

  return null;
}

async function findAvailableProvider(
  startTime: Date,
  endTime: Date
): Promise<{ id: string; name: string; mrsId: string } | null> {
  // Get all providers with schedule templates
  const providers = await prisma.provider.findMany({
    where: {
      scheduleTemplates: { some: {} },
    },
  });

  // Find the first provider who is available at the requested time
  for (const provider of providers) {
    const available = await isWithinSchedule(startTime, endTime, provider.id);
    if (available) {
      return provider;
    }
  }

  return null;
}

interface ServiceInfo {
  id: string;
  name: string;
  mrsId: string;
  durationMinutes: number;
}

async function findService(serviceType?: string): Promise<ServiceInfo | null> {
  const DEFAULT_DURATION = 30;

  // Get all services
  const services = await prisma.appointmentType.findMany();
  if (services.length === 0) {
    return null;
  }

  if (!serviceType) {
    // Return default service - prefer "General Medicine" or "General" or first available
    const generalService = services.find(s =>
      s.name.toLowerCase().includes('general') ||
      s.name.toLowerCase().includes('checkup')
    );
    const service = generalService || services[0];
    return { ...service, durationMinutes: service.durationMinutes ?? DEFAULT_DURATION };
  }

  // Search by type (flexible matching)
  const normalizedType = serviceType.toLowerCase().trim();

  // Keyword mappings - maps user terms to service name patterns
  const typeKeywords: Record<string, string[]> = {
    // User might say "checkup" or "general checkup" - match to General Medicine
    general: ['checkup', 'check-up', 'general', 'annual', 'physical', 'medicine'],
    // User might say "follow-up" - match to Outpatient
    outpatient: ['follow-up', 'followup', 'follow up', 'return', 'outpatient'],
    // User might say "rehab" or "physical therapy"
    rehabilitation: ['rehab', 'rehabilitation', 'therapy', 'pt'],
  };

  for (const service of services) {
    const serviceLower = service.name.toLowerCase();

    // Direct match - service name contains what user said
    if (serviceLower.includes(normalizedType)) {
      return { ...service, durationMinutes: service.durationMinutes ?? DEFAULT_DURATION };
    }

    // Check if what user said matches keywords for this service type
    for (const [servicePattern, keywords] of Object.entries(typeKeywords)) {
      // If service name matches the pattern (e.g., "General Medicine" contains "general")
      if (serviceLower.includes(servicePattern)) {
        // And user said one of the keywords for this service
        if (keywords.some(k => normalizedType.includes(k))) {
          return { ...service, durationMinutes: service.durationMinutes ?? DEFAULT_DURATION };
        }
      }
    }
  }

  // Fallback to first service if nothing matched
  return { ...services[0], durationMinutes: services[0].durationMinutes ?? DEFAULT_DURATION };
}

async function updateConversationAppointment(callId: string, appointmentId: string): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: callId },
  });

  if (conversation) {
    // Store in metadata or a related field
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        metadata: {
          ...(conversation.metadata as object || {}),
          lastAppointmentId: appointmentId,
        },
      },
    });
  }
}
