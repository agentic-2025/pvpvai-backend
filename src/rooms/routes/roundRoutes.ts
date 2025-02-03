import { FastifyInstance } from 'fastify';
import { roundController } from '../controllers/roundController';
import { roomController } from '../controllers/roomController';
import {
  endRoundSchema,
  kickParticipantSchema,
  RoundMessage,
  RoundOutcome,
  KickParticipant,
  roundMessageInputSchema
} from '../validators/schemas';
import { sendMessageToAgent } from '../utils/messageHandler';
import { agentPreflight } from '../utils/validation';
import { roundPreflight } from '../utils/validation';
import { applyPvp } from '../../pvp';
import axios from 'axios';
import { supabase, wsOps } from '../../config';
import { AiChatAgentMessageOutputMessage, WsMessageOutputTypes } from '../../types/ws';
import { backendEthersSigningWallet } from '../../config';
import { signMessage } from '../utils/validation';
import { PvpStatusEffect } from '../../types/pvp';

export async function roundRoutes(server: FastifyInstance) {
  // AI Chat endpoint with validation
  server.post<{
    Params: { roomId: string; roundId: string };
    Body: RoundMessage;
    Reply: { success: boolean; error?: string };
  }>(
    '/rooms/:roomId/rounds/:roundId/aiChat',
    {
      // TODO Signature auth
      schema: {
        body: roundMessageInputSchema,
        params: {
          type: 'object',
          required: ['roundId', 'roomId'],
          properties: {
            roomId: { type: 'string', pattern: '^[0-9]+$' },
            roundId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      // Step 1: Verification / basic fetching
      const roomId = parseInt(request.params.roomId);
      const roundId = parseInt(request.params.roundId);
      const { agentId, /*roundId,*/ text } = request.body.content;
      const {round, roundAgents, agents, valid: roundValid, reason: roundReason} = await roundPreflight(roundId)
      if(!roundValid) {
        return reply.status(400).send({ success: false, error: roundReason });
      }
      if(!roundAgents || !agents) {
        return reply.status(400).send({ success: false, error: 'No round agents found, how did that happen?' });
      }

      const {agent, valid: agentValid, reason: agentReason} = await agentPreflight(agentId, roundId);
      if(!agentValid) {
        return reply.status(400).send({ success: false, error: agentReason });
      }



      // Step 2: Prepare messages
      const prePvpMessages = agents
      .map((agent) => {
        return {
          agentId: agent.id,
          endpoint: agent.endpoint?.endsWith('/message') ? agent.endpoint : `${agent.endpoint}/message`,
          message: request.body.content
        }
      })

      // TODO
      const postPvpMessages = prePvpMessages
      // const postPvpMessages = await applyPvp(agentId, prePvpMessages, round?.pvp_status_effects)


      //Step 3: Send messages
      const content = {
        timestamp: Date.now(),
        roomId,
        roundId,
        senderId: agentId,
        originalMessages: prePvpMessages.map((message) => ({agentId: message.agentId, message: message.message})),
        postPvpMessages: postPvpMessages.map((message) => ({agentId: message.agentId, message: message.message})),
          pvpStatusEffects: round?.pvp_status_effects as { [agentId: string]: [PvpStatusEffect] },
        }

      const {timestamp, signature} = await signMessage(backendEthersSigningWallet, WsMessageOutputTypes.AI_CHAT_AGENT_MESSAGE_OUTPUT, content)

      //Step 4: Send messages to agents
      for(const message of postPvpMessages) {
        
        //Do not await on this endpoint until we have a custom REST API endpoint
        //The /message endpoint stalls until the agent has responded.
        //We don't care about the agent's response, we just care that they received the message
        //Should also consider updating to consistent body, AgentMessageOutputMessage planned for WS
        axios.post(message.endpoint, {
          roomId: roomId,
          roundId: roundId,
          agentId: message.agentId,
          // sender: etherSigningWallet.address,
          // timestamp,
          // signature,
          text: message.message,
        });
      }

      const {error: storeMessageError} = await supabase
        .from('round_agent_messages')
        .insert({
          agent_id: agentId, 
          original_author: agentId, //Original author is the same thing as agent id, I just didn't want to break other people's code.
          round_id: roundId,
          message_type: WsMessageOutputTypes.AI_CHAT_AGENT_MESSAGE_OUTPUT,
          pvp_status_effects: round?.pvp_status_effects as { [agentId: string]: [PvpStatusEffect] },
          message: content,
        })
      if(storeMessageError) {
        console.error('Error storing message:', storeMessageError);
      }

          // Broadcast to WebSocket clients
      const wsMessage: AiChatAgentMessageOutputMessage = {
        type: WsMessageOutputTypes.AI_CHAT_AGENT_MESSAGE_OUTPUT,
        content: content,
      };
      
  
      await wsOps.broadcastToRoom(roomId, wsMessage);

      // Run message through pvp rules

      // Get or create active round
      // const roundResult = await roundController.getOrCreateActiveRound(roomId);
      // if (!roundResult.success) {
      //   return reply.status(400).send({ success: false, error: roundResult.error });
      // }


      return reply.send({ success: true });
    }
  );

  // End round endpoint
  server.post<{
    Params: { roundId: string };
    Body: { outcome?: RoundOutcome };
  }>(
    '/rounds/:roundId/end',
    {
      schema: {
        body: endRoundSchema,
        params: {
          type: 'object',
          required: ['roundId'],
          properties: {
            roundId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roundId = parseInt(request.params.roundId);
      const result = await roundController.endRound(roundId, request.body.outcome);
      
      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }
      
      return reply.send({ success: true });
    }
  );

  // Kick participant endpoint
  server.post<{
    Params: { roundId: string };
    Body: KickParticipant;
  }>(
    '/rounds/:roundId/kick',
    {
      schema: {
        body: kickParticipantSchema,
        params: {
          type: 'object',
          required: ['roundId'],
          properties: {
            roundId: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const roundId = parseInt(request.params.roundId);
      const result = await roundController.kickParticipant(roundId, request.body.agentId);
      
      if (!result.success) {
        return reply.status(400).send({ success: false, error: result.error });
      }
      
      return reply.send({ success: true });
    }
  );

//   // Populate this w/ pvp_statuses from the rounds table for all active rounds on startup
// const currentPvPStatuses: { [roundId: string]: { [agentId: string]: PvPStatus[] } } = {};

// } = {};
//   type PvPStatus = {
//   status: "SILENCE" | "DEAFEN" | "POISON" | "ATTACK"
//   details: undefined | PoisonDetails
//   expires: number
// }

// type PoisonDetails = {
//   find: string;
//   replace: string;
//   case_sensitive: boolean;
// }
//   server.post<{
//     Params: { roundId: string };
//     Body: {
//       message_type: string;
//       content: any;
//     };
//   }>('/rounds/:roundId/pvp', async (request, reply) => {
//     const roundId = parseInt(request.params.roundId);
//     //Get all round data (includes if active and current pvp statuses) 
//     //Confirm round is active - PvP actions can only be taken on active rounds
//     //Confirm target agent is not already affected by the incoming pvp action (can't re-apply or stack effects in hackathon)
//     // Add the status update to an in-memory map: {roomId: {roundId: {agentId: [pvp_statuses]}}}
//     // Update PvP Statuses in the rounds table:
//     //    - SILENCE:Add {status: "SILENCE", expires: (30s from now in UTC)} to the target agent's pvp_statuses
//     //    - DEAFEN: Add {status: "DEAFEN", expires: (30s from now in UTC)} to the target agent's pvp_statuses
//     //    - POISON: 
//     //         - User must supply the following additional data: {find: "string", replace: "string", case_sensitive: true/false}
//     //         - Add {status: "POISON", details: {find: "string", replace: "string", case_sensitive: false}, expires: (30s from now in UTC)} to the target agent's pvp_statuses
//     //    - ATTACK: Send to <PLACEHOLDER FOR ATTACK HANDLER>
//     // 
//     return reply.send({ success: true });
//   });

