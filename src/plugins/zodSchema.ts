import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { TypeBoxTypeProvider } from '@fastify/type-provider-json-schema-to-ts';

async function zodSchemaPlugin(server: FastifyInstance) {
  // Add schema compiler for Zod schemas
  server.setValidatorCompiler(({ schema }) => {
    return (data) => {
      try {
        // Assume schema is a Zod schema
        const result = schema.safeParse(data);
        return result.success ? { value: result.data } : { error: result.error };
      } catch (error) {
        return { error };
      }
    };
  });

  // Set error handler for validation errors
  server.setErrorHandler((error, request, reply) => {
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