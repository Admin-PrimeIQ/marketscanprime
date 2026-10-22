"use client"

import React, { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Eye,
  Pencil,
  Copy,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { type StrapiExchangeRateProfile } from "@/lib/api/strapi"
import { dataClient } from "@/lib/api/client"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { EmptyState, LoadingState } from "@/components/empty-state"
import { POPSY_ILLUSTRATIONS } from "@/lib/popsy-illustrations"
import { toast } from "@/hooks/use-toast"

interface ExchangeRateProfilesTableProps {
  searchQuery: string
  profiles: StrapiExchangeRateProfile[]
  isLoading?: boolean
  onSortChange?: (sort: string) => void
  onPageSizeChange?: (pageSize: number) => void
  currentPage?: number
  totalPages?: number
  totalItems?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onDeleted?: () => void
}

type SortField = "code" | "name" | "createdAt"
type SortDirection = "asc" | "desc"

interface Column {
  id: string
  label: string
  field: SortField | null
  width: number
  minWidth: number
}

const getColumns = (t: (key: string) => string): Column[] => [
  { id: "code", label: t("code"), field: "code", width: 120, minWidth: 80 },
  { id: "name", label: t("name"), field: "name", width: 220, minWidth: 160 },
  {
    id: "projects",
    label: t("projectsLinked"),
    field: null,
    width: 100,
    minWidth: 80,
  },
  {
    id: "createdAt",
    label: t("createdAt"),
    field: "createdAt",
    width: 150,
    minWidth: 120,
  },
  { id: "actions", label: t("actions"), field: null, width: 100, minWidth: 80 },
]

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return "-"
  try {
    const date = new Date(dateString)
    const hasTime = dateString.includes("T") || dateString.includes(" ")
    if (hasTime) {
      return format(date, "dd/MM/yyyy hh:mm a", { locale: es })
    }
    return format(date, "dd/MM/yyyy", { locale: es })
  } catch {
    return "-"
  }
}

function profileHrefId(p: StrapiExchangeRateProfile): string {
  return String(p.documentId ?? p.id ?? "")
}

function SortableColumnHeader({
  column,
  sortField,
  sortDirection,
  onSort,
}: {
  column: Column
  sortField: SortField | null
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}) {
  const SortIcon =
    column.field === sortField
      ? sortDirection === "asc"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown

  return (
    <th
      className="px-4 py-4 text-sm font-medium text-muted-foreground relative select-none"
      style={{ width: column.width, minWidth: column.minWidth }}
    >
      <div className="flex items-center gap-2">
        {column.field ? (
          <button
            type="button"
            onClick={() => column.field && onSort(column.field)}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span className="uppercase">{column.label}</span>
            <SortIcon
              className={`w-3 h-3 ${column.field === sortField ? "text-foreground" : "text-muted-foreground/50"}`}
            />
          </button>
        ) : (
          <span className="uppercase">{column.label}</span>
        )}
      </div>
    </th>
  )
}

export function ExchangeRateProfilesTable({
  searchQuery,
  profiles,
  isLoading,
  onSortChange,
  onPageSizeChange,
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onDeleted,
}: ExchangeRateProfilesTableProps) {
  const router = useRouter()
  const t = useTranslations("common")
  const [goToPageValue, setGoToPageValue] = useState("")
  const [columns] = useState<Column[]>(() => getColumns(t))
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [deleteTarget, setDeleteTarget] = useState<StrapiExchangeRateProfile | null>(
    null
  )
  const [isDeleting, setIsDeleting] = useState(false)

  const handleSort = (field: SortField) => {
    const newDirection =
      sortField === field && sortDirection === "asc" ? "desc" : "asc"
    setSortField(field)
    setSortDirection(newDirection)
    onSortChange?.(`${field}:${newDirection}`)
  }

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return profiles
    const q = searchQuery.toLowerCase()
    return profiles.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    )
  }, [profiles, searchQuery])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.documentId ?? deleteTarget.id
    if (id === undefined || id === null) return
    setIsDeleting(true)
    try {
      await dataClient.deleteExchangeRateProfile(id)
      toast({ title: t("success"), description: t("deleteExchangeRateProfileSuccess") })
      setDeleteTarget(null)
      onDeleted?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error")
      toast({ title: t("error"), description: msg, variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <LoadingState
        title={t("loading")}
        description={t("loadingExchangeRateProfiles")}
      />
    )
  }

  const rowClick = (p: StrapiExchangeRateProfile) => {
    const hid = profileHrefId(p)
    if (hid) router.push(`/exchange-rate-profiles/view/${hid}`)
  }

  return (
    <div className="space-y-4">
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            illustrationSrc={
              searchQuery ? POPSY_ILLUSTRATIONS.noResults : POPSY_ILLUSTRATIONS.building
            }
            title={
              searchQuery ? t("noExchangeRateProfilesFound") : t("noExchangeRateProfiles")
            }
            description={
              searchQuery ? t("tryDifferentSearch") : t("noExchangeRateProfilesDescription")
            }
            action={
              !searchQuery
                ? {
                    label: t("newExchangeRateProfile"),
                    onClick: () => router.push("/exchange-rate-profiles/new"),
                  }
                : undefined
            }
          />
        ) : (
          filtered.map((p) => (
            <Card
              key={profileHrefId(p)}
              className="p-4 border border-border bg-card cursor-pointer"
              onClick={() => rowClick(p)}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  {p.code ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs mb-2">
                      {p.code}
                    </span>
                  ) : null}
                  <h3 className="text-base font-semibold text-foreground">
                    {p.name || t("noName")}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("projectsLinked")}: {p.projects?.length ?? 0}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <Link href={`/exchange-rate-profiles/view/${profileHrefId(p)}`}>
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        {t("viewDetails")}
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <Link href={`/exchange-rate-profiles/edit/${profileHrefId(p)}`}>
                      <DropdownMenuItem>
                        <Pencil className="w-4 h-4 mr-2" />
                        {t("edit")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href={`/exchange-rate-profiles/clone/${profileHrefId(p)}`}>
                      <DropdownMenuItem>
                        <Copy className="w-4 h-4 mr-2" />
                        {t("duplicate")}
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(p)
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("createdAt")}: {formatDate(p.createdAt)}
              </p>
            </Card>
          ))
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              {columns.map((column) =>
                column.field ? (
                  <SortableColumnHeader
                    key={column.id}
                    column={column}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                ) : (
                  <th
                    key={column.id}
                    className="px-4 py-4 text-sm font-medium text-muted-foreground"
                    style={{ width: column.width, minWidth: column.minWidth }}
                  >
                    <span className="uppercase">{column.label}</span>
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  <EmptyState
                    illustrationSrc={
                      searchQuery ? POPSY_ILLUSTRATIONS.noResults : POPSY_ILLUSTRATIONS.building
                    }
                    title={
                      searchQuery
                        ? t("noExchangeRateProfilesFound")
                        : t("noExchangeRateProfiles")
                    }
                    description={
                      searchQuery
                        ? t("tryDifferentSearch")
                        : t("noExchangeRateProfilesDescription")
                    }
                    action={
                      !searchQuery
                        ? {
                            label: t("newExchangeRateProfile"),
                            onClick: () => router.push("/exchange-rate-profiles/new"),
                          }
                        : undefined
                    }
                    illustrationSize={200}
                    className="py-8"
                  />
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={profileHrefId(p)}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => rowClick(p)}
                >
                  {columns.map((column) => {
                    switch (column.id) {
                      case "code":
                        return (
                          <td
                            key={column.id}
                            className="px-4 py-4"
                            style={{ width: column.width }}
                          >
                            {p.code ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-md border border-border bg-muted/50 font-mono text-xs">
                                {p.code}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        )
                      case "name":
                        return (
                          <td
                            key={column.id}
                            className="px-4 py-4"
                            style={{ width: column.width }}
                          >
                            <p className="text-sm font-semibold text-foreground">
                              {p.name || t("noName")}
                            </p>
                          </td>
                        )
                      case "projects":
                        return (
                          <td
                            key={column.id}
                            className="px-4 py-4"
                            style={{ width: column.width }}
                          >
                            <Badge variant="secondary">{p.projects?.length ?? 0}</Badge>
                          </td>
                        )
                      case "createdAt":
                        return (
                          <td
                            key={column.id}
                            className="px-4 py-4"
                            style={{ width: column.width }}
                          >
                            <span className="text-sm text-foreground">
                              {formatDate(p.createdAt)}
                            </span>
                          </td>
                        )
                      case "actions":
                        return (
                          <td
                            key={column.id}
                            className="px-4 py-4"
                            style={{ width: column.width }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <Link href={`/exchange-rate-profiles/view/${profileHrefId(p)}`}>
                                  <DropdownMenuItem>
                                    <Eye className="w-4 h-4 mr-2" />
                                    {t("viewDetails")}
                                  </DropdownMenuItem>
                                </Link>
                                <DropdownMenuSeparator />
                                <Link href={`/exchange-rate-profiles/edit/${profileHrefId(p)}`}>
                                  <DropdownMenuItem>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    {t("edit")}
                                  </DropdownMenuItem>
                                </Link>
                                <Link href={`/exchange-rate-profiles/clone/${profileHrefId(p)}`}>
                                  <DropdownMenuItem>
                                    <Copy className="w-4 h-4 mr-2" />
                                    {t("duplicate")}
                                  </DropdownMenuItem>
                                </Link>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(p)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t("delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        )
                      default:
                        return null
                    }
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {t("rowsPerPage")}:
              </span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => onPageSizeChange?.(Number(value))}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t("showing")} {(currentPage - 1) * pageSize + 1} -{" "}
              {Math.min(currentPage * pageSize, totalItems)} {t("of")} {totalItems}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2 flex-wrap">
            <div className="flex items-center gap-1 sm:gap-2 justify-center sm:justify-end flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(1)}
                disabled={currentPage === 1}
                className="flex-shrink-0"
                title={t("first")}
              >
                <ChevronsLeft className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">{t("first")}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex-shrink-0"
              >
                {t("previous")}
              </Button>
              <div className="flex items-center gap-1 px-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">
                  {t("page")}
                </span>
                <Input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={goToPageValue}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === "" || (Number(value) >= 1 && Number(value) <= totalPages)) {
                      setGoToPageValue(value)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && goToPageValue) {
                      const page = Number(goToPageValue)
                      if (page >= 1 && page <= totalPages) {
                        onPageChange?.(page)
                        setGoToPageValue("")
                      }
                    }
                  }}
                  onBlur={() => {
                    if (goToPageValue) {
                      const page = Number(goToPageValue)
                      if (page >= 1 && page <= totalPages) {
                        onPageChange?.(page)
                      }
                      setGoToPageValue("")
                    }
                  }}
                  placeholder={currentPage.toString()}
                  className="w-16 sm:w-20 h-8 text-center text-sm"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {t("of")} {totalPages}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex-shrink-0"
              >
                {t("next")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(totalPages)}
                disabled={currentPage === totalPages}
                className="flex-shrink-0"
                title={t("last")}
              >
                <span className="hidden sm:inline mr-1">{t("last")}</span>
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteExchangeRateProfileConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? t("saving") : t("delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
