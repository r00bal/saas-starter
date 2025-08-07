import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db/drizzle"
import { comparePasswords } from "@/lib/auth/session"
import { eq, and, isNull } from "drizzle-orm"
import { users, accounts, sessions, verificationTokens, activityLogs, ActivityType } from "@/lib/db/schema"
import { z } from "zod"

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" }, // Keep current JWT strategy
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const { email, password } = signInSchema.parse(credentials)

          const user = await db
            .select()
            .from(users)
            .where(and(eq(users.email, email), isNull(users.deletedAt)))
            .limit(1)

          if (user.length === 0) {
            return null
          }

          const foundUser = user[0]

          // Check if user has a password (OAuth users might not)
          if (!foundUser.passwordHash) {
            return null
          }

          const isPasswordValid = await comparePasswords(
            password,
            foundUser.passwordHash
          )

          if (!isPasswordValid) {
            return null
          }

          // Log sign-in activity
          await db.insert(activityLogs).values({
            userId: foundUser.id,
            action: ActivityType.SIGN_IN,
            ipAddress: "", // Will be populated by the calling code
          })

          return {
            id: foundUser.id.toString(),
            name: foundUser.name,
            email: foundUser.email,
            image: foundUser.image,
            role: foundUser.role,
          }
        } catch (error) {
          console.error("Auth error:", error)
          return null
        }
      }
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers, log the sign-in activity (adapter handles user creation)
      if (account?.provider !== "credentials" && user.id) {
        try {
          await db.insert(activityLogs).values({
            userId: user.id,
            action: ActivityType.SIGN_IN,
            ipAddress: "",
          })
        } catch (error) {
          console.error("Error logging OAuth sign-in:", error)
        }
      }
      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url
      return `${baseUrl}/dashboard`
    }
  },
  pages: {
    signIn: '/sign-in',
  },
})