import { FastifyInstance, FastifyServerOptions } from "fastify";
import { supabase } from "../config";
import { Database } from "../types/database.types";
import { DataAndError } from "../types/rest";

export default async function companyRoutes(
  server: FastifyInstance,
  options: FastifyServerOptions
) {

  //Note: You do not generally need GET functions for supabas unless you're doing deep data massaging or merging it with other data.
  //The Supabase client has getter functions for all tables already, and the frontend is using it.
  server.post<{
    Body: Database["public"]["Tables"]["agents"]["Insert"];
    Reply: DataAndError<Database["public"]["Tables"]["agents"]["Row"]>;
  }>("", async (request, reply) => {
    try {
      const agentData = request.body;
      const { data: agent, error } = await supabase
        .from("agents")
        .insert(agentData)
        .select()
        .single();

      if (error) {
        console.error("Error inserting agent:", error);
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(201).send({ data: agent });
    } catch (err) {
      console.error("Error in /agent POST:", err);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
