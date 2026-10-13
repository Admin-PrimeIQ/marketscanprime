"use client"

import { useEffect, useState, useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import { type StrapiProject, type CatalogItem, strapiClient } from "@/lib/api/strapi"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface FinancingTabProps {
  initialData?: Partial<StrapiProject>
  disabled?: boolean
  onStateChange?: (state: { fha?: boolean; muvi?: boolean; fractionalDownPayment?: boolean; nse?: string }) => void
  onFormValueChange?: (name: string, value: string) => void
}

export function FinancingTab({ initialData, disabled = false, onStateChange, onFormValueChange }: FinancingTabProps) {
  const t = useTranslations('projectForm.financing')
  const [fractionalDownPayment, setFractionalDownPayment] = useState(initialData?.fractionalDownPayment || false)
  const [fha, setFha] = useState(initialData?.fha || false)
  const [muvi, setMuvi] = useState(initialData?.muvi || false)
  const [nses, setNses] = useState<CatalogItem[]>([])
  const [nseSearchQuery, setNseSearchQuery] = useState("")
  const [openNse, setOpenNse] = useState(false)
  const [isLoadingNses, setIsLoadingNses] = useState(false)
  const [selectedNseId, setSelectedNseId] = useState<string | undefined>(
    typeof initialData?.nse === 'object' && initialData.nse !== null
      ? (initialData.nse.documentId || String(initialData.nse.id))
      : initialData?.nse
  )

  const selectedNse = useMemo(() => {
    if (!selectedNseId) return null
    return nses.find(nse => (nse.documentId || String(nse.id)) === selectedNseId) || null
  }, [nses, selectedNseId])

  // Cargar NSEs
  useEffect(() => {
    const loadNses = async () => {
      if (!openNse && nses.length > 0) return
      
      setIsLoadingNses(true)
      try {
        const response = await strapiClient.getCatalogList('nses', {
          page: 1,
          pageSize: 1000,
          search: nseSearchQuery || undefined,
          sort: 'name:asc',
        })
        setNses(response.data || [])
      } catch (error) {
        console.error('Error loading NSEs:', error)
      } finally {
        setIsLoadingNses(false)
      }
    }
    loadNses()
  }, [openNse, nseSearchQuery])

  const filteredNses = useMemo(() => {
    if (!nseSearchQuery) return nses
    const query = nseSearchQuery.toLowerCase()
    return nses.filter(nse => 
      nse.name.toLowerCase().includes(query) ||
      nse.code?.toLowerCase().includes(query)
    )
  }, [nses, nseSearchQuery])
  
  return (
    <div className="space-y-6">
      {/* Hidden input para que el formulario pueda leer el valor seleccionado */}
      <input type="hidden" name="nse" value={selectedNseId || ""} />
      <input type="hidden" name="fractionalDownPayment" value={fractionalDownPayment ? "true" : "false"} />
      
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('parameters')}</h3>
      </div>

      {/* FHA / MUVI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="fha" 
            name="fha"
            disabled={disabled}
            checked={fha}
            onCheckedChange={(checked) => {
              const newValue = checked === true
              setFha(newValue)
              onStateChange?.({ fha: newValue })
            }}
          />
          <Label htmlFor="fha" className="cursor-pointer text-base font-semibold">
            {t('fha')}
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="muvi" 
            name="muvi"
            disabled={disabled}
            checked={muvi}
            onCheckedChange={(checked) => {
              const newValue = checked === true
              setMuvi(newValue)
              onStateChange?.({ muvi: newValue })
            }}
          />
          <Label htmlFor="muvi" className="cursor-pointer">
            {t('muvi')}
          </Label>
        </div>
      </div>

      {/* Fractional Down Payment / Down Payment Percentage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="fractionalDownPayment" 
            disabled={disabled}
            checked={fractionalDownPayment}
            onCheckedChange={(checked) => {
              const newValue = checked === true
              setFractionalDownPayment(newValue)
              onStateChange?.({ fractionalDownPayment: newValue })
            }}
          />
          <Label htmlFor="fractionalDownPayment" className="cursor-pointer">
            {t('fractionalDownPayment')}
          </Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="downPaymentPercentage">{t('downPayment')}</Label>
          <Input
            id="downPaymentPercentage"
            name="downPaymentPercentage"
            type="number"
            step="0.01"
            placeholder="20.00"
            disabled={disabled || !fractionalDownPayment}
            onChange={(e) => onFormValueChange?.('downPaymentPercentage', e.target.value)}
            className="bg-background border-border"
            defaultValue={initialData?.downPaymentPercentage}
          />
        </div>
      </div>

      {/* NSE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>{t('socioeconomicLevel')}</Label>
          <Popover open={openNse} onOpenChange={setOpenNse}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openNse}
                disabled={disabled}
                className="w-full justify-between"
              >
                {selectedNse ? selectedNse.name : t('selectSocioeconomicLevel')}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('searchNSE')}
                  value={nseSearchQuery}
                  onValueChange={setNseSearchQuery}
                />
                <CommandEmpty>
                  {isLoadingNses ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <span>{t('noResults')}</span>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {filteredNses.map((nse) => {
                      const nseId = nse.documentId || String(nse.id)
                      return (
                        <CommandItem
                          key={nseId}
                          value={nseId}
                          onSelect={() => {
                            setSelectedNseId(nseId)
                            setOpenNse(false)
                            setNseSearchQuery("")
                            onStateChange?.({ nse: nseId })
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedNseId === nseId ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col items-start">
                            <span className="font-medium leading-tight">{nse.name}</span>
                            {nse.code && (
                              <span className="text-xs text-muted-foreground leading-tight">{nse.code}</span>
                            )}
                          </div>
                        </CommandItem>
                      )
                    })}
                  </CommandList>
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}
