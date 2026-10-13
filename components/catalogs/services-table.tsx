"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Pencil, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const services = [
  { id: 1, nombre: "Seguridad 24/7" },
  { id: 2, nombre: "Garita de seguridad" },
  { id: 3, nombre: "Circuito cerrado de cámaras" },
  { id: 4, nombre: "Control de acceso" },
  { id: 5, nombre: "Conserje" },
  { id: 6, nombre: "Mantenimiento" },
  { id: 7, nombre: "Área comercial" },
  { id: 8, nombre: "Estacionamiento de visitas" },
  { id: 9, nombre: "Generador eléctrico" },
  { id: 10, nombre: "Cisterna" },
]

export function ServicesTable() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Servicios</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Servicio
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Nuevo Servicio</DialogTitle>
                <DialogDescription>Agrega un nuevo servicio al catálogo</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre del Servicio</Label>
                  <Input
                    id="nombre"
                    placeholder="Ej: Limpieza de áreas comunes"
                    className="bg-background border-border"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 text-sm font-medium text-muted-foreground">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 text-sm font-medium text-muted-foreground text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-foreground">{service.id}</td>
                  <td className="px-4 py-3 text-sm text-foreground font-medium">{service.nombre}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
