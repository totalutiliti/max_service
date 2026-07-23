"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Role = "cliente" | "prestador" | "parceiro" | "operacao";
type Section = "inicio" | "atividade" | "mensagens" | "conta";
type RequestStep = 1 | 2 | 3 | 4;

interface DemoSession {
  role: "customer" | "provider" | "partner" | "operation";
  name: string;
  email: string;
  expiresAt: string;
}

interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
}

interface ServiceRegion {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  neighborhoods: Array<{ id: string; slug: string; name: string }>;
}

interface RequestAttachment {
  id: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png";
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

interface PersistedRequest {
  id: string;
  publicCode: string;
  regionId: string;
  neighborhoodId: string;
  title: string;
  description: string;
  neighborhood: string;
  city: string;
  state: string;
  status: string;
  preferredWindow: string;
  categoryName: string;
  categoryIcon: string;
  proposalCount: number;
  hasActorProposal?: boolean;
  matchScore: number;
  matchReasons: string[];
  isUrgent: boolean;
  attachments: RequestAttachment[];
}

type ProviderAvailabilityStatus = "available_now" | "scheduled" | "paused";

interface ProviderMatchingData {
  profile: {
    providerId: string;
    primaryCategoryId: string;
    categoryName: string;
    categoryIcon: string;
    categoryActive: boolean;
    availabilityStatus: ProviderAvailabilityStatus;
    acceptsUrgent: boolean;
    activeProposalLimit: number;
    activeJobLimit: number;
    version: number;
    updatedAt: string;
    verificationStatus: VerificationStatus | null;
    activeRegionCount: number;
    activeProposalCount: number;
    activeJobCount: number;
    eligible: boolean;
    remainingProposalCapacity: number;
    remainingJobCapacity: number;
  };
  blockers: string[];
  regions: Array<{ id: string; name: string; state: string }>;
  history: Array<{
    id: string;
    eventType: "configured" | "updated";
    profileVersion: number;
    createdAt: string;
  }>;
}

interface ProviderScheduleData {
  settings: {
    providerId: string;
    timeZone: "America/Sao_Paulo";
    version: number;
    updatedAt: string;
  };
  weekly: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    active: boolean;
  }>;
  blocks: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string;
    status: "active" | "cancelled";
    createdAt: string;
  }>;
  appointments: Array<{
    id: string;
    requestCode: string;
    requestTitle: string;
    customerName: string;
    status: BookingStatus;
    scheduledFor: string;
    scheduledUntil: string;
  }>;
  history: Array<{
    id: string;
    eventType: "weekly_updated" | "block_created" | "block_cancelled";
    scheduleVersion: number;
    createdAt: string;
  }>;
  metrics: {
    openDayCount: number;
    activeBlockCount: number;
    upcomingAppointmentCount: number;
  };
}

interface ProposalSlotsData {
  proposal: {
    id: string;
    providerId: string;
    providerName: string;
    estimatedMinutes: number;
  };
  timeZone: "America/Sao_Paulo";
  slots: Array<{ startsAt: string; endsAt: string }>;
}

interface PersistedProposal {
  id: string;
  requestId: string;
  amountCents: number;
  estimatedMinutes: number;
  message: string;
  status: string;
  providerName: string;
  providerCode: string;
}

interface PersistedConversation {
  id: string;
  bookingId: string;
  bookingStatus: string;
  scheduledFor: string | null;
  requestCode: string;
  requestTitle: string;
  otherName: string;
  otherCode: string;
  latestMessage: string | null;
  latestMessageAt: string | null;
  unreadCount: number;
}

interface PersistedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderCode?: string;
  body: string;
  createdAt: string;
  attachment: RequestAttachment | null;
}

type BookingStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
type CancellationReason = "schedule_change" | "no_longer_needed" | "participant_unavailable" | "safety_concern" | "other";

interface BookingHistoryEvent {
  id: string;
  status: BookingStatus;
  note: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
}

interface ServiceReview {
  id: string;
  rating: number;
  comment: string;
  authorRole: "customer" | "provider";
  authorName: string;
  subjectName: string;
  createdAt: string;
}

interface PersistedBooking {
  id: string;
  status: BookingStatus;
  scheduledFor: string | null;
  scheduledUntil: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  requestId: string;
  requestCode: string;
  requestTitle: string;
  requestDescription: string;
  neighborhood: string;
  city: string;
  state: string;
  categoryName: string;
  categoryIcon: string;
  amountCents: number;
  estimatedMinutes: number;
  customerId: string;
  customerName: string;
  customerCode: string;
  providerId: string;
  providerName: string;
  providerCode: string;
  reviewCount: number;
  averageRating: string | null;
  hasActorReview: boolean;
  cancellationReason: CancellationReason | null;
  cancellationDetails: string | null;
  cancellationPriorStatus: "scheduled" | "in_progress" | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  supportCaseCode: string | null;
  supportCaseStatus: string | null;
  history?: BookingHistoryEvent[];
  reviews?: ServiceReview[];
}

interface SupportCase {
  id: string;
  publicCode: string;
  caseType: "cancellation";
  priority: "normal" | "high";
  status: "open" | "in_review" | "resolved";
  title: string;
  description: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  requestCode: string;
  requestTitle: string;
  reasonCode: CancellationReason;
  priorStatus: "scheduled" | "in_progress";
  openedByName: string;
  openedByRole: "customer" | "provider";
  assignedToName: string | null;
  eventCount: number;
}

interface SupportCaseEvent {
  id: string;
  eventType: "opened" | "note" | "status_changed";
  fromStatus: SupportCase["status"] | null;
  toStatus: SupportCase["status"] | null;
  note: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
}

interface SupportCaseDetail extends SupportCase {
  events: SupportCaseEvent[];
}

type PartnerSupportTopic = "referral" | "account" | "finance_sandbox" | "other";
type PartnerSupportStatus = "open" | "in_review" | "resolved";
type PartnerSupportSlaState = "pending" | "met" | "breached";

interface PartnerSupportCase {
  id: string;
  publicCode: string;
  topic: PartnerSupportTopic;
  priority: "normal" | "high";
  status: PartnerSupportStatus;
  subject: string;
  resolution: string | null;
  slaPolicyVersion: string;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstRespondedAt: string | null;
  firstResponseSla: PartnerSupportSlaState;
  resolutionSla: PartnerSupportSlaState;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  partnerName: string;
  partnerCode: string;
  assignedToId: string | null;
  assignedToName: string | null;
  referralId: string | null;
  referralCode: string | null;
  referralName: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  latestEventBody: string | null;
  latestEventType: "message" | "status_changed" | "triage_changed" | null;
  latestEventAt: string | null;
  latestActorName: string | null;
  latestActorRole: "partner" | "operation" | null;
  eventCount: number;
}

interface PartnerSupportEvent {
  id: string;
  eventType: "message" | "status_changed" | "triage_changed";
  fromStatus: PartnerSupportStatus | null;
  toStatus: PartnerSupportStatus | null;
  body: string;
  createdAt: string;
  actorName: string;
  actorRole: "partner" | "operation";
  attachment: {
    id: string;
    fileName: string;
    contentType: "application/pdf" | "image/jpeg" | "image/png";
    sizeBytes: number;
    sha256: string;
    createdAt: string;
  } | null;
}

interface PartnerSupportCaseDetail extends PartnerSupportCase {
  events: PartnerSupportEvent[];
}

interface PartnerSupportReferral {
  id: string;
  publicCode: string;
  professionalName: string;
  status: PartnerReferral["status"];
  categoryName: string;
  categoryIcon: string;
}

interface PartnerSupportData {
  cases: PartnerSupportCase[];
  metrics: {
    totalCount: number;
    openCount: number;
    inReviewCount: number;
    resolvedCount: number;
    waitingOperationCount: number;
    unassignedCount: number;
    slaBreachedCount: number;
  };
  referrals: PartnerSupportReferral[];
  operators: Array<{ id: string; publicCode: string; displayName: string }>;
}

interface UserNotification {
  id: string;
  type: "system" | "proposal_received" | "proposal_accepted" | "message_received" | "booking_started" | "booking_completed" | "booking_cancelled" | "review_received" | "case_opened" | "case_updated" | "referral_reviewed" | "support_message";
  category: "marketplace" | "messages" | "support" | "system";
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
}

interface NotificationPreferencesRecord {
  marketplacePush: boolean;
  messagesPush: boolean;
  supportPush: boolean;
  systemPush: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timeZone: string;
  version: number;
  updatedAt: string;
}

interface NotificationPreferencesData {
  preferences: NotificationPreferencesRecord;
  history: Array<{ id: string; version: number; createdAt: string }>;
  timeZones: Array<{ value: string; label: string }>;
  channels: {
    inApp: { available: boolean; enabled: boolean };
    push: { available: boolean; enabled: boolean; subscriptionCount: number };
    email: { available: boolean; enabled: boolean };
    sms: { available: boolean; enabled: boolean };
  };
  changed?: boolean;
  suppressedDeliveries?: number;
}

interface PartnerReferral {
  id: string;
  publicCode: string;
  professionalName: string;
  email: string;
  status: "invited" | "in_review" | "approved" | "active" | "rejected";
  source: "link" | "qr" | "manual";
  createdAt: string;
  activatedAt: string | null;
  categoryName: string;
  categoryIcon: string;
  providerCode: string | null;
}

interface OperationReferral extends PartnerReferral {
  consentAt: string | null;
  privacyNoticeVersion: string | null;
  partnerName: string;
  partnerCode: string;
  reviewedByName: string | null;
  latestReviewNote: string | null;
  latestReviewAt: string | null;
  eventCount: number;
}

interface OperationReferralEvent {
  id: string;
  eventType: "review_started" | "approved" | "rejected";
  fromStatus: "invited" | "in_review";
  toStatus: "in_review" | "approved" | "rejected";
  note: string;
  createdAt: string;
  actorName: string;
}

interface OperationReferralDetail extends OperationReferral {
  events: OperationReferralEvent[];
}

type OperationActivityCategory = "marketplace" | "service" | "operation" | "growth" | "finance";

interface OperationActivityEvent {
  id: string;
  action: string;
  category: OperationActivityCategory;
  title: string;
  detail: string;
  reference: string;
  entityType: string;
  actorRole: "customer" | "provider" | "partner" | "operation";
  actorName: string;
  createdAt: string;
}

interface OperationActivityData {
  metrics: {
    totalCount: number;
    lastThirtyDaysCount: number;
    criticalCount: number;
    actorCount: number;
  };
  events: OperationActivityEvent[];
}

type ReportPeriodDays = 7 | 30 | 90;

interface OperationReportData {
  period: { days: ReportPeriodDays; from: string; to: string; bucket: "day" | "week" };
  funnel: {
    requestCount: number;
    proposedRequestCount: number;
    bookingCount: number;
    completedCount: number;
    cancelledCount: number;
    proposalCount: number;
    averageFirstProposalMinutes: number;
    proposalCoverageRate: number;
    bookingConversionRate: number;
    completionRate: number;
    averageProposalsPerRequest: number;
  };
  financial: {
    intentCount: number;
    listAmountCents: number;
    discountAmountCents: number;
    netVolumeCents: number;
    settledAmountCents: number;
    refundedAmountCents: number;
    platformFeeCents: number;
    expectedLedgerCents: number;
    ledgerNetCents: number;
    unreconciledCount: number;
    staleAuthorizedCount: number;
    generatedAt: string;
    discountRate: number;
    reconciliationDifferenceCents: number;
    reconciled: boolean;
  };
  growth: {
    referralCount: number;
    approvedReferralCount: number;
    activatedReferralCount: number;
    campaignRedemptionCount: number;
    campaignDiscountCents: number;
    referralApprovalRate: number;
  };
  operations: {
    cancellationCaseCount: number;
    cancellationResolvedCount: number;
    partnerCaseCount: number;
    partnerResolvedCount: number;
    overduePartnerCaseCount: number;
    verificationSubmittedCount: number;
    verificationApprovedCount: number;
    verificationPendingCount: number;
  };
  goals: {
    periodDays: ReportPeriodDays;
    proposalCoverageTarget: number;
    bookingConversionTarget: number;
    firstProposalTargetMinutes: number;
    overdueCaseLimit: number;
    unreconciledLimit: number;
    version: number;
    updatedAt: string;
  };
  alerts: Array<{
    id: string;
    severity: "warning" | "critical";
    title: string;
    detail: string;
  }>;
  comparison: {
    period: { from: string; to: string };
    previous: {
      requestCount: number;
      proposedRequestCount: number;
      bookingCount: number;
      completedCount: number;
      averageFirstProposalMinutes: number;
      netVolumeCents: number;
      proposalCoverageRate: number;
      bookingConversionRate: number;
    };
    changes: {
      requestCountPercent: number | null;
      proposalCoveragePoints: number;
      bookingConversionPoints: number;
      firstProposalMinutesPercent: number | null;
      netVolumePercent: number | null;
    };
  };
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    icon: string;
    requestCount: number;
    proposedRequestCount: number;
    bookingCount: number;
    completedCount: number;
    averageProposalCents: number;
    netVolumeCents: number;
    proposalCoverageRate: number;
    bookingConversionRate: number;
  }>;
  timeline: Array<{
    bucketStart: string;
    requestCount: number;
    bookingCount: number;
    netVolumeCents: number;
  }>;
}

interface OnboardingData {
  status: "pending" | "completed";
  profile: {
    profileType: "customer" | "provider";
    regionId: string;
    neighborhoodId: string | null;
    city: string;
    state: string;
    neighborhood: string | null;
    serviceCategoryId: string | null;
    serviceCategoryName: string | null;
    serviceCategoryIcon: string | null;
    yearsExperience: number | null;
    serviceRadiusKm: number | null;
    bio: string | null;
    availabilitySummary: string | null;
    version: number;
    completedAt: string;
    updatedAt: string;
  } | null;
  documents: Array<{
    id: string;
    documentType: "terms_of_use" | "privacy_notice" | "provider_code";
    version: string;
    title: string;
    summary: string;
    content: string;
    contentSha256: string;
    approvalStatus: "draft" | "approved";
    effectiveAt: string;
    acceptedAt: string | null;
  }>;
  consents: {
    marketingCommunications: boolean;
    productResearch: boolean;
  };
  categories: Array<{ id: string; name: string; icon: string }>;
  regions: Array<ServiceRegion & { selected: boolean }>;
  matchingProfile: {
    availabilityStatus: ProviderAvailabilityStatus;
    acceptsUrgent: boolean;
    activeProposalLimit: number;
    activeJobLimit: number;
    version: number;
  } | null;
  history: Array<{
    id: string;
    eventType: "completed" | "updated";
    profileVersion: number;
    createdAt: string;
  }>;
}

type CatalogAction = "activate" | "deactivate" | "move_up" | "move_down";

interface OperationCatalogCategory extends ServiceCategory {
  sortOrder: number;
  active: boolean;
  updatedAt: string;
  requestCount: number;
  openRequestCount: number;
  referralCount: number;
  eventCount: number;
  latestEventType: "activated" | "deactivated" | "reordered" | null;
  latestEventNote: string | null;
  latestEventAt: string | null;
  latestActorName: string | null;
}

interface OperationCatalogData {
  metrics: { totalCount: number; activeCount: number; inactiveCount: number };
  categories: OperationCatalogCategory[];
}

type RegionAction = "activate" | "deactivate";

interface OperationRegionNeighborhood {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sortOrder: number;
  version: number;
  updatedAt: string;
  requestCount: number;
}

interface OperationRegion {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  active: boolean;
  sortOrder: number;
  version: number;
  updatedAt: string;
  requestCount: number;
  openRequestCount: number;
  providerCount: number;
  activeNeighborhoodCount: number;
  latestEventType: string | null;
  latestEventNote: string | null;
  latestEventAt: string | null;
  latestActorName: string | null;
  neighborhoods: OperationRegionNeighborhood[];
}

interface OperationRegionData {
  metrics: {
    totalCount: number;
    activeCount: number;
    plannedCount: number;
    activeNeighborhoodCount: number;
  };
  regions: OperationRegion[];
}

interface OperationMatchingProvider {
  providerId: string;
  providerCode: string;
  providerName: string;
  primaryCategoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryActive: boolean | null;
  availabilityStatus: ProviderAvailabilityStatus | null;
  acceptsUrgent: boolean | null;
  activeProposalLimit: number | null;
  activeJobLimit: number | null;
  version: number | null;
  updatedAt: string | null;
  verificationStatus: VerificationStatus | null;
  activeRegionCount: number;
  activeProposalCount: number;
  activeJobCount: number;
  blockers: Array<{ code: string; label: string }>;
  eligible: boolean;
}

interface OperationMatchingData {
  metrics: {
    providerCount: number;
    eligibleCount: number;
    verificationBlockedCount: number;
    coverageBlockedCount: number;
    capacityBlockedCount: number;
  };
  providers: OperationMatchingProvider[];
}

type CampaignDiscountType = "fixed" | "percentage";
type CampaignAction = "activate" | "pause";

interface CampaignOffer {
  name: string;
  code: string;
  description: string;
  discountType: CampaignDiscountType;
  discountValue: number;
  maxDiscountCents: number | null;
  minAmountCents: number;
  endsAt: string;
}

interface MarketingCampaign extends CampaignOffer {
  id: string;
  totalRedemptionLimit: number;
  perCustomerLimit: number;
  startsAt: string;
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  usedCount: number;
  redeemedCount: number;
  discountGrantedCents: number;
  eventCount: number;
  latestEventNote: string | null;
  latestEventAt: string | null;
  latestActorName: string | null;
}

interface CampaignData {
  metrics: {
    totalCount: number;
    liveCount: number;
    scheduledCount: number;
    inactiveCount: number;
    redeemedCount: number;
    discountGrantedCents: number;
  };
  campaigns: MarketingCampaign[];
}

interface PartnerDashboardData {
  link: { id: string; referralCode: string; slug: string; status: "active" | "paused"; createdAt: string };
  metrics: { totalCount: number; activeCount: number; pendingCount: number; activationRate: number };
  referrals: PartnerReferral[];
  categories: ServiceCategory[];
}

type VerificationStatus = "submitted" | "in_review" | "changes_requested" | "approved";
type VerificationDocumentStatus = "pending" | "accepted" | "changes_requested";

interface VerificationDocument {
  id: string;
  documentType: "identity" | "address" | "professional_qualification" | "profile_photo";
  label: string;
  status: VerificationDocumentStatus;
  note: string | null;
  checkedAt: string | null;
  updatedAt: string;
  checkedByName: string | null;
  fileId: string | null;
  fileName: string | null;
  fileContentType: string | null;
  fileSizeBytes: number | null;
  fileSha256: string | null;
  fileScanStatus: "not_scanned" | null;
  fileUploadedAt: string | null;
  fileVersionCount: number;
}

interface VerificationEvent {
  id: string;
  eventType: "submitted" | "review_started" | "document_uploaded" | "document_reviewed" | "approved" | "changes_requested";
  fromStatus: VerificationStatus | null;
  toStatus: VerificationStatus | null;
  note: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
}

interface ProviderVerification {
  id: string;
  publicCode: string;
  providerId: string;
  providerName: string;
  providerCode: string;
  status: VerificationStatus;
  reviewPriority: "standard" | "attention";
  policyVersion: string;
  submittedAt: string;
  decisionReason: string | null;
  decidedAt: string | null;
  updatedAt: string;
  assignedToName: string | null;
  documentCount: number;
  acceptedDocumentCount: number;
  attentionDocumentCount: number;
  documents?: VerificationDocument[];
  events?: VerificationEvent[];
}

type SandboxPaymentStatus = "sandbox_authorized" | "sandbox_settled" | "sandbox_refunded";

interface FinanceRecord {
  id: string;
  publicCode: string;
  bookingId: string;
  requestPublicCode: string;
  serviceTitle: string;
  listAmountCents: number;
  discountAmountCents: number;
  campaignName: string | null;
  couponCode: string | null;
  grossAmountCents: number;
  status: SandboxPaymentStatus;
  actorAmountCents: number;
  recognizedAmountCents: number;
  reversedAmountCents: number;
  bookingStatus: BookingStatus | null;
  createdAt: string;
  settledAt: string | null;
  refundedAt: string | null;
  reconciledAt: string | null;
}

interface FinanceDashboardData {
  rule: {
    version: string;
    currency: "BRL";
    platformFeeBps: number;
    partnerCommissionBps: number;
    customerCashbackBps: number;
    effectiveFrom: string;
  };
  summary: {
    recordCount: number;
    grossAmountCents: number;
    discountAmountCents: number;
    pendingAmountCents: number;
    recognizedAmountCents: number;
    reversedAmountCents: number;
  };
  reconciliation: null | {
    expectedLedgerCents: number;
    ledgerNetCents: number;
    unreconciledCount: number;
    differenceCents: number;
    matched: boolean;
  };
  records: FinanceRecord[];
}

const demoUiActorIds = {
  cliente: "00000000-0000-4000-8000-000000000101",
  prestador: "00000000-0000-4000-8000-000000000201",
} as const;

const roleDetails: Record<Role, { label: string; short: string; name: string; email: string; description: string }> = {
  cliente: {
    label: "Cliente",
    short: "CL",
    name: "Marina Alves",
    email: "marina@demo.maxservice",
    description: "Pedir um serviço, comparar propostas e acompanhar a execução.",
  },
  prestador: {
    label: "Profissional",
    short: "PR",
    name: "Rafael Santos",
    email: "rafael@demo.maxservice",
    description: "Receber oportunidades, enviar propostas e organizar a agenda.",
  },
  parceiro: {
    label: "Parceiro",
    short: "PC",
    name: "João Martins",
    email: "joao@demo.maxservice",
    description: "Indicar profissionais e acompanhar a rede e as comissões.",
  },
  operacao: {
    label: "Administração",
    short: "AD",
    name: "Equipe Max",
    email: "operacao@demo.maxservice",
    description: "Moderar cadastros, atender ocorrências e acompanhar o negócio.",
  },
};

const sectionLabels: Record<Role, Record<Section, string>> = {
  cliente: { inicio: "Início", atividade: "Meus pedidos", mensagens: "Mensagens", conta: "Conta e plano" },
  prestador: { inicio: "Visão geral", atividade: "Oportunidades", mensagens: "Mensagens", conta: "Conta e plano" },
  parceiro: { inicio: "Visão geral", atividade: "Minha rede", mensagens: "Mensagens", conta: "Conta e repasses" },
  operacao: { inicio: "Visão geral", atividade: "Fila operacional", mensagens: "Atendimentos", conta: "Configurações" },
};

export function DemoExperience() {
  const [signedIn, setSignedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [role, setRole] = useState<Role>("cliente");
  const [section, setSection] = useState<Section>("inicio");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ session?: DemoSession }>;
      })
      .then((payload) => {
        if (payload?.session) {
          setRole(uiRole(payload.session.role));
          setSignedIn(true);
        }
      })
      .catch(() => undefined)
      .finally(() => setCheckingSession(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createSession = async (nextRole: Role) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/v1/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = await response.json() as { session?: DemoSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "Não foi possível iniciar a sessão.");
      setRole(uiRole(payload.session.role));
      setSignedIn(true);
      setSection("inicio");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível iniciar a sessão.");
    } finally {
      setAuthBusy(false);
    }
  };

  const changeRole = async (nextRole: Role) => {
    if (nextRole === role) return;
    setAuthBusy(true);
    try {
      const response = await fetch("/api/v1/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = await response.json() as { session?: DemoSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "Não foi possível trocar o perfil.");
      const authenticatedRole = uiRole(payload.session.role);
      setRole(authenticatedRole);
      setSection("inicio");
      setToast(`Sessão alterada para ${roleDetails[authenticatedRole].label}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível trocar o perfil.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthBusy(true);
    try {
      await fetch("/api/v1/auth/session", { method: "DELETE" });
    } finally {
      setSignedIn(false);
      setSection("inicio");
      setAuthBusy(false);
    }
  };

  if (checkingSession) return <main className="session-loading"><Image src="/max-service-mark.png" alt="" width={76} height={76} priority /><strong>Preparando seu espaço Max Service…</strong></main>;
  if (!signedIn) return <AccessScreen role={role} setRole={setRole} onEnter={() => createSession(role)} busy={authBusy} error={authError} />;

  return (
    <Shell
      role={role}
      section={section}
      setSection={setSection}
      changeRole={changeRole}
      onSignOut={signOut}
      authBusy={authBusy}
    >
      {section === "inicio" && role === "cliente" && <CustomerView notify={setToast} />}
      {section === "inicio" && role === "prestador" && <ProviderView notify={setToast} />}
      {section === "inicio" && role === "parceiro" && <PartnerView notify={setToast} />}
      {section === "inicio" && role === "operacao" && <OperationsView notify={setToast} />}
      {section === "atividade" && <ActivityView role={role} notify={setToast} />}
      {section === "mensagens" && <MessagesView role={role} notify={setToast} />}
      {section === "conta" && <AccountView role={role} notify={setToast} />}
      <MobileNav role={role} section={section} setSection={setSection} />
      {toast && <div className="app-toast" role="status"><span>✓</span>{toast}</div>}
    </Shell>
  );
}

function uiRole(role: DemoSession["role"]): Role {
  if (role === "customer") return "cliente";
  if (role === "provider") return "prestador";
  if (role === "partner") return "parceiro";
  return "operacao";
}

function AccessScreen({ role, setRole, onEnter, busy, error }: { role: Role; setRole: (role: Role) => void; onEnter: () => void; busy: boolean; error: string }) {
  const selected = roleDetails[role];
  return (
    <main className="access-page">
      <section className="access-brand-panel">
        <Link className="brand-lockup" href="/" aria-label="Max Service - início">
          <Image src="/max-service-mark.png" alt="" width={58} height={58} priority />
          <span><strong>MAX</strong> SERVICE</span>
        </Link>
        <div className="access-brand-copy">
          <p className="eyebrow"><span /> PLATAFORMA MAX SERVICE</p>
          <h1>O trabalho acontece.<br/><em>A Max organiza.</em></h1>
          <p>Um ambiente para clientes, profissionais, parceiros e operação conduzirem cada serviço do pedido à conclusão.</p>
        </div>
        <div className="access-proof">
          <span>✓</span><p><strong>Ambiente demonstrativo seguro</strong><small>Dados fictícios e nenhuma cobrança real.</small></p>
        </div>
      </section>

      <section className="access-form-panel" aria-labelledby="access-title">
        <div className="access-form-wrap">
          <p className="access-step">ACESSO À DEMONSTRAÇÃO</p>
          <h2 id="access-title">Escolha como deseja entrar.</h2>
          <p className="access-intro">Você poderá trocar de perfil a qualquer momento dentro da plataforma.</p>
          <div className="access-role-grid" role="radiogroup" aria-label="Perfil de acesso">
            {(Object.keys(roleDetails) as Role[]).map((item) => (
              <button
                key={item}
                className={role === item ? "selected" : ""}
                onClick={() => setRole(item)}
                role="radio"
                aria-checked={role === item}
              >
                <span className="access-role-icon">{roleDetails[item].short}</span>
                <span><strong>{roleDetails[item].label}</strong><small>{roleDetails[item].description}</small></span>
                <i aria-hidden="true">✓</i>
              </button>
            ))}
          </div>
          <div className="demo-credentials">
            <div><small>E-MAIL DEMONSTRATIVO</small><strong>{selected.email}</strong></div>
            <span>Sessão local protegida e temporária</span>
          </div>
          {error && <p className="access-error" role="alert">{error}</p>}
          <button className="button access-submit" onClick={onEnter} disabled={busy}>{busy ? "Criando sessão…" : `Entrar como ${selected.label}`} <span aria-hidden="true">→</span></button>
          <p className="access-disclaimer">Ao continuar, o servidor cria uma sessão demonstrativa revogável. Os dados são fictícios e não existe cobrança real.</p>
          <Link className="access-back" href="/">← Voltar para o site</Link>
        </div>
      </section>
    </main>
  );
}

function Shell({ role, section, setSection, changeRole, onSignOut, authBusy, children }: {
  role: Role;
  section: Section;
  setSection: (section: Section) => void;
  changeRole: (role: Role) => Promise<void>;
  onSignOut: () => Promise<void>;
  authBusy: boolean;
  children: React.ReactNode;
}) {
  const user = roleDetails[role];
  return (
    <main className="demo-shell">
      <a className="skip-link" href="#painel">Pular para o painel</a>
      <aside className="demo-sidebar">
        <Link className="brand-lockup compact" href="/" aria-label="Voltar ao início da Max Service">
          <Image src="/max-service-mark.png" alt="" width={48} height={48} priority />
          <span><strong>MAX</strong> SERVICE</span>
        </Link>
        <div className="workspace-chip"><span>{user.short}</span><div><small>ESPAÇO DE TRABALHO</small><strong>{user.label}</strong></div></div>
        <nav className="app-nav" aria-label="Navegação da plataforma">
          {(Object.keys(sectionLabels[role]) as Section[]).map((item, index) => (
            <button key={item} onClick={() => setSection(item)} className={section === item ? "active" : ""} aria-current={section === item ? "page" : undefined}>
              <span aria-hidden="true">{["⌂", "▤", "◉", "⚙"][index]}</span>{sectionLabels[role][item]}
              {item === "mensagens" && (role === "cliente" || role === "prestador") && <UnreadMessageBadge role={role} />}
            </button>
          ))}
        </nav>
        <div className="demo-profile-switcher">
          <small>PERFIL DA DEMONSTRAÇÃO</small>
          <select value={role} disabled={authBusy} onChange={(event) => void changeRole(event.target.value as Role)} aria-label="Trocar perfil da demonstração">
            {(Object.keys(roleDetails) as Role[]).map((item) => <option key={item} value={item}>{roleDetails[item].label}</option>)}
          </select>
          <p>Dados fictícios · sem pagamento real</p>
        </div>
        <button className="signout-button" disabled={authBusy} onClick={() => void onSignOut()}>← Encerrar sessão</button>
      </aside>
      <div className="demo-main" id="painel">{children}</div>
    </main>
  );
}

function UnreadMessageBadge({ role }: { role: "cliente" | "prestador" }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let syncing = false;
    let active = true;
    const syncUnread = async () => {
      if (syncing || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        const response = await fetch(`/api/v1/messaging?role=${role}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { conversations?: PersistedConversation[] };
        if (!response.ok || !payload.conversations) return;
        if (active) setUnreadCount(payload.conversations.reduce((total, conversation) => total + conversation.unreadCount, 0));
      } catch {
        // Preserva a última contagem válida durante indisponibilidade transitória.
      } finally {
        syncing = false;
      }
    };
    const initialSync = window.setTimeout(() => void syncUnread(), 0);
    const timer = window.setInterval(() => void syncUnread(), 15_000);
    const syncWhenVisible = () => void syncUnread();
    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("max-service:messages-read", syncWhenVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(initialSync);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("max-service:messages-read", syncWhenVisible);
    };
  }, [role]);

  if (unreadCount === 0) return null;
  const label = `${unreadCount} mensagem${unreadCount === 1 ? "" : "s"} não lida${unreadCount === 1 ? "" : "s"}`;
  return <i aria-label={label}>{unreadCount > 99 ? "99+" : unreadCount}</i>;
}

function DashboardHeader({ role, eyebrow, title, children }: { role: Role; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="dashboard-header">
      <div><p>{eyebrow}</p><h1>{title}</h1></div>
      <div className="dashboard-actions">{children}<NotificationCenter key={role} role={role} /><div className="mini-avatar">{roleDetails[role].short}</div></div>
    </header>
  );
}

const notificationIcon: Record<UserNotification["type"], string> = {
  system: "M",
  proposal_received: "✦",
  proposal_accepted: "✓",
  message_received: "◉",
  booking_started: "→",
  booking_completed: "✓",
  booking_cancelled: "!",
  review_received: "★",
  case_opened: "!",
  case_updated: "CS",
  referral_reviewed: "RF",
  support_message: "AT",
};

type PushChannelState = "checking" | "unavailable" | "blocked" | "inactive" | "active" | "working" | "error";

interface PushConfigurationResponse {
  available?: boolean;
  publicKey?: string | null;
  error?: string;
  message?: string;
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0)).buffer;
}

function NotificationCenter({ role }: { role: Role }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [pushState, setPushState] = useState<PushChannelState>("checking");
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState("");

  const syncPushState = useCallback(async () => {
    setPushMessage("");
    if (
      !window.isSecureContext
      || !("serviceWorker" in navigator)
      || !("PushManager" in window)
      || !("Notification" in window)
    ) {
      setPushState("unavailable");
      return;
    }
    setPushState("checking");
    try {
      const configResponse = await fetch(
        `/api/v1/notifications?role=${encodeURIComponent(role)}&channel=push`,
        { cache: "no-store" },
      );
      const config = await configResponse.json() as PushConfigurationResponse;
      if (!configResponse.ok) throw new Error(config.error ?? config.message ?? "Não foi possível consultar o canal push.");
      if (!config.available || !config.publicKey) {
        setPushState("unavailable");
        return;
      }
      setPushPublicKey(config.publicKey);
      if (Notification.permission === "denied") {
        setPushState("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushState("inactive");
        return;
      }
      const statusResponse = await fetch("/api/v1/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, action: "status-push", endpoint: subscription.endpoint }),
      });
      const status = await statusResponse.json() as { enabled?: boolean; error?: string; message?: string };
      if (!statusResponse.ok) throw new Error(status.error ?? status.message ?? "Não foi possível confirmar este aparelho.");
      setPushState(status.enabled ? "active" : "inactive");
    } catch (error) {
      setPushState("error");
      setPushMessage(error instanceof Error ? error.message : "Não foi possível consultar os avisos deste aparelho.");
    }
  }, [role]);

  useEffect(() => {
    const controller = new AbortController();
    let syncing = false;
    let active = true;
    const syncNotifications = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const response = await fetch(`/api/v1/notifications?role=${encodeURIComponent(role)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { notifications?: UserNotification[]; unreadCount?: number };
        if (!response.ok || !payload.notifications) throw new Error("Não foi possível carregar as notificações.");
        if (!active) return;
        setNotifications(payload.notifications);
        setUnreadCount(payload.unreadCount ?? 0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Mantém a última leitura válida durante uma indisponibilidade transitória.
        }
      } finally {
        syncing = false;
        if (active) setLoading(false);
      }
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncNotifications();
    };
    const initialSync = window.setTimeout(syncWhenVisible, 0);
    const timer = window.setInterval(syncWhenVisible, 15_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(initialSync);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [refresh, role]);

  const updateRead = async (action: "read" | "read-all", notificationId?: string) => {
    const response = await fetch("/api/v1/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, action, notificationId }),
    });
    if (!response.ok) return;
    setRefresh((value) => value + 1);
  };

  const enablePush = async () => {
    if (!pushPublicKey || !("Notification" in window)) return;
    setPushState("working");
    setPushMessage("");
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(pushPublicKey),
        });
      const response = await fetch("/api/v1/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, action: "subscribe-push", subscription: subscription.toJSON() }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível ativar os avisos.");
      setPushState("active");
      await registration.showNotification("Avisos ativados", {
        body: "Este aparelho já pode receber novidades da Max Service.",
        tag: "max-service-push-enabled",
        icon: "/max-service-mark-192.png",
        badge: "/max-service-mark-192.png",
      });
    } catch (error) {
      setPushState("error");
      setPushMessage(error instanceof Error ? error.message : "Não foi possível ativar os avisos.");
    }
  };

  const disablePush = async () => {
    setPushState("working");
    setPushMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/v1/notifications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role, action: "unsubscribe-push", endpoint: subscription.endpoint }),
        });
        const payload = await response.json() as { error?: string; message?: string };
        if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível desativar os avisos.");
        await subscription.unsubscribe();
      }
      setPushState("inactive");
    } catch (error) {
      setPushState("error");
      setPushMessage(error instanceof Error ? error.message : "Não foi possível desativar os avisos.");
    }
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const toggleNotifications = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void syncPushState();
  };
  const pushCopy = pushState === "active"
    ? "Ativo neste aparelho. Você receberá atualizações mesmo fora da plataforma."
    : pushState === "blocked"
      ? "A permissão está bloqueada no navegador. Libere-a nas configurações do site."
      : pushState === "unavailable"
        ? "Este navegador ou ambiente ainda não oferece avisos em segundo plano."
        : "Receba propostas, mensagens e mudanças de atendimento fora da plataforma.";
  return (
    <div className="notification-center">
      <button
        className={`notification-button ${unreadCount > 0 ? "has-unread" : ""}`}
        onClick={toggleNotifications}
        aria-label={`Notificações, ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`}
        aria-expanded={open}
      >
        {unreadCount > 0 ? unreadCount > 9 ? "9+" : unreadCount : "✓"}
      </button>
      {open && (
        <section className="notifications-panel" role="dialog" aria-label="Central de notificações">
          <header>
            <div><small>CENTRAL MAX</small><h2>Notificações</h2></div>
            <button onClick={() => setOpen(false)} aria-label="Fechar notificações">×</button>
          </header>
          <div className="notifications-toolbar">
            <span>{unreadCount} não lida{unreadCount === 1 ? "" : "s"}</span>
            {unreadCount > 0 && <button onClick={() => updateRead("read-all")}>Marcar todas como lidas</button>}
          </div>
          <div className={`push-channel push-${pushState}`}>
            <div>
              <strong>Avisos neste aparelho</strong>
              <span>{pushState === "checking" ? "Verificando disponibilidade..." : pushCopy}</span>
              {pushState !== "active" && pushState !== "checking" && (
                <small>O conteúdo pode aparecer na tela bloqueada.</small>
              )}
              {pushState === "active" && <small>Assuntos e horário de silêncio ficam em Conta.</small>}
              {pushMessage && <small role="alert">{pushMessage}</small>}
            </div>
            {pushState === "active" && <button onClick={disablePush}>Desativar</button>}
            {(pushState === "inactive" || pushState === "error") && (
              <button onClick={enablePush} disabled={!pushPublicKey}>Ativar avisos</button>
            )}
            {pushState === "working" && <button disabled>Salvando...</button>}
          </div>
          <div className="notifications-list">
            {loading && <div className="data-state">Carregando avisos...</div>}
            {!loading && notifications.length === 0 && (
              <div className="data-state">
                <strong>Tudo tranquilo por aqui.</strong>
                <span>Novos avisos aparecerão nesta central.</span>
              </div>
            )}
            {notifications.map((item) => (
              <button
                key={item.id}
                className={item.readAt ? "read" : "unread"}
                onClick={() => !item.readAt && updateRead("read", item.id)}
              >
                <i>{notificationIcon[item.type]}</i>
                <span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <small>{formatDate(item.createdAt)}{item.actorName ? ` · ${item.actorName}` : ""}</small>
                </span>
                {!item.readAt && <em aria-label="Não lida" />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function useServiceCategories(notify: (message: string) => void) {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/categories", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { categories?: ServiceCategory[]; error?: string; message?: string };
        if (!response.ok || !payload.categories) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar o catálogo.");
        }
        return payload.categories;
      })
      .then(setCategories)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar o catálogo.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify]);
  return { categories, loading };
}

function useServiceRegions(notify: (message: string) => void) {
  const [regions, setRegions] = useState<ServiceRegion[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/regions", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { regions?: ServiceRegion[]; error?: string; message?: string };
        if (!response.ok || !payload.regions) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar as regiões do piloto.");
        }
        return payload.regions;
      })
      .then(setRegions)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar as regiões do piloto.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify]);
  return { regions, loading };
}

function CustomerView({ notify }: { notify: (message: string) => void }) {
  const { categories, loading: categoriesLoading } = useServiceCategories(notify);
  const { regions, loading: regionsLoading } = useServiceRegions(notify);
  const [requestOpen, setRequestOpen] = useState(false);
  const [initialCategorySlug, setInitialCategorySlug] = useState("");
  const openRequest = (categorySlug?: string) => {
    if (categories.length === 0 || regions.length === 0) {
      notify(categoriesLoading || regionsLoading ? "Catálogo e regiões ainda estão carregando." : "Não há cobertura disponível para um novo pedido.");
      return;
    }
    setInitialCategorySlug(categorySlug ?? categories[0].slug);
    setRequestOpen(true);
  };
  return (
    <>
      <DashboardHeader role="cliente" eyebrow="Quarta-feira, 22 de julho" title="Olá, Marina. O que vamos resolver?">
        <button className="location-chip" onClick={() => notify(`${regions.length} região(ões) ativa(s) no piloto.`)}>⌖ {regions[0] ? `${regions[0].city}, ${regions[0].state}` : "Carregando cobertura"}</button>
      </DashboardHeader>
      <section className="dashboard-hero">
        <div><span className="small-label">NOVO PEDIDO</span><h2>Precisa de ajuda em casa?</h2><p>Conte o que precisa e receba propostas de profissionais disponíveis na sua região.</p><button className="button" onClick={() => openRequest()}>Pedir um serviço →</button></div>
        <div className="dashboard-hero-mark" aria-hidden="true"><Image src="/max-service-mark.png" alt="" width={220} height={220} /></div>
      </section>
      <section className="dashboard-section dashboard-spaced">
        <div className="dashboard-section-title"><div><small>ACESSO RÁPIDO</small><h2>Serviços mais procurados</h2></div><button onClick={() => openRequest()}>Ver todos →</button></div>
        <div className="quick-categories">
          {categoriesLoading && <div className="data-state">Carregando catálogo...</div>}
          {!categoriesLoading && categories.map((category) => <button key={category.id} onClick={() => openRequest(category.slug)}><span>{category.icon}</span><strong>{category.name}</strong></button>)}
        </div>
      </section>
      <div className="dashboard-columns">
        <section className="dashboard-section activity-card">
          <div className="dashboard-section-title"><div><small>EM ANDAMENTO</small><h2>Troca de chuveiro</h2></div><span className="status-pill success">✓ Agendado</span></div>
          <div className="activity-provider"><div className="avatar avatar-one">RS</div><div><strong>Rafael Santos</strong><span>Eletricista · ★ 4,9</span></div><div><small>Amanhã</small><strong>09:30</strong></div></div>
          <div className="timeline-mini"><span className="done" /><span className="done" /><span className="current" /><span /></div>
          <div className="timeline-labels"><span>Pedido</span><span>Proposta</span><span>Agendado</span><span>Concluído</span></div>
          <div className="card-actions"><button className="secondary-action" onClick={() => notify("Detalhes do serviço carregados.")}>Ver detalhes</button><button className="primary-action" onClick={() => notify("Conversa com Rafael aberta.")}>Abrir conversa</button></div>
        </section>
        <section className="dashboard-section help-card">
          <span className="help-icon">?</span><div><small>PRECISA DE AJUDA?</small><h2>A gente está por perto.</h2><p>Tire dúvidas sobre pedidos, propostas ou segurança.</p></div><button className="secondary-action" onClick={() => notify("Atendimento iniciado. Tempo estimado: 2 minutos.")}>Falar com o suporte</button>
        </section>
      </div>
      {requestOpen && <RequestDialog categories={categories} regions={regions} initialCategorySlug={initialCategorySlug} onClose={() => setRequestOpen(false)} notify={notify} />}
    </>
  );
}

function RequestDialog({
  categories,
  regions,
  initialCategorySlug,
  onClose,
  notify,
}: {
  categories: ServiceCategory[];
  regions: ServiceRegion[];
  initialCategorySlug: string;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [step, setStep] = useState<RequestStep>(1);
  const [categorySlug, setCategorySlug] = useState(initialCategorySlug || categories[0]?.slug || "");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  const [neighborhoodId, setNeighborhoodId] = useState(regions[0]?.neighborhoods[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponOffer, setCouponOffer] = useState<CampaignOffer | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selectedCategory = categories.find((category) => category.slug === categorySlug) ?? categories[0];
  const selectedRegion = regions.find((region) => region.id === regionId) ?? regions[0];
  const selectedNeighborhood = selectedRegion?.neighborhoods.find((neighborhood) => neighborhood.id === neighborhoodId)
    ?? selectedRegion?.neighborhoods[0];

  const changeRegion = (nextRegionId: string) => {
    const nextRegion = regions.find((region) => region.id === nextRegionId);
    setRegionId(nextRegionId);
    setNeighborhoodId(nextRegion?.neighborhoods[0]?.id ?? "");
  };

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const addPhotos = (selected: FileList | null) => {
    if (!selected) return;
    const candidates = Array.from(selected);
    const invalid = candidates.find((file) => !["image/jpeg", "image/png"].includes(file.type) || file.size > 524_288 || file.size < 8);
    if (invalid) {
      notify(`${invalid.name}: use somente JPEG ou PNG de até 512 KB.`);
      return;
    }
    setPhotos((current) => {
      const unique = candidates.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size));
      const nextPhotos = [...current, ...unique].slice(0, 3);
      if (current.length + unique.length > 3) notify("Cada pedido aceita no máximo 3 imagens.");
      return nextPhotos;
    });
  };

  const next = () => setStep((Math.min(4, step + 1)) as RequestStep);
  const back = () => setStep((Math.max(1, step - 1)) as RequestStep);
  const validateCoupon = async () => {
    setCouponChecking(true);
    try {
      const response = await fetch("/api/v1/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim() }),
      });
      const payload = await response.json() as { offer?: CampaignOffer; error?: string; message?: string };
      if (!response.ok || !payload.offer) throw new Error(payload.error ?? payload.message ?? "Cupom indisponível.");
      setCouponCode(payload.offer.code);
      setCouponOffer(payload.offer);
      notify(`Cupom ${payload.offer.code} validado. Ele será reservado ao confirmar o pedido.`);
    } catch (error) {
      setCouponOffer(null);
      notify(error instanceof Error ? error.message : "Não foi possível validar o cupom.");
    } finally {
      setCouponChecking(false);
    }
  };
  const finish = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/service-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categorySlug,
          title: description.trim().slice(0, 100),
          description: description.trim(),
          regionId: selectedRegion?.id,
          neighborhoodId: selectedNeighborhood?.id,
          preferredWindow: "O quanto antes",
          couponCode: couponOffer?.code,
        }),
      });
      const payload = await response.json() as { request?: { id?: string; publicCode?: string; campaign?: CampaignOffer | null }; error?: string; message?: string };
      if (!response.ok || !payload.request?.id) throw new Error(payload.error ?? payload.message ?? "Não foi possível criar o pedido.");
      let uploaded = 0;
      let uploadFailure = "";
      for (const photo of photos) {
        const form = new FormData();
        form.set("requestId", payload.request.id);
        form.set("file", photo);
        const uploadResponse = await fetch("/api/v1/customer/request-attachments", { method: "POST", body: form });
        const uploadPayload = await uploadResponse.json() as { error?: string; message?: string };
        if (uploadResponse.ok) uploaded += 1;
        else uploadFailure = uploadPayload.error ?? uploadPayload.message ?? "Uma imagem não pôde ser guardada.";
      }
      if (uploadFailure) {
        notify(`Pedido ${payload.request.publicCode ?? ""} criado; ${uploaded} de ${photos.length} imagem(ns) guardada(s). ${uploadFailure}`);
      } else {
        notify(`Pedido ${payload.request.publicCode ?? ""} criado${uploaded ? ` com ${uploaded} imagem(ns) privada(s)` : ""}${payload.request.campaign ? ` · cupom ${payload.request.campaign.code} reservado` : ""}.`);
      }
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível salvar o pedido.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog" role="dialog" aria-modal="true" aria-labelledby="request-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        {step < 4 && <><p className="dialog-kicker">NOVO PEDIDO · ETAPA {step} DE 3</p><div className="dialog-progress"><span style={{ width: `${step * 33.33}%` }} /></div></>}
        {step === 1 && <div className="dialog-content"><h2 id="request-title">Qual serviço você precisa?</h2><p>Escolha a opção que mais combina com a sua necessidade.</p><div className="dialog-categories">{categories.map((category) => <button key={category.id} onClick={() => setCategorySlug(category.slug)} className={categorySlug === category.slug ? "selected" : ""} aria-pressed={categorySlug === category.slug}><span>{category.icon}</span>{category.name}<i aria-hidden="true">✓</i></button>)}</div></div>}
        {step === 2 && <div className="dialog-content"><h2 id="request-title">Conte um pouco mais.</h2><p>Uma descrição clara ajuda o profissional a enviar uma proposta melhor.</p><label className="field"><span>O que precisa ser feito?</span><textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} placeholder="Ex.: Preciso trocar um chuveiro que parou de aquecer..." rows={5} /><small>{description.length}/500 caracteres</small></label><label className="upload-placeholder"><input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple onChange={(event) => { addPhotos(event.target.files); event.currentTarget.value = ""; }} /><span>＋</span><strong>Adicionar fotos sintéticas</strong><small>Opcional · até 3 JPEG/PNG de 512 KB</small></label>{photos.length > 0 && <ul className="request-photo-selection">{photos.map((photo) => <li key={`${photo.name}-${photo.size}`}><span>{photo.type === "image/png" ? "PNG" : "JPG"}</span><div><strong>{photo.name}</strong><small>{Math.ceil(photo.size / 1024)} KB · privado</small></div><button type="button" onClick={() => setPhotos((current) => current.filter((item) => item !== photo))} aria-label={`Remover ${photo.name}`}>×</button></li>)}</ul>}<p className="synthetic-file-note">Use apenas imagens sintéticas nesta demonstração. Os arquivos ficam privados e sem link público.</p></div>}
        {step === 3 && <div className="dialog-content"><h2 id="request-title">Quando e onde?</h2><p>Escolha uma área coberta. Você poderá ajustar os detalhes pelo chat.</p><div className="location-fields"><label className="field"><span>Região do piloto</span><select value={selectedRegion?.id ?? ""} onChange={(event) => changeRegion(event.target.value)}>{regions.map((region) => <option key={region.id} value={region.id}>{region.name} · {region.state}</option>)}</select></label><label className="field"><span>Bairro</span><select value={selectedNeighborhood?.id ?? ""} onChange={(event) => setNeighborhoodId(event.target.value)}>{selectedRegion?.neighborhoods.map((neighborhood) => <option key={neighborhood.id} value={neighborhood.id}>{neighborhood.name}</option>)}</select></label></div><div className="choice-grid"><button className="selected"><strong>O quanto antes</strong><small>Primeiro horário disponível</small></button><button><strong>Escolher uma data</strong><small>Defina dia e período</small></button></div><div className="coupon-box"><div><span>CUPOM PROMOCIONAL</span><small>Experimente BEMVINDO20</small></div><div className="coupon-input"><input value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase().slice(0, 32)); setCouponOffer(null); }} placeholder="DIGITE SEU CUPOM" /><button type="button" onClick={validateCoupon} disabled={couponChecking || couponCode.trim().length < 3}>{couponChecking ? "Validando..." : "Aplicar"}</button></div>{couponOffer && <p className="coupon-success"><strong>{couponOffer.code} aplicado</strong>{couponOffer.description} · válido para propostas a partir de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(couponOffer.minAmountCents / 100)}.</p>}</div><div className="privacy-tip"><span>⌖</span><p><strong>Seu endereço completo fica protegido.</strong> Mostramos apenas a região até você escolher um profissional.</p></div></div>}
        {step === 4 && <div className="dialog-success"><span className="success-check">✓</span><p className="dialog-kicker">PEDIDO PRONTO</p><h2 id="request-title">Agora é com a gente.</h2><p>Confirme para salvar o pedido. Somente profissionais com cobertura ativa poderão enviar propostas.</p><div className="success-summary"><span>{selectedCategory?.icon}</span><div><small>Categoria</small><strong>{selectedCategory?.name}</strong><small>{selectedNeighborhood?.name} · {selectedRegion?.name} · o quanto antes{photos.length ? ` · ${photos.length} foto(s)` : ""}{couponOffer ? ` · cupom ${couponOffer.code}` : ""}</small></div></div><button className="button" onClick={finish} disabled={saving || !selectedCategory || !selectedRegion || !selectedNeighborhood}>{saving ? "Salvando pedido e imagens..." : "Confirmar e acompanhar"}</button></div>}
        {step < 4 && <footer className="dialog-footer"><button className="secondary-action" onClick={step === 1 ? onClose : back}>{step === 1 ? "Cancelar" : "Voltar"}</button><button className="primary-action" onClick={next} disabled={!selectedCategory || !selectedRegion || !selectedNeighborhood || (step === 2 && description.trim().length < 10)}>Continuar →</button></footer>}
      </section>
    </div>
  );
}

const verificationStatusLabel: Record<VerificationStatus, string> = {
  submitted: "Aguardando análise",
  in_review: "Em análise",
  changes_requested: "Correção solicitada",
  approved: "Perfil aprovado",
};

const verificationDocumentStatusLabel: Record<VerificationDocumentStatus, string> = {
  pending: "Pendente",
  accepted: "Conferido",
  changes_requested: "Corrigir",
};

const providerAvailabilityLabel: Record<ProviderAvailabilityStatus, string> = {
  available_now: "Disponível agora",
  scheduled: "Com agenda",
  paused: "Pausado",
};

function ProviderMatchingPanel({
  notify,
  onChanged,
}: {
  notify: (message: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<ProviderMatchingData | null>(null);
  const [draft, setDraft] = useState<{
    availabilityStatus: ProviderAvailabilityStatus;
    acceptsUrgent: boolean;
    activeProposalLimit: number;
    activeJobLimit: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/provider/matching", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as ProviderMatchingData & { error?: string; message?: string };
        if (!response.ok || !payload.profile) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar o matching.");
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setDraft({
          availabilityStatus: payload.profile.availabilityStatus,
          acceptsUrgent: payload.profile.acceptsUrgent,
          activeProposalLimit: payload.profile.activeProposalLimit,
          activeJobLimit: payload.profile.activeJobLimit,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar o matching.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/provider/matching", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json() as ProviderMatchingData & { error?: string; message?: string };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar o matching.");
      }
      setData(payload);
      setDraft({
        availabilityStatus: payload.profile.availabilityStatus,
        acceptsUrgent: payload.profile.acceptsUrgent,
        activeProposalLimit: payload.profile.activeProposalLimit,
        activeJobLimit: payload.profile.activeJobLimit,
      });
      notify(`Matching atualizado na versão ${payload.profile.version}.`);
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar o matching.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <section className="dashboard-section provider-matching-panel"><div className="data-state">Calculando elegibilidade e capacidade...</div></section>;
  if (!data || !draft) return <section className="dashboard-section provider-matching-panel"><div className="data-state"><strong>Matching indisponível.</strong><button className="secondary-action" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Tentar novamente</button></div></section>;
  const dirty = draft.availabilityStatus !== data.profile.availabilityStatus
    || draft.acceptsUrgent !== data.profile.acceptsUrgent
    || draft.activeProposalLimit !== data.profile.activeProposalLimit
    || draft.activeJobLimit !== data.profile.activeJobLimit;

  return (
    <section className={`dashboard-section provider-matching-panel ${data.profile.eligible ? "eligible" : "blocked"}`}>
      <header>
        <div><small>MATCHING PERSISTENTE · V{data.profile.version}</small><h2>Controle as oportunidades que chegam até você.</h2><p>Categoria, cobertura, verificação e capacidade são conferidas novamente no servidor antes de cada proposta.</p></div>
        <span className={`status-pill ${data.profile.eligible ? "success" : "warning"}`}>{data.profile.eligible ? "Elegível para receber" : `${data.blockers.length} bloqueio(s)`}</span>
      </header>
      <div className="matching-profile-strip">
        <article><span>{data.profile.categoryIcon}</span><div><small>CATEGORIA PRINCIPAL</small><strong>{data.profile.categoryName}</strong></div></article>
        <article><span>⌖</span><div><small>COBERTURA ATIVA</small><strong>{data.regions.map((region) => region.name).join(", ") || "Nenhuma região"}</strong></div></article>
        <article><span>✓</span><div><small>VERIFICAÇÃO</small><strong>{data.profile.verificationStatus ? verificationStatusLabel[data.profile.verificationStatus] : "Não iniciada"}</strong></div></article>
      </div>
      {data.blockers.length > 0 && <div className="matching-blockers">{data.blockers.map((blocker) => <span key={blocker}>! {blocker}</span>)}</div>}
      <div className="matching-control-grid">
        <section>
          <small>DISPONIBILIDADE</small>
          <div className="matching-status-choice">{(["available_now", "scheduled", "paused"] as const).map((status) => <button key={status} className={draft.availabilityStatus === status ? "selected" : ""} onClick={() => setDraft({ ...draft, availabilityStatus: status })}>{providerAvailabilityLabel[status]}</button>)}</div>
          <label className="matching-urgent-toggle"><input type="checkbox" checked={draft.acceptsUrgent} onChange={(event) => setDraft({ ...draft, acceptsUrgent: event.target.checked })} /><span><strong>Aceitar urgências</strong><small>Pedidos “o quanto antes” ganham prioridade no ranking.</small></span><em aria-hidden="true" /></label>
        </section>
        <section>
          <small>LIMITES DE CAPACIDADE</small>
          <label><span>Propostas ativas</span><strong>{data.profile.activeProposalCount} / {draft.activeProposalLimit}</strong><input type="range" min="1" max="20" value={draft.activeProposalLimit} onChange={(event) => setDraft({ ...draft, activeProposalLimit: Number(event.target.value) })} /></label>
          <label><span>Serviços simultâneos</span><strong>{data.profile.activeJobCount} / {draft.activeJobLimit}</strong><input type="range" min="1" max="20" value={draft.activeJobLimit} onChange={(event) => setDraft({ ...draft, activeJobLimit: Number(event.target.value) })} /></label>
        </section>
      </div>
      <footer><div><strong>{data.profile.remainingProposalCapacity} nova(s) proposta(s) e {data.profile.remainingJobCapacity} serviço(s) disponíveis</strong><span>{data.history.length} alteração(ões) preservada(s) no histórico.</span></div><button className="primary-action" disabled={saving || !dirty} onClick={save}>{saving ? "Salvando..." : dirty ? "Salvar matching →" : "Matching atualizado"}</button></footer>
    </section>
  );
}

function ProviderView({ notify }: { notify: (message: string) => void }) {
  const [opportunities, setOpportunities] = useState<PersistedRequest[]>([]);
  const [verification, setVerification] = useState<ProviderVerification | null>(null);
  const [selected, setSelected] = useState<PersistedRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationLoading, setVerificationLoading] = useState(true);
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/provider/opportunities", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as oportunidades.");
        return response.json() as Promise<{ requests: PersistedRequest[] }>;
      })
      .then((payload) => setOpportunities(payload.requests))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar as oportunidades.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/provider/verification", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { verification?: ProviderVerification; error?: string; message?: string };
        if (!response.ok || !payload.verification) throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar a verificação do perfil.");
        return payload.verification;
      })
      .then(setVerification)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar a verificação do perfil.");
      })
      .finally(() => setVerificationLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const verificationPercentage = verification?.documentCount
    ? Math.round((verification.acceptedDocumentCount / verification.documentCount) * 100)
    : 0;
  const verificationTone = verification?.status === "approved" ? "success" : "warning";

  const uploadDocument = async (documentId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingDocumentId(documentId);
    try {
      const form = new FormData();
      form.set("documentId", documentId);
      form.set("file", file);
      const response = await fetch("/api/v1/provider/verification", { method: "POST", body: form });
      const payload = await response.json() as { verification?: ProviderVerification; error?: string; message?: string };
      if (!response.ok || !payload.verification) throw new Error(payload.error ?? payload.message ?? "Não foi possível guardar o arquivo.");
      setVerification(payload.verification);
      notify("Arquivo sintético guardado no cofre privado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível guardar o arquivo.");
    } finally {
      setUploadingDocumentId(null);
    }
  };

  return (
    <>
      <DashboardHeader role="prestador" eyebrow="Área do profissional" title="Bom trabalho começa com boas oportunidades."><span className={`status-pill ${verificationTone}`}>● {verificationLoading ? "Consultando perfil" : verification ? verificationStatusLabel[verification.status] : "Perfil indisponível"}</span></DashboardHeader>
      <div className="metric-grid"><Metric label="Novas oportunidades" value={loading ? "…" : String(opportunities.length)} detail="Pedidos disponíveis agora" tone="lime" /><Metric label="Propostas ativas" value={String(opportunities.filter((item) => item.hasActorProposal).length)} detail="Enviadas por você" /><Metric label="Serviços no mês" value="12" detail="+20% desde junho" /><Metric label="Avaliação" value="4,9" detail="126 avaliações" /></div>
      <ProviderMatchingPanel notify={notify} onChanged={() => { setLoading(true); setRefresh((value) => value + 1); }} />
      <div className="dashboard-columns wide-left">
        <section className="dashboard-section"><div className="dashboard-section-title"><div><small>OPORTUNIDADES PRÓXIMAS</small><h2>Pedidos disponíveis</h2></div><button onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Atualizar ↻</button></div><div className="opportunity-list">{loading && <div className="data-state">Buscando oportunidades...</div>}{!loading && opportunities.length === 0 && <div className="data-state"><strong>Nenhum pedido disponível agora.</strong><span>Novos pedidos aparecerão aqui automaticamente.</span></div>}{opportunities.slice(0, 5).map((request) => <Opportunity key={request.id} request={request} onSelect={() => setSelected(request)} />)}</div></section>
        <section className="dashboard-section profile-progress"><small>VERIFICAÇÃO · {verification?.publicCode ?? "…"}</small><div className="progress-ring" style={{ background: `radial-gradient(circle at center, white 59%, transparent 61%), conic-gradient(var(--lime) ${verificationPercentage}%, #e2e7df 0)` }}>{verificationLoading ? "…" : verificationPercentage}<sup>%</sup></div><h2>{verification ? verificationStatusLabel[verification.status] : "Carregando perfil"}</h2><p>{verification?.decisionReason ?? (verification ? `${verification.acceptedDocumentCount} de ${verification.documentCount} itens conferidos pela operação.` : "Consultando o checklist de verificação.")}</p>{verification?.documents && <><div className="private-upload-note"><span>!</span><p><strong>Use apenas arquivos sintéticos.</strong>PDF, JPEG ou PNG de até 2 MB. Nenhum dado ou documento real deve entrar nesta demonstração.</p></div><ul className="profile-checklist document-checklist">{verification.documents.map((document) => <li key={document.id} className={document.status}><span>{document.status === "accepted" ? "✓" : "!"}</span><div><strong>{document.label}</strong><small>{document.fileName ? `${document.fileName} · ${document.fileVersionCount} versão(ões)` : verificationDocumentStatusLabel[document.status]}</small></div><div className="provider-document-actions">{document.fileId && <a href={`/api/v1/provider/verification?fileId=${encodeURIComponent(document.fileId)}`} download>Baixar</a>}<label className={uploadingDocumentId === document.id ? "busy" : ""}><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={uploadingDocumentId !== null} onChange={(event) => { void uploadDocument(document.id, event.target.files?.[0]); event.currentTarget.value = ""; }} /><span>{uploadingDocumentId === document.id ? "Enviando…" : document.fileId ? "Nova versão" : "Enviar arquivo"}</span></label></div></li>)}</ul></>}</section>
      </div>
      {selected && <ProposalDialog request={selected} onClose={() => setSelected(null)} onSaved={() => { setLoading(true); setRefresh((value) => value + 1); }} notify={notify} />}
    </>
  );
}

function Opportunity({ request, onSelect }: { request: PersistedRequest; onSelect: () => void }) {
  return <article className="ranked-opportunity"><span className="category-icon">{request.categoryIcon}</span><div><div className="opportunity-title"><strong>{request.title}</strong><em>{request.matchScore}% match</em></div><span>{request.neighborhood} · {request.city}{request.attachments.length ? ` · ${request.attachments.length} foto(s)` : ""}</span><small className="match-reasons">{request.matchReasons.slice(0, 4).map((reason) => <i key={reason}>{reason}</i>)}</small></div><div><small>{request.preferredWindow}</small><button onClick={onSelect}>{request.hasActorProposal ? "Atualizar proposta" : "Enviar proposta"}</button></div></article>;
}

function ProposalDialog({ request, onClose, onSaved, notify }: { request: PersistedRequest; onClose: () => void; onSaved: () => void; notify: (message: string) => void }) {
  const [amount, setAmount] = useState("125");
  const [minutes, setMinutes] = useState("90");
  const [message, setMessage] = useState("Posso realizar o serviço no período solicitado e levo as ferramentas necessárias.");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/v1/provider/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          amountCents: Math.round(Number(amount) * 100),
          estimatedMinutes: Number(minutes),
          message: message.trim(),
        }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível enviar a proposta.");
      notify(request.hasActorProposal ? "Proposta atualizada com sucesso." : "Proposta enviada ao cliente.");
      onSaved();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar a proposta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog proposal-dialog" role="dialog" aria-modal="true" aria-labelledby="proposal-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        <div className="proposal-request-summary"><span>{request.categoryIcon}</span><div><small>{request.publicCode} · {request.categoryName}</small><h2 id="proposal-title">{request.title}</h2><p>{request.description}</p><em>⌖ {request.neighborhood}, {request.city} · {request.preferredWindow}</em></div></div>
        {request.attachments.length > 0 && <section className="request-photo-gallery"><header><div><small>IMAGENS DO PEDIDO</small><strong>{request.attachments.length} arquivo(s) privado(s)</strong></div><span>Somente para avaliar o serviço</span></header><div>{request.attachments.map((attachment, index) => <a key={attachment.id} href={`/api/v1/provider/request-attachments?attachmentId=${encodeURIComponent(attachment.id)}`} target="_blank" rel="noreferrer"><Image src={`/api/v1/provider/request-attachments?attachmentId=${encodeURIComponent(attachment.id)}`} alt={`Imagem ${index + 1} do pedido ${request.publicCode}`} width={220} height={120} unoptimized /><span>Abrir imagem {index + 1}</span></a>)}</div></section>}
        <form className="proposal-form" onSubmit={submit}>
          <div className="proposal-fields"><label className="field"><span>Valor da proposta</span><div className="money-input"><i>R$</i><input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div></label><label className="field"><span>Tempo estimado</span><select value={minutes} onChange={(event) => setMinutes(event.target.value)}><option value="60">Até 1 hora</option><option value="90">Até 1h30</option><option value="120">Até 2 horas</option><option value="240">Até 4 horas</option><option value="480">Até 1 dia</option></select></label></div>
          <label className="field"><span>Mensagem para o cliente</span><textarea rows={4} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} required /><small>{message.length}/500 caracteres</small></label>
          <div className="commercial-preview"><span>i</span><p><strong>Simulação transparente</strong>Este ambiente não realiza cobrança. Taxas e repasses serão apresentados antes do aceite em produção.</p></div>
          <footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || Number(amount) <= 0 || message.trim().length < 5}>{saving ? "Enviando..." : request.hasActorProposal ? "Atualizar proposta" : "Enviar proposta →"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function usePartnerDashboard(notify: (message: string) => void) {
  const [data, setData] = useState<PartnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/partner/dashboard", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as PartnerDashboardData & { error?: string; message?: string };
        if (!response.ok || !payload.link) throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar a rede.");
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar a rede.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);
  return { data, loading, refresh: () => setRefresh((value) => value + 1) };
}

const referralStatusLabel: Record<PartnerReferral["status"], string> = {
  invited: "Convidado",
  in_review: "Em análise",
  approved: "Aprovado p/ onboarding",
  active: "Ativo",
  rejected: "Não aprovado",
};

const referralStatusTone = (status: PartnerReferral["status"]) => {
  if (status === "active" || status === "approved") return "success";
  if (status === "rejected") return "neutral";
  return "warning";
};

function PartnerView({ notify }: { notify: (message: string) => void }) {
  const { data, loading, refresh } = usePartnerDashboard(notify);
  const [inviteOpen, setInviteOpen] = useState(false);
  const referralPath = data ? `/convite?codigo=${encodeURIComponent(data.link.referralCode)}&origem=link` : "";
  const referralUrl = data ? `maxservice.local${referralPath}` : "Carregando...";
  const copyLink = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${referralPath}`); } catch { /* O ambiente pode bloquear a área de transferência. */ }
    notify("Link de indicação copiado.");
  };
  return (
    <>
      <DashboardHeader role="parceiro" eyebrow="Área do parceiro" title="Sua rede, com origem e status claros."><button className="button button-small" onClick={() => setInviteOpen(true)} disabled={!data || data.categories.length === 0}>Nova indicação</button></DashboardHeader>
      <div className="metric-grid"><Metric label="Afiliados ativos" value={loading ? "…" : String(data?.metrics.activeCount ?? 0)} detail="Cadastro concluído" tone="lime" /><Metric label="Em andamento" value={loading ? "…" : String(data?.metrics.pendingCount ?? 0)} detail="Convites e análises" /><Metric label="Indicações totais" value={loading ? "…" : String(data?.metrics.totalCount ?? 0)} detail="Somente sua rede" /><Metric label="Taxa de ativação" value={loading ? "…" : `${data?.metrics.activationRate ?? 0}%`} detail="Ativos sobre indicações" /></div>
      <div className="dashboard-columns">
        <section className="dashboard-section referral-card"><div><small>SEU CÓDIGO DE INDICAÇÃO</small><h2>Convide profissionais da sua região.</h2><p>Compartilhe o link ou o QR Code. O profissional acessa uma página pública, registra o consentimento e entra na sua rede como convidado.</p><div className="fake-link"><span>{referralUrl}</span><button disabled={!data} onClick={copyLink}>Copiar</button></div></div>{data && <a className="referral-qr" href={`/convite?codigo=${encodeURIComponent(data.link.referralCode)}&origem=qr`} aria-label={`Abrir convite pelo QR Code ${data.link.referralCode}`}><Image src={`/api/v1/public/referrals/qr?code=${encodeURIComponent(data.link.referralCode)}`} alt={`QR Code de indicação ${data.link.referralCode}`} width={320} height={320} unoptimized /></a>}</section>
        <section className="dashboard-section"><div className="dashboard-section-title"><div><small>REDE RECENTE</small><h2>Últimas indicações</h2></div><button onClick={refresh}>Atualizar ↻</button></div><div className="affiliate-list">{loading && <div className="data-state">Carregando indicações...</div>}{!loading && data?.referrals.length === 0 && <div className="data-state"><strong>Sua rede começa aqui.</strong><span>Registre a primeira indicação para acompanhar o progresso.</span></div>}{data?.referrals.slice(0, 5).map((referral) => <Affiliate key={referral.id} referral={referral} />)}</div></section>
      </div>
      {inviteOpen && <ReferralInviteDialog categories={data?.categories ?? []} onClose={() => setInviteOpen(false)} onSaved={refresh} notify={notify} />}
    </>
  );
}

function Affiliate({ referral }: { referral: PartnerReferral }) {
  const initials = referral.professionalName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <div><span className="mini-avatar neutral">{initials}</span><p><strong>{referral.professionalName}</strong><small>{referral.categoryIcon} {referral.categoryName} · {referral.publicCode}</small></p><span className={`status-pill ${referralStatusTone(referral.status)}`}>{referralStatusLabel[referral.status]}</span></div>;
}

function ReferralInviteDialog({
  categories,
  onClose,
  onSaved,
  notify,
}: {
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/v1/partner/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ professionalName: name.trim(), email: email.trim(), categorySlug }),
      });
      const payload = await response.json() as { referral?: PartnerReferral; error?: string; message?: string };
      if (!response.ok || !payload.referral) throw new Error(payload.error ?? payload.message ?? "Não foi possível registrar a indicação.");
      notify(`${payload.referral.publicCode}: indicação registrada. O envio externo ainda não está ativo.`);
      onSaved();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível registrar a indicação.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="request-dialog referral-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="referral-invite-title"><button ref={closeRef} className="dialog-close" onClick={onClose} aria-label="Fechar">×</button><header><span>+</span><div><p className="dialog-kicker">NOVA INDICAÇÃO</p><h2 id="referral-invite-title">Registre um profissional.</h2><p>O cadastro entrará como convidado e ficará vinculado ao seu código.</p></div></header><form onSubmit={submit}><label className="field"><span>Nome do profissional</span><input minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" required /></label><label className="field"><span>E-mail</span><input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="profissional@exemplo.com" required /></label><label className="field"><span>Categoria principal</span><select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)} disabled={categories.length === 0} required>{categories.map((category) => <option key={category.id} value={category.slug}>{category.icon} {category.name}</option>)}</select></label><div className="commercial-preview"><span>i</span><p><strong>Registro sem disparo automático</strong>A indicação será persistida, mas nenhum e-mail ou mensagem externa será enviado nesta demonstração.</p></div><footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || !categorySlug || name.trim().length < 3 || !email.includes("@")}>{saving ? "Registrando..." : "Registrar indicação →"}</button></footer></form></section></div>;
}

function OperationReportsPanel({ notify }: { notify: (message: string) => void }) {
  const [period, setPeriod] = useState<ReportPeriodDays>(30);
  const [data, setData] = useState<OperationReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const compactMoney = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);
  const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
  const variation = (value: number | null, suffix = "%") => value === null
    ? "sem base anterior"
    : `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR")}${suffix} vs. período anterior`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/operation/reports?days=${period}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as OperationReportData & { error?: string; message?: string };
        if (!response.ok || !payload.period || !payload.funnel) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar o relatório operacional.");
        }
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar o relatório operacional.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, period, refresh]);

  const exportCsv = () => {
    if (!data) return;
    const cell = (value: string | number) => `"${String(value).replaceAll("\"", "\"\"")}"`;
    const rows = [
      ["Categoria", "Pedidos", "Com proposta", "Agendados", "Concluídos", "Cobertura (%)", "Conversão (%)", "Proposta média (centavos)", "Volume líquido (centavos)"],
      ...data.categories.map((category) => [
        category.name,
        category.requestCount,
        category.proposedRequestCount,
        category.bookingCount,
        category.completedCount,
        category.proposalCoverageRate,
        category.bookingConversionRate,
        category.averageProposalCents,
        category.netVolumeCents,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `max-service-relatorio-${data.period.days}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Relatório agregado exportado sem dados pessoais.");
  };

  const maximumTimelineRequests = Math.max(1, ...(data?.timeline.map((item) => item.requestCount) ?? [1]));
  const funnelSteps = data ? [
    { label: "Pedidos", value: data.funnel.requestCount, rate: 100 },
    { label: "Com proposta", value: data.funnel.proposedRequestCount, rate: data.funnel.proposalCoverageRate },
    { label: "Agendados", value: data.funnel.bookingCount, rate: data.funnel.bookingConversionRate },
    { label: "Concluídos", value: data.funnel.completedCount, rate: data.funnel.requestCount ? Math.round((data.funnel.completedCount / data.funnel.requestCount) * 10_000) / 100 : 0 },
  ] : [];

  return (
    <section className="dashboard-section operation-reports">
      <header className="report-header">
        <div><small>INTELIGÊNCIA DO PILOTO</small><h2>Relatório operacional</h2><p>Funil, categorias, aquisição e reconciliação em uma visão sem dados pessoais.</p></div>
        <div className="report-actions"><div className="period-switch" aria-label="Período do relatório">{([7, 30, 90] as ReportPeriodDays[]).map((days) => <button key={days} className={period === days ? "active" : ""} onClick={() => { if (period !== days) { setLoading(true); setPeriod(days); } }}>{days} dias</button>)}</div><button className="secondary-action" onClick={() => setGoalsOpen(true)} disabled={!data || loading}>Editar metas</button><button className="secondary-action" onClick={exportCsv} disabled={!data || loading}>Exportar CSV ↓</button><button className="secondary-action" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }} disabled={loading}>Atualizar ↻</button></div>
      </header>
      {loading && !data && <div className="data-state">Consolidando indicadores...</div>}
      {data && <>
        <div className="report-scorecards">
          <article><small>CONVERSÃO EM AGENDAMENTO</small><strong>{data.funnel.bookingConversionRate.toLocaleString("pt-BR")}%</strong><span>{variation(data.comparison.changes.bookingConversionPoints, " p.p.")}</span></article>
          <article><small>TEMPO ATÉ 1ª PROPOSTA</small><strong>{data.funnel.averageFirstProposalMinutes} min</strong><span>{variation(data.comparison.changes.firstProposalMinutesPercent)}</span></article>
          <article><small>VOLUME LÍQUIDO</small><strong>{money(data.financial.netVolumeCents)}</strong><span>{variation(data.comparison.changes.netVolumePercent)}</span></article>
          <article className={data.financial.reconciled ? "healthy" : "attention"}><small>RECONCILIAÇÃO</small><strong>{data.financial.reconciled ? "Conciliada" : "Atenção"}</strong><span>{data.financial.unreconciledCount} pendência(s) · diferença {money(data.financial.reconciliationDifferenceCents)}</span></article>
        </div>
        <section className="report-goal-strip">
          <div><small>METAS · {data.period.days} DIAS · V{data.goals.version}</small><strong>Cobertura ≥ {data.goals.proposalCoverageTarget.toLocaleString("pt-BR")}%</strong></div>
          <div><small>CONVERSÃO</small><strong>≥ {data.goals.bookingConversionTarget.toLocaleString("pt-BR")}%</strong></div>
          <div><small>1ª PROPOSTA</small><strong>≤ {data.goals.firstProposalTargetMinutes} min</strong></div>
          <div><small>CASOS VENCIDOS</small><strong>≤ {data.goals.overdueCaseLimit}</strong></div>
          <div><small>PEDIDOS</small><strong>{variation(data.comparison.changes.requestCountPercent)}</strong></div>
        </section>
        <section className={`report-alerts ${data.alerts.length === 0 ? "clear" : ""}`}>
          <header><div><small>MONITOR DE DESVIOS</small><h3>{data.alerts.length === 0 ? "Operação dentro das metas." : `${data.alerts.length} desvio(s) exigem leitura.`}</h3></div><span>Comparação: {date(data.comparison.period.from)} — {date(data.comparison.period.to)}</span></header>
          <div>{data.alerts.length === 0
            ? <article className="clear"><i>✓</i><div><strong>Nenhum alerta ativo</strong><p>As métricas do período respeitam os limites configurados.</p></div></article>
            : data.alerts.map((alert) => <article key={alert.id} className={alert.severity}><i>{alert.severity === "critical" ? "!" : "↗"}</i><div><strong>{alert.title}</strong><p>{alert.detail}</p></div><span>{alert.severity === "critical" ? "Crítico" : "Atenção"}</span></article>)}
          </div>
        </section>
        <div className="report-grid">
          <section className="report-funnel">
            <header><div><small>FUNIL DO MARKETPLACE</small><h3>Da necessidade ao serviço concluído</h3></div><span>{date(data.period.from)} — {date(data.period.to)}</span></header>
            <div>{funnelSteps.map((step, index) => <article key={step.label}><div><span>{String(index + 1).padStart(2, "0")}</span><strong>{step.label}</strong><b>{step.value}</b></div><div className="funnel-track"><i style={{ width: `${Math.max(step.value ? 5 : 0, step.rate)}%` }} /></div><small>{index === 0 ? "base do período" : `${step.rate.toLocaleString("pt-BR")}% dos pedidos`}</small></article>)}</div>
            <footer><span>{data.funnel.cancelledCount} cancelamento(s)</span><span>{data.funnel.completionRate.toLocaleString("pt-BR")}% dos agendados concluídos</span></footer>
          </section>
          <section className="report-timeline">
            <header><div><small>RITMO DE AQUISIÇÃO</small><h3>Pedidos por {data.period.bucket === "week" ? "semana" : "dia"}</h3></div><span className="report-legend"><i /> pedidos <i /> agendamentos</span></header>
            <div className="report-bars">{data.timeline.map((item) => <article key={item.bucketStart} title={`${date(item.bucketStart)}: ${item.requestCount} pedido(s), ${item.bookingCount} agendamento(s), ${money(item.netVolumeCents)}`}><div><i style={{ height: `${Math.max(item.requestCount ? 8 : 2, (item.requestCount / maximumTimelineRequests) * 100)}%` }} /><b style={{ height: `${Math.max(item.bookingCount ? 6 : 1, (item.bookingCount / maximumTimelineRequests) * 100)}%` }} /></div><span>{data.timeline.length <= 10 || item === data.timeline[0] || item === data.timeline[data.timeline.length - 1] ? date(item.bucketStart) : ""}</span></article>)}</div>
            <footer><span>{data.growth.referralCount} indicação(ões) · {data.growth.referralApprovalRate.toLocaleString("pt-BR")}% aprovadas</span><strong>{data.growth.campaignRedemptionCount} cupom(ns) convertido(s)</strong></footer>
          </section>
        </div>
        <section className="report-finance">
          <div><small>SAÚDE FINANCEIRA · SANDBOX</small><h3>{compactMoney(data.financial.netVolumeCents)} processados no período</h3><p>Lista {money(data.financial.listAmountCents)} · desconto médio {data.financial.discountRate.toLocaleString("pt-BR")}% · taxa Max prevista {money(data.financial.platformFeeCents)}</p></div>
          <div className="report-finance-values"><span><small>RECONHECIDO</small><strong>{money(data.financial.settledAmountCents)}</strong></span><span><small>ESTORNADO</small><strong>{money(data.financial.refundedAmountCents)}</strong></span><span><small>AUTORIZAÇÕES &gt; 7 DIAS</small><strong>{data.financial.staleAuthorizedCount}</strong></span></div>
        </section>
        <section className="report-categories">
          <header><div><small>DESEMPENHO POR CATEGORIA</small><h3>Onde a demanda encontra oferta</h3></div><span>{data.categories.length} categoria(s) monitorada(s)</span></header>
          <div className="report-category-head"><span>Categoria</span><span>Pedidos</span><span>Cobertura</span><span>Conversão</span><span>Ticket proposto</span><span>Volume líquido</span></div>
          {data.categories.map((category) => <article key={category.id}><div><span>{category.icon}</span><strong>{category.name}</strong><small>{category.slug}</small></div><strong>{category.requestCount}</strong><span>{category.proposalCoverageRate.toLocaleString("pt-BR")}%</span><span>{category.bookingConversionRate.toLocaleString("pt-BR")}%</span><span>{money(category.averageProposalCents)}</span><span>{money(category.netVolumeCents)}</span></article>)}
        </section>
        <footer className="report-footnote"><span>i</span><p><strong>Leitura de gestão:</strong> indicadores são agregados no servidor com acesso exclusivo da Operação. O CSV contém somente categorias e métricas, sem nomes, contatos, descrições ou identificadores internos.</p><small>Gerado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.financial.generatedAt))}</small></footer>
      </>}
      {data && goalsOpen && <OperationReportGoalsDialog goals={data.goals} onClose={() => setGoalsOpen(false)} onSaved={() => { setLoading(true); setRefresh((value) => value + 1); }} notify={notify} />}
    </section>
  );
}

function OperationReportGoalsDialog({
  goals,
  onClose,
  onSaved,
  notify,
}: {
  goals: OperationReportData["goals"];
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string) => void;
}) {
  const [proposalCoverage, setProposalCoverage] = useState(String(goals.proposalCoverageTarget));
  const [bookingConversion, setBookingConversion] = useState(String(goals.bookingConversionTarget));
  const [firstProposalMinutes, setFirstProposalMinutes] = useState(String(goals.firstProposalTargetMinutes));
  const [overdueCaseLimit, setOverdueCaseLimit] = useState(String(goals.overdueCaseLimit));
  const [unreconciledLimit, setUnreconciledLimit] = useState(String(goals.unreconciledLimit));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  const percent = (value: string) => Number(value.replace(",", "."));
  const integer = (value: string) => Number.parseInt(value, 10);
  const valid = [percent(proposalCoverage), percent(bookingConversion)].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
    && Number.isInteger(integer(firstProposalMinutes)) && integer(firstProposalMinutes) >= 1 && integer(firstProposalMinutes) <= 10080
    && Number.isInteger(integer(overdueCaseLimit)) && integer(overdueCaseLimit) >= 0 && integer(overdueCaseLimit) <= 10000
    && Number.isInteger(integer(unreconciledLimit)) && integer(unreconciledLimit) >= 0 && integer(unreconciledLimit) <= 10000
    && note.trim().length >= 10;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/operation/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodDays: goals.periodDays,
          proposalCoverageTargetBps: Math.round(percent(proposalCoverage) * 100),
          bookingConversionTargetBps: Math.round(percent(bookingConversion) * 100),
          firstProposalTargetMinutes: integer(firstProposalMinutes),
          overdueCaseLimit: integer(overdueCaseLimit),
          unreconciledLimit: integer(unreconciledLimit),
          note: note.trim(),
        }),
      });
      const payload = await response.json() as { goals?: OperationReportData["goals"]; error?: string; message?: string };
      if (!response.ok || !payload.goals) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar as metas.");
      }
      notify(`Metas de ${payload.goals.periodDays} dias atualizadas na versão ${payload.goals.version}.`);
      onSaved();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar as metas.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog report-goals-dialog" role="dialog" aria-modal="true" aria-labelledby="report-goals-title">
        <button ref={closeRef} className="dialog-close" onClick={onClose} aria-label="Fechar">×</button>
        <header><span>◎</span><div><p className="dialog-kicker">METAS DE {goals.periodDays} DIAS</p><h2 id="report-goals-title">Defina os limites do piloto.</h2><p>Cada mudança cria uma nova versão e exige justificativa auditável.</p></div></header>
        <form onSubmit={submit}>
          <div className="report-goal-fields">
            <label className="field"><span>Cobertura de propostas (%)</span><input type="number" min="0" max="100" step="0.1" value={proposalCoverage} onChange={(event) => setProposalCoverage(event.target.value)} required /></label>
            <label className="field"><span>Conversão em agendamento (%)</span><input type="number" min="0" max="100" step="0.1" value={bookingConversion} onChange={(event) => setBookingConversion(event.target.value)} required /></label>
            <label className="field"><span>Tempo até primeira proposta (min)</span><input type="number" min="1" max="10080" value={firstProposalMinutes} onChange={(event) => setFirstProposalMinutes(event.target.value)} required /></label>
            <label className="field"><span>Limite de casos com SLA vencido</span><input type="number" min="0" max="10000" value={overdueCaseLimit} onChange={(event) => setOverdueCaseLimit(event.target.value)} required /></label>
            <label className="field"><span>Limite de itens não conciliados</span><input type="number" min="0" max="10000" value={unreconciledLimit} onChange={(event) => setUnreconciledLimit(event.target.value)} required /></label>
          </div>
          <label className="field"><span>Justificativa da alteração</span><textarea minLength={10} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explique a decisão e o contexto operacional." required /><small>{note.trim().length}/1000</small></label>
          <div className="commercial-preview"><span>i</span><p><strong>Escopo controlado</strong>A meta vale somente para a janela de {goals.periodDays} dias. Nenhuma mensagem externa será disparada.</p></div>
          <footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || !valid}>{saving ? "Salvando..." : "Salvar nova versão →"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function OperationsView({ notify }: { notify: (message: string) => void }) {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [verifications, setVerifications] = useState<ProviderVerification[]>([]);
  const [referrals, setReferrals] = useState<OperationReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/v1/operation/cases", { cache: "no-store", signal: controller.signal }),
      fetch("/api/v1/operation/verifications", { cache: "no-store", signal: controller.signal }),
      fetch("/api/v1/operation/referrals", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([casesResponse, verificationsResponse, referralsResponse]) => {
        const casesPayload = await casesResponse.json() as { cases?: SupportCase[]; error?: string; message?: string };
        const verificationsPayload = await verificationsResponse.json() as { verifications?: ProviderVerification[]; error?: string; message?: string };
        const referralsPayload = await referralsResponse.json() as { referrals?: OperationReferral[]; error?: string; message?: string };
        if (!casesResponse.ok || !casesPayload.cases) throw new Error(casesPayload.error ?? casesPayload.message ?? "Não foi possível carregar as ocorrências.");
        if (!verificationsResponse.ok || !verificationsPayload.verifications) throw new Error(verificationsPayload.error ?? verificationsPayload.message ?? "Não foi possível carregar as verificações.");
        if (!referralsResponse.ok || !referralsPayload.referrals) throw new Error(referralsPayload.error ?? referralsPayload.message ?? "Não foi possível carregar as indicações.");
        return { cases: casesPayload.cases, verifications: verificationsPayload.verifications, referrals: referralsPayload.referrals };
      })
      .then((payload) => { setCases(payload.cases); setVerifications(payload.verifications); setReferrals(payload.referrals); setRefreshedAt(Date.now()); })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar a fila operacional.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const openCases = cases.filter((item) => item.status !== "resolved");
  const highPriority = openCases.filter((item) => item.priority === "high").length;
  const profilesInReview = verifications.filter((item) => item.status === "submitted" || item.status === "in_review");
  const documentsRequiringAttention = verifications.reduce((total, item) => total + item.attentionDocumentCount, 0);
  const referralsInReview = referrals.filter((item) => item.status === "invited" || item.status === "in_review");
  const waiting = (value: string) => {
    const minutes = Math.max(0, Math.floor((refreshedAt - new Date(value).getTime()) / 60_000));
    if (minutes < 1) return "agora";
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  };

  return (
    <>
      <DashboardHeader role="operacao" eyebrow="Operação e moderação" title="O que precisa de atenção hoje?" />
      <div className="metric-grid"><Metric label="Perfis na fila" value={loading ? "…" : String(profilesInReview.length)} detail="Enviados ou em análise" tone={profilesInReview.length > 0 ? "warning" : undefined} /><Metric label="Indicações na fila" value={loading ? "…" : String(referralsInReview.length)} detail="Convites aguardando decisão" tone={referralsInReview.length > 0 ? "warning" : undefined} /><Metric label="Itens com atenção" value={loading ? "…" : String(documentsRequiringAttention)} detail="Pendentes ou para correção" /><Metric label="Ocorrências abertas" value={loading ? "…" : String(openCases.length)} detail={`${highPriority} em alta prioridade`} tone={highPriority > 0 ? "warning" : undefined} /></div>
      <OperationReportsPanel notify={notify} />
      <section className="dashboard-section operations-table referral-review-table"><div className="dashboard-section-title"><div><small>AQUISIÇÃO DE PROFISSIONAIS</small><h2>Indicações de parceiros</h2></div><button onClick={() => setRefresh((value) => value + 1)}>Atualizar fila ↻</button></div><div className="table-head"><span>Referência</span><span>Profissional</span><span>Parceiro</span><span>Origem</span><span>Status</span></div>{loading && <div className="data-state">Carregando indicações...</div>}{!loading && referrals.length === 0 && <div className="data-state"><strong>Nenhuma indicação encontrada.</strong><span>Cadastros vindos dos links e QR Codes aparecerão nesta fila.</span></div>}{referrals.map((item) => <OperationReferralRow key={item.id} item={item} onOpen={() => setSelectedReferralId(item.id)} />)}</section>
      <section className="dashboard-section operations-table verification-table"><div className="dashboard-section-title"><div><small>MODERAÇÃO DE CADASTROS</small><h2>Verificação de profissionais</h2></div><button onClick={() => setRefresh((value) => value + 1)}>Atualizar fila ↻</button></div><div className="table-head"><span>Referência</span><span>Profissional</span><span>Documentos</span><span>Prioridade</span><span>Status</span></div>{loading && <div className="data-state">Carregando verificações...</div>}{!loading && verifications.length === 0 && <div className="data-state"><strong>Nenhuma verificação encontrada.</strong><span>Novos cadastros enviados aparecerão automaticamente nesta fila.</span></div>}{verifications.map((item) => <VerificationRow key={item.id} item={item} onOpen={() => setSelectedVerificationId(item.id)} />)}</section>
      <section className="dashboard-section operations-table"><div className="dashboard-section-title"><div><small>FILA PRIORITÁRIA</small><h2>Cancelamentos e ocorrências</h2></div><button onClick={() => setRefresh((value) => value + 1)}>Atualizar fila ↻</button></div><div className="table-head"><span>Tipo</span><span>Referência</span><span>Motivo</span><span>Espera</span><span>Status</span></div>{loading && <div className="data-state">Carregando ocorrências...</div>}{!loading && cases.length === 0 && <div className="data-state"><strong>Nenhuma ocorrência aberta.</strong><span>Cancelamentos registrados aparecerão automaticamente nesta fila.</span></div>}{cases.map((item) => <OperationRow key={item.id} item={item} wait={waiting(item.createdAt)} onOpen={() => setSelectedCaseId(item.id)} />)}</section>
      <div className="operations-note"><span>!</span><p><strong>Ações críticas exigem justificativa.</strong> Aprovações, rejeições, suspensões e mudanças de regra ficam registradas com antes/depois na trilha de auditoria.</p></div>
      {selectedReferralId && <OperationReferralDialog referralId={selectedReferralId} onClose={() => setSelectedReferralId(null)} onChanged={() => setRefresh((value) => value + 1)} notify={notify} />}
      {selectedVerificationId && <OperationVerificationDialog verificationId={selectedVerificationId} onClose={() => setSelectedVerificationId(null)} onChanged={() => setRefresh((value) => value + 1)} notify={notify} />}
      {selectedCaseId && <OperationCaseDialog caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} onChanged={() => setRefresh((value) => value + 1)} notify={notify} />}
    </>
  );
}

function OperationReferralRow({ item, onOpen }: { item: OperationReferral; onOpen: () => void }) {
  const closed = item.status === "approved" || item.status === "active" || item.status === "rejected";
  const sourceLabel = item.source === "qr" ? "QR Code" : item.source === "link" ? "Link público" : "Manual";
  return (
    <article className={`table-row ${closed ? "resolved" : ""}`}>
      <span data-label="Referência"><strong>{item.publicCode}</strong></span>
      <span data-label="Profissional">{item.professionalName}<small>{item.categoryIcon} {item.categoryName}</small></span>
      <span data-label="Parceiro">{item.partnerName}<small>{item.partnerCode}</small></span>
      <span data-label="Origem">{sourceLabel}</span>
      <span data-label="Status"><button onClick={onOpen} className={`operation-open-button ${item.status === "invited" ? "urgent" : ""}`}><span>{referralStatusLabel[item.status]}</span><i>→</i></button></span>
    </article>
  );
}

function OperationReferralDialog({ referralId, onClose, onChanged, notify }: { referralId: string; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [detail, setDetail] = useState<OperationReferralDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/operation/referrals?referralId=${encodeURIComponent(referralId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { referral?: OperationReferralDetail; error?: string; message?: string };
        if (!response.ok || !payload.referral) throw new Error(payload.error ?? payload.message ?? "Não foi possível abrir a indicação.");
        return payload.referral;
      })
      .then(setDetail)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível abrir a indicação.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [referralId, notify, reload]);

  const submit = async (status: "in_review" | "approved" | "rejected") => {
    if (note.trim().length < 10) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/operation/referrals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referralId, status, note: note.trim() }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar a indicação.");
      setNote("");
      setReload((value) => value + 1);
      onChanged();
      notify(status === "in_review" ? "Análise da indicação iniciada." : status === "approved" ? "Indicação aprovada para onboarding." : "Indicação rejeitada com justificativa.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar a indicação.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  const sourceLabel = detail?.source === "qr" ? "QR Code" : detail?.source === "link" ? "Link público" : "Cadastro manual";
  const eventTitle: Record<OperationReferralEvent["eventType"], string> = {
    review_started: "Análise iniciada",
    approved: "Aprovado para onboarding",
    rejected: "Indicação não aprovada",
  };
  const canReview = detail?.status === "invited" || detail?.status === "in_review";

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog operation-case-dialog referral-review-dialog" role="dialog" aria-modal="true" aria-labelledby="referral-review-title">
        <button className="dialog-close" onClick={onClose} aria-label="Fechar indicação">×</button>
        {loading && !detail && <div className="data-state"><strong>Carregando indicação...</strong></div>}
        {!loading && !detail && <div className="data-state"><strong>Indicação indisponível.</strong><button className="secondary-action" onClick={onClose}>Fechar</button></div>}
        {detail && <>
          <header className="operation-case-header">
            <span>RF</span>
            <div><p className="dialog-kicker">{detail.publicCode} · {sourceLabel}</p><h2 id="referral-review-title">{detail.professionalName}</h2><p>{detail.email} · recebido em {formatDate(detail.createdAt)}</p></div>
            <strong className={`status-pill ${referralStatusTone(detail.status)}`}>{referralStatusLabel[detail.status]}</strong>
          </header>
          <div className="operation-case-body">
            <section className="operation-case-facts">
              <article><small>PARCEIRO</small><strong>{detail.partnerName}</strong><span>{detail.partnerCode}</span></article>
              <article><small>CATEGORIA</small><strong>{detail.categoryIcon} {detail.categoryName}</strong><span>Área principal informada</span></article>
              <article><small>CONSENTIMENTO</small><strong>{detail.consentAt ? "Registrado" : "Cadastro manual"}</strong><span>{detail.consentAt ? `${formatDate(detail.consentAt)} · ${detail.privacyNoticeVersion}` : "Originado pelo parceiro"}</span></article>
            </section>
            {detail.latestReviewNote && (detail.status === "approved" || detail.status === "rejected") && <section className="operation-resolution"><span>{detail.status === "approved" ? "✓" : "!"}</span><div><small>DECISÃO REGISTRADA</small><strong>{detail.latestReviewNote}</strong><p>{detail.reviewedByName}{detail.latestReviewAt ? ` · ${formatDate(detail.latestReviewAt)}` : ""}</p></div></section>}
            <section className="operation-timeline">
              <small>TRILHA DE REVISÃO · {detail.events.length} EVENTO(S)</small>
              {detail.events.length === 0 && <div className="data-state"><span>A indicação ainda aguarda a primeira análise.</span></div>}
              {detail.events.map((event) => <article key={event.id}><i>{event.eventType === "review_started" ? "→" : event.eventType === "approved" ? "✓" : "!"}</i><div><header><strong>{eventTitle[event.eventType]}</strong><small>{formatDate(event.createdAt)}</small></header><p>{event.note}</p><span>{event.actorName}</span></div></article>)}
            </section>
            {canReview && <section className="operation-case-actions">
              <div><small>JUSTIFICATIVA OBRIGATÓRIA</small><strong>Cada mudança fica vinculada ao operador e preservada no histórico.</strong></div>
              <label><span>Nota da análise</span><textarea minLength={10} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Registre a conferência realizada e o motivo da decisão." /><small>{note.trim().length}/1000</small></label>
              <div className="operation-action-buttons">
                {detail.status === "invited" && <button className="primary-action" disabled={submitting || note.trim().length < 10} onClick={() => submit("in_review")}>{submitting ? "Salvando..." : "Iniciar análise"}</button>}
                {detail.status === "in_review" && <><button className="danger-action" disabled={submitting || note.trim().length < 10} onClick={() => submit("rejected")}>Não aprovar</button><button className="primary-action" disabled={submitting || note.trim().length < 10} onClick={() => submit("approved")}>{submitting ? "Salvando..." : "Aprovar para onboarding"}</button></>}
              </div>
            </section>}
          </div>
        </>}
      </section>
    </div>
  );
}

function VerificationRow({ item, onOpen }: { item: ProviderVerification; onOpen: () => void }) {
  const urgent = item.reviewPriority === "attention" && item.status !== "approved";
  return <article className={`table-row ${item.status === "approved" ? "resolved" : ""}`}><span data-label="Referência"><strong>{item.publicCode}</strong></span><span data-label="Profissional">{item.providerName}<small>{item.providerCode}</small></span><span data-label="Documentos">{item.acceptedDocumentCount}/{item.documentCount} conferidos</span><span data-label="Prioridade">{item.reviewPriority === "attention" ? "Atenção" : "Padrão"}</span><span data-label="Status"><button onClick={onOpen} className={`operation-open-button ${urgent || item.status === "changes_requested" ? "urgent" : ""}`}><span>{verificationStatusLabel[item.status]}</span><i>→</i></button></span></article>;
}

function OperationVerificationDialog({ verificationId, onClose, onChanged, notify }: { verificationId: string; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [detail, setDetail] = useState<ProviderVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/operation/verifications?verificationId=${encodeURIComponent(verificationId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { verification?: ProviderVerification; error?: string; message?: string };
        if (!response.ok || !payload.verification) throw new Error(payload.error ?? payload.message ?? "Não foi possível abrir a verificação.");
        return payload.verification;
      })
      .then(setDetail)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível abrir a verificação.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [verificationId, notify]);

  const submit = async (action: "status" | "document", status: "in_review" | "approved" | "changes_requested" | "accepted", documentId?: string) => {
    if (note.trim().length < 10) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/operation/verifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationId, documentId, action, status, note: note.trim() }),
      });
      const payload = await response.json() as { verification?: ProviderVerification; error?: string; message?: string };
      if (!response.ok || !payload.verification) throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar a verificação.");
      setDetail(payload.verification);
      setNote("");
      onChanged();
      notify(action === "document" ? "Item documental revisado com auditoria." : status === "approved" ? "Perfil aprovado com justificativa registrada." : status === "changes_requested" ? "Correção solicitada ao profissional." : "Análise assumida pela operação.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar a verificação.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  const documents = detail?.documents ?? [];
  const events = detail?.events ?? [];
  const hasCorrection = documents.some((document) => document.status === "changes_requested");
  const eventTitle: Record<VerificationEvent["eventType"], string> = {
    submitted: "Cadastro enviado",
    review_started: "Análise iniciada",
    document_uploaded: "Arquivo privado enviado",
    document_reviewed: "Item documental revisado",
    approved: "Perfil aprovado",
    changes_requested: "Correção solicitada",
  };

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="request-dialog operation-case-dialog verification-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title"><button className="dialog-close" onClick={onClose} aria-label="Fechar verificação">×</button>{loading && !detail && <div className="data-state"><strong>Carregando verificação...</strong></div>}{!loading && !detail && <div className="data-state"><strong>Verificação indisponível.</strong><button className="secondary-action" onClick={onClose}>Fechar</button></div>}{detail && <><header className="operation-case-header"><span>VF</span><div><p className="dialog-kicker">{detail.publicCode} · {detail.policyVersion}</p><h2 id="verification-title">{detail.providerName}</h2><p>{detail.providerCode} · enviado em {formatDate(detail.submittedAt)}</p></div><strong className={`status-pill ${detail.status === "approved" ? "success" : "warning"}`}>{verificationStatusLabel[detail.status]}</strong></header><div className="operation-case-body"><section className="operation-case-facts"><article><small>RESPONSÁVEL</small><strong>{detail.assignedToName ?? "Não atribuído"}</strong><span>{detail.assignedToName ? "Equipe de operação" : "Aguardando triagem"}</span></article><article><small>PRIORIDADE</small><strong>{detail.reviewPriority === "attention" ? "Atenção" : "Padrão"}</strong><span>Critério operacional, sem score automático</span></article><article><small>CHECKLIST</small><strong>{detail.acceptedDocumentCount} de {detail.documentCount}</strong><span>Itens demonstrativos conferidos</span></article></section>{detail.decisionReason && <section className="operation-resolution"><span>{detail.status === "approved" ? "✓" : "!"}</span><div><small>DECISÃO REGISTRADA</small><strong>{detail.decisionReason}</strong><p>{detail.decidedAt ? formatDate(detail.decidedAt) : ""}</p></div></section>}<section className="verification-documents"><div><small>CHECKLIST DOCUMENTAL</small><span>Arquivos privados sintéticos, sem link público e ainda sem antivírus.</span></div>{documents.map((document) => <article key={document.id}><i className={document.status}>{document.status === "accepted" ? "✓" : document.status === "changes_requested" ? "!" : "…"}</i><div><strong>{document.label}</strong><span>{verificationDocumentStatusLabel[document.status]}{document.checkedByName ? ` · ${document.checkedByName}` : ""}</span>{document.note && <p>{document.note}</p>}{document.fileId && <div className="private-file-summary"><span>{document.fileName} · {document.fileSizeBytes ? `${Math.ceil(document.fileSizeBytes / 1024)} KB` : ""} · {document.fileVersionCount} versão(ões)</span><a href={`/api/v1/operation/verifications?fileId=${encodeURIComponent(document.fileId)}`} download>Baixar arquivo</a></div>}</div>{detail.status === "in_review" && <div className="verification-document-actions"><button className="secondary-action" disabled={submitting || note.trim().length < 10 || document.status === "accepted"} onClick={() => submit("document", "accepted", document.id)}>Aceitar</button><button className="danger-action" disabled={submitting || note.trim().length < 10 || document.status === "changes_requested"} onClick={() => submit("document", "changes_requested", document.id)}>Corrigir</button></div>}</article>)}</section><section className="operation-timeline"><small>TRILHA DE AUDITORIA · {events.length} EVENTO(S)</small>{events.map((event) => <article key={event.id}><i>{event.eventType === "document_uploaded" ? "↑" : event.eventType === "document_reviewed" ? "D" : event.eventType === "submitted" ? "+" : "→"}</i><div><header><strong>{eventTitle[event.eventType]}</strong><small>{formatDate(event.createdAt)}</small></header><p>{event.note}</p><span>{event.actorName}</span></div></article>)}</section>{detail.status !== "approved" && detail.status !== "changes_requested" && <section className="operation-case-actions"><div><small>JUSTIFICATIVA OBRIGATÓRIA</small><strong>O texto será anexado à ação e ao histórico da verificação.</strong></div><label><span>Nota da revisão</span><textarea minLength={10} maxLength={900} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Descreva objetivamente a conferência ou a correção necessária." /><small>{note.trim().length}/900</small></label><div className="operation-action-buttons">{detail.status === "submitted" && <button className="primary-action" disabled={submitting || note.trim().length < 10} onClick={() => submit("status", "in_review")}>Iniciar análise</button>}{detail.status === "in_review" && <><button className="danger-action" disabled={submitting || note.trim().length < 10 || !hasCorrection} onClick={() => submit("status", "changes_requested")}>Solicitar correção</button><button className="primary-action" disabled={submitting || note.trim().length < 10 || detail.attentionDocumentCount > 0} onClick={() => submit("status", "approved")}>{submitting ? "Salvando..." : "Aprovar perfil"}</button></>}</div></section>}</div></>}</section></div>;
}

const supportCaseStatusLabel: Record<SupportCase["status"], string> = {
  open: "Aberto",
  in_review: "Em análise",
  resolved: "Resolvido",
};

function OperationRow({ item, wait, onOpen }: { item: SupportCase; wait: string; onOpen: () => void }) {
  const status = item.status === "open" && item.priority === "high" ? "Prioridade" : supportCaseStatusLabel[item.status];
  return <article className={`table-row ${item.status === "resolved" ? "resolved" : ""}`}><span data-label="Tipo"><strong>Cancelamento</strong></span><span data-label="Referência">{item.publicCode}</span><span data-label="Motivo">{item.requestCode} · {item.description}</span><span data-label="Espera">{item.status === "resolved" ? "finalizado" : wait}</span><span data-label="Status"><button onClick={onOpen} className={`operation-open-button ${item.priority === "high" && item.status !== "resolved" ? "urgent" : ""}`}><span>{status}</span><i>→</i></button></span></article>;
}

function OperationCaseDialog({ caseId, onClose, onChanged, notify }: { caseId: string; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/operation/cases?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { case?: SupportCaseDetail; error?: string; message?: string };
        if (!response.ok || !payload.case) throw new Error(payload.error ?? payload.message ?? "Não foi possível abrir o chamado.");
        return payload.case;
      })
      .then(setDetail)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível abrir o chamado.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [caseId, notify, reload]);

  const submit = async (action: "note" | "status", status?: "in_review" | "resolved") => {
    if (note.trim().length < 10) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/operation/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, action, status, note: note.trim() }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar o chamado.");
      setNote("");
      setReload((value) => value + 1);
      onChanged();
      notify(action === "note" ? "Nota interna registrada." : status === "resolved" ? "Chamado resolvido com auditoria." : "Chamado assumido pela operação.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar o chamado.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  return <div className="dialog-backdrop" role="presentation"><section className="request-dialog operation-case-dialog" role="dialog" aria-modal="true" aria-labelledby="operation-case-title"><button className="dialog-close" onClick={onClose} aria-label="Fechar chamado">×</button>{loading && !detail && <div className="data-state"><strong>Carregando chamado...</strong></div>}{!loading && !detail && <div className="data-state"><strong>Chamado indisponível.</strong><button className="secondary-action" onClick={onClose}>Fechar</button></div>}{detail && <><header className="operation-case-header"><span>{detail.priority === "high" ? "!" : "CS"}</span><div><p className="dialog-kicker">{detail.publicCode} · {detail.requestCode}</p><h2 id="operation-case-title">{detail.title}</h2><p>{detail.requestTitle}</p></div><strong className={`status-pill ${detail.status === "resolved" ? "success" : detail.priority === "high" ? "warning" : "neutral"}`}>{supportCaseStatusLabel[detail.status]}</strong></header><div className="operation-case-body"><section className="operation-case-facts"><article><small>ABERTO POR</small><strong>{detail.openedByName}</strong><span>{detail.openedByRole === "customer" ? "Cliente" : "Profissional"}</span></article><article><small>RESPONSÁVEL</small><strong>{detail.assignedToName ?? "Não atribuído"}</strong><span>{detail.assignedToName ? "Equipe de operação" : "Aguardando análise"}</span></article><article><small>PRIORIDADE</small><strong>{detail.priority === "high" ? "Alta" : "Normal"}</strong><span>{detail.priorStatus === "in_progress" ? "Serviço interrompido" : "Antes do início"}</span></article></section><section className="operation-case-description"><small>RELATO ORIGINAL</small><p>{detail.description}</p></section>{detail.resolution && <section className="operation-resolution"><span>✓</span><div><small>RESOLUÇÃO REGISTRADA</small><strong>{detail.resolution}</strong><p>{detail.resolvedAt ? formatDate(detail.resolvedAt) : ""}</p></div></section>}<section className="operation-timeline"><small>LINHA DO TEMPO · {detail.events.length} EVENTO(S)</small>{detail.events.map((event) => <article key={event.id}><i>{event.eventType === "note" ? "N" : event.eventType === "opened" ? "+" : "→"}</i><div><header><strong>{event.eventType === "opened" ? "Chamado aberto" : event.eventType === "note" ? "Nota interna" : `${event.fromStatus ? supportCaseStatusLabel[event.fromStatus] : ""} → ${event.toStatus ? supportCaseStatusLabel[event.toStatus] : ""}`}</strong><small>{formatDate(event.createdAt)}</small></header><p>{event.note}</p><span>{event.actorName}</span></div></article>)}</section>{detail.status !== "resolved" && <section className="operation-case-actions"><div><small>REGISTRO OPERACIONAL</small><strong>Justifique cada ação para manter a trilha completa.</strong></div><label><span>Nota ou justificativa</span><textarea minLength={10} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Descreva a análise, contato realizado ou solução adotada." /><small>{note.trim().length}/1000</small></label><div className="operation-action-buttons"><button className="secondary-action" disabled={submitting || note.trim().length < 10} onClick={() => submit("note")}>Adicionar nota</button>{detail.status === "open" && <button className="primary-action" disabled={submitting || note.trim().length < 10} onClick={() => submit("status", "in_review")}>Assumir análise</button>}<button className="danger-action" disabled={submitting || note.trim().length < 10} onClick={() => submit("status", "resolved")}>{submitting ? "Salvando..." : "Resolver chamado"}</button></div></section>}</div></>}</section></div>;
}

function ActivityView({ role, notify }: { role: Role; notify: (message: string) => void }) {
  if (role === "cliente" || role === "prestador") return <BookingActivityView role={role} notify={notify} />;
  if (role === "parceiro") return <PartnerActivityView notify={notify} />;
  return <OperationActivityView notify={notify} />;
}

const bookingStatusLabel: Record<BookingStatus, string> = {
  scheduled: "Agendado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const cancellationReasonLabel: Record<CancellationReason, string> = {
  schedule_change: "Mudança de horário",
  no_longer_needed: "Serviço não é mais necessário",
  participant_unavailable: "Participante indisponível",
  safety_concern: "Questão de segurança",
  other: "Outro motivo",
};

const scheduleDayLabel: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

function brazilScheduleInput(dayOffset: number, hour: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + dayOffset * 86_400_000));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${String(hour).padStart(2, "0")}:00`;
}

function brazilScheduleIso(value: string) {
  return new Date(`${value}:00-03:00`).toISOString();
}

function ProviderSchedulePanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<ProviderScheduleData | null>(null);
  const [weekly, setWeekly] = useState<ProviderScheduleData["weekly"]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [cancellingBlockId, setCancellingBlockId] = useState("");
  const [blockStart, setBlockStart] = useState(() => brazilScheduleInput(1, 12));
  const [blockEnd, setBlockEnd] = useState(() => brazilScheduleInput(1, 13));
  const [blockReason, setBlockReason] = useState("Compromisso pessoal");
  const [refresh, setRefresh] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/provider/schedule", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as ProviderScheduleData & { error?: string; message?: string };
        if (!response.ok || !payload.settings) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar sua agenda.");
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setWeekly(payload.weekly);
        setLoadedAt(Date.now());
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar sua agenda.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const updateDay = (dayOfWeek: number, patch: Partial<ProviderScheduleData["weekly"][number]>) => {
    setWeekly((current) => current.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day));
  };

  const saveWeekly = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/v1/provider/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update_weekly", weekly }),
      });
      const payload = await response.json() as ProviderScheduleData & { error?: string; message?: string };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível salvar a jornada semanal.");
      }
      setData(payload);
      setWeekly(payload.weekly);
      notify(`Agenda semanal atualizada na versão ${payload.settings.version}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível salvar a jornada semanal.");
    } finally {
      setSaving(false);
    }
  };

  const createBlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blockReason.trim().length < 5 || !blockStart || !blockEnd) return;
    setBlocking(true);
    try {
      const response = await fetch("/api/v1/provider/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_block",
          startsAt: brazilScheduleIso(blockStart),
          endsAt: brazilScheduleIso(blockEnd),
          reason: blockReason.trim(),
        }),
      });
      const payload = await response.json() as { block?: { id: string }; error?: string; message?: string };
      if (!response.ok || !payload.block) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível bloquear o período.");
      }
      notify("Período bloqueado. Novos clientes não verão esse horário.");
      setRefresh((value) => value + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível bloquear o período.");
    } finally {
      setBlocking(false);
    }
  };

  const cancelBlock = async (blockId: string) => {
    setCancellingBlockId(blockId);
    try {
      const response = await fetch("/api/v1/provider/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel_block", blockId }),
      });
      const payload = await response.json() as { status?: string; error?: string; message?: string };
      if (!response.ok || payload.status !== "cancelled") {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível liberar o período.");
      }
      notify("Período liberado novamente para agendamentos.");
      setRefresh((value) => value + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível liberar o período.");
    } finally {
      setCancellingBlockId("");
    }
  };

  if (loading && !data) return <section className="dashboard-section provider-schedule-panel"><div className="data-state">Montando sua agenda operacional...</div></section>;
  if (!data) return <section className="dashboard-section provider-schedule-panel"><div className="data-state"><strong>Agenda indisponível.</strong><button className="secondary-action" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Tentar novamente</button></div></section>;
  const dirty = JSON.stringify(weekly) !== JSON.stringify(data.weekly);
  const activeBlocks = data.blocks.filter((block) => block.status === "active" && new Date(block.endsAt).getTime() >= loadedAt);
  const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: data.settings.timeZone,
  }).format(new Date(value));

  return (
    <section className="dashboard-section provider-schedule-panel">
      <header>
        <div><small>AGENDA OPERACIONAL · V{data.settings.version}</small><h2>Defina quando você pode ser contratado.</h2><p>Os horários exibidos ao cliente já descontam serviços confirmados e períodos bloqueados.</p></div>
        <div className="schedule-summary"><span><strong>{data.metrics.openDayCount}</strong><small>dias ativos</small></span><span><strong>{data.metrics.upcomingAppointmentCount}</strong><small>agendados</small></span><span><strong>{data.metrics.activeBlockCount}</strong><small>bloqueios</small></span></div>
      </header>
      <div className="provider-schedule-grid">
        <section className="weekly-schedule-editor">
          <header><div><small>JORNADA SEMANAL</small><strong>Horário padrão de atendimento</strong></div><button className="primary-action" disabled={saving || !dirty} onClick={saveWeekly}>{saving ? "Salvando..." : dirty ? "Salvar jornada" : "Jornada atualizada"}</button></header>
          <div>{weekly.map((day) => <article key={day.dayOfWeek} className={day.active ? "active" : "inactive"}><label><input type="checkbox" checked={day.active} onChange={(event) => updateDay(day.dayOfWeek, { active: event.target.checked })} /><span>{scheduleDayLabel[day.dayOfWeek]}</span></label><div><input aria-label={`Início de ${scheduleDayLabel[day.dayOfWeek]}`} type="time" step="1800" value={day.startTime} disabled={!day.active} onChange={(event) => updateDay(day.dayOfWeek, { startTime: event.target.value })} /><i>até</i><input aria-label={`Fim de ${scheduleDayLabel[day.dayOfWeek]}`} type="time" step="1800" value={day.endTime} disabled={!day.active} onChange={(event) => updateDay(day.dayOfWeek, { endTime: event.target.value })} /></div><em>{day.active ? `${day.startTime}–${day.endTime}` : "Fechado"}</em></article>)}</div>
        </section>
        <section className="schedule-block-manager">
          <header><small>BLOQUEAR PERÍODO</small><strong>Reserve compromissos sem cancelar sua jornada.</strong></header>
          <form onSubmit={createBlock}>
            <label><span>Início</span><input type="datetime-local" step="1800" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} required /></label>
            <label><span>Fim</span><input type="datetime-local" step="1800" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} required /></label>
            <label><span>Motivo interno</span><input minLength={5} maxLength={160} value={blockReason} onChange={(event) => setBlockReason(event.target.value)} required /></label>
            <button className="secondary-action" disabled={blocking || blockReason.trim().length < 5}>{blocking ? "Bloqueando..." : "Bloquear horário"}</button>
          </form>
          <div className="schedule-block-list"><small>PRÓXIMOS BLOQUEIOS</small>{activeBlocks.length === 0 && <p>Nenhum período bloqueado.</p>}{activeBlocks.map((block) => <article key={block.id}><span>×</span><div><strong>{block.reason}</strong><small>{dateTime(block.startsAt)} → {dateTime(block.endsAt)}</small></div><button disabled={cancellingBlockId === block.id} onClick={() => cancelBlock(block.id)}>{cancellingBlockId === block.id ? "Liberando..." : "Liberar"}</button></article>)}</div>
        </section>
      </div>
      <div className="schedule-appointments">
        <header><small>PRÓXIMOS SERVIÇOS CONFIRMADOS</small><span>Conflitos são bloqueados no servidor</span></header>
        {data.appointments.length === 0 && <p>Nenhum serviço futuro confirmado.</p>}
        {data.appointments.map((appointment) => <article key={appointment.id}><span>{appointment.requestCode}</span><div><strong>{appointment.requestTitle}</strong><small>{appointment.customerName}</small></div><time>{dateTime(appointment.scheduledFor)} → {dateTime(appointment.scheduledUntil)}</time></article>)}
      </div>
      <footer><span>✓</span><p><strong>Proteção de agenda ativa:</strong> duas confirmações simultâneas não ocupam o mesmo período, e um bloqueio nunca pode encobrir um serviço já confirmado.</p></footer>
    </section>
  );
}

function BookingActivityView({ role, notify }: { role: "cliente" | "prestador"; notify: (message: string) => void }) {
  const [persistedRequests, setPersistedRequests] = useState<PersistedRequest[]>([]);
  const [bookings, setBookings] = useState<PersistedBooking[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PersistedRequest | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const bookingRequest = fetch(`/api/v1/bookings?role=${role}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar a agenda.");
        return response.json() as Promise<{ bookings: PersistedBooking[] }>;
      });
    const serviceRequest = role === "cliente"
      ? fetch("/api/v1/service-requests", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error("Falha ao carregar pedidos.");
          return response.json() as Promise<{ requests: PersistedRequest[] }>;
        })
      : Promise.resolve({ requests: [] as PersistedRequest[] });
    Promise.all([bookingRequest, serviceRequest])
      .then(([bookingPayload, requestPayload]) => {
        setBookings(bookingPayload.bookings);
        setPersistedRequests(requestPayload.requests);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar a agenda.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh, role]);

  const pendingRequests = role === "cliente"
    ? persistedRequests.filter((request) => request.status === "open" || request.status === "proposals_received")
    : [];
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredBookings = bookings.filter((booking) => !normalizedQuery || [booking.requestCode, booking.requestTitle, booking.customerName, booking.providerName, booking.categoryName].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery)));
  const filteredRequests = pendingRequests.filter((request) => !normalizedQuery || [request.publicCode, request.title, request.categoryName].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery)));
  const activeCount = bookings.filter((booking) => booking.status === "scheduled" || booking.status === "in_progress").length;
  const completedCount = bookings.filter((booking) => booking.status === "completed").length;
  const completionRate = bookings.length > 0 ? Math.round((completedCount / bookings.length) * 100) : 0;
  const nextBooking = bookings.find((booking) => booking.status === "scheduled" && booking.scheduledFor);
  const dateTime = (value: string | null) => value
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value))
    : "A combinar";

  return (
    <>
      <DashboardHeader role={role} eyebrow={role === "cliente" ? "ACOMPANHAMENTO DE SERVIÇOS" : "MINHA AGENDA"} title={role === "cliente" ? "Do aceite à conclusão, tudo no mesmo lugar." : "Organize a execução e mantenha o cliente informado."}><button className="button button-small" onClick={() => setRefresh((value) => value + 1)}>Atualizar agenda</button></DashboardHeader>
      <div className="activity-overview"><article><small>Serviços ativos</small><strong>{activeCount}</strong><span>Agenda persistente</span></article><article><small>Taxa de conclusão</small><strong>{completionRate}%</strong><span>{completedCount} concluído(s)</span></article><article><small>{role === "cliente" ? "Pedidos aguardando" : "Próximo serviço"}</small><strong>{role === "cliente" ? pendingRequests.length : nextBooking?.scheduledFor ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(nextBooking.scheduledFor)) : "—"}</strong><span>{role === "cliente" ? "Propostas em aberto" : "Horário local"}</span></article></div>
      {role === "prestador" && <ProviderSchedulePanel notify={notify} />}
      <section className="dashboard-section records-card">
        <div className="records-toolbar"><label><span>Buscar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, serviço ou pessoa" /></label><span className="records-counter">{filteredBookings.length + filteredRequests.length} registro(s)</span></div>
        <div className="record-list">
          {loading && <div className="data-state">Carregando agenda...</div>}
          {!loading && filteredBookings.length === 0 && filteredRequests.length === 0 && <div className="data-state"><strong>Nenhum registro encontrado.</strong><span>Novos agendamentos aparecerão aqui após o aceite da proposta.</span></div>}
          {filteredBookings.map((booking) => <button key={booking.id} onClick={() => setSelectedBookingId(booking.id)}><span className="record-code">{booking.requestCode}</span><span><strong>{booking.requestTitle}</strong><small>{role === "cliente" ? booking.providerName : booking.customerName} · {dateTime(booking.scheduledFor)}</small></span><span className={`status-pill ${booking.status === "cancelled" ? "warning" : "success"}`}>{bookingStatusLabel[booking.status]}</span><i>→</i></button>)}
          {filteredRequests.map((request) => <button key={request.id} onClick={() => setSelectedRequest(request)}><span className="record-code">{request.publicCode}</span><span><strong>{request.title}</strong><small>{request.proposalCount > 0 ? `${request.proposalCount} proposta(s)` : request.preferredWindow}</small></span><span className="status-pill success">{request.status === "proposals_received" ? "Propostas" : "Aberto"}</span><i>→</i></button>)}
        </div>
      </section>
      {selectedRequest && <ProposalComparisonDialog request={selectedRequest} onClose={() => setSelectedRequest(null)} onChanged={() => setRefresh((value) => value + 1)} notify={notify} />}
      {selectedBookingId && <BookingDetailDialog role={role} bookingId={selectedBookingId} onClose={() => setSelectedBookingId("")} onChanged={() => setRefresh((value) => value + 1)} notify={notify} />}
    </>
  );
}

function PartnerActivityView({ notify }: { notify: (message: string) => void }) {
  const { data, loading, refresh } = usePartnerDashboard(notify);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const referrals = data?.referrals.filter((referral) => !normalizedQuery || [referral.publicCode, referral.professionalName, referral.email, referral.categoryName, referralStatusLabel[referral.status]].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery))) ?? [];
  const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

  return <><DashboardHeader role="parceiro" eyebrow="REDE DE PROFISSIONAIS" title="Acompanhe cada indicação com transparência."><button className="button button-small" onClick={refresh}>Atualizar rede</button></DashboardHeader><div className="activity-overview"><article><small>Afiliados ativos</small><strong>{loading ? "…" : data?.metrics.activeCount ?? 0}</strong><span>Vínculo confirmado</span></article><article><small>Taxa de ativação</small><strong>{loading ? "…" : `${data?.metrics.activationRate ?? 0}%`}</strong><span>Sem estimativa financeira</span></article><article><small>Em andamento</small><strong>{loading ? "…" : data?.metrics.pendingCount ?? 0}</strong><span>Convites, análises e onboarding</span></article></div><section className="dashboard-section records-card"><div className="records-toolbar"><label><span>Buscar na rede</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, profissional, e-mail ou categoria" /></label><span className="records-counter">{referrals.length} indicação(ões)</span></div><div className="record-list">{loading && <div className="data-state">Carregando rede...</div>}{!loading && referrals.length === 0 && <div className="data-state"><strong>Nenhuma indicação encontrada.</strong><span>Ajuste a busca ou registre um novo profissional.</span></div>}{referrals.map((referral) => <button key={referral.id} onClick={() => notify(`${referral.publicCode}: origem ${referral.source} em ${date(referral.createdAt)}.`)}><span className="record-code">{referral.publicCode}</span><span><strong>{referral.professionalName} · {referral.categoryName}</strong><small>{referral.email} · registrado em {date(referral.createdAt)}</small></span><span className={`status-pill ${referralStatusTone(referral.status)}`}>{referralStatusLabel[referral.status]}</span><i>→</i></button>)}</div></section></>;
}

const operationActivityCategoryLabel: Record<OperationActivityCategory, string> = {
  marketplace: "Marketplace",
  service: "Atendimento",
  operation: "Operação",
  growth: "Parceiros",
  finance: "Financeiro",
};

const operationActivityRoleLabel: Record<OperationActivityEvent["actorRole"], string> = {
  customer: "Cliente",
  provider: "Profissional",
  partner: "Parceiro",
  operation: "Operação",
};

function OperationActivityView({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<OperationActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | OperationActivityCategory>("all");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/operation/activity", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as OperationActivityData & { error?: string; message?: string };
        if (!response.ok || !payload.events || !payload.metrics) throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar a atividade.");
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar a atividade.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const events = data?.events.filter((event) => {
    if (category !== "all" && event.category !== category) return false;
    if (!normalizedQuery) return true;
    return [event.reference, event.title, event.detail, event.actorName, event.action]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
  }) ?? [];
  const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

  return (
    <>
      <DashboardHeader role="operacao" eyebrow="AUDITORIA OPERACIONAL" title="Cada ação crítica, com origem e contexto."><button className="button button-small" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Atualizar histórico</button></DashboardHeader>
      <div className="activity-overview"><article><small>Eventos registrados</small><strong>{loading ? "…" : data?.metrics.totalCount ?? 0}</strong><span>{data?.metrics.lastThirtyDaysCount ?? 0} nos últimos 30 dias</span></article><article><small>Ações críticas</small><strong>{loading ? "…" : data?.metrics.criticalCount ?? 0}</strong><span>Decisões e mudanças nos últimos 30 dias</span></article><article><small>Atores identificados</small><strong>{loading ? "…" : data?.metrics.actorCount ?? 0}</strong><span>Nenhum evento anônimo</span></article></div>
      <section className="dashboard-section records-card">
        <div className="records-toolbar operation-activity-toolbar">
          <label><span>Buscar no histórico</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Referência, ação ou responsável" /></label>
          <label><span>Área</span><select aria-label="Filtrar atividade por área" value={category} onChange={(event) => setCategory(event.target.value as "all" | OperationActivityCategory)}><option value="all">Todas as áreas</option>{Object.entries(operationActivityCategoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <span className="records-counter">{events.length} evento(s)</span>
        </div>
        <div className="record-list operation-activity-list">
          {loading && <div className="data-state">Carregando histórico auditável...</div>}
          {!loading && events.length === 0 && <div className="data-state"><strong>Nenhum evento encontrado.</strong><span>Ajuste a busca ou o filtro de área.</span></div>}
          {!loading && events.map((event) => <button key={event.id} onClick={() => notify(`${event.reference}: ${event.detail}`)}><span className="record-code">{event.reference}</span><span><strong>{event.title}</strong><small>{event.actorName} · {operationActivityRoleLabel[event.actorRole]} · {dateTime(event.createdAt)}</small></span><span className={`status-pill ${event.category === "operation" || event.category === "finance" ? "warning" : event.category === "growth" ? "neutral" : "success"}`}>{operationActivityCategoryLabel[event.category]}</span><i>→</i></button>)}
        </div>
      </section>
    </>
  );
}

function BookingDetailDialog({ role, bookingId, onClose, onChanged, notify }: { role: "cliente" | "prestador"; bookingId: string; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [booking, setBooking] = useState<PersistedBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [showCancellation, setShowCancellation] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancellationReason>("schedule_change");
  const [cancelDetails, setCancelDetails] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/bookings?role=${role}&bookingId=${encodeURIComponent(bookingId)}`, { cache: "no-store" });
    const payload = await response.json() as { booking?: PersistedBooking; error?: string; message?: string };
    if (!response.ok || !payload.booking) throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar o agendamento.");
    return payload.booking;
  }, [bookingId, role]);

  useEffect(() => {
    closeRef.current?.focus();
    void load().then(setBooking).catch((error: unknown) => notify(error instanceof Error ? error.message : "Não foi possível carregar o agendamento.")).finally(() => setLoading(false));
  }, [load, notify]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const transition = async (status: "in_progress" | "completed") => {
    setUpdating(true);
    try {
      const response = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, bookingId, status }),
      });
      const payload = await response.json() as { booking?: PersistedBooking | string; error?: string; message?: string };
      if (!response.ok || typeof payload.booking !== "object") throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar o serviço.");
      setBooking(await load());
      onChanged();
      notify(status === "in_progress" ? "Serviço iniciado. O cliente já pode acompanhar a atualização." : "Serviço marcado como concluído e registrado no histórico.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar o serviço.");
    } finally {
      setUpdating(false);
    }
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (comment.trim().length < 10) return;
    setReviewing(true);
    try {
      const response = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, bookingId, rating, comment: comment.trim() }),
      });
      const payload = await response.json() as { review?: ServiceReview | string; error?: string; message?: string };
      if (!response.ok || typeof payload.review !== "object") throw new Error(payload.error ?? payload.message ?? "Não foi possível registrar a avaliação.");
      setBooking(await load());
      setComment("");
      onChanged();
      notify("Avaliação registrada. Obrigado por compartilhar sua experiência.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível registrar a avaliação.");
    } finally {
      setReviewing(false);
    }
  };

  const submitCancellation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cancelDetails.trim().length < 10) return;
    setCancelling(true);
    try {
      const response = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, bookingId, reasonCode: cancelReason, details: cancelDetails.trim() }),
      });
      const payload = await response.json() as { case?: { publicCode: string }; error?: string; message?: string };
      if (!response.ok || !payload.case) throw new Error(payload.error ?? payload.message ?? "Não foi possível registrar o cancelamento.");
      setBooking(await load());
      setShowCancellation(false);
      setCancelDetails("");
      onChanged();
      notify(`Cancelamento registrado. Ocorrência ${payload.case.publicCode} aberta para acompanhamento.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível registrar o cancelamento.");
    } finally {
      setCancelling(false);
    }
  };

  const dateTime = (value: string | null) => value
    ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value))
    : "A combinar";
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const stageIndex = booking ? ["scheduled", "in_progress", "completed"].indexOf(booking.status) : 0;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog booking-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        {loading && <div className="data-state">Carregando agendamento...</div>}
        {booking && <>
          <header className="booking-dialog-header"><span>{booking.categoryIcon}</span><div><p className="dialog-kicker">{booking.requestCode} · {booking.categoryName}</p><h2 id="booking-title">{booking.requestTitle}</h2><p>{booking.neighborhood}, {booking.city} · {role === "cliente" ? booking.providerName : booking.customerName}</p></div><strong className={`status-pill ${booking.status === "cancelled" ? "warning" : "success"}`}>{bookingStatusLabel[booking.status]}</strong></header>
          <div className="booking-dialog-body">
            {booking.status === "cancelled" ? <div className="booking-cancelled-stage"><span>!</span><div><small>ATENDIMENTO INTERROMPIDO</small><strong>O cancelamento foi registrado e encaminhado para a equipe Max.</strong></div></div> : <div className="booking-stage" aria-label={`Etapa atual: ${bookingStatusLabel[booking.status]}`}>
              {["Agendado", "Em andamento", "Concluído"].map((label, index) => <div key={label} className={`${index <= stageIndex ? "active" : ""} ${index < stageIndex ? "complete" : ""}`}><i>{index < stageIndex ? "✓" : index + 1}</i><span>{label}</span></div>)}
            </div>}
            <div className="booking-facts"><article><small>DATA E HORÁRIO</small><strong>{dateTime(booking.scheduledFor)}</strong></article><article><small>VALOR DA PROPOSTA</small><strong>{currency.format(booking.amountCents / 100)}</strong></article><article><small>DURAÇÃO PREVISTA</small><strong>{booking.estimatedMinutes < 120 ? `${booking.estimatedMinutes} min` : `${Math.round(booking.estimatedMinutes / 60)} h`}</strong></article></div>
            <section className="booking-description"><small>DETALHES DO PEDIDO</small><p>{booking.requestDescription}</p></section>
            <section className="booking-history"><small>HISTÓRICO DO SERVIÇO</small>{booking.history?.map((event) => <article key={event.id}><i>✓</i><div><strong>{bookingStatusLabel[event.status]}</strong><p>{event.note}</p><small>{event.actorName} · {dateTime(event.createdAt)}</small></div></article>)}</section>
            {booking.status === "cancelled" && booking.cancellationReason && <section className="cancellation-summary"><div><small>MOTIVO DO CANCELAMENTO</small><strong>{cancellationReasonLabel[booking.cancellationReason]}</strong></div><p>{booking.cancellationDetails}</p><footer><span>Solicitado por {booking.cancelledByName}</span><strong>{booking.supportCaseCode} · {booking.supportCaseStatus === "open" ? "Ocorrência aberta" : booking.supportCaseStatus}</strong></footer></section>}
            {booking.reviews && booking.reviews.length > 0 && <section className="service-reviews"><div><small>AVALIAÇÕES DA EXPERIÊNCIA</small><strong>{booking.averageRating ? `${booking.averageRating} de 5` : "Avaliado"}</strong></div>{booking.reviews.map((review) => <article key={review.id}><header><span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><small>{review.authorName} · {review.authorRole === "customer" ? "Cliente" : "Profissional"}</small></header><p>{review.comment}</p></article>)}</section>}
            {booking.status === "completed" && !booking.hasActorReview && <form className="review-form" onSubmit={submitReview}><div><small>AVALIE ESTA EXPERIÊNCIA</small><strong>{role === "cliente" ? `Como foi o serviço de ${booking.providerName}?` : `Como foi atender ${booking.customerName}?`}</strong></div><div className="review-stars" role="radiogroup" aria-label="Nota da avaliação">{[1,2,3,4,5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} estrela${value > 1 ? "s" : ""}`} className={value <= rating ? "active" : ""} onClick={() => setRating(value)}>★</button>)}</div><label><span>Comentário</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} minLength={10} maxLength={500} placeholder="Conte com clareza o que deu certo na experiência." /></label><button className="primary-action" type="submit" disabled={reviewing || comment.trim().length < 10}>{reviewing ? "Registrando..." : "Enviar avaliação"}</button></form>}
            {showCancellation && (booking.status === "scheduled" || booking.status === "in_progress") && <form className="cancellation-form" onSubmit={submitCancellation}><div><small>CANCELAMENTO COM MOTIVO</small><strong>Confirme os dados antes de interromper o atendimento.</strong></div><label><span>Motivo</span><select value={cancelReason} onChange={(event) => setCancelReason(event.target.value as CancellationReason)}>{Object.entries(cancellationReasonLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Explique o ocorrido</span><textarea minLength={10} maxLength={500} value={cancelDetails} onChange={(event) => setCancelDetails(event.target.value)} placeholder="Informe detalhes para a equipe Max acompanhar o caso." /></label><div><button type="button" className="secondary-action" onClick={() => setShowCancellation(false)}>Voltar</button><button type="submit" className="danger-action" disabled={cancelling || cancelDetails.trim().length < 10}>{cancelling ? "Registrando..." : "Confirmar cancelamento"}</button></div></form>}
            <div className="booking-next-action"><div><small>PRÓXIMA AÇÃO</small><strong>{booking.status === "scheduled" ? role === "prestador" ? "Inicie quando chegar ao local." : "Aguarde o profissional iniciar o serviço." : booking.status === "in_progress" ? role === "prestador" ? "Conclua após finalizar o atendimento." : "O profissional está executando o serviço." : booking.status === "cancelled" ? `Acompanhe a ocorrência ${booking.supportCaseCode ?? "aberta"}.` : booking.hasActorReview ? "Sua avaliação está registrada e vinculada ao serviço." : "Avalie a experiência para concluir esta jornada."}</strong></div><div className="booking-action-buttons">{role === "prestador" && booking.status === "scheduled" && <button className="primary-action" disabled={updating} onClick={() => transition("in_progress")}>{updating ? "Atualizando..." : "Iniciar serviço"}</button>}{role === "prestador" && booking.status === "in_progress" && <button className="primary-action" disabled={updating} onClick={() => transition("completed")}>{updating ? "Atualizando..." : "Marcar como concluído"}</button>}{(booking.status === "scheduled" || booking.status === "in_progress") && !showCancellation && <button className="danger-action" onClick={() => setShowCancellation(true)}>Solicitar cancelamento</button>}</div></div>
          </div>
        </>}
      </section>
    </div>
  );
}

function ProposalComparisonDialog({ request, onClose, onChanged, notify }: { request: PersistedRequest; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [proposals, setProposals] = useState<PersistedProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState("");
  const [slotProposalId, setSlotProposalId] = useState("");
  const [slotData, setSlotData] = useState<ProposalSlotsData | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  const fetchProposals = useCallback(async () => {
    const response = await fetch(`/api/v1/customer/proposals?requestId=${encodeURIComponent(request.id)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar as propostas.");
    const payload = await response.json() as { proposals: PersistedProposal[] };
    return payload.proposals;
  }, [request.id]);

  useEffect(() => {
    closeRef.current?.focus();
    void fetchProposals()
      .then(setProposals)
      .catch((error: unknown) => notify(error instanceof Error ? error.message : "Não foi possível carregar as propostas."))
      .finally(() => setLoading(false));
  }, [fetchProposals, notify]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const chooseSchedule = async (proposal: PersistedProposal) => {
    if (slotProposalId === proposal.id) {
      setSlotProposalId("");
      setSlotData(null);
      setSelectedSlot("");
      return;
    }
    setSlotProposalId(proposal.id);
    setSlotData(null);
    setSelectedSlot("");
    setSlotsLoading(true);
    try {
      const response = await fetch(`/api/v1/customer/proposal-slots?proposalId=${encodeURIComponent(proposal.id)}`, { cache: "no-store" });
      const payload = await response.json() as ProposalSlotsData & { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível consultar os horários.");
      setSlotData(payload);
      setSelectedSlot(payload.slots[0]?.startsAt ?? "");
    } catch (error) {
      setSlotProposalId("");
      notify(error instanceof Error ? error.message : "Não foi possível consultar os horários.");
    } finally {
      setSlotsLoading(false);
    }
  };

  const accept = async (proposal: PersistedProposal, scheduledFor: string) => {
    setAccepting(proposal.id);
    try {
      const response = await fetch("/api/v1/customer/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, scheduledFor }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível aceitar a proposta.");
      const formatted = new Intl.DateTimeFormat("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(scheduledFor));
      notify(`Proposta de ${proposal.providerName} aceita para ${formatted}.`);
      setSlotProposalId("");
      setSlotData(null);
      setSelectedSlot("");
      setProposals(await fetchProposals());
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível aceitar a proposta.");
    } finally {
      setAccepting("");
    }
  };

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const hasAccepted = proposals.some((proposal) => proposal.status === "accepted") || request.status === "booked";
  const groupedSlots = (slotData?.slots ?? []).reduce<Array<{ dateKey: string; label: string; slots: ProposalSlotsData["slots"] }>>((groups, slot) => {
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(slot.startsAt));
    const existing = groups.find((group) => group.dateKey === dateKey);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.push({
        dateKey,
        label: new Intl.DateTimeFormat("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "short",
          timeZone: "America/Sao_Paulo",
        }).format(new Date(slot.startsAt)),
        slots: [slot],
      });
    }
    return groups;
  }, []);
  const slotTime = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="comparison-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        <header className="comparison-header"><p className="dialog-kicker">{request.publicCode} · {request.categoryName}</p><h2 id="comparison-title">Compare as propostas</h2><p>{request.title} · {request.neighborhood}, {request.city}</p></header>
        <div className="comparison-list">
          {loading && <div className="data-state">Carregando propostas...</div>}
          {!loading && proposals.length === 0 && <div className="data-state"><strong>Aguardando propostas.</strong><span>Você receberá uma notificação quando um profissional responder.</span></div>}
          {proposals.map((proposal) => (
            <article key={proposal.id} className={`comparison-card ${proposal.status === "accepted" ? "accepted" : proposal.status === "declined" ? "declined" : ""}`}>
              <div className="comparison-provider">
                <span className="mini-avatar">{proposal.providerName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                <div><strong>{proposal.providerName}</strong><small>{proposal.providerCode} · ★ 4,9</small></div>
                <span className={`status-pill ${proposal.status === "accepted" ? "success" : proposal.status === "declined" ? "warning" : "success"}`}>{proposal.status === "accepted" ? "✓ Escolhida" : proposal.status === "declined" ? "Não escolhida" : "Nova proposta"}</span>
              </div>
              <p>{proposal.message}</p>
              <div className="comparison-offer">
                <div><small>VALOR</small><strong>{currency.format(proposal.amountCents / 100)}</strong></div>
                <div><small>PREVISÃO</small><strong>{proposal.estimatedMinutes < 120 ? `${proposal.estimatedMinutes} min` : `${Math.round(proposal.estimatedMinutes / 60)} h`}</strong></div>
                <button
                  className="primary-action"
                  disabled={hasAccepted || accepting === proposal.id || proposal.status !== "sent"}
                  onClick={() => void chooseSchedule(proposal)}
                >
                  {proposal.status === "accepted" ? "Proposta aceita" : slotProposalId === proposal.id ? "Ocultar horários" : "Ver horários"}
                </button>
              </div>
              {slotProposalId === proposal.id && (
                <section className="proposal-slot-picker" aria-label={`Horários de ${proposal.providerName}`}>
                  <header>
                    <div><small>ESCOLHA O MELHOR HORÁRIO</small><strong>Disponibilidade confirmada em tempo real</strong></div>
                    <span>{proposal.estimatedMinutes} min</span>
                  </header>
                  {slotsLoading && <div className="data-state">Consultando a agenda...</div>}
                  {!slotsLoading && slotData && groupedSlots.length === 0 && (
                    <div className="data-state"><strong>Agenda preenchida nos próximos dias.</strong><span>Compare outra proposta ou tente novamente mais tarde.</span></div>
                  )}
                  {!slotsLoading && groupedSlots.length > 0 && (
                    <div className="proposal-slot-days">
                      {groupedSlots.slice(0, 7).map((group) => (
                        <div className="proposal-slot-day" key={group.dateKey}>
                          <strong>{group.label}</strong>
                          <div className="proposal-slot-grid">
                            {group.slots.map((slot) => (
                              <button
                                key={slot.startsAt}
                                type="button"
                                className={selectedSlot === slot.startsAt ? "selected" : ""}
                                aria-pressed={selectedSlot === slot.startsAt}
                                onClick={() => setSelectedSlot(slot.startsAt)}
                              >
                                {slotTime(slot.startsAt)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!slotsLoading && slotData && slotData.slots.length > 0 && (
                    <footer className="proposal-slot-confirm">
                      <span>O horário fica reservado ao confirmar.</span>
                      <button className="primary-action" disabled={!selectedSlot || accepting === proposal.id} onClick={() => void accept(proposal, selectedSlot)}>
                        {accepting === proposal.id ? "Confirmando..." : "Confirmar profissional e horário"}
                      </button>
                    </footer>
                  )}
                </section>
              )}
            </article>
          ))}
        </div>
        <footer className="comparison-footer"><span>✓ Você só confirma depois de comparar.</span><button className="secondary-action" onClick={onClose}>Fechar</button></footer>
      </section>
    </div>
  );
}

function MessagesView({ role, notify }: { role: Role; notify: (message: string) => void }) {
  if (role === "parceiro" || role === "operacao") return <PartnerSupportCenter role={role} notify={notify} />;
  return <PersistentMessages role={role} notify={notify} />;
}

function PersistentMessages({ role, notify }: { role: "cliente" | "prestador"; notify: (message: string) => void }) {
  const [conversations, setConversations] = useState<PersistedConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<PersistedMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messageCursorRef = useRef<string | null>(null);
  const readCursorRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let syncing = false;
    let active = true;
    const syncConversations = async () => {
      if (syncing || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        const response = await fetch(`/api/v1/messaging?role=${role}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível carregar as conversas.");
        const payload = await response.json() as { conversations: PersistedConversation[] };
        if (!active) return;
        setConversations(payload.conversations);
        setSelectedId((current) => payload.conversations.some((item) => item.id === current) ? current : payload.conversations[0]?.id ?? "");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          notify(error instanceof Error ? error.message : "Não foi possível carregar as conversas.");
        }
      } finally {
        syncing = false;
        if (active) setLoading(false);
      }
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncConversations();
    };
    void syncConversations();
    const timer = window.setInterval(syncWhenVisible, 12_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [notify, role]);

  useEffect(() => {
    messageCursorRef.current = null;
    readCursorRef.current = null;
    if (!selectedId) {
      const clearMessages = window.setTimeout(() => setMessages([]), 0);
      return () => window.clearTimeout(clearMessages);
    }
    const controller = new AbortController();
    let syncing = false;
    let active = true;
    const acknowledgeRead = async (messageId: string) => {
      if (readCursorRef.current === messageId) return;
      readCursorRef.current = messageId;
      try {
        const response = await fetch("/api/v1/messaging", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role, conversationId: selectedId, messageId }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Não foi possível confirmar a leitura.");
        if (!active) return;
        setConversations((current) => current.map((conversation) => conversation.id === selectedId
          ? { ...conversation, unreadCount: 0 }
          : conversation));
        window.dispatchEvent(new Event("max-service:messages-read"));
      } catch {
        if (readCursorRef.current === messageId) readCursorRef.current = null;
      }
    };
    const syncMessages = async (initial = false) => {
      if (syncing || (!initial && document.visibilityState !== "visible")) return;
      const after = initial ? null : messageCursorRef.current;
      if (!initial && !after) return;
      syncing = true;
      try {
        const params = new URLSearchParams({ role, conversationId: selectedId });
        if (after) params.set("after", after);
        const response = await fetch(`/api/v1/messaging?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível sincronizar as mensagens.");
        const payload = await response.json() as { messages: PersistedMessage[]; cursor: string | null };
        if (!active) return;
        if (initial) {
          setMessages(payload.messages);
        } else if (payload.messages.length > 0) {
          setMessages((current) => {
            const known = new Set(current.map((message) => message.id));
            return [...current, ...payload.messages.filter((message) => !known.has(message.id))];
          });
          const latest = payload.messages.at(-1);
          if (latest) {
            setConversations((current) => current.map((conversation) => conversation.id === selectedId
              ? { ...conversation, latestMessage: latest.body, latestMessageAt: latest.createdAt }
              : conversation));
          }
        }
        messageCursorRef.current = payload.cursor ?? messageCursorRef.current;
        if (payload.cursor && document.visibilityState === "visible") void acknowledgeRead(payload.cursor);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError") && initial) {
          notify(error instanceof Error ? error.message : "Não foi possível carregar as mensagens.");
        }
      } finally {
        syncing = false;
      }
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncMessages(false);
    };
    void syncMessages(true);
    const timer = window.setInterval(syncWhenVisible, 4_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [notify, role, selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const selected = conversations.find((item) => item.id === selectedId);
  const actorId = demoUiActorIds[role];
  const time = (value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const schedule = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));

  const selectAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png"]).has(file.type)) {
      notify("Envie somente uma imagem JPEG ou PNG.");
      return;
    }
    if (file.size < 8 || file.size > 524_288) {
      notify("A imagem deve ter no máximo 512 KB.");
      return;
    }
    setAttachmentFile(file);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !attachmentFile) || !selectedId) return;
    setSending(true);
    try {
      const requestBody = attachmentFile ? new FormData() : null;
      if (requestBody && attachmentFile) {
        requestBody.set("role", role);
        requestBody.set("conversationId", selectedId);
        requestBody.set("body", body);
        requestBody.set("file", attachmentFile);
      }
      const response = await fetch("/api/v1/messaging", attachmentFile ? {
        method: "POST",
        body: requestBody,
      } : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, conversationId: selectedId, body }),
      });
      const payload = await response.json() as { message?: PersistedMessage | string; error?: string };
      if (!response.ok || typeof payload.message !== "object") throw new Error(payload.error ?? (typeof payload.message === "string" ? payload.message : "Não foi possível enviar a mensagem."));
      const sent = { ...payload.message, senderName: roleDetails[role].name };
      setMessages((current) => [...current, sent]);
      setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...conversation, latestMessage: sent.body, latestMessageAt: sent.createdAt } : conversation));
      setDraft("");
      setAttachmentFile(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <DashboardHeader role={role} eyebrow="CENTRAL DE MENSAGENS" title="Conversa organizada, serviço tranquilo." />
      <section className="messages-layout">
        <aside className="conversation-list">
          <div className="conversation-search"><input aria-label="Buscar conversa" placeholder="Buscar conversa" /></div>
          {loading && <div className="data-state">Carregando conversas...</div>}
          {!loading && conversations.length === 0 && <div className="data-state"><strong>Nenhuma conversa ainda.</strong><span>Ela será criada quando uma proposta for aceita.</span></div>}
          {conversations.map((conversation) => <button key={conversation.id} onClick={() => { setSelectedId(conversation.id); setAttachmentFile(null); }} className={conversation.id === selectedId ? "active" : ""}><span className="mini-avatar">{conversation.otherName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><span><strong>{conversation.otherName}</strong><small>{conversation.requestCode} · {conversation.requestTitle}</small><em>{conversation.latestMessage ?? "Conversa liberada"}</em></span>{conversation.unreadCount > 0 ? <i aria-label={`${conversation.unreadCount} mensagem${conversation.unreadCount === 1 ? "" : "s"} não lida${conversation.unreadCount === 1 ? "" : "s"}`}>{conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}</i> : conversation.bookingStatus === "scheduled" && <i aria-label="Serviço agendado">✓</i>}</button>)}
        </aside>
        {selected ? <div className="chat-panel"><header><span className="mini-avatar">{selected.otherName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><div><strong>{selected.otherName}</strong><small><span className="live-dot" /> Sincronização automática · {selected.requestCode} · {selected.scheduledFor ? `Agendado: ${schedule(selected.scheduledFor)}` : selected.bookingStatus}</small></div><button aria-label="Mais opções">•••</button></header><div className="chat-messages"><div className="chat-date">CONVERSA DO SERVIÇO</div>{messages.length === 0 && <div className="data-state"><strong>Conversa liberada.</strong><span>Envie a primeira mensagem para combinar os detalhes.</span></div>}{messages.map((message) => <article key={message.id} className={`message ${message.senderId === actorId ? "sent" : "received"}`}><span>{message.body}</span>{message.attachment && <a className="message-attachment" href={`/api/v1/messaging?role=${role}&attachmentId=${encodeURIComponent(message.attachment.id)}`} target="_blank" rel="noreferrer"><Image src={`/api/v1/messaging?role=${role}&attachmentId=${encodeURIComponent(message.attachment.id)}`} alt={message.attachment.fileName} width={360} height={220} unoptimized /><em>Imagem privada · abrir em tamanho original</em></a>}<small>{time(message.createdAt)}{message.senderId === actorId ? " · ✓" : ""}</small></article>)}<div ref={endRef} /></div><form className="message-composer" onSubmit={send}>{attachmentFile && <div className="message-attachment-draft"><span>▣ {attachmentFile.name} · {(attachmentFile.size / 1024).toFixed(0)} KB</span><button type="button" onClick={() => setAttachmentFile(null)} aria-label="Remover imagem selecionada">×</button></div>}<label className="message-attachment-button" title="Anexar imagem privada"><span>＋</span><input type="file" accept="image/jpeg,image/png" onChange={selectAttachment} aria-label="Anexar imagem privada" /></label><input aria-label="Mensagem" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder={attachmentFile ? "Adicione uma legenda (opcional)..." : "Escreva uma mensagem..."} /><button type="submit" disabled={sending || (!draft.trim() && !attachmentFile)}>{sending ? "Enviando..." : "Enviar"}</button></form></div> : <div className="chat-panel empty-chat"><div className="data-state"><strong>Selecione uma conversa.</strong><span>As mensagens ficam vinculadas ao serviço contratado.</span></div></div>}
      </section>
    </>
  );
}

const partnerSupportTopicLabel: Record<PartnerSupportTopic, string> = {
  referral: "Indicação de profissional",
  account: "Conta do parceiro",
  finance_sandbox: "Comissão sandbox",
  other: "Outro assunto",
};

const partnerSupportStatusLabel: Record<PartnerSupportStatus, string> = {
  open: "Aberto",
  in_review: "Em análise",
  resolved: "Resolvido",
};

function PartnerSupportCreateDialog({
  referrals,
  onClose,
  onCreated,
  notify,
}: {
  referrals: PartnerSupportReferral[];
  onClose: () => void;
  onCreated: (caseId: string) => void;
  notify: (message: string) => void;
}) {
  const [topic, setTopic] = useState<PartnerSupportTopic>("referral");
  const [referralId, setReferralId] = useState(referrals[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (subject.trim().length < 5 || body.trim().length < 10 || (topic === "referral" && !referralId)) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/partner/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          topic,
          subject: subject.trim(),
          body: body.trim(),
          referralId: topic === "referral" ? referralId : undefined,
        }),
      });
      const payload = await response.json() as { case?: { id: string; publicCode: string }; error?: string; message?: string };
      if (!response.ok || !payload.case) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível abrir a solicitação.");
      }
      notify(`${payload.case.publicCode} aberto e enviado à equipe Max.`);
      onCreated(payload.case.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível abrir a solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog partner-support-create" role="dialog" aria-modal="true" aria-labelledby="partner-support-create-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar nova solicitação">×</button>
        <header><p className="dialog-kicker">CANAL PROTEGIDO · ATENDIMENTO MAX</p><h2 id="partner-support-create-title">Como podemos ajudar?</h2><p>Abra uma solicitação com contexto. A conversa e cada mudança de estado ficarão registradas.</p></header>
        <form onSubmit={submit}>
          <label className="field"><span>Assunto do atendimento</span><select value={topic} onChange={(event) => setTopic(event.target.value as PartnerSupportTopic)}>{Object.entries(partnerSupportTopicLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {topic === "referral" && <label className="field"><span>Indicação relacionada</span><select value={referralId} onChange={(event) => setReferralId(event.target.value)} required><option value="">Selecione uma indicação</option>{referrals.map((referral) => <option key={referral.id} value={referral.id}>{referral.publicCode} · {referral.professionalName} · {referral.categoryName}</option>)}</select><small>Somente indicações pertencentes à sua rede aparecem aqui.</small></label>}
          <label className="field"><span>Título</span><input value={subject} minLength={5} maxLength={120} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: Dúvida sobre análise de indicação" required /></label>
          <label className="field"><span>Mensagem inicial</span><textarea value={body} minLength={10} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Conte o que aconteceu e qual ajuda você precisa." required /><small>{body.trim().length}/2000</small></label>
          <footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button type="submit" className="primary-action" disabled={submitting || subject.trim().length < 5 || body.trim().length < 10 || (topic === "referral" && !referralId)}>{submitting ? "Enviando..." : "Abrir solicitação"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function PartnerSupportCenter({ role, notify }: { role: "parceiro" | "operacao"; notify: (message: string) => void }) {
  const endpoint = role === "parceiro" ? "/api/v1/partner/support" : "/api/v1/operation/support";
  const [data, setData] = useState<PartnerSupportData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<PartnerSupportCaseDetail | null>(null);
  const [query, setQuery] = useState("");
  const [caseFilter, setCaseFilter] = useState<"all" | PartnerSupportStatus | "sla">("all");
  const [draft, setDraft] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [triagePriority, setTriagePriority] = useState<"normal" | "high">("normal");
  const [triageAssigneeId, setTriageAssigneeId] = useState("");
  const [triageNote, setTriageNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as PartnerSupportData & { error?: string; message?: string };
        if (!response.ok || !payload.cases || !payload.metrics) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar os atendimentos.");
        }
        return payload;
      })
      .then((payload) => {
        setDetailLoading(true);
        setAttachmentFile(null);
        setData(payload);
        setSelectedId((current) => payload.cases.some((item) => item.id === current) ? current : payload.cases[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar os atendimentos.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [endpoint, notify, refresh]);

  useEffect(() => {
    if (!selectedId) {
      const clearDetail = window.setTimeout(() => setDetail(null), 0);
      return () => window.clearTimeout(clearDetail);
    }
    const controller = new AbortController();
    fetch(`${endpoint}?caseId=${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { case?: PartnerSupportCaseDetail; error?: string; message?: string };
        if (!response.ok || !payload.case) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível abrir o atendimento.");
        }
        return payload.case;
      })
      .then((supportCase) => {
        setDetail(supportCase);
        setTriagePriority(supportCase.priority);
        setTriageAssigneeId(supportCase.assignedToId ?? data?.operators[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível abrir o atendimento.");
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [data?.operators, endpoint, notify, refresh, selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [detail?.events]);

  const refreshCenter = () => {
    setLoading(true);
    setDetailLoading(true);
    setRefresh((value) => value + 1);
  };
  const filteredCases = (data?.cases ?? []).filter((item) => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    const matchesQuery = !needle || [item.publicCode, item.subject, item.partnerName, item.referralCode, item.referralName]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle));
    const matchesFilter = caseFilter === "all"
      || item.status === caseFilter
      || (caseFilter === "sla" && item.status !== "resolved"
        && (item.firstResponseSla === "breached" || item.resolutionSla === "breached"));
    return matchesQuery && matchesFilter;
  });
  const timestamp = (value: string | null) => value
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
    : "Sem interação";
  const slaState = (item: PartnerSupportCase) => item.firstResponseSla === "breached" || item.resolutionSla === "breached"
    ? "breached"
    : item.resolutionSla === "met"
      ? "met"
      : "pending";
  const slaLabel = (item: PartnerSupportCase) => {
    const state = slaState(item);
    if (state === "breached") return "Prazo excedido";
    if (state === "met") return "Concluído no prazo";
    return item.firstRespondedAt
      ? `Resolver até ${timestamp(item.resolutionDueAt)}`
      : `Responder até ${timestamp(item.firstResponseDueAt)}`;
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedId || (!attachmentFile && body.length < 3) || (body.length > 0 && body.length < 3)) return;
    setSubmitting(true);
    try {
      let response: Response;
      if (attachmentFile) {
        const form = new FormData();
        form.set("caseId", selectedId);
        form.set("body", body);
        form.set("file", attachmentFile);
        response = await fetch(endpoint, { method: "POST", body: form });
      } else {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "message", caseId: selectedId, body }),
        });
      }
      const payload = await response.json() as { event?: PartnerSupportEvent; error?: string; message?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error ?? payload.message ?? "Não foi possível enviar a mensagem.");
      setDraft("");
      setAttachmentFile(null);
      refreshCenter();
      notify(attachmentFile ? "Mensagem e anexo privado registrados no atendimento." : "Mensagem registrada no atendimento.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!new Set(["application/pdf", "image/jpeg", "image/png"]).has(file.type)) {
      notify("Envie somente PDF, JPEG ou PNG.");
      return;
    }
    if (file.size < 4 || file.size > 2_097_152) {
      notify("O arquivo deve ter entre 4 bytes e 2 MB.");
      return;
    }
    setAttachmentFile(file);
  };

  const transition = async (status: "in_review" | "resolved") => {
    if (!selectedId || transitionNote.trim().length < 10) return;
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "transition", caseId: selectedId, status, note: transitionNote.trim() }),
      });
      const payload = await response.json() as { case?: PartnerSupportCase; error?: string; message?: string };
      if (!response.ok || !payload.case) throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar o atendimento.");
      setTransitionNote("");
      refreshCenter();
      notify(status === "resolved" ? "Atendimento resolvido com histórico preservado." : "Atendimento assumido pela Operação.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar o atendimento.");
    } finally {
      setSubmitting(false);
    }
  };

  const triage = async () => {
    if (!selectedId || !triageAssigneeId || triageNote.trim().length < 10) return;
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "triage",
          caseId: selectedId,
          priority: triagePriority,
          assigneeId: triageAssigneeId,
          note: triageNote.trim(),
        }),
      });
      const payload = await response.json() as { case?: PartnerSupportCase; error?: string; message?: string };
      if (!response.ok || !payload.case) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar a triagem.");
      }
      setTriageNote("");
      refreshCenter();
      notify("Triagem registrada com responsável, prioridade e novos prazos.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar a triagem.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DashboardHeader role={role} eyebrow={role === "operacao" ? "CENTRAL DE ATENDIMENTOS" : "SUPORTE DA REDE"} title={role === "operacao" ? "Cada solicitação, contexto e decisão em um só lugar." : "Fale com a Max sem perder o contexto da sua rede."}>
        {role === "parceiro" && <button className="button button-small" onClick={() => setCreateOpen(true)}>+ Novo atendimento</button>}
      </DashboardHeader>
      <section className="partner-support-metrics">
        <article><small>ABERTOS</small><strong>{loading ? "…" : data?.metrics.openCount ?? 0}</strong><span>Aguardando triagem</span></article>
        <article><small>{role === "operacao" ? "SEM RESPONSÁVEL" : "EM ANÁLISE"}</small><strong>{loading ? "…" : role === "operacao" ? data?.metrics.unassignedCount ?? 0 : data?.metrics.inReviewCount ?? 0}</strong><span>{role === "operacao" ? "Precisam de atribuição" : "Com a equipe Max"}</span></article>
        <article><small>{role === "operacao" ? "AGUARDANDO OPERAÇÃO" : "RESOLVIDOS"}</small><strong>{loading ? "…" : role === "operacao" ? data?.metrics.waitingOperationCount ?? 0 : data?.metrics.resolvedCount ?? 0}</strong><span>{role === "operacao" ? "Última mensagem do parceiro" : "Histórico disponível"}</span></article>
        <article className={(data?.metrics.slaBreachedCount ?? 0) > 0 ? "breached" : ""}><small>FORA DO PRAZO</small><strong>{loading ? "…" : data?.metrics.slaBreachedCount ?? 0}</strong><span>Política {data?.cases[0]?.slaPolicyVersion ?? "SUPPORT-SLA"}</span></article>
      </section>
      <section className="partner-support-center">
        <aside className="partner-support-list">
          <div className="partner-support-toolbar"><label><span>Buscar atendimento</span><input aria-label="Buscar atendimento" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role === "operacao" ? "Código, parceiro ou assunto" : "Código, assunto ou indicação"} /></label><label><span>Filtrar fila</span><select aria-label="Filtrar atendimentos" value={caseFilter} onChange={(event) => setCaseFilter(event.target.value as typeof caseFilter)}><option value="all">Todos</option><option value="open">Abertos</option><option value="in_review">Em análise</option><option value="resolved">Resolvidos</option><option value="sla">Prazo excedido</option></select></label></div>
          <div>
            {loading && <div className="data-state">Carregando atendimentos...</div>}
            {!loading && filteredCases.length === 0 && <div className="data-state"><strong>Nenhum atendimento encontrado.</strong><span>{role === "parceiro" ? "Abra uma solicitação para falar com a equipe Max." : "A fila está em dia."}</span></div>}
            {filteredCases.map((item) => <button key={item.id} className={item.id === selectedId ? "active" : ""} onClick={() => { setDetail(null); setDetailLoading(true); setAttachmentFile(null); setSelectedId(item.id); }}><header><strong>{item.publicCode}</strong><span className={`status-pill ${item.status === "resolved" ? "success" : item.status === "open" ? "warning" : "neutral"}`}>{partnerSupportStatusLabel[item.status]}</span></header><h3>{item.subject}</h3><p>{item.latestEventBody ?? partnerSupportTopicLabel[item.topic]}</p><div className={`support-sla-chip ${slaState(item)}`}>{slaLabel(item)}</div><footer><span>{role === "operacao" ? `${item.partnerName} · ${item.assignedToName ?? "sem responsável"}` : item.referralCode ?? partnerSupportTopicLabel[item.topic]}</span><time>{timestamp(item.latestEventAt ?? item.createdAt)}</time></footer></button>)}
          </div>
        </aside>
        <div className="partner-support-thread">
          {detailLoading && !detail && <div className="data-state"><strong>Abrindo atendimento...</strong></div>}
          {!detailLoading && !detail && <div className="data-state"><strong>Selecione um atendimento.</strong><span>A conversa e a trilha de estado aparecerão aqui.</span></div>}
          {detail && (
            <>
              <header>
                <div><small>{detail.publicCode} · {partnerSupportTopicLabel[detail.topic]}</small><h2>{detail.subject}</h2><p>{role === "operacao" ? `${detail.partnerName} · ${detail.partnerCode}` : "Equipe Max · canal protegido"}{detail.referralCode ? ` · ${detail.referralCode} · ${detail.referralName}` : ""}</p></div>
                <div className="support-header-badges"><span className={`priority-pill ${detail.priority}`}>{detail.priority === "high" ? "Prioridade alta" : "Prioridade normal"}</span><span className={`status-pill ${detail.status === "resolved" ? "success" : detail.status === "open" ? "warning" : "neutral"}`}>{partnerSupportStatusLabel[detail.status]}</span></div>
              </header>
              <section className="support-sla-overview">
                <article className={detail.firstResponseSla}><small>PRIMEIRA RESPOSTA</small><strong>{detail.firstRespondedAt ? timestamp(detail.firstRespondedAt) : detail.firstResponseSla === "breached" ? "Prazo excedido" : "Aguardando equipe"}</strong><span>Limite {timestamp(detail.firstResponseDueAt)}</span></article>
                <article className={detail.resolutionSla}><small>RESOLUÇÃO</small><strong>{detail.resolvedAt ? timestamp(detail.resolvedAt) : detail.resolutionSla === "breached" ? "Prazo excedido" : "Em andamento"}</strong><span>Limite {timestamp(detail.resolutionDueAt)}</span></article>
                <article><small>RESPONSÁVEL</small><strong>{detail.assignedToName ?? "Não atribuído"}</strong><span>{detail.slaPolicyVersion}</span></article>
              </section>
              <div className="partner-support-events">
                <div className="chat-date">HISTÓRICO IMUTÁVEL · {detail.eventCount} EVENTO(S)</div>
                {detail.events.map((event) => event.eventType !== "message"
                  ? <article key={event.id} className={`support-status-event ${event.eventType === "triage_changed" ? "triage" : ""}`}><span>{event.eventType === "triage_changed" ? "T" : "→"}</span><div><strong>{event.eventType === "triage_changed" ? "Triagem atualizada" : `${event.fromStatus ? partnerSupportStatusLabel[event.fromStatus] : ""} → ${event.toStatus ? partnerSupportStatusLabel[event.toStatus] : ""}`}</strong><p>{event.body}</p><small>{event.actorName} · {timestamp(event.createdAt)}</small></div></article>
                  : (
                    <article key={event.id} className={`support-message ${event.actorRole === (role === "parceiro" ? "partner" : "operation") ? "sent" : "received"}`}>
                      <strong>{event.actorName}</strong>
                      <p>{event.body}</p>
                      {event.attachment && (
                        <a
                          className="support-private-attachment"
                          href={`${endpoint}?attachmentId=${encodeURIComponent(event.attachment.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>{event.attachment.contentType === "application/pdf" ? "PDF" : "IMG"}</span>
                          <div>
                            <strong>{event.attachment.fileName}</strong>
                            <small>{Math.ceil(event.attachment.sizeBytes / 1024)} KB · arquivo privado</small>
                          </div>
                          <b>↗</b>
                        </a>
                      )}
                      <small>{timestamp(event.createdAt)}</small>
                    </article>
                  ))}
                {detail.resolution && <section className="support-resolution"><span>✓</span><div><small>RESOLUÇÃO REGISTRADA</small><strong>{detail.resolution}</strong><p>{detail.resolvedAt ? timestamp(detail.resolvedAt) : ""}</p></div></section>}
                <div ref={endRef} />
              </div>
              {detail.status !== "resolved" && (
                <>
                  <form className="support-composer" onSubmit={sendMessage}>
                    {attachmentFile && (
                      <div className="support-attachment-draft">
                        <span>{attachmentFile.type === "application/pdf" ? "PDF" : "IMG"} · {attachmentFile.name} · {Math.ceil(attachmentFile.size / 1024)} KB</span>
                        <button type="button" onClick={() => setAttachmentFile(null)} aria-label="Remover arquivo selecionado">×</button>
                      </div>
                    )}
                    <label className="support-attachment-button" title="Anexar arquivo privado">
                      <span>＋</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={selectAttachment}
                        aria-label="Anexar arquivo privado"
                      />
                    </label>
                    <label className="support-message-field">
                      <span>Responder no atendimento</span>
                      <textarea
                        aria-label="Mensagem do atendimento"
                        value={draft}
                        minLength={attachmentFile ? undefined : 3}
                        maxLength={2000}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={attachmentFile ? "Adicione uma legenda ou envie somente o arquivo..." : "Escreva uma mensagem objetiva..."}
                      />
                    </label>
                    <button
                      className="primary-action"
                      type="submit"
                      disabled={submitting || (!attachmentFile && draft.trim().length < 3) || (draft.trim().length > 0 && draft.trim().length < 3)}
                    >
                      {submitting ? "Enviando..." : attachmentFile ? "Enviar arquivo" : "Enviar mensagem"}
                    </button>
                    <small className="support-attachment-note">PDF, JPEG ou PNG sintético · até 2 MB · acesso auditado</small>
                  </form>
                  {role === "operacao" && (
                    <>
                      <section className="support-triage">
                        <div><small>TRIAGEM E SLA</small><strong>Defina quem assume e eleve a prioridade quando necessário.</strong></div>
                        <label><span>Prioridade</span><select value={triagePriority} onChange={(event) => setTriagePriority(event.target.value as "normal" | "high")}><option value="normal" disabled={detail.priority === "high"}>Normal · 4h / 48h</option><option value="high">Alta · 1h / 8h</option></select></label>
                        <label><span>Responsável</span><select value={triageAssigneeId} onChange={(event) => setTriageAssigneeId(event.target.value)}><option value="">Selecione</option>{data?.operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.displayName} · {operator.publicCode}</option>)}</select></label>
                        <label className="triage-note"><span>Justificativa da triagem</span><textarea minLength={10} maxLength={1000} value={triageNote} onChange={(event) => setTriageNote(event.target.value)} placeholder="Explique a atribuição ou a elevação da prioridade." /><small>{triageNote.trim().length}/1000</small></label>
                        <button className="secondary-action" disabled={submitting || !triageAssigneeId || triageNote.trim().length < 10 || (triagePriority === detail.priority && triageAssigneeId === detail.assignedToId)} onClick={triage}>{submitting ? "Salvando..." : "Registrar triagem"}</button>
                      </section>
                      <section className="support-transition"><div><small>DECISÃO OPERACIONAL</small><strong>{detail.status === "open" ? "Assuma a solicitação para iniciar a análise." : "Registre a solução antes de encerrar."}</strong></div><label><span>Justificativa</span><textarea minLength={10} maxLength={1000} value={transitionNote} onChange={(event) => setTransitionNote(event.target.value)} placeholder="Contextualize a decisão para a trilha de auditoria." /><small>{transitionNote.trim().length}/1000</small></label><button className={detail.status === "open" ? "secondary-action" : "danger-action"} disabled={submitting || transitionNote.trim().length < 10} onClick={() => transition(detail.status === "open" ? "in_review" : "resolved")}>{submitting ? "Salvando..." : detail.status === "open" ? "Assumir análise" : "Resolver atendimento"}</button></section>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
      {createOpen && <PartnerSupportCreateDialog referrals={data?.referrals ?? []} onClose={() => setCreateOpen(false)} onCreated={(caseId) => { setCreateOpen(false); setSelectedId(caseId); refreshCenter(); }} notify={notify} />}
    </>
  );
}

function MatchingOperationsPanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<OperationMatchingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/operation/matching", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as OperationMatchingData & { error?: string; message?: string };
        if (!response.ok || !payload.providers || !payload.metrics) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar a elegibilidade profissional.");
        }
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar a elegibilidade profissional.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  return (
    <section className="dashboard-section matching-operations">
      <header><div><small>SAÚDE DO MATCHING</small><h2>Elegibilidade dos profissionais</h2><p>Acompanhe quem pode receber pedidos e qual regra precisa ser resolvida antes da próxima oportunidade.</p></div><button className="secondary-action" disabled={loading} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Atualizar ↻</button></header>
      <div className="matching-operation-metrics">
        <article><strong>{loading ? "…" : data?.metrics.eligibleCount ?? 0}</strong><span>elegíveis agora</span></article>
        <article><strong>{loading ? "…" : data?.metrics.verificationBlockedCount ?? 0}</strong><span>aguardam verificação</span></article>
        <article><strong>{loading ? "…" : data?.metrics.coverageBlockedCount ?? 0}</strong><span>sem cobertura ativa</span></article>
        <article><strong>{loading ? "…" : data?.metrics.capacityBlockedCount ?? 0}</strong><span>no limite de capacidade</span></article>
      </div>
      <div className="matching-provider-list">
        {loading && <div className="data-state">Calculando regras de elegibilidade...</div>}
        {!loading && data?.providers.map((provider) => (
          <article key={provider.providerId} className={provider.eligible ? "eligible" : "blocked"}>
            <div className="matching-provider-identity"><span>{provider.categoryIcon ?? "?"}</span><div><strong>{provider.providerName}</strong><small>{provider.providerCode} · {provider.categoryName ?? "Sem categoria"}</small></div></div>
            <div className="matching-provider-capacity"><span><strong>{provider.activeProposalCount}/{provider.activeProposalLimit ?? "—"}</strong><small>propostas</small></span><span><strong>{provider.activeJobCount}/{provider.activeJobLimit ?? "—"}</strong><small>serviços</small></span><span><strong>{provider.activeRegionCount}</strong><small>regiões</small></span></div>
            <span className={`status-pill ${provider.eligible ? "success" : "warning"}`}>{provider.eligible ? "Elegível" : `${provider.blockers.length} bloqueio(s)`}</span>
            <div className="matching-provider-blockers">{provider.blockers.length > 0 ? provider.blockers.map((blocker) => <i key={blocker.code}>{blocker.label}</i>) : <i className="ready">{providerAvailabilityLabel[provider.availabilityStatus ?? "scheduled"]}{provider.acceptsUrgent ? " · aceita urgências" : ""}</i>}</div>
          </article>
        ))}
      </div>
      <footer><span>i</span><p><strong>Sem score oculto:</strong> o piloto usa apenas categoria declarada, região ativa, verificação humana, disponibilidade e limites definidos pelo próprio profissional.</p></footer>
    </section>
  );
}

function RegionManagementPanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<OperationRegionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<{
    target: "region" | "neighborhood";
    region: OperationRegion;
    neighborhood?: OperationRegionNeighborhood;
    action: RegionAction;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/operation/regions", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as OperationRegionData & { error?: string; message?: string };
        if (!response.ok || !payload.regions || !payload.metrics) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar a cobertura regional.");
        }
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar a cobertura regional.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const reload = () => {
    setLoading(true);
    setRefresh((value) => value + 1);
  };
  const formatted = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

  return (
    <section className="dashboard-section region-management">
      <header>
        <div><small>COBERTURA DO PILOTO</small><h2>Regiões e bairros elegíveis</h2><p>A oferta só recebe pedidos de áreas ativas vinculadas ao cadastro do profissional.</p></div>
        <button className="secondary-action" onClick={reload} disabled={loading}>Atualizar ↻</button>
      </header>
      <div className="region-metrics">
        <article><strong>{loading ? "…" : data?.metrics.activeCount ?? 0}</strong><span>regiões ativas</span></article>
        <article><strong>{loading ? "…" : data?.metrics.activeNeighborhoodCount ?? 0}</strong><span>bairros cobertos</span></article>
        <article><strong>{loading ? "…" : data?.metrics.plannedCount ?? 0}</strong><span>regiões planejadas</span></article>
      </div>
      <div className="region-list">
        {loading && <div className="data-state">Carregando cobertura regional...</div>}
        {!loading && data?.regions.map((region) => (
          <article key={region.id} className={region.active ? "" : "inactive"}>
            <header>
              <span className="region-mark">{region.code}</span>
              <div><strong>{region.name} · {region.state}</strong><small>Versão {region.version} · atualizado {formatted(region.updatedAt)}</small></div>
              <div className="region-facts"><span><strong>{region.openRequestCount}</strong> em andamento</span><span><strong>{region.providerCount}</strong> profissionais</span><span><strong>{region.activeNeighborhoodCount}</strong> bairros</span></div>
              <span className={`status-pill ${region.active ? "success" : "neutral"}`}>{region.active ? "Ativa" : "Planejada"}</span>
              <button className={region.active ? "danger-action" : "primary-action"} onClick={() => setPending({ target: "region", region, action: region.active ? "deactivate" : "activate" })}>{region.active ? "Desativar região" : "Ativar região"}</button>
            </header>
            <div className="region-neighborhoods">
              {region.neighborhoods.map((neighborhood) => (
                <div key={neighborhood.id} className={neighborhood.active ? "" : "inactive"}>
                  <span aria-hidden="true">{neighborhood.active ? "✓" : "○"}</span>
                  <div><strong>{neighborhood.name}</strong><small>{neighborhood.requestCount} pedido(s) · versão {neighborhood.version}</small></div>
                  <button onClick={() => setPending({ target: "neighborhood", region, neighborhood, action: neighborhood.active ? "deactivate" : "activate" })}>{neighborhood.active ? "Pausar" : "Ativar"}</button>
                </div>
              ))}
            </div>
            {region.latestEventAt && <footer><strong>Última decisão</strong><span>{region.latestEventNote}</span><small>{region.latestActorName} · {formatted(region.latestEventAt)}</small></footer>}
          </article>
        ))}
      </div>
      <footer className="region-guard"><span>i</span><p><strong>Proteção em duas camadas:</strong> a API deriva cidade e bairro dos identificadores ativos, e as políticas RLS impedem leitura e criação fora da cobertura. A última região e o último bairro ativos não podem ser desativados.</p></footer>
      {pending && <RegionActionDialog pending={pending} onClose={() => setPending(null)} onSaved={() => { setPending(null); reload(); }} notify={notify} />}
    </section>
  );
}

function RegionActionDialog({
  pending,
  onClose,
  onSaved,
  notify,
}: {
  pending: {
    target: "region" | "neighborhood";
    region: OperationRegion;
    neighborhood?: OperationRegionNeighborhood;
    action: RegionAction;
  };
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const subject = pending.neighborhood?.name ?? pending.region.name;
  const activating = pending.action === "activate";
  useEffect(() => { closeRef.current?.focus(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/v1/operation/regions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: pending.target,
          id: pending.neighborhood?.id ?? pending.region.id,
          action: pending.action,
          note: note.trim(),
        }),
      });
      const payload = await response.json() as { region?: OperationRegion; neighborhood?: OperationRegionNeighborhood; error?: string; message?: string };
      if (!response.ok || (!payload.region && !payload.neighborhood)) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar a cobertura.");
      }
      notify(`${subject}: cobertura ${activating ? "ativada" : "desativada"} e auditada.`);
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar a cobertura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog catalog-action-dialog" role="dialog" aria-modal="true" aria-labelledby="region-action-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        <header><span>⌖</span><div><p className="dialog-kicker">DECISÃO DE COBERTURA</p><h2 id="region-action-title">{activating ? "Ativar" : "Desativar"} {pending.target === "region" ? "região" : "bairro"}</h2><p>{subject} · {pending.region.state}</p></div></header>
        <form onSubmit={submit}>
          <p className="catalog-action-detail">{activating ? "A área passará a aceitar novos cadastros e pedidos elegíveis." : "Novos pedidos e oportunidades serão bloqueados; o histórico permanecerá disponível."}</p>
          <label className="field"><span>Justificativa da mudança</span><textarea rows={4} minLength={10} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explique o motivo e o impacto esperado..." required /><small>{note.length}/1000 caracteres · mínimo de 10</small></label>
          <footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || note.trim().length < 10}>{saving ? "Registrando..." : `${activating ? "Ativar" : "Desativar"} e auditar →`}</button></footer>
        </form>
      </section>
    </div>
  );
}

const catalogActionCopy: Record<CatalogAction, { title: string; verb: string; detail: string }> = {
  activate: { title: "Ativar categoria", verb: "Ativar", detail: "A categoria voltará a aparecer em novos pedidos e indicações." },
  deactivate: { title: "Desativar categoria", verb: "Desativar", detail: "A categoria deixará de aceitar novos pedidos e indicações; o histórico será preservado." },
  move_up: { title: "Subir no catálogo", verb: "Mover para cima", detail: "A categoria ganhará prioridade nas listas exibidas aos usuários." },
  move_down: { title: "Descer no catálogo", verb: "Mover para baixo", detail: "A categoria perderá uma posição nas listas exibidas aos usuários." },
};

function CatalogManagementPanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<OperationCatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<{ category: OperationCatalogCategory; action: CatalogAction } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/operation/categories", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as OperationCatalogData & { error?: string; message?: string };
        if (!response.ok || !payload.categories || !payload.metrics) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar o catálogo operacional.");
        }
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar o catálogo operacional.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const reload = () => {
    setLoading(true);
    setRefresh((value) => value + 1);
  };
  const formatted = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

  return (
    <section className="dashboard-section catalog-management">
      <header>
        <div><small>CATÁLOGO DO PILOTO</small><h2>Categorias de serviço</h2><p>Controle disponibilidade e prioridade sem apagar o histórico do marketplace.</p></div>
        <button className="secondary-action" onClick={reload} disabled={loading}>Atualizar ↻</button>
      </header>
      <div className="catalog-metrics">
        <article><strong>{loading ? "…" : data?.metrics.activeCount ?? 0}</strong><span>ativas para novos pedidos</span></article>
        <article><strong>{loading ? "…" : data?.metrics.inactiveCount ?? 0}</strong><span>temporariamente indisponíveis</span></article>
        <article><strong>{loading ? "…" : data?.metrics.totalCount ?? 0}</strong><span>categorias versionadas</span></article>
      </div>
      <div className="catalog-list">
        {loading && <div className="data-state">Carregando categorias...</div>}
        {!loading && data?.categories.map((category, index) => (
          <article key={category.id} className={category.active ? "" : "inactive"}>
            <span className="catalog-position">#{index + 1}</span>
            <span className="catalog-icon">{category.icon}</span>
            <div className="catalog-identity"><strong>{category.name}</strong><small>{category.slug} · atualizado {formatted(category.updatedAt)}</small></div>
            <div className="catalog-demand"><strong>{category.openRequestCount}</strong><small>em andamento</small></div>
            <div className="catalog-demand"><strong>{category.requestCount}</strong><small>pedidos</small></div>
            <div className="catalog-demand"><strong>{category.referralCount}</strong><small>indicações</small></div>
            <span className={`status-pill ${category.active ? "success" : "neutral"}`}>{category.active ? "Ativa" : "Inativa"}</span>
            <div className="catalog-actions">
              <button onClick={() => setPending({ category, action: "move_up" })} disabled={index === 0} aria-label={`Subir ${category.name}`}>↑</button>
              <button onClick={() => setPending({ category, action: "move_down" })} disabled={index === (data?.categories.length ?? 0) - 1} aria-label={`Descer ${category.name}`}>↓</button>
              <button className={category.active ? "danger" : "restore"} onClick={() => setPending({ category, action: category.active ? "deactivate" : "activate" })}>{category.active ? "Desativar" : "Ativar"}</button>
            </div>
            {category.latestEventAt && <div className="catalog-latest"><span>Última decisão</span><p>{category.latestEventNote}</p><small>{category.latestActorName} · {formatted(category.latestEventAt)} · {category.eventCount} evento(s)</small></div>}
          </article>
        ))}
      </div>
      <footer><span>i</span><p><strong>Proteção operacional:</strong> toda mudança exige justificativa, gera evento imutável e aparece na trilha de atividade. O banco impede a desativação da última categoria ativa.</p></footer>
      {pending && <CatalogActionDialog pending={pending} onClose={() => setPending(null)} onSaved={() => { setPending(null); reload(); }} notify={notify} />}
    </section>
  );
}

function CatalogActionDialog({
  pending,
  onClose,
  onSaved,
  notify,
}: {
  pending: { category: OperationCatalogCategory; action: CatalogAction };
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copy = catalogActionCopy[pending.action];
  useEffect(() => { closeRef.current?.focus(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/v1/operation/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categoryId: pending.category.id,
          action: pending.action,
          note: note.trim(),
        }),
      });
      const payload = await response.json() as { category?: OperationCatalogCategory; error?: string; message?: string };
      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar a categoria.");
      }
      notify(`${pending.category.name}: catálogo atualizado e auditado.`);
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar a categoria.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-dialog catalog-action-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-action-title">
        <button className="dialog-close" ref={closeRef} onClick={onClose} aria-label="Fechar">×</button>
        <header><span>{pending.category.icon}</span><div><p className="dialog-kicker">DECISÃO OPERACIONAL</p><h2 id="catalog-action-title">{copy.title}</h2><p>{pending.category.name} · posição {pending.category.sortOrder}</p></div></header>
        <form onSubmit={submit}>
          <p className="catalog-action-detail">{copy.detail}</p>
          <label className="field"><span>Justificativa da mudança</span><textarea rows={4} minLength={10} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explique o motivo e o impacto esperado..." required /><small>{note.length}/1000 caracteres · mínimo de 10</small></label>
          <footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || note.trim().length < 10}>{saving ? "Registrando..." : `${copy.verb} e auditar →`}</button></footer>
        </form>
      </section>
    </div>
  );
}

function CampaignManagementPanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [referenceTime, setReferenceTime] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<{ campaign: MarketingCampaign; action: CampaignAction } | null>(null);
  const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const formatted = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/operation/campaigns", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as CampaignData & { error?: string; message?: string };
        if (!response.ok || !payload.campaigns || !payload.metrics) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar as campanhas.");
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setReferenceTime(Date.now());
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar as campanhas.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  const reload = () => {
    setLoading(true);
    setRefresh((value) => value + 1);
  };
  const displayStatus = (campaign: MarketingCampaign) => {
    if (campaign.status === "paused") return { label: "Pausada", tone: "neutral" };
    if (new Date(campaign.endsAt).getTime() <= referenceTime) return { label: "Encerrada", tone: "neutral" };
    if (new Date(campaign.startsAt).getTime() > referenceTime) return { label: "Agendada", tone: "warning" };
    return { label: "No ar", tone: "success" };
  };

  return (
    <section className="dashboard-section catalog-management campaign-management">
      <header>
        <div><small>CRESCIMENTO CONTROLADO</small><h2>Campanhas e cupons</h2><p>Publique benefícios com validade, orçamento de usos e trilha de decisão.</p></div>
        <div className="campaign-header-actions"><button className="secondary-action" onClick={reload} disabled={loading}>Atualizar ↻</button><button className="primary-action" onClick={() => setCreating(true)}>Nova campanha +</button></div>
      </header>
      <div className="catalog-metrics campaign-metrics">
        <article><strong>{loading ? "…" : data?.metrics.liveCount ?? 0}</strong><span>campanhas no ar</span></article>
        <article><strong>{loading ? "…" : data?.metrics.redeemedCount ?? 0}</strong><span>cupons convertidos</span></article>
        <article><strong>{loading ? "…" : money(data?.metrics.discountGrantedCents ?? 0)}</strong><span>benefício concedido</span></article>
        <article><strong>{loading ? "…" : data?.metrics.inactiveCount ?? 0}</strong><span>pausadas ou encerradas</span></article>
      </div>
      <div className="campaign-list">
        {loading && <div className="data-state">Carregando campanhas...</div>}
        {!loading && data?.campaigns.length === 0 && <div className="data-state">Nenhuma campanha publicada.</div>}
        {!loading && data?.campaigns.map((campaign) => {
          const display = displayStatus(campaign);
          const benefit = campaign.discountType === "fixed"
            ? money(campaign.discountValue)
            : `${(campaign.discountValue / 100).toLocaleString("pt-BR")}% · teto ${money(campaign.maxDiscountCents ?? 0)}`;
          return (
            <article key={campaign.id}>
              <div className="campaign-code"><small>CUPOM</small><strong>{campaign.code}</strong><span>{campaign.name}</span></div>
              <div className="campaign-benefit"><small>BENEFÍCIO</small><strong>{benefit}</strong><span>mínimo {money(campaign.minAmountCents)}</span></div>
              <div className="campaign-progress"><div><small>USO</small><strong>{campaign.usedCount} / {campaign.totalRedemptionLimit}</strong></div><progress value={campaign.usedCount} max={campaign.totalRedemptionLimit} /><span>{campaign.redeemedCount} convertido(s) · até {campaign.perCustomerLimit} por cliente</span></div>
              <div className="campaign-period"><small>JANELA</small><strong>{formatted(campaign.startsAt)}</strong><span>até {formatted(campaign.endsAt)}</span></div>
              <span className={`status-pill ${display.tone}`}>{display.label}</span>
              <button className={campaign.status === "active" ? "danger-action" : "secondary-action"} disabled={display.label === "Encerrada"} onClick={() => setPending({ campaign, action: campaign.status === "active" ? "pause" : "activate" })}>{campaign.status === "active" ? "Pausar" : "Ativar"}</button>
              {campaign.latestEventAt && <div className="campaign-latest"><strong>Última decisão</strong><span>{campaign.latestEventNote} · {campaign.latestActorName} · {formatted(campaign.latestEventAt)}</span></div>}
            </article>
          );
        })}
      </div>
      <footer><span>i</span><p><strong>Cálculo confiável:</strong> o cupom é reservado no pedido e recalculado no servidor quando uma proposta é aceita. O valor congelado entra no sandbox financeiro e não pode ser alterado pelo navegador.</p></footer>
      {creating && <CampaignCreateDialog onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} notify={notify} />}
      {pending && <CampaignStatusDialog pending={pending} onClose={() => setPending(null)} onSaved={() => { setPending(null); reload(); }} notify={notify} />}
    </section>
  );
}

function CampaignCreateDialog({ onClose, onSaved, notify }: { onClose: () => void; onSaved: () => void; notify: (message: string) => void }) {
  const now = new Date();
  const later = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const localDate = (value: Date) => {
    const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return adjusted.toISOString().slice(0, 16);
  };
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<CampaignDiscountType>("fixed");
  const [discount, setDiscount] = useState("20");
  const [maxDiscount, setMaxDiscount] = useState("50");
  const [minimum, setMinimum] = useState("80");
  const [totalLimit, setTotalLimit] = useState("100");
  const [customerLimit, setCustomerLimit] = useState("1");
  const [startsAt, setStartsAt] = useState(localDate(now));
  const [endsAt, setEndsAt] = useState(localDate(later));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const discountValue = discountType === "fixed" ? Math.round(Number(discount) * 100) : Math.round(Number(discount) * 100);
      const response = await fetch("/api/v1/operation/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          campaign: {
            name: name.trim(),
            code: code.trim(),
            description: description.trim(),
            discountType,
            discountValue,
            maxDiscountCents: discountType === "percentage" ? Math.round(Number(maxDiscount) * 100) : undefined,
            minAmountCents: Math.round(Number(minimum) * 100),
            totalRedemptionLimit: Number(totalLimit),
            perCustomerLimit: Number(customerLimit),
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            note: note.trim(),
          },
        }),
      });
      const payload = await response.json() as { campaign?: MarketingCampaign; error?: string; message?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? payload.message ?? "Não foi possível criar a campanha.");
      notify(`Campanha ${payload.campaign.code} criada e auditada.`);
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível criar a campanha.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="request-dialog campaign-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-create-title"><button className="dialog-close" onClick={onClose} aria-label="Fechar">×</button><header><span>%</span><div><p className="dialog-kicker">NOVA REGRA PROMOCIONAL</p><h2 id="campaign-create-title">Crie uma campanha controlada.</h2><p>Todos os limites ficam congelados nos pedidos que usarem este código.</p></div></header><form onSubmit={submit}><div className="campaign-form-grid"><label className="field"><span>Nome da campanha</span><input minLength={3} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>Código</span><input minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="BEMVINDO20" required /></label><label className="field campaign-wide"><span>Descrição para o cliente</span><textarea minLength={10} maxLength={240} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} required /></label><label className="field"><span>Tipo de desconto</span><select value={discountType} onChange={(event) => setDiscountType(event.target.value as CampaignDiscountType)}><option value="fixed">Valor fixo (R$)</option><option value="percentage">Percentual (%)</option></select></label><label className="field"><span>{discountType === "fixed" ? "Desconto em reais" : "Percentual"}</span><input type="number" min="1" max={discountType === "fixed" ? "10000" : "50"} step={discountType === "fixed" ? ".01" : ".1"} value={discount} onChange={(event) => setDiscount(event.target.value)} required /></label>{discountType === "percentage" && <label className="field"><span>Teto em reais</span><input type="number" min="1" step=".01" value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} required /></label>}<label className="field"><span>Pedido mínimo (R$)</span><input type="number" min="1" step=".01" value={minimum} onChange={(event) => setMinimum(event.target.value)} required /></label><label className="field"><span>Limite total de usos</span><input type="number" min="1" max="100000" value={totalLimit} onChange={(event) => setTotalLimit(event.target.value)} required /></label><label className="field"><span>Limite por cliente</span><input type="number" min="1" max="100" value={customerLimit} onChange={(event) => setCustomerLimit(event.target.value)} required /></label><label className="field"><span>Início</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label><label className="field"><span>Fim</span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></label><label className="field campaign-wide"><span>Justificativa operacional</span><textarea minLength={10} maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Objetivo, público e aprovação desta campanha..." required /><small>{note.length}/1000 caracteres</small></label></div><footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || note.trim().length < 10}>{saving ? "Publicando..." : "Publicar e auditar →"}</button></footer></form></section></div>;
}

function CampaignStatusDialog({ pending, onClose, onSaved, notify }: { pending: { campaign: MarketingCampaign; action: CampaignAction }; onClose: () => void; onSaved: () => void; notify: (message: string) => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/v1/operation/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: pending.campaign.id, action: pending.action, note: note.trim() }) });
      const payload = await response.json() as { campaign?: MarketingCampaign; error?: string; message?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? payload.message ?? "Não foi possível atualizar a campanha.");
      notify(`${pending.campaign.code}: campanha ${pending.action === "pause" ? "pausada" : "ativada"} e auditada.`);
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar a campanha.");
    } finally {
      setSaving(false);
    }
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="request-dialog catalog-action-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-status-title"><button className="dialog-close" onClick={onClose} aria-label="Fechar">×</button><header><span>%</span><div><p className="dialog-kicker">DECISÃO PROMOCIONAL</p><h2 id="campaign-status-title">{pending.action === "pause" ? "Pausar campanha" : "Ativar campanha"}</h2><p>{pending.campaign.code} · {pending.campaign.name}</p></div></header><form onSubmit={submit}><p className="catalog-action-detail">{pending.action === "pause" ? "Novos pedidos deixarão de reservar este cupom; reservas já criadas serão preservadas." : "O cupom voltará a aceitar reservas dentro da janela e dos limites configurados."}</p><label className="field"><span>Justificativa da mudança</span><textarea minLength={10} maxLength={1000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} required /><small>{note.length}/1000 caracteres</small></label><footer className="dialog-footer"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving || note.trim().length < 10}>{saving ? "Registrando..." : `${pending.action === "pause" ? "Pausar" : "Ativar"} e auditar →`}</button></footer></form></section></div>;
}

function OnboardingPanel({ role, notify }: { role: "cliente" | "prestador"; notify: (message: string) => void }) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const formatted = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/onboarding", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as OnboardingData & { error?: string; message?: string };
        if (!response.ok || !payload.status || !payload.documents) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar o onboarding.");
        }
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar o onboarding.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh]);

  if (loading && !data) return <section className="dashboard-section onboarding-panel"><div className="data-state">Carregando perfil e documentos vigentes...</div></section>;
  if (!data) return <section className="dashboard-section onboarding-panel"><div className="data-state"><strong>Onboarding indisponível.</strong><button className="secondary-action" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Tentar novamente</button></div></section>;
  if (data.status === "pending" || editing) {
    return <OnboardingForm key={`${role}-${data.profile?.version ?? 0}`} role={role} data={data} notify={notify} onCancel={data.status === "completed" ? () => setEditing(false) : undefined} onSaved={(next) => { setData(next); setEditing(false); }} />;
  }

  const profile = data.profile;
  return (
    <section className="dashboard-section onboarding-panel completed">
      <header><div><small>IDENTIDADE E CONSENTIMENTOS</small><h2>Onboarding concluído</h2><p>Perfil persistente, documentos vinculados ao hash aceito e preferências separadas.</p></div><span className="status-pill success">Versão {profile?.version}</span></header>
      <div className="onboarding-summary">
        <article><small>ATUAÇÃO</small><strong>{profile?.city} · {profile?.state}</strong><span>{role === "cliente" ? profile?.neighborhood : `${profile?.serviceCategoryIcon} ${profile?.serviceCategoryName} · ${data.regions.filter((region) => region.selected).map((region) => region.name).join(", ")}`}</span></article>
        <article><small>TERMOS VIGENTES</small><strong>{data.documents.filter((document) => document.acceptedAt).length} de {data.documents.length}</strong><span>Todos os aceites preservados</span></article>
        <article><small>COMUNICAÇÃO</small><strong>{data.consents.marketingCommunications ? "Autorizada" : "Somente transacional"}</strong><span>Pesquisa {data.consents.productResearch ? "autorizada" : "não autorizada"}</span></article>
        <article><small>ÚLTIMA ATUALIZAÇÃO</small><strong>{profile ? formatted(profile.updatedAt) : "—"}</strong><span>{data.history.length} evento(s) no histórico</span></article>
      </div>
      <div className="onboarding-accepted-docs">{data.documents.map((document) => <span key={document.id}><i>✓</i><strong>{document.title}</strong><small>{document.version} · {document.approvalStatus === "draft" ? "minuta do piloto" : "aprovado"}</small></span>)}</div>
      <footer><div><strong>Dados reais continuam bloqueados.</strong><span>Estas minutas e o armazenamento local validam a jornada; publicação exige aprovação jurídica e provedor de identidade.</span></div><button className="secondary-action" onClick={() => setEditing(true)}>Atualizar cadastro</button></footer>
    </section>
  );
}

function OnboardingForm({
  role,
  data,
  notify,
  onCancel,
  onSaved,
}: {
  role: "cliente" | "prestador";
  data: OnboardingData;
  notify: (message: string) => void;
  onCancel?: () => void;
  onSaved: (data: OnboardingData) => void;
}) {
  const profile = data.profile;
  const [regionId, setRegionId] = useState(profile?.regionId ?? data.regions[0]?.id ?? "");
  const initialRegion = data.regions.find((region) => region.id === (profile?.regionId ?? data.regions[0]?.id));
  const [neighborhoodId, setNeighborhoodId] = useState(profile?.neighborhoodId ?? initialRegion?.neighborhoods[0]?.id ?? "");
  const [serviceRegionIds, setServiceRegionIds] = useState(() => new Set(
    data.regions.filter((region) => region.selected).map((region) => region.id).length > 0
      ? data.regions.filter((region) => region.selected).map((region) => region.id)
      : [profile?.regionId ?? data.regions[0]?.id ?? ""].filter(Boolean),
  ));
  const [serviceCategoryId, setServiceCategoryId] = useState(profile?.serviceCategoryId ?? data.categories[0]?.id ?? "");
  const [yearsExperience, setYearsExperience] = useState(String(profile?.yearsExperience ?? 5));
  const [serviceRadiusKm, setServiceRadiusKm] = useState(String(profile?.serviceRadiusKm ?? 25));
  const [bio, setBio] = useState(profile?.bio ?? "Profissional com experiência prática, atendimento transparente e foco em segurança.");
  const [availabilitySummary, setAvailabilitySummary] = useState(profile?.availabilitySummary ?? "Segunda a sábado, das 8h às 18h");
  const [availabilityStatus, setAvailabilityStatus] = useState<ProviderAvailabilityStatus>(data.matchingProfile?.availabilityStatus ?? "scheduled");
  const [acceptsUrgent, setAcceptsUrgent] = useState(data.matchingProfile?.acceptsUrgent ?? false);
  const [activeProposalLimit, setActiveProposalLimit] = useState(String(data.matchingProfile?.activeProposalLimit ?? 6));
  const [activeJobLimit, setActiveJobLimit] = useState(String(data.matchingProfile?.activeJobLimit ?? 3));
  const [acceptedDocumentIds, setAcceptedDocumentIds] = useState(() => new Set(data.documents.filter((document) => document.acceptedAt).map((document) => document.id)));
  const [marketingConsent, setMarketingConsent] = useState(data.consents.marketingCommunications);
  const [productResearchConsent, setProductResearchConsent] = useState(data.consents.productResearch);
  const [saving, setSaving] = useState(false);
  const isProvider = role === "prestador";
  const selectedRegion = data.regions.find((region) => region.id === regionId) ?? data.regions[0];
  const allDocumentsAccepted = data.documents.length > 0 && acceptedDocumentIds.size === data.documents.length;

  const toggleDocument = (id: string) => {
    setAcceptedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const changeRegion = (nextRegionId: string) => {
    const region = data.regions.find((item) => item.id === nextRegionId);
    setRegionId(nextRegionId);
    setNeighborhoodId(region?.neighborhoods[0]?.id ?? "");
  };

  const toggleServiceRegion = (id: string) => {
    setServiceRegionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      else notify("Selecione no máximo 5 regiões de atendimento.");
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/v1/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(isProvider
            ? {
                serviceRegionIds: [...serviceRegionIds],
                serviceCategoryId,
                yearsExperience: Number(yearsExperience),
                serviceRadiusKm: Number(serviceRadiusKm),
                bio: bio.trim(),
                availabilitySummary: availabilitySummary.trim(),
                availabilityStatus,
                acceptsUrgent,
                activeProposalLimit: Number(activeProposalLimit),
                activeJobLimit: Number(activeJobLimit),
              }
            : { regionId, neighborhoodId }),
          acceptedDocumentIds: [...acceptedDocumentIds],
          marketingConsent,
          productResearchConsent,
        }),
      });
      const payload = await response.json() as OnboardingData & { error?: string; message?: string };
      if (!response.ok || payload.status !== "completed" || !payload.profile) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível concluir o onboarding.");
      }
      notify(`Onboarding salvo na versão ${payload.profile.version}, com termos e consentimentos auditados.`);
      onSaved(payload);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível concluir o onboarding.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="dashboard-section onboarding-panel onboarding-form">
      <header><div><small>ONBOARDING PERSISTENTE</small><h2>{profile ? "Atualize seu cadastro." : "Prepare seu perfil para o piloto."}</h2><p>Preencha somente dados sintéticos nesta etapa. Termos e preferências são registrados separadamente.</p></div><span className="status-pill warning">{profile ? `Versão ${profile.version}` : "Pendente"}</span></header>
      <form onSubmit={submit}>
        <div className="onboarding-fields">
          {!isProvider && <><label className="field"><span>Região do piloto</span><select value={selectedRegion?.id ?? ""} onChange={(event) => changeRegion(event.target.value)} required>{data.regions.map((region) => <option key={region.id} value={region.id}>{region.name} · {region.state}</option>)}</select></label><label className="field"><span>Bairro de atendimento</span><select value={neighborhoodId} onChange={(event) => setNeighborhoodId(event.target.value)} required>{selectedRegion?.neighborhoods.map((neighborhood) => <option key={neighborhood.id} value={neighborhood.id}>{neighborhood.name}</option>)}</select></label></>}
          {isProvider && <div className="provider-region-selector onboarding-wide"><div><span>Regiões de atendimento</span><small>Selecione de 1 a 5 áreas ativas. Oportunidades fora delas ficam bloqueadas no banco.</small></div><div>{data.regions.map((region) => <label key={region.id} className={serviceRegionIds.has(region.id) ? "selected" : ""}><input type="checkbox" checked={serviceRegionIds.has(region.id)} onChange={() => toggleServiceRegion(region.id)} /><span><strong>{region.name} · {region.state}</strong><small>{region.neighborhoods.length} bairros ativos</small></span></label>)}</div></div>}
          {isProvider && <div className="onboarding-matching-settings onboarding-wide"><header><div><span>Disponibilidade para oportunidades</span><small>Essa regra controla o matching e pode ser alterada depois no painel profissional.</small></div><label><input type="checkbox" checked={acceptsUrgent} onChange={(event) => setAcceptsUrgent(event.target.checked)} /><span>Aceito pedidos urgentes</span></label></header><div className="availability-choice">{([{ value: "available_now", label: "Disponível agora", detail: "Prioridade em urgências" }, { value: "scheduled", label: "Com agenda", detail: "Receber normalmente" }, { value: "paused", label: "Pausado", detail: "Não receber novos pedidos" }] as const).map((option) => <button key={option.value} type="button" className={availabilityStatus === option.value ? "selected" : ""} onClick={() => setAvailabilityStatus(option.value)}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div><div className="matching-limit-fields"><label className="field"><span>Máximo de propostas ativas</span><input type="number" min="1" max="20" value={activeProposalLimit} onChange={(event) => setActiveProposalLimit(event.target.value)} required /></label><label className="field"><span>Máximo de serviços simultâneos</span><input type="number" min="1" max="20" value={activeJobLimit} onChange={(event) => setActiveJobLimit(event.target.value)} required /></label></div></div>}
          {isProvider && <><label className="field"><span>Categoria principal</span><select value={serviceCategoryId} onChange={(event) => setServiceCategoryId(event.target.value)} required>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></label><label className="field"><span>Anos de experiência</span><input type="number" min="0" max="60" value={yearsExperience} onChange={(event) => setYearsExperience(event.target.value)} required /></label><label className="field"><span>Raio de atendimento (km)</span><input type="number" min="1" max="200" value={serviceRadiusKm} onChange={(event) => setServiceRadiusKm(event.target.value)} required /></label><label className="field onboarding-wide"><span>Apresentação profissional</span><textarea minLength={20} maxLength={500} rows={3} value={bio} onChange={(event) => setBio(event.target.value)} required /><small>{bio.trim().length}/500</small></label><label className="field onboarding-wide"><span>Disponibilidade</span><input minLength={5} maxLength={200} value={availabilitySummary} onChange={(event) => setAvailabilitySummary(event.target.value)} required /></label></>}
        </div>
        <section className="onboarding-documents">
          <header><div><small>DOCUMENTOS VIGENTES</small><h3>Leia e aceite para continuar</h3></div><span>{acceptedDocumentIds.size} de {data.documents.length}</span></header>
          {data.documents.map((document) => <article key={document.id}><label><input type="checkbox" checked={acceptedDocumentIds.has(document.id)} onChange={() => toggleDocument(document.id)} /><span><strong>{document.title}</strong><small>{document.version} · {document.approvalStatus === "draft" ? "minuta do piloto" : "aprovado"}</small></span></label><details><summary>Consultar conteúdo</summary><p>{document.content}</p><small>Integridade: {document.contentSha256.slice(0, 12)}…</small></details></article>)}
        </section>
        <section className="onboarding-consents">
          <header><small>PREFERÊNCIAS OPCIONAIS</small><h3>Você decide separadamente.</h3></header>
          <label><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} /><span><strong>Novidades e campanhas</strong><small>Autorizar comunicações promocionais. Pode ser revogado depois.</small></span></label>
          <label><input type="checkbox" checked={productResearchConsent} onChange={(event) => setProductResearchConsent(event.target.checked)} /><span><strong>Pesquisa de produto</strong><small>Autorizar convites para entrevistas e testes da experiência.</small></span></label>
        </section>
        <footer className="onboarding-form-footer"><div><strong>Aceites obrigatórios não incluem marketing.</strong><span>O hash do texto, a versão e o horário ficam preservados.</span></div><div>{onCancel && <button type="button" className="secondary-action" onClick={onCancel}>Cancelar</button>}<button className="primary-action" disabled={saving || !allDocumentsAccepted || (isProvider ? serviceRegionIds.size === 0 || Number(activeProposalLimit) < 1 || Number(activeJobLimit) < 1 : !selectedRegion || !neighborhoodId)}>{saving ? "Salvando..." : profile ? "Salvar nova versão →" : "Concluir onboarding →"}</button></div></footer>
      </form>
    </section>
  );
}

function NotificationPreferencesPanel({ role, notify }: { role: Role; notify: (message: string) => void }) {
  const [data, setData] = useState<NotificationPreferencesData | null>(null);
  const [draft, setDraft] = useState<NotificationPreferencesRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const formatted = (value: string) => new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/notifications?role=${encodeURIComponent(role)}&channel=preferences`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as NotificationPreferencesData & { error?: string; message?: string };
        if (!response.ok || !payload.preferences || !payload.channels) {
          throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar as preferências.");
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setDraft(payload.preferences);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar as preferências.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [notify, refresh, role]);

  const updateDraft = (key: keyof NotificationPreferencesRecord, value: boolean | string) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role,
          action: "update-preferences",
          preferences: {
            marketplacePush: draft.marketplacePush,
            messagesPush: draft.messagesPush,
            supportPush: draft.supportPush,
            systemPush: draft.systemPush,
            quietHoursEnabled: draft.quietHoursEnabled,
            quietStart: draft.quietStart,
            quietEnd: draft.quietEnd,
            timeZone: draft.timeZone,
          },
        }),
      });
      const payload = await response.json() as NotificationPreferencesData & { error?: string; message?: string };
      if (!response.ok || !payload.preferences) {
        throw new Error(payload.error ?? payload.message ?? "Não foi possível salvar as preferências.");
      }
      setData(payload);
      setDraft(payload.preferences);
      const suppressed = payload.suppressedDeliveries ?? 0;
      notify(payload.changed
        ? `Preferências salvas na versão ${payload.preferences.version}.${suppressed > 0 ? ` ${suppressed} entrega(s) pendente(s) foram interrompidas.` : ""}`
        : "As preferências já estavam atualizadas.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível salvar as preferências.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return <section id="notification-preferences" className="dashboard-section notification-preferences-panel"><div className="data-state">Carregando canais e horários...</div></section>;
  }
  if (!data || !draft) {
    return <section id="notification-preferences" className="dashboard-section notification-preferences-panel"><div className="data-state"><strong>Preferências indisponíveis.</strong><button className="secondary-action" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Tentar novamente</button></div></section>;
  }

  const categories = [
    { key: "marketplacePush" as const, label: "Pedidos e serviços", detail: "Propostas, agenda, andamento, cancelamentos e avaliações.", mark: "MS" },
    { key: "messagesPush" as const, label: "Mensagens", detail: "Novas mensagens das conversas do marketplace.", mark: "CH" },
    { key: "supportPush" as const, label: "Atendimento", detail: "Casos, indicações e respostas da central de suporte.", mark: "AT" },
    { key: "systemPush" as const, label: "Plataforma", detail: "Comunicados operacionais e novidades do ambiente.", mark: "MX" },
  ];
  const dirty = [
    "marketplacePush",
    "messagesPush",
    "supportPush",
    "systemPush",
    "quietHoursEnabled",
    "quietStart",
    "quietEnd",
    "timeZone",
  ].some((key) => draft[key as keyof NotificationPreferencesRecord] !== data.preferences[key as keyof NotificationPreferencesRecord]);
  const enabledCount = categories.filter((category) => draft[category.key]).length;
  const selectedTimeZone = data.timeZones.find((item) => item.value === draft.timeZone)?.label ?? draft.timeZone;

  return (
    <section id="notification-preferences" className="dashboard-section notification-preferences-panel">
      <header>
        <div><small>COMUNICAÇÃO TRANSACIONAL</small><h2>Notificações sob seu controle</h2><p>A central permanece ativa. Você escolhe quais assuntos podem chegar por Web Push e quando o aparelho deve ficar em silêncio.</p></div>
        <span className="status-pill success">Versão {data.preferences.version}</span>
      </header>
      <div className="notification-channel-grid">
        <article className="active"><i>✓</i><div><small>CENTRAL MAX</small><strong>Sempre ativa</strong><span>Histórico persistente e contadores de não lidas.</span></div></article>
        <article className={data.channels.push.enabled ? "active" : ""}><i>{data.channels.push.enabled ? "✓" : "○"}</i><div><small>WEB PUSH</small><strong>{data.channels.push.enabled ? `${data.channels.push.subscriptionCount} aparelho(s)` : data.channels.push.available ? "Nenhum aparelho" : "Indisponível"}</strong><span>{data.channels.push.enabled ? "Permissão ativa em pelo menos um dispositivo." : "Ative pelo sino de notificações deste navegador."}</span></div></article>
        <article><i>—</i><div><small>E-MAIL E SMS</small><strong>Aguardando provedor</strong><span>Nenhum contato real é usado no piloto.</span></div></article>
      </div>
      <form onSubmit={save}>
        <section className="notification-topic-settings">
          <header><div><small>ASSUNTOS NO WEB PUSH</small><h3>{enabledCount} de {categories.length} ativos</h3></div><span>A central não é afetada</span></header>
          <div>
            {categories.map((category) => (
              <label key={category.key}>
                <i>{category.mark}</i>
                <span><strong>{category.label}</strong><small>{category.detail}</small></span>
                <input type="checkbox" checked={draft[category.key]} onChange={(event) => updateDraft(category.key, event.target.checked)} />
                <em aria-hidden="true" />
              </label>
            ))}
          </div>
        </section>
        <section className={`quiet-hours-settings ${draft.quietHoursEnabled ? "active" : ""}`}>
          <header>
            <div><small>HORÁRIO DE SILÊNCIO</small><h3>Adiar avisos, sem perder nada</h3><p>Durante a janela, as entregas ficam na fila e voltam automaticamente ao final.</p></div>
            <label className="quiet-hours-toggle"><input type="checkbox" checked={draft.quietHoursEnabled} onChange={(event) => updateDraft("quietHoursEnabled", event.target.checked)} /><span>{draft.quietHoursEnabled ? "Ativo" : "Inativo"}</span><em aria-hidden="true" /></label>
          </header>
          <div className="quiet-hours-fields">
            <label className="field"><span>Silenciar a partir de</span><input type="time" value={draft.quietStart} disabled={!draft.quietHoursEnabled} onChange={(event) => updateDraft("quietStart", event.target.value)} required /></label>
            <label className="field"><span>Retomar às</span><input type="time" value={draft.quietEnd} disabled={!draft.quietHoursEnabled} onChange={(event) => updateDraft("quietEnd", event.target.value)} required /></label>
            <label className="field"><span>Fuso horário</span><select value={draft.timeZone} disabled={!draft.quietHoursEnabled} onChange={(event) => updateDraft("timeZone", event.target.value)}>{data.timeZones.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          <footer><strong>{draft.quietHoursEnabled ? `${draft.quietStart}–${draft.quietEnd} · ${selectedTimeZone}` : "Entregas sem janela de silêncio"}</strong><span>Retentativas técnicas continuam limitadas e auditáveis.</span></footer>
        </section>
        <footer className="notification-preferences-footer">
          <div><strong>Última atualização: {formatted(data.preferences.updatedAt)}</strong><span>{data.history.length} alteração(ões) preservada(s) no histórico.</span></div>
          <button className="primary-action" disabled={saving || !dirty}>{saving ? "Salvando..." : dirty ? "Salvar preferências →" : "Preferências atualizadas"}</button>
        </footer>
      </form>
    </section>
  );
}

function AccountView({ role, notify }: { role: Role; notify: (message: string) => void }) {
  const user = roleDetails[role];
  const isOperational = role === "operacao";
  return (
    <>
      <DashboardHeader role={role} eyebrow={isOperational ? "CONFIGURAÇÕES DO SISTEMA" : "CONTA E PLANO"} title={isOperational ? "Controle o piloto com regras claras." : "Sua conta, do seu jeito."} />
      <div className="account-layout">
        <section className="dashboard-section account-profile">
          <div className="account-avatar">{user.short}</div><div><small>PERFIL ATUAL</small><h2>{user.name}</h2><p>{user.email}</p></div><button className="secondary-action" onClick={() => notify("Edição de perfil aberta.")}>Editar perfil</button>
        </section>
        <section className="plan-card">
          <div><span className="plan-badge">PILOTO MAX</span><h2>{isOperational ? "Ambiente de validação" : "Sem mensalidade nesta fase"}</h2><p>{isOperational ? "Parâmetros críticos permanecem bloqueados até aprovação operacional e jurídica." : "Durante o piloto, você conhece a plataforma sem assinatura mensal. Regras comerciais futuras serão apresentadas antes de qualquer aceite."}</p></div>
          <div className="plan-price"><small>VALOR MENSAL</small><strong>R$ 0</strong><span>Ambiente demonstrativo</span></div>
        </section>
        {(role === "cliente" || role === "prestador") && <OnboardingPanel role={role} notify={notify} />}
        <NotificationPreferencesPanel key={role} role={role} notify={notify} />
        <section className="dashboard-section account-options">
          <div className="dashboard-section-title"><div><small>PREFERÊNCIAS</small><h2>Configurações da conta</h2></div></div>
          <button onClick={() => document.getElementById("notification-preferences")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span>Notificações</span><small>Central, Web Push e horário de silêncio</small><i>→</i></button>
          <button onClick={() => notify("Central de privacidade aberta.")}><span>Privacidade e segurança</span><small>Dados pessoais, acesso e consentimentos</small><i>→</i></button>
          <button onClick={() => notify("Termos do piloto carregados.")}><span>Termos do piloto</span><small>Versão demonstrativa e regras aplicáveis</small><i>→</i></button>
        </section>
        {isOperational && <MatchingOperationsPanel notify={notify} />}
        {isOperational && <RegionManagementPanel notify={notify} />}
        {isOperational && <CatalogManagementPanel notify={notify} />}
        {isOperational && <CampaignManagementPanel notify={notify} />}
        <FinancialSandboxPanel key={role} role={role} notify={notify} />
      </div>
    </>
  );
}

const sandboxPaymentStatusLabel: Record<SandboxPaymentStatus, string> = {
  sandbox_authorized: "Previsto",
  sandbox_settled: "Reconhecido",
  sandbox_refunded: "Estornado",
};

const financeRoleCopy: Record<Role, { title: string; recognized: string; pending: string; description: string }> = {
  cliente: { title: "Cashback promocional", recognized: "Cashback reconhecido", pending: "Cashback previsto", description: "Benefício promocional vinculado ao serviço; não é saldo bancário, carteira ou valor sacável." },
  prestador: { title: "Recebíveis simulados", recognized: "Valor reconhecido", pending: "Valor previsto", description: "Estimativa líquida após a regra demonstrativa, sem antecipação ou movimentação de dinheiro." },
  parceiro: { title: "Comissões da rede", recognized: "Comissão reconhecida", pending: "Comissão prevista", description: "Somente serviços atribuídos à sua rede aparecem aqui; não existe conta de pagamento nesta demonstração." },
  operacao: { title: "Conciliação do sandbox", recognized: "Taxa reconhecida", pending: "Taxa prevista", description: "Eventos assinados atualizam um ledger imutável. Nenhum PSP ou pagamento real está conectado." },
};

function FinancialSandboxPanel({ role, notify }: { role: Role; notify: (message: string) => void }) {
  const [data, setData] = useState<FinanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const copy = financeRoleCopy[role];
  const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/finance/dashboard?role=${encodeURIComponent(role)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as FinanceDashboardData & { error?: string; message?: string };
        if (!response.ok || !payload.rule) throw new Error(payload.error ?? payload.message ?? "Não foi possível carregar o resumo financeiro sandbox.");
        return payload;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify(error instanceof Error ? error.message : "Não foi possível carregar o resumo financeiro sandbox.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [role, notify, refresh]);

  const simulate = async (record: FinanceRecord) => {
    const eventType = record.bookingStatus === "cancelled" ? "refund" : "settlement";
    setProcessingId(record.id);
    try {
      const response = await fetch("/api/v1/finance/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intentId: record.id, eventType, amountCents: record.grossAmountCents }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Não foi possível processar o evento sandbox.");
      notify(eventType === "refund" ? "Estorno sandbox registrado e reconciliado." : "Liquidação sandbox registrada e reconciliada.");
      setLoading(true);
      setRefresh((value) => value + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível processar o evento sandbox.");
    } finally {
      setProcessingId(null);
    }
  };

  const canProcess = (record: FinanceRecord) => role === "operacao" && record.status === "sandbox_authorized" && (record.bookingStatus === "completed" || record.bookingStatus === "cancelled");
  return <section className="dashboard-section financial-sandbox"><header><div><small>FINANCEIRO SANDBOX · {data?.rule.version ?? "REGRA VERSIONADA"}</small><h2>{copy.title}</h2><p>{copy.description}</p></div><span className="sandbox-badge">SEM DINHEIRO REAL</span></header><div className="financial-metrics"><article><small>{copy.recognized}</small><strong>{loading ? "…" : money(data?.summary.recognizedAmountCents ?? 0)}</strong><span>Lançamentos líquidos no ledger</span></article><article><small>{copy.pending}</small><strong>{loading ? "…" : money(data?.summary.pendingAmountCents ?? 0)}</strong><span>Enquanto o serviço não é liquidado</span></article><article><small>Volume relacionado</small><strong>{loading ? "…" : money(data?.summary.grossAmountCents ?? 0)}</strong><span>{data?.summary.recordCount ?? 0} intent(s) · {money(data?.summary.discountAmountCents ?? 0)} em cupons</span></article><article><small>Regra aplicada</small><strong>12% + 2% + 2%</strong><span>Plataforma · parceiro · cashback</span></article></div>{role === "operacao" && data?.reconciliation && <div className={`reconciliation-strip ${data.reconciliation.matched ? "matched" : "warning"}`}><span>{data.reconciliation.matched ? "✓" : "!"}</span><div><strong>{data.reconciliation.matched ? "Ledger conciliado" : "Divergência encontrada"}</strong><small>Esperado {money(data.reconciliation.expectedLedgerCents)} · ledger {money(data.reconciliation.ledgerNetCents)} · diferença {money(data.reconciliation.differenceCents)}</small></div></div>}<div className="financial-records"><div className="financial-record-head"><span>Serviço</span><span>Valor do serviço</span><span>{role === "operacao" ? "Taxa Max" : "Sua parcela"}</span><span>Status</span></div>{loading && <div className="data-state">Carregando lançamentos...</div>}{!loading && data?.records.length === 0 && <div className="data-state"><strong>Nenhum lançamento neste perfil.</strong><span>Os registros surgem quando uma proposta é aceita.</span></div>}{data?.records.map((record) => <article key={record.id}><div><strong>{record.serviceTitle}</strong><small>{record.requestPublicCode} · {record.publicCode}</small></div><span className="financial-service-value">{record.discountAmountCents > 0 && <small><s>{money(record.listAmountCents)}</s> · {record.couponCode}</small>}<strong>{money(record.grossAmountCents)}</strong></span><span>{money(record.actorAmountCents)}</span><div><span className={`status-pill ${record.status === "sandbox_settled" ? "success" : "warning"}`}>{sandboxPaymentStatusLabel[record.status]}</span>{canProcess(record) && <button className="secondary-action" disabled={processingId === record.id} onClick={() => simulate(record)}>{processingId === record.id ? "Processando..." : record.bookingStatus === "cancelled" ? "Simular estorno" : "Simular liquidação"}</button>}</div></article>)}</div><footer><p><strong>Como funciona:</strong> o valor é congelado no aceite, incluindo o desconto promocional, dividido pela regra vigente e reconhecido apenas por evento sandbox assinado. Estornos geram lançamentos inversos; nada é apagado.</p><button className="secondary-action" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Atualizar resumo ↻</button></footer></section>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={`metric-card ${tone ?? ""}`}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}

function MobileNav({ role, section, setSection }: { role: Role; section: Section; setSection: (section: Section) => void }) {
  return <nav className="mobile-role-bar" aria-label="Navegação móvel">{(Object.keys(sectionLabels[role]) as Section[]).map((item, index) => <button key={item} onClick={() => setSection(item)} className={section === item ? "active" : ""}><span>{["⌂", "▤", "◉", "⚙"][index]}</span>{sectionLabels[role][item].replace("Meus ", "")}</button>)}</nav>;
}
