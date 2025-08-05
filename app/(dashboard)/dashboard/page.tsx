"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { customerPortalAction } from "@/lib/payments/actions";
import { useActionState } from "react";
import { User } from "@/lib/db/schema";
import useSWR from "swr";
import { Suspense } from "react";
import { deleteAccount } from "@/app/(login)/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

type ActionState = {
  error?: string;
  success?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function SubscriptionSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ManageSubscription() {
  const { data: userData } = useSWR<User>("/api/user", fetcher);

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="mb-4 sm:mb-0">
              <p className="font-medium">
                Current Plan: {userData?.planName || "Free"}
              </p>
              <p className="text-sm text-muted-foreground">
                {userData?.subscriptionStatus === "active"
                  ? "Billed monthly"
                  : userData?.subscriptionStatus === "trialing"
                  ? "Trial period"
                  : "No active subscription"}
              </p>
            </div>
            <form action={customerPortalAction}>
              <Button type="submit" variant="outline">
                Manage Subscription
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteAccountSkeleton() {
  return (
    <Card className="mb-8 h-[200px]">
      <CardHeader>
        <CardTitle>Delete Account</CardTitle>
      </CardHeader>
    </Card>
  );
}

function DeleteAccount() {
  const [deleteState, deleteAction, isDeletePending] = useActionState<
    ActionState,
    FormData
  >(deleteAccount, {});

  return (
    <Card className="mb-8 border-red-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          Delete Account
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. This will permanently delete your
            account and cancel any active subscriptions.
          </p>

          <form action={deleteAction} className="space-y-4">
            <div>
              <Label htmlFor="password" className="text-sm font-medium">
                Confirm your password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1"
                placeholder="Enter your password to confirm"
              />
            </div>

            {deleteState?.error && (
              <p className="text-red-500 text-sm">{deleteState.error}</p>
            )}

            <Button
              type="submit"
              variant="destructive"
              disabled={isDeletePending}
              className="w-full"
            >
              {isDeletePending ? "Deleting Account..." : "Delete Account"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        <Suspense fallback={<SubscriptionSkeleton />}>
          <ManageSubscription />
        </Suspense>

        <Suspense fallback={<DeleteAccountSkeleton />}>
          <DeleteAccount />
        </Suspense>
      </div>
    </div>
  );
}
