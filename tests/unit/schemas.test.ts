import { describe, expect, it } from 'vitest'
import {
  AnalysisModeInputSchema,
  LoveAnalysisResultSchema,
  StyleSkillSchema
} from '../../src/shared/schemas'

const evidence = [{ messageId: 'm1', quote: '周末一起吃饭吗？', reason: '主动邀约' }]

describe('public data schemas', () => {
  it('accepts a complete love analysis and rejects missing low-risk replies', () => {
    const base = {
      kind: 'love',
      generatedAt: new Date().toISOString(),
      affection: {
        signal: 'positive',
        summary: '对方有持续回应和主动邀约。',
        confidence: 'medium',
        evidence,
        uncertainty: ['样本时间跨度较短']
      },
      advancement: {
        decision: 'cautious',
        summary: '可以小幅增加互动，不建议突然升级关系。',
        reasons: ['已有主动邀约', '仍需观察线下意愿'],
        evidence
      },
      topics: [
        { title: '周末安排', opening: '周末打算怎么过？', reason: '自然延续话题', risk: 'low' },
        { title: '照片', opening: '那张照片是在哪里拍的？', reason: '延续已有内容', risk: 'low' },
        { title: '吃饭', opening: '有空可以一起试试那家店。', reason: '轻度邀约', risk: 'medium' }
      ],
      replies: [
        { text: '听起来不错，周末有空。', tone: '自然', risk: 'low', rationale: '回应邀约' },
        { text: '可以呀，你挑时间。', tone: '主动', risk: 'medium', rationale: '推进安排' },
        { text: '我最近周三更方便。', tone: '直接', risk: 'low', rationale: '明确边界' }
      ],
      warnings: []
    }
    expect(LoveAnalysisResultSchema.safeParse(base).success).toBe(true)
    expect(
      LoveAnalysisResultSchema.safeParse({
        ...base,
        replies: base.replies.map((reply) => ({ ...reply, risk: 'high' }))
      }).success
    ).toBe(false)
  })

  it('validates style skills and declarative custom modes', () => {
    expect(
      StyleSkillSchema.safeParse({
        schemaVersion: 1,
        name: '简短自然',
        description: '',
        language: 'zh-CN',
        traits: {
          tone: ['简短'],
          sentenceLength: '一到两句',
          emoji: '偶尔',
          punctuation: '少用感叹号',
          formality: '口语',
          humor: '轻微'
        },
        rules: ['先回应对方具体内容'],
        avoid: ['长篇说教'],
        examples: []
      }).success
    ).toBe(true)

    expect(
      AnalysisModeInputSchema.safeParse({
        name: '复盘',
        description: '复盘一段沟通',
        prompt: '基于证据复盘，不虚构。',
        includeImagesByDefault: false,
        sections: [
          {
            id: 'summary',
            title: '摘要',
            type: 'analysis',
            instruction: '',
            required: true
          }
        ]
      }).success
    ).toBe(true)
  })
})
