import { UnitForm } from "@/components/units/unit-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewUnitPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/units">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Nueva Unidad</h1>
          <p className="text-muted-foreground mt-1">Registra una nueva unidad en el proyecto</p>
        </div>
      </div>

      <UnitForm />
    </div>
  )
}
