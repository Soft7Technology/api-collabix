import dotenv from "dotenv";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z
  .object({
    PORT: z.coerce.number().default(5000),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .default("dev_access_secret_key_at_least_32_chars_long_12345"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32)
      .default("dev_refresh_secret_key_at_least_32_chars_long_12345"),
    JWT_ACCESS_EXPIRES_IN: z.string().default("4h"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
    // Customer URL is used in invitation/reset links. FRONTEND_URLS is the
    // complete CORS allow-list for the customer and administration apps.
    FRONTEND_URL: z.string().url().default("http://localhost:8001"),
    FRONTEND_URLS: z
      .string()
      .default("http://localhost:8001,http://localhost:8002"),
    EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
    SMTP_HOST: z.string().default("sandbox.smtp.mailtrap.io"),
    SMTP_PORT: z.coerce.number().default(2525),
    SMTP_SECURE: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z
      .string()
      .default("Collabix Soft7 Onboarding <no-reply@collabix.com>"),
    // Dedicated Leave / HR Email Service (Soft7.in@gmail.com)
    SMTP_LEAVE_HOST: z.string().default("smtp.gmail.com"),
    SMTP_LEAVE_PORT: z.coerce.number().default(465),
    SMTP_LEAVE_SECURE: z
      .preprocess((val) => val === "true" || val === true, z.boolean())
      .default(true),
    SMTP_LEAVE_USER: z.string().default("Soft7.in@gmail.com"),
    SMTP_LEAVE_PASS: z.string().optional(),
    SMTP_LEAVE_FROM: z
      .string()
      .default("SOFT7 HR <Soft7.in@gmail.com>"),
    COOKIE_DOMAIN: z.string().optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== "production") return;
    if (env.JWT_ACCESS_SECRET.startsWith("dev_")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message: "Production access secret must be explicitly configured",
      });
    }
    if (env.JWT_REFRESH_SECRET.startsWith("dev_")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: "Production refresh secret must be explicitly configured",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
