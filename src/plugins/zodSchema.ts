import { FastifyInstance, FastifySchema, FastifySchemaCompiler } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { ZodError, ZodSchema, z } from 'zod';

type ZodSchemaCompiler = FastifySchemaCompiler<FastifySchema> & {
  schema: ZodSchema;
};

async function zodSchemaPlugin(server: FastifyInstance) {
  server.setValidatorCompiler(({ schema }: { schema: FastifySchema }) => {
    return (data: unknown) => {
      if (schema instanceof z.ZodType) {
        try {
          const result = schema.safeParse(data);
          return result.success
            ? { value: result.data }
            : { error: new Error(result.error.message) };
        } catch (err) {
          return { error: err instanceof Error ? err : new Error('Validation failed') };
        }
      }
      // Handle non-Zod schemas (fallback)
      return { value: data };
    };
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: 'Validation error',
        details: error.issues
      });
      return;
    }
    if (error.validation) {
      reply.status(400).send({
        error: 'Validation error',
        details: error.validation
      });
      return;
    }
    reply.send(error);
  });
}

export default fastifyPlugin(zodSchemaPlugin);