import { z } from 'zod';
import { dayIsBefore, daySchema, slugLikeSchema } from './primitives.ts';

/** A 32-byte X25519 public key in standard base64: 44 characters ending in "=". */
export const publicKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/, 'expected a 32-byte key in base64');

/** First 8 bytes of SHA-256 of the public key, hex, grouped: "ab12-cd34-ef56-7890". Printed on the trust page. */
export const keyFingerprintSchema = z
  .string()
  .regex(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/, 'expected four groups of four hex characters');

/**
 * The settings file of a workshop: workshops/<slug>/workshop.json.
 * A workshop is a folder; this file is the part that is not cards or copy.
 */
export const workshopConfigSchema = z
  .object({
    slug: slugLikeSchema.min(3),
    name: z.string().min(1).max(80),
    organizer: z.string().min(1).max(120),
    purpose: z.string().min(1).max(300),
    warmupsPerSession: z.number().int().min(0).max(10),
    checkpointsPerSession: z.number().int().min(0).max(10),
    invitesPerParticipant: z.number().int().min(0).max(10),
    /** Safety valve on the wave links: joins stop at this many participants per wave. */
    cap: z.number().int().min(1).max(100000),
    opensDay: daySchema,
    closesDay: daySchema,
    deleteDay: daySchema,
    publicKey: publicKeySchema,
    keyFingerprint: keyFingerprintSchema,
  })
  .superRefine((w, ctx) => {
    if (w.warmupsPerSession + w.checkpointsPerSession < 1) {
      ctx.addIssue({ code: 'custom', message: 'a session needs at least one card' });
    }
    if (dayIsBefore(w.closesDay, w.opensDay)) {
      ctx.addIssue({ code: 'custom', message: 'closesDay must not be before opensDay' });
    }
    if (!dayIsBefore(w.closesDay, w.deleteDay)) {
      ctx.addIssue({ code: 'custom', message: 'deleteDay must be after closesDay' });
    }
  });
export type WorkshopConfig = z.infer<typeof workshopConfigSchema>;

/**
 * workshops/<slug>/workshop.staging.json: what staging builds and the local server use instead of
 * the production values. The public key staging seals to, so drills open with the development
 * private key and the production key never leaves the vault; and, optionally, an earlier opening
 * day, so staging can be tried before the real window. Production ignores this file entirely.
 */
export const workshopStagingSchema = z.strictObject({
  publicKey: publicKeySchema,
  keyFingerprint: keyFingerprintSchema,
  opensDay: daySchema.optional(),
});
export type WorkshopStaging = z.infer<typeof workshopStagingSchema>;

export const WORKSHOP_STATUSES = ['draft', 'open', 'closed', 'exported', 'deleted'] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];
