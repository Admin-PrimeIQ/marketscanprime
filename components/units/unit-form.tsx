"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Save, X } from "lucide-react"
import { UnitGeneralTab } from "./form-tabs/unit-general-tab"
import { UnitPricingTab } from "./form-tabs/unit-pricing-tab"
import { UnitRentalTab } from "./form-tabs/unit-rental-tab"
import { UnitSpecificTab } from "./form-tabs/unit-specific-tab"
import Link from "next/link"

export function UnitForm() {
  const [activeTab, setActiveTab] = useState("general")
  const [unitType, setUnitType] = useState<"vivienda" | "oficina" | "industrial">("vivienda")

  return (
    <form className="space-y-6">
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6 overflow-x-auto">
              <TabsTrigger value="general" className="text-xs sm:text-sm">General</TabsTrigger>
              <TabsTrigger value="pricing" className="text-xs sm:text-sm">Precios</TabsTrigger>
              <TabsTrigger value="rental" className="text-xs sm:text-sm">Renta</TabsTrigger>
              <TabsTrigger value="specific" className="text-xs sm:text-sm">Específico</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <UnitGeneralTab onUnitTypeChange={setUnitType} />
            </TabsContent>

            <TabsContent value="pricing">
              <UnitPricingTab />
            </TabsContent>

            <TabsContent value="rental">
              <UnitRentalTab />
            </TabsContent>

            <TabsContent value="specific">
              <UnitSpecificTab unitType={unitType} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-3 sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-3 sm:p-4 border-t border-border z-10">
        <Link href="/units" className="w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto">
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
        </Link>
        <Button type="submit" className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          Guardar Unidad
        </Button>
      </div>
    </form>
  )
}
