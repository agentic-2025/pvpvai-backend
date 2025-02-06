import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SIGNATURE_WINDOW_MS } from '../config';
import { verifySignedMessage } from '../utils/auth';
import { sortObjectKeys } from '../utils/sortObjectKeys';

// Zod schema for auth data in body
export const signedRequestBodySchema = z
  .object({
    sender: z.string(),
    signature: z.string(),
    content: z
      .object({
        // Ensure timestamp is UTC unix timestamp in milliseconds
        timestamp: z
          .number()
          .int()
          .min(Date.now() - SIGNATURE_WINDOW_MS), //Reject records that wouldn't fall in the signature window in basic validation
      })
      .passthrough(),
  })
  .passthrough();

export const signatureVerificationPlugin = async (
  request: FastifyRequest<{
    Body: z.infer<typeof signedRequestBodySchema>;
  }>,
  reply: FastifyReply
) => {
  try {
    // Parse and validate the request body against the schema
    const body = signedRequestBodySchema.parse(request.body);
    const { content, signature, sender } = body;

    const { error } = verifySignedMessage(
      sortObjectKeys(content), // Ensure deterministic content ordering
      signature,
      sender,
      content.timestamp,
      SIGNATURE_WINDOW_MS
    );

    if (error) {
      return reply.code(401).send({
        error,
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
      error: `Internal server error during signature verification: ${error}`,
    });
  }
};

export const signatureVerificationMiddleware = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', signatureVerificationPlugin);
};
