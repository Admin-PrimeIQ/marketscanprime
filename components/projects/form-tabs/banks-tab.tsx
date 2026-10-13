"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type StrapiProject } from "@/lib/api/strapi"

const banks = [
  { id: 1, name: "Banco Industrial" },
  { id: 2, name: "BAC" },
  { id: 3, name: "Banrural" },
  { id: 4, name: "G&T Continental" },
  { id: 5, name: "Banco Promerica" },
  { id: 6, name: "BAM" },
]

interface BankParticipation {
  id: string
  banco_id: string
  porcentaje: string
  name?: string
}

interface BanksTabProps {
  initialParticipations?: { id: string; name: string; percentage?: string }[]
}

export function BanksTab({ initialParticipations = [] }: BanksTabProps) {
  const [participations, setParticipations] = useState<BankParticipation[]>([{ id: "1", banco_id: "", porcentaje: "" }])

  useEffect(() => {
    if (initialParticipations.length > 0) {
      setParticipations(
        initialParticipations.map((p) => ({
          id: p.id,
          banco_id: "",
          porcentaje: p.percentage || "",
          name: p.name,
        }))
      )
    }
  }, [initialParticipations])

  const addParticipation = () => {
    setParticipations([...participations, { id: Date.now().toString(), banco_id: "", porcentaje: "" }])
  }

  const removeParticipation = (id: string) => {
    setParticipations(participations.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Bancos que Participan</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Agrega los bancos que participan en el financiamiento y su porcentaje de participación
        </p>
      </div>

      <div className="space-y-4">
        {participations.map((participation, index) => (
          <div
            key={participation.id}
            className="flex items-end gap-4 p-4 rounded-lg border border-border bg-background"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor={`bank-${participation.id}`}>Banco</Label>
              <Select>
                <SelectTrigger id={`bank-${participation.id}`} className="bg-card border-border">
                  <SelectValue placeholder={participation.name || "Seleccionar banco"} />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id.toString()}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-32 space-y-2">
              <Label htmlFor={`percentage-${participation.id}`}>% Participación</Label>
              <Input
                id={`percentage-${participation.id}`}
                type="number"
                step="0.01"
                placeholder="20.00"
                className="bg-card border-border"
              />
            </div>

            {participations.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeParticipation(participation.id)}
                className="flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addParticipation}>
        <Plus className="w-4 h-4 mr-2" />
        Agregar Banco
      </Button>
    </div>
  )
}
