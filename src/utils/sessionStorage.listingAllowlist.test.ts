import { afterEach, beforeEach, expect, test } from 'bun:test'
import type { Message } from '../types/message.js'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../test/sharedMutationLock.js'
import { isLoggableMessage } from './sessionStorage.ts'

const originalUserType = process.env.USER_TYPE
const originalHookSave = process.env.CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT

beforeEach(async () => {
  await acquireSharedMutationLock('sessionStorage.listingAllowlist')
})

afterEach(() => {
  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }
  if (originalHookSave === undefined) {
    delete process.env.CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT
  } else {
    process.env.CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT = originalHookSave
  }
  releaseSharedMutationLock()
})

function attachment(type: string, extra: Record<string, unknown> = {}): Message {
  return {
    type: 'attachment',
    uuid: '00000000-0000-4000-8000-00000000b001',
    attachment: { type, ...extra },
  } as unknown as Message
}

test('isLoggableMessage keeps prefix-cache listing deltas (cache-hit)', () => {
  process.env.USER_TYPE = 'external'

  // Listing deltas carry only local catalogs. Keeping them in the transcript
  // lets --resume rebuild the same announced set so the OpenAI / Moonshot
  // automatic prefix cache stays byte-stable (max cache-hit).
  expect(
    isLoggableMessage(
      attachment('skill_listing', {
        content: 'skills',
        skillCount: 1,
        isInitial: true,
      }),
    ),
  ).toBe(true)
  expect(
    isLoggableMessage(
      attachment('agent_listing_delta', {
        addedTypes: ['Explore'],
        addedLines: ['- Explore: stub'],
        removedTypes: [],
        isInitial: true,
        showConcurrencyNote: true,
      }),
    ),
  ).toBe(true)
  expect(
    isLoggableMessage(
      attachment('deferred_tools_delta', {
        addedNames: ['ToolSearch'],
        addedLines: ['- ToolSearch'],
        removedNames: [],
      }),
    ),
  ).toBe(true)
  expect(
    isLoggableMessage(
      attachment('mcp_instructions_delta', {
        addedNames: ['demo'],
        addedBlocks: ['## demo\ndo things'],
        removedNames: [],
      }),
    ),
  ).toBe(true)
})

test('isLoggableMessage keeps file and hook attachments for cache-hit', () => {
  process.env.USER_TYPE = 'external'
  delete process.env.CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT

  // All attachments (including @mention files and hook output) stay in the
  // transcript so --resume re-sends the exact request history and keeps the
  // prefix cache byte-stable.
  expect(
    isLoggableMessage(
      attachment('file', { filename: '/tmp/secret.txt', content: 'nope' }),
    ),
  ).toBe(true)
  expect(
    isLoggableMessage(
      attachment('hook_additional_context', {
        content: ['hook output'],
        hookName: 'SessionStart',
        toolName: undefined,
        toolUseID: undefined,
        hookEvent: 'SessionStart',
      }),
    ),
  ).toBe(true)
})

test('isLoggableMessage keeps all attachments for ant users', () => {
  process.env.USER_TYPE = 'ant'

  expect(
    isLoggableMessage(
      attachment('file', { filename: '/tmp/x.txt', content: 'x' }),
    ),
  ).toBe(true)
  expect(
    isLoggableMessage(
      attachment('mcp_instructions_delta', {
        addedNames: ['demo'],
        addedBlocks: ['## demo\ndo things'],
        removedNames: [],
      }),
    ),
  ).toBe(true)
  expect(
    isLoggableMessage(
      attachment('agent_listing_delta', {
        addedTypes: ['Explore'],
        addedLines: ['- Explore: stub'],
        removedTypes: [],
        isInitial: true,
        showConcurrencyNote: true,
      }),
    ),
  ).toBe(true)
})

test('isLoggableMessage fails closed on malformed null attachment', () => {
  process.env.USER_TYPE = 'external'
  const malformed = {
    type: 'attachment',
    uuid: '00000000-0000-4000-8000-00000000bad2',
    attachment: null,
  } as unknown as Message

  expect(() => isLoggableMessage(malformed)).not.toThrow()
  expect(isLoggableMessage(malformed)).toBe(false)
})

test('isLoggableMessage fails closed on non-object attachment payload', () => {
  process.env.USER_TYPE = 'external'
  const malformed = {
    type: 'attachment',
    uuid: '00000000-0000-4000-8000-00000000bad3',
    attachment: 'skill_listing',
  } as unknown as Message

  expect(() => isLoggableMessage(malformed)).not.toThrow()
  expect(isLoggableMessage(malformed)).toBe(false)
})
