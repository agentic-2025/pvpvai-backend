import { describe, expect, test } from 'bun:test';
import { WsMessageTypes } from './schemas/wsServer';
import { PvpActions } from './types/pvp';
import type { AllAgentChatMessageSchemaTypes } from './utils/schemas';
import { ObservationType } from './utils/schemas';

// Test fixtures
const senderAgentId = 1;
const targetAgentId = 2;
const mockAgentAddresses = new Map([
  [1, '0xsenderAddress'],
  [2, '0xtargetAddress'],
]);

// Create a message factory to get fresh messages for each test
function createBaseMessage(): AllAgentChatMessageSchemaTypes {
  return {
    messageType: WsMessageTypes.AGENT_MESSAGE,
    sender: '0xsenderAddress',
    signature: 'mockSignature',
    content: {
      timestamp: Date.now(),
      roomId: 1,
      roundId: 1,
      agentId: senderAgentId,
      text: 'I think investing in Bitcoin and Ethereum is a good strategy. The market looks bullish today.',
      context: [],
    },
  } as const;
}

// Update base message for simple poison test
const simplePoisonMessage: AllAgentChatMessageSchemaTypes = {
  messageType: WsMessageTypes.AGENT_MESSAGE,
  sender: '0xsenderAddress',
  signature: 'mockSignature',
  content: {
    timestamp: Date.now(),
    roomId: 1,
    roundId: 1,
    agentId: senderAgentId,
    text: 'Hello world!',
    context: [],
  },
} as const;

// Define proper non-agent message type
const nonAgentMessage: AllAgentChatMessageSchemaTypes = {
  messageType: 'observation',
  sender: '0xgmAddress',
  signature: 'mockSignature',
  content: {
    timestamp: Date.now(),
    roomId: 1,
    roundId: 1,
    agentId: 1,
    observationType: ObservationType.GAME_EVENT,
    data: {
      message: 'GM Message',
    },
  },
} as const;

interface MockPvpResult {
  originalMessage: AllAgentChatMessageSchemaTypes;
  targetMessages: Record<number, AllAgentChatMessageSchemaTypes>;
  appliedEffects: any[];
  pvpStatusEffects: Record<string, any>;
}

// Helper function to simulate PvP status effects without contract calls
function mockPvpLogic(
  message: AllAgentChatMessageSchemaTypes,
  senderStatus: any[] = [],
  targetStatus: any[] = []
): MockPvpResult {
  // Non-agent messages pass through unmodified
  if (message.messageType !== WsMessageTypes.AGENT_MESSAGE) {
    return {
      originalMessage: message,
      targetMessages: { [targetAgentId]: message },
      appliedEffects: [],
      pvpStatusEffects: {},
    };
  }

  const result: MockPvpResult = {
    originalMessage: message,
    targetMessages: {},
    appliedEffects: [],
    pvpStatusEffects: {},
  };

  // Check for silence
  if (senderStatus.some((s) => s.verb === PvpActions.SILENCE)) {
    return result; // Silenced agents can't send messages
  }

  // Apply all poison effects sequentially
  let modifiedMessage = { ...message };
  const poisonEffects = senderStatus.filter((s) => s.verb === PvpActions.POISON);

  if (poisonEffects.length > 0 && 'content' in modifiedMessage) {
    for (const poisonEffect of poisonEffects) {
      if (poisonEffect.parameters && 'text' in modifiedMessage.content) {
        const params = JSON.parse(Buffer.from(poisonEffect.parameters.slice(2), 'hex').toString());
        modifiedMessage.content.text = modifiedMessage.content.text.replace(
          new RegExp(params.find, params.case_sensitive ? 'g' : 'gi'),
          params.replace
        );
      }
    }
  }

  // Skip deafened targets
  if (!targetStatus.some((s) => s.verb === PvpActions.DEAFEN)) {
    result.targetMessages[targetAgentId] = modifiedMessage;
  }

  return result;
}

describe('PvP System', () => {
  test('should pass through non-agent messages unmodified', () => {
    const result = mockPvpLogic(nonAgentMessage);
    expect(result.targetMessages[targetAgentId]).toEqual(nonAgentMessage);
    expect(result.appliedEffects.length).toBe(0);
  });

  test('should block messages from silenced agents', () => {
    const result = mockPvpLogic(createBaseMessage(), [
      {
        verb: PvpActions.SILENCE,
        endTime: Math.floor(Date.now() / 1000) + 3600,
        instigator: '0xinstigator',
        parameters: '0x',
      },
    ]);

    expect(Object.keys(result.targetMessages).length).toBe(0);
  });

  test('should skip deafened targets', () => {
    const result = mockPvpLogic(
      createBaseMessage(),
      [],
      [
        {
          verb: PvpActions.DEAFEN,
          endTime: Math.floor(Date.now() / 1000) + 3600,
          instigator: '0xinstigator',
          parameters: '0x',
        },
      ]
    );

    expect(Object.keys(result.targetMessages).length).toBe(0);
  });

  test('should apply poison effects to messages', () => {
    const result = mockPvpLogic(simplePoisonMessage, [
      {
        verb: PvpActions.POISON,
        endTime: Math.floor(Date.now() / 1000) + 3600,
        instigator: '0xinstigator',
        parameters:
          '0x' +
          Buffer.from(
            JSON.stringify({
              find: 'world',
              replace: 'friend',
              case_sensitive: false,
            })
          ).toString('hex'),
      },
    ]);

    const message = result.targetMessages[targetAgentId];
    if ('content' in message && 'text' in message.content) {
      expect(message.content.text).toBe('Hello friend!');
    }
  });

  test('should poison Bitcoin to PEPE', () => {
    const message = createBaseMessage();
    const result = mockPvpLogic(message, [
      {
        verb: PvpActions.POISON,
        endTime: Math.floor(Date.now() / 1000) + 3600,
        instigator: '0xinstigator',
        parameters:
          '0x' +
          Buffer.from(
            JSON.stringify({
              find: 'Bitcoin',
              replace: 'PEPE',
              case_sensitive: false,
            })
          ).toString('hex'),
      },
    ]);

    const resultMessage = result.targetMessages[targetAgentId];
    if ('content' in resultMessage && 'text' in resultMessage.content) {
      expect(resultMessage.content.text).toBe(
        'I think investing in PEPE and Ethereum is a good strategy. The market looks bullish today.'
      );
    }
  });

  test('should poison "investing" to "aping"', () => {
    const message = createBaseMessage();
    const result = mockPvpLogic(message, [
      {
        verb: PvpActions.POISON,
        endTime: Math.floor(Date.now() / 1000) + 3600,
        instigator: '0xinstigator',
        parameters:
          '0x' +
          Buffer.from(
            JSON.stringify({
              find: '\\binvesting\\b',
              replace: 'aping',
              case_sensitive: false,
            })
          ).toString('hex'),
      },
    ]);

    const resultMessage = result.targetMessages[targetAgentId];
    if ('content' in resultMessage && 'text' in resultMessage.content) {
      expect(resultMessage.content.text).toBe(
        'I think aping in Bitcoin and Ethereum is a good strategy. The market looks bullish today.'
      );
    }
  });

  test('should poison "bullish" to "mooning"', () => {
    const message = createBaseMessage();
    const result = mockPvpLogic(message, [
      {
        verb: PvpActions.POISON,
        endTime: Math.floor(Date.now() / 1000) + 3600,
        instigator: '0xinstigator',
        parameters:
          '0x' +
          Buffer.from(
            JSON.stringify({
              find: 'bullish',
              replace: 'mooning',
              case_sensitive: false,
            })
          ).toString('hex'),
      },
    ]);

    const resultMessage = result.targetMessages[targetAgentId];
    if ('content' in resultMessage && 'text' in resultMessage.content) {
      expect(resultMessage.content.text).toBe(
        'I think investing in Bitcoin and Ethereum is a good strategy. The market looks mooning today.'
      );
    }
  });
});
