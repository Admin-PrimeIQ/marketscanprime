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

const banks = [
  { id: 1, nombre: "Banco Industrial" },
  { id: 2, nombre: "BAC" },
  { id: 3, nombre: "Banrural" },
  { id: 4, nombre: "G&T Continental" },
  { id: 5, nombre: "Banco Promerica" },
  { id: 6, nombre: "BAM" },
  { id: 7, nombre: "Banco Azteca" },
  { id: 8, nombre: "Bantrab" },
]

export function BanksTable() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Bancos</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Banco
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Nuevo Banco</DialogTitle>
                <DialogDescription>Agrega un nuevo banco al catálogo</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre del Banco</Label>
                  <Input
                    id="nombre"
                    placeholder="Ej: Banco de América Central"
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
              {banks.map((bank) => (
                <tr key={bank.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-foreground">{bank.id}</td>
                  <td className="px-4 py-3 text-sm text-foreground font-medium">{bank.nombre}</td>
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
