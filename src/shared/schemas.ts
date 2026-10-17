import { z } from 'zod'

export const SenderRoleSchema = z.enum(['self', 'other', 'system', 'unknown'])
export const RiskLevelSchema = z.enum(['low', 'medium', 'high'])
export const ConfidenceSchema = z.enum(['low', 'medium', 'high'])

export const EvidenceRefSchema = z.object({
  messageId: z.string().optional(),
  assetId: z.string().optional(),
  quote: z.string().max(500).optional(),
  reason: z.string().max(500).optional()
})

export const StyleBasisSchema = z.object({
  styleId: z.string().optional(),
  styleName: z.string(),
  sourceKind: z.enum(['imported', 'generated_global', 'generated_friend']),
  sampleCount: z.number().int().nonnegative().optional(),
  traits: z.array(z.string()).max(12),
  evidenceNote: z.string()
})

export const ReplyCandidateSchema = z.object({
  text: z.string().min(1).max(2000),
  tone: z.string().min(1).max(40),
  risk: RiskLevelSchema,
  rationale: z.string().max(800).default('')
})

export const TopicCandidateSchema = z.object({
  title: z.string().min(1).max(120),
  opening: z.string().min(1).max(500),
  reason: z.string().max(500).default(''),
  risk: RiskLevelSchema
})

export const LoveAnalysisResultSchema = z.object({
  kind: z.literal('love'),
  generatedAt: z.string(),
  affection: z.object({
    signal: z.enum(['positive', 'mixed', 'negative', 'insufficient']),
    summary: z.string(),
    confidence: ConfidenceSchema,
    evidence: z.array(EvidenceRefSchema).max(12),
    uncertainty: z.array(z.string()).max(8)
  }),
  advancement: z.object({
    decision: z.enum(['advance', 'cautious', 'pause', 'insufficient']),
    summary: z.string(),
    reasons: z.array(z.string()).max(8),
    evidence: z.array(EvidenceRefSchema).max(12)
  }),
  topics: z.array(TopicCandidateSchema).min(3).max(5),
  replies: z
    .array(ReplyCandidateSchema)
    .min(3)
    .max(5)
    .refine((items) => items.some((item) => item.risk === 'low'), {
      message: '至少需要一条低风险回复'
    }),
  styleBasis: StyleBasisSchema.optional(),
  warnings: z.array(z.string()).default([])
})

export const WorkAnalysisResultSchema = z.object({
  kind: z.literal('work'),
  generatedAt: z.string(),
  counterpartRead: z.object({
    summary: z.string(),
    confidence: ConfidenceSchema,
    evidence: z.array(EvidenceRefSchema).max(12),
    uncertainty: z.array(z.string()).max(8)
  }),
  risks: z.array(z.string()).min(1).max(8),
  objective: z.object({
    summary: z.string(),
    evidence: z.array(EvidenceRefSchema).max(12)
  }),
  actions: z.array(z.string()).min(3).max(5),
  replies: z
    .array(ReplyCandidateSchema)
    .min(3)
    .max(5)
    .refine((items) => items.some((item) => item.risk === 'low'), {
      message: '至少需要一条低风险回复'
    }),
  styleBasis: StyleBasisSchema.optional(),
  warnings: z.array(z.string()).default([])
})

export const CustomSectionResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['analysis', 'recommendations', 'topics', 'replies', 'bullets', 'text']),
  content: z.string().default(''),
  items: z.array(z.string()).default([]),
  topics: z.array(TopicCandidateSchema).optional(),
  replies: z.array(ReplyCandidateSchema).optional(),
  confidence: ConfidenceSchema.optional(),
  evidence: z.array(EvidenceRefSchema).max(12).default([])
})

export const CustomAnalysisResultSchema = z.object({
  kind: z.literal('custom'),
  generatedAt: z.string(),
  modeName: z.string(),
  summary: z.string().default(''),
  sections: z.array(CustomSectionResultSchema),
  styleBasis: StyleBasisSchema.optional(),
  warnings: z.array(z.string()).default([])
})

export const AnalysisResultSchema = z.discriminatedUnion('kind', [
  LoveAnalysisResultSchema,
  WorkAnalysisResultSchema,
  CustomAnalysisResultSchema
])

export const MessageInputSchema = z.object({
  tempId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  sentAt: z.string().nullable(),
  senderName: z.string().min(1).max(200),
  senderRole: SenderRoleSchema,
  text: z.string().max(200_000),
  messageType: z.enum(['text', 'image', 'system', 'other']).default('text'),
  assetNames: z.array(z.string()).default([])
})

export const ImportAssetSchema = z.object({
  tempId: z.string(),
  originalName: z.string(),
  sourcePath: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  kind: z.enum(['chat_export', 'image', 'screenshot']),
  sha256: z.string().optional()
})

export const ImportPreviewSchema = z.object({
  id: z.string(),
  sourceLabel: z.string(),
  createdAt: z.string(),
  friendId: z.string(),
  messages: z.array(MessageInputSchema),
  assets: z.array(ImportAssetSchema),
  warnings: z.array(z.string()),
  stats: z.object({
    textFiles: z.number().int(),
    imageFiles: z.number().int(),
    screenshotFiles: z.number().int(),
    parsedMessages: z.number().int()
  })
})

export const ImportCommitInputSchema = z.object({
  previewId: z.string().min(1),
  friendId: z.string().min(1),
  action: z.enum(['copy', 'move']),
  messages: z.array(MessageInputSchema)
})

export const ImportBatchSchema = z.object({
  id: z.string(),
  friendId: z.string(),
  sourceLabel: z.string(),
  action: z.enum(['copy', 'move']),
  status: z.string(),
  messageCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  createdAt: z.string()
})

export const PersonaSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  tone: z.string().max(1000),
  analysisStyle: z.string().max(3000),
  boundaries: z.string().max(3000),
  builtIn: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const PersonaInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  tone: z.string().max(1000),
  analysisStyle: z.string().max(3000),
  boundaries: z.string().max(3000)
})

export const ModeSectionDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(100),
  type: z.enum(['analysis', 'recommendations', 'topics', 'replies', 'bullets', 'text']),
  instruction: z.string().max(2000).default(''),
  required: z.boolean().default(true)
})

export const AnalysisModeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string().min(1).max(80),
  description: z.string().max(1000),
  prompt: z.string().max(8000),
  builtIn: z.boolean(),
  sections: z.array(ModeSectionDefinitionSchema).max(8),
  includeImagesByDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const AnalysisModeInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(1000),
  prompt: z.string().min(1).max(8000),
  sections: z.array(ModeSectionDefinitionSchema).min(1).max(8),
  includeImagesByDefault: z.boolean()
})

export const StyleSkillSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  description: z.string().max(2000).default(''),
  language: z.string().default('zh-CN'),
  traits: z.object({
    tone: z.array(z.string()).max(20).default([]),
    sentenceLength: z.string().max(100).default(''),
    emoji: z.string().max(200).default(''),
    punctuation: z.string().max(300).default(''),
    formality: z.string().max(100).default(''),
    humor: z.string().max(200).default('')
  }),
  rules: z.array(z.string()).max(30).default([]),
  avoid: z.array(z.string()).max(30).default([]),
  examples: z
    .array(
      z.object({
        context: z.string().max(1000).default(''),
        reply: z.string().min(1).max(2000)
      })
    )
    .max(20)
    .default([]),
  rawMarkdown: z.string().max(50_000).optional()
})

export const StyleProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceKind: z.enum(['imported', 'generated_global', 'generated_friend']),
  friendId: z.string().nullable(),
  sampleCount: z.number().int().nonnegative(),
  skill: StyleSkillSchema,
  evidenceMessageIds: z.array(z.string()),
  createdAt: z.string()
})

export const ProviderProtocolSchema = z.enum(['chat_completions', 'responses'])

export const ProviderProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  protocol: ProviderProtocolSchema,
  baseUrl: z.string().url(),
  textModel: z.string().min(1),
  visionModel: z.string().default(''),
  isDefault: z.boolean(),
  hasApiKey: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const ProviderInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  protocol: ProviderProtocolSchema,
  baseUrl: z.string().url(),
  apiKey: z.string().max(5000).optional(),
  textModel: z.string().min(1),
  visionModel: z.string().default(''),
  isDefault: z.boolean()
})

export const AnalysisScopeSchema = z.object({
  from: z.string().nullable().default(null),
  to: z.string().nullable().default(null)
})

export const AnalysisPreflightInputSchema = z.object({
  friendId: z.string().min(1),
  modeId: z.string().min(1),
  personaId: z.string().min(1),
  styleId: z.string().nullable().default(null),
  providerId: z.string().min(1),
  includeImages: z.boolean().default(false),
  scope: AnalysisScopeSchema
})

export const AnalysisPreflightSchema = z.object({
  friendName: z.string(),
  modeName: z.string(),
  providerName: z.string(),
  protocol: ProviderProtocolSchema,
  endpoint: z.string(),
  messageCount: z.number().int(),
  characterCount: z.number().int(),
  imageCount: z.number().int(),
  estimatedRequests: z.number().int(),
  includesImages: z.boolean(),
  warnings: z.array(z.string())
})

export const AnalysisStartInputSchema = AnalysisPreflightInputSchema.extend({
  consentToImages: z.boolean()
})

export const AnalysisProgressSchema = z.object({
  runId: z.string(),
  phase: z.enum(['preparing', 'summarizing', 'images', 'synthesizing', 'validating', 'saving']),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  message: z.string()
})

export const AnalysisRunSchema = z.object({
  id: z.string(),
  friendId: z.string(),
  friendName: z.string(),
  modeId: z.string(),
  modeName: z.string(),
  personaId: z.string(),
  personaName: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  styleId: z.string().nullable(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  includeImages: z.boolean(),
  requestCount: z.number().int(),
  messageCount: z.number().int(),
  imageCount: z.number().int(),
  result: AnalysisResultSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable()
})

export const ChatMessageSchema = z.object({
  id: z.string(),
  friendId: z.string(),
  batchId: z.string(),
  seq: z.number().int(),
  sentAt: z.string().nullable(),
  senderName: z.string(),
  senderRole: SenderRoleSchema,
  text: z.string(),
  messageType: z.enum(['text', 'image', 'system', 'other']),
  assetIds: z.array(z.string())
})

export const FriendSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  notes: z.string(),
  messageCount: z.number().int().default(0),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const AppStateSchema = z.object({
  vaultState: z.enum(['missing', 'locked', 'unlocked']),
  dataPath: z.string(),
  writable: z.boolean(),
  version: z.string(),
  error: z.string().optional()
})

export type SenderRole = z.infer<typeof SenderRoleSchema>
export type RiskLevel = z.infer<typeof RiskLevelSchema>
export type Confidence = z.infer<typeof ConfidenceSchema>
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>
export type StyleBasis = z.infer<typeof StyleBasisSchema>
export type ReplyCandidate = z.infer<typeof ReplyCandidateSchema>
export type TopicCandidate = z.infer<typeof TopicCandidateSchema>
export type LoveAnalysisResult = z.infer<typeof LoveAnalysisResultSchema>
export type WorkAnalysisResult = z.infer<typeof WorkAnalysisResultSchema>
export type CustomAnalysisResult = z.infer<typeof CustomAnalysisResultSchema>
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>
export type MessageInput = z.infer<typeof MessageInputSchema>
export type ImportAsset = z.infer<typeof ImportAssetSchema>
export type ImportPreview = z.infer<typeof ImportPreviewSchema>
export type ImportCommitInput = z.infer<typeof ImportCommitInputSchema>
export type ImportBatch = z.infer<typeof ImportBatchSchema>
export type Persona = z.infer<typeof PersonaSchema>
export type PersonaInput = z.infer<typeof PersonaInputSchema>
export type ModeSectionDefinition = z.infer<typeof ModeSectionDefinitionSchema>
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>
export type AnalysisModeInput = z.infer<typeof AnalysisModeInputSchema>
export type StyleSkill = z.infer<typeof StyleSkillSchema>
export type StyleProfile = z.infer<typeof StyleProfileSchema>
export type ProviderProtocol = z.infer<typeof ProviderProtocolSchema>
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>
export type ProviderInput = z.infer<typeof ProviderInputSchema>
export type AnalysisScope = z.infer<typeof AnalysisScopeSchema>
export type AnalysisPreflightInput = z.infer<typeof AnalysisPreflightInputSchema>
export type AnalysisPreflight = z.infer<typeof AnalysisPreflightSchema>
export type AnalysisStartInput = z.infer<typeof AnalysisStartInputSchema>
export type AnalysisProgress = z.infer<typeof AnalysisProgressSchema>
export type AnalysisRun = z.infer<typeof AnalysisRunSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type Friend = z.infer<typeof FriendSchema>
export type AppState = z.infer<typeof AppStateSchema>
