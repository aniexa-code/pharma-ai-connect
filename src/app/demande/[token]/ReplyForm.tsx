"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Alert, Textarea } from "@/components/ui";
import { replyToRequest } from "../actions";

export function ReplyForm({ token }: { token: string }) {
  const [state, action] = useActionState(replyToRequest, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Textarea name="body" rows={2} required maxLength={1000} placeholder="Répondre à la pharmacie" />
      <Alert>{state.error}</Alert>
      <SubmitButton variant="secondary">Envoyer</SubmitButton>
    </form>
  );
}
