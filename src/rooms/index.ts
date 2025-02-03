import { FastifyInstance, FastifyServerOptions } from 'fastify';
import { messagesRoutes } from '../routes/messageRoutes';
import { roomRoutes } from '../routes/roomRoutes';
import { roundRoutes } from '../routes/roundRoutes';

// Export room types
export * from '../types/roomTypes';
// Export round types (renamed to avoid conflicts)
export {
  RoundConfig,
  RoundDataDB as RoundData,
  RoundMessageDB as RoundMessage,
  BaseRoundOutcome as RoundOutcome,
  RoundParticipantDB as RoundParticipant,
} from '../types/roundTypes';

// Export controllers
export * from '../controllers/roomController';
export * from '../controllers/roundController';

// Export services
export * from '../services/roomService';
export * from '../services/roundService';

// Export schemas
export * from '../utils/schemas';

// Export utilities
export * from '../utils/messageHandler';
export * from '../utils/pvpHandler';

// Main routes registration
export default async function registerRoomRoutes(
  server: FastifyInstance,
  options: FastifyServerOptions
) {
  // Register room routes
  await roomRoutes(server);

  // Register round routes
  await roundRoutes(server);

  // Register observation routes
  await messagesRoutes(server);
}
