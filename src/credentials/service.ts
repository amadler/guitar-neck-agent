import { db } from "../db/client.js";
import { userCredentials } from "../db/schema/user_credentials.js";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto.js";

export const credentialsService = {
  async save(userId: string, apiKey: string): Promise<void> {
    const encryptedApiKey = encrypt(apiKey);

    await db
      .insert(userCredentials)
      .values({
        userId,
        provider: "openrouter",
        encryptedApiKey,
      })
      .onConflictDoUpdate({
        target: [userCredentials.userId, userCredentials.provider],
        set: { encryptedApiKey, updatedAt: new Date() },
      });
  },

  async getStatus(userId: string): Promise<{ configured: boolean }> {
    const [cred] = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1);

    return { configured: !!cred };
  },

  async delete(userId: string): Promise<void> {
    await db
      .delete(userCredentials)
      .where(eq(userCredentials.userId, userId));
  },

  async getDecryptedKey(userId: string): Promise<string | null> {
    const [cred] = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1);

    if (!cred) return null;
    return decrypt(cred.encryptedApiKey);
  },
};