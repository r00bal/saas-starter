"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  User,
  users,
  activityLogs,
  type NewUser,
  type NewActivityLog,
  ActivityType,
} from "@/lib/db/schema";
import { comparePasswords, hashPassword } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createCheckoutSession, stripe } from "@/lib/payments/stripe";
import { getUser } from "@/lib/db/queries";
import {
  validatedAction,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { signIn as authSignIn, signOut as authSignOut } from "@/auth";

async function logActivity(
  userId: string,
  type: ActivityType,
  ipAddress?: string
) {
  const newActivity: NewActivityLog = {
    userId,
    action: type,
    ipAddress: ipAddress || "",
  };
  await db.insert(activityLogs).values(newActivity);
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  try {
    // Use Auth.js signIn with credentials provider
    const result = await authSignIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result) {
      return {
        error: "Invalid email or password. Please try again.",
        email,
        password,
      };
    }

    const redirectTo = formData.get("redirect") as string | null;
    if (redirectTo === "checkout") {
      const priceId = formData.get("priceId") as string;
      const user = await getUser();
      if (user) {
        return createCheckoutSession({ user, priceId });
      }
    }

    redirect("/dashboard");
  } catch (error) {
    console.error("Sign in error:", error);
    return {
      error: "Invalid email or password. Please try again.",
      email,
      password,
    };
  }
});

const signUpSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: "An account with this email already exists.",
      email,
      password,
    };
  }

  const passwordHash = await hashPassword(password);

  const [createdUser] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role: "member",
    })
    .returning();

  await logActivity(createdUser.id, ActivityType.SIGN_UP);

  try {
    // Use Auth.js signIn after successful registration
    const result = await authSignIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result) {
      return {
        error: "Account created but sign in failed. Please try signing in.",
        email,
        password,
      };
    }

    const redirectTo = formData.get("redirect") as string | null;
    if (redirectTo === "checkout") {
      const priceId = formData.get("priceId") as string;
      return createCheckoutSession({ user: createdUser, priceId });
    }

    redirect("/dashboard");
  } catch (error) {
    console.error("Auto sign-in error:", error);
    return {
      error: "Account created successfully. Please sign in.",
      email: "",
      password: "",
    };
  }
});

export async function signOut() {
  const user = await getUser();
  if (user) {
    await logActivity(user.id, ActivityType.SIGN_OUT);
  }
  await authSignOut({ redirect: false });
  redirect("/");
}

export async function signInWithGoogle(callbackUrl?: string) {
  await authSignIn("google", {
    redirectTo: callbackUrl || "/dashboard",
  });
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    // Check if user has a password (OAuth users might not)
    if (!user.passwordHash) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "Cannot update password for OAuth accounts.",
      };
    }

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "Current password is incorrect.",
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "New password must be different from the current password.",
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "New password and confirmation password do not match.",
      };
    }

    const newPasswordHash = await hashPassword(newPassword);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(user.id, ActivityType.UPDATE_PASSWORD),
    ]);

    return {
      success: "Password updated successfully.",
    };
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(2).max(100),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name } = data;

    await Promise.all([
      db
        .update(users)
        .set({ name, email: user.email })
        .where(eq(users.id, user.id)),
      logActivity(user.id, ActivityType.UPDATE_ACCOUNT),
    ]);

    return { name, success: "Account updated successfully." };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    // Check if user has a password (OAuth users might not)
    if (!user.passwordHash) {
      return {
        password,
        error: "Cannot delete OAuth accounts with password verification.",
      };
    }

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: "Incorrect password. Account deletion failed.",
      };
    }

    try {
      // Cancel Stripe subscription if exists
      if (user.stripeSubscriptionId) {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      }

      // Log the deletion activity
      await logActivity(user.id, ActivityType.DELETE_ACCOUNT);

      // Soft delete the user
      await db
        .update(users)
        .set({
          deletedAt: new Date(),
          email: `${user.email}-${user.id}-deleted`, // Ensure email uniqueness
        })
        .where(eq(users.id, user.id));

      // Sign out using Auth.js
      await authSignOut({ redirect: false });

      redirect("/sign-in");
    } catch (error) {
      console.error("Error deleting account:", error);
      return {
        password,
        error: "Failed to delete account. Please try again.",
      };
    }
  }
);
