import { FastifyInstance, FastifyServerOptions } from 'fastify';
import { roomRoutes } from './routes/roomRoutes';
import { roundRoutes } from './routes/roundRoutes';

// Export room types
export * from './types/roomTypes';
// Export round types (renamed to avoid conflicts)
export {
  RoundDataDB as RoundData,
  RoundParticipantDB as RoundParticipant,
  RoundMessageDB as RoundMessage,
  GMActionDB as GMAction,
  RoundConfig,
  BaseRoundOutcome as RoundOutcome,
} from './types/roundTypes';

// Export controllers
export * from './controllers/roomController';
export * from './controllers/roundController';

// Export services
export * from './services/roomService';
export * from './services/roundService';

// Export schemas
export * from './validators/schemas';

// Export utilities
export * from './utils/messageHandler';
export * from './utils/pvpHandler';

// Main routes registration
export default async function registerRoomRoutes(server: FastifyInstance, options: FastifyServerOptions) {
  // Register room routes
  await roomRoutes(server);
  
  // Register round routes
  await roundRoutes(server);
}