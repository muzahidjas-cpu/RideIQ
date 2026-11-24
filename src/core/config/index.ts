// RideIQ Core Configuration Manager
// Loads environment variables, validates required config, provides typed access.

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('56181').transform(Number),
  MCP_TRANSPORT: z.enum(['stdio', 'streamable-http']).default('stdio'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  MAPS_API_BASE_URL: z.string().optional(),
  MAPS_API_KEY: z.string().optional(),
  DISPATCH_API_BASE_URL: z.string().optional(),
  DISPATCH_API_KEY: z.string().optional(),
  CRM_API_BASE_URL: z.string().optional(),
  CRM_API_KEY: z.string().optional(),
  NOTIFICATIONS_API_BASE_URL: z.string().optional(),
  NOTIFICATIONS_API_KEY: z.string().optional(),
  SAFETY_SERVICES_API_BASE_URL: z.string().optional(),
  SAFETY_SERVICES_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(1, 'ENCRYPTION_KEY is required'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:56181'),
  SIMULATION_DEFAULT_SEED: z.string().default('42').transform(Number),
  SIMULATION_MAX_HORIZON_MINUTES: z.string().default('1440').transform(Number),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = configSchema.parse(process.env);
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
