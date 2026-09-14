import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestSchema = z.object({
  plumberId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(5).max(30),
  address: z.string().trim().max(200),
  description: z.string().trim().min(5).max(1000),
  urgency: z.enum(["today", "week", "whenever"]),
});

const messageSchema = z.object({
  jobId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});

export const listPlumbers = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await (client as any).rpc("get_marketplace_plumbers");
  if (error) throw new Error("Unable to load plumbers");
  return data ?? [];
});

export const submitCustomerRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("submit_customer_request", {
      p_plumber_id: data.plumberId,
      p_requester_id: context.userId,
      p_name: data.name,
      p_phone: data.phone,
      p_address: data.address,
      p_description: data.description,
      p_urgency: data.urgency,
    });
    if (error) throw new Error("Could not send your request");
    return { ok: true };
  });

export const getCustomerDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("get_customer_dashboard");
    if (error) {
      if (error.code === "PGRST202") {
        throw new Error("The customer portal database migration has not been applied yet.");
      }
      if (error.message?.includes("Customer account required")) {
        throw new Error(
          "This account is not registered as a customer. Create a new client account.",
        );
      }
      throw new Error("Unable to load your client portal. Please sign out and sign in again.");
    }
    return data as {
      profile: {
        full_name: string;
        phone: string | null;
        address: string | null;
        verification_status: string;
      };
      jobs: Array<{
        id: string;
        description: string;
        status: string;
        urgency: string;
        scheduled_at: string | null;
        final_price_cents: number | null;
        suggested_price_cents: number | null;
        business_name: string;
        plumber_verified: string;
      }>;
      payments: Array<{
        id: string;
        job_id: string | null;
        amount_cents: number;
        status: string;
        kind: string;
        created_at: string;
      }>;
      messages: Array<{
        id: string;
        job_id: string | null;
        body: string;
        direction: string;
        created_at: string;
        business_name: string;
      }>;
    };
  });

export const sendCustomerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => messageSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("send_customer_message", {
      p_job_id: data.jobId,
      p_body: data.body,
    });
    if (error) throw new Error("Could not send your message");
    return { ok: true };
  });
