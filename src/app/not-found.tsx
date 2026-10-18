import { ButtonLink, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-lg space-y-3 text-center">
      <h1 className="text-xl font-bold">Page introuvable ou lien expiré</h1>
      <p className="text-sm text-muted">Un lien de suivi peut avoir été remplacé par un plus récent. Vous pouvez en obtenir un nouveau avec votre référence de commande.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink href="/suivi">Retrouver ma commande</ButtonLink>
        <ButtonLink variant="secondary" href="/">Accueil</ButtonLink>
      </div>
    </Card>
  );
}
