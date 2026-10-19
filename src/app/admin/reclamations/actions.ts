"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { hideReview } from "@/lib/services/reviews";

export async function hideReviewAction(fd: FormData) {
  const a = await requireAdmin();
  await hideReview(a.id, String(fd.get("id")));
  revalidatePath("/admin/reclamations");
  revalidatePath("/pharmacies", "layout");
}
