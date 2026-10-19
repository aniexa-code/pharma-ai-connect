import "server-only";
import type { DocumentOwner } from "@prisma/client";
import { docSpecs, type UploadedFile } from "./services/onboarding";

/** Lit les pièces jointes d'un formulaire (champs doc_<TYPE>), en ignorant les champs laissés vides. */
export async function documentsFrom(fd: FormData, owner: DocumentOwner): Promise<UploadedFile[]> {
  const out: UploadedFile[] = [];
  for (const spec of docSpecs(owner)) {
    const f = fd.get(`doc_${spec.kind}`);
    if (f instanceof File && f.size > 0) out.push({ kind: spec.kind, name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return out;
}
