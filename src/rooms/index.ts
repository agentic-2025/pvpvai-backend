import { FastifyInstance } from 'fastify';
import { roomController } from '../controllers/roomController';
import { roomRoutes } from '../routes/roomRoutes';

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


// Main routes registration
export default async function registerRoomRoutes(
  server: FastifyInstance
) {
  // Remove duplicate route registrations and use the routes from roomRoutes instead
  await roomRoutes(server);
}
