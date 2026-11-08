import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button, Card, EmptyState } from "@/shared/ui";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon={Compass} title="Página no encontrada" description="La ruta solicitada no existe." action={<Link to="/"><Button variant="primary">Ir al dashboard</Button></Link>} />
    </Card>
  );
}
