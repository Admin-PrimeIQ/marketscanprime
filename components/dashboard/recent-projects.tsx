import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, MapPin, Building2 } from "lucide-react"
import Link from "next/link"

const recentProjects = [
  {
    id: 1,
    name: "Torre Atlántida",
    developer: "Inmobiliaria del Atlántico",
    zone: "Zona 14",
    units: 48,
    status: "En Revisión",
    lastUpdate: "Hace 2 horas",
  },
  {
    id: 2,
    name: "Residencial Las Palmas",
    developer: "Constructora Central",
    zone: "Zona 16",
    units: 24,
    status: "Completo",
    lastUpdate: "Hace 5 horas",
  },
  {
    id: 3,
    name: "Office Plaza Central",
    developer: "Grupo Empresarial GT",
    zone: "Zona 10",
    units: 36,
    status: "Activo",
    lastUpdate: "Hace 1 día",
  },
]

export function RecentProjects() {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Últimos Registros Editados</CardTitle>
          <Link href="/projects">
            <Button variant="ghost" size="sm">
              Ver todos
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentProjects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{project.name}</h4>
                  <p className="text-sm text-muted-foreground">{project.developer}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {project.zone}
                    </span>
                    <span className="text-xs text-muted-foreground">{project.units} unidades</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {project.lastUpdate}
                    </span>
                  </div>
                </div>
              </div>
              <Badge
                variant={
                  project.status === "Completo" ? "default" : project.status === "En Revisión" ? "secondary" : "outline"
                }
              >
                {project.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
