import { getBytes, hashMessage, recoverAddress } from 'ethers';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SIGNATURE_WINDOW_MS } from '../config';

// Constants

// Types
type SignedRequest = {
  account: string;
  timestamp: number;
  [key: string]: any;
};

// Zod schema for auth data in body
const signedRequestSchema = z
  .object({
    account: z.string(),
    // Ensure timestamp is UTC unix timestamp in milliseconds
    timestamp: z
      .number()
      .int()
      .min(Date.now() - SIGNATURE_WINDOW_MS) //Reject records that wouldn't fall in the signature window in basic validation
  })
  .passthrough();

const extractAddressFromMessage = (message: string, signature: string): string => {
  const hash = hashMessage(message);
  const digest = getBytes(hash);
  return recoverAddress(digest, signature);
};

export const signatureVerificationPlugin = async (
  request: FastifyRequest<{
    Headers: { 'x-authorization-signature': string };
    Body: SignedRequest;
  }>,
  reply: FastifyReply
) => {
  try {
    const signature = request.headers['x-authorization-signature'];
    if (!signature) {
      return reply.code(401).send({
        error: 'Missing signature header',
      });
    }

    const body = signedRequestSchema.parse(request.body);
    const now = Date.now(); // UTC timestamp
    console.log('Signature verification - Server time:', now);
    console.log('Signature verification - Request time:', body.timestamp);
    console.log('Signature verification - Time difference:', now - body.timestamp);

    if (body.timestamp > now) {
      return reply.code(401).send({
        error:
          'Timestamp is in the future. Ensure your timestamp is in millisecond precision and is in UTC.',
        serverTime: now,
        requestTime: body.timestamp,
      });
    }
    if (now - body.timestamp > SIGNATURE_WINDOW_MS) {
      return reply.code(401).send({
        error:
          'Signature expired. Please ensure your timestamp has millisecond precision, is in UTC, and is within 5000ms of the current time in UTC.',
        serverTime: now,
        requestTime: body.timestamp,
        difference: now - body.timestamp,
      });
    }

    const messageToVerify = JSON.stringify(request.body);
    const recoveredAddress = extractAddressFromMessage(messageToVerify, signature);

    if (recoveredAddress.toLowerCase() !== body.account.toLowerCase()) {
      return reply.code(401).send({
        error: 'Signature verification failed',
        expected: body.account,
        recovered: recoveredAddress,
      });
    }

    return;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: error.errors,
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal server error during signature verification',
    });
  }
};

export const signatureVerificationMiddleware = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', signatureVerificationPlugin);
};
