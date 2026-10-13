"use client"

import { TourStep } from "./tour-guide"
import { useTranslations } from "next-intl"

export function getProjectsTourSteps(t: (key: string) => string): TourStep[] {
  return [
    {
      id: "projects-header",
      target: '[data-tour="projects-header"]',
      title: t("welcome.title"),
      description: t("welcome.description"),
      position: "bottom",
    },
    {
      id: "projects-search",
      target: '[data-tour="projects-search"]',
      title: t("search.title"),
      description: t("search.description"),
      position: "bottom",
    },
    {
      id: "projects-filters",
      target: '[data-tour="projects-filters"]',
      title: t("filters.title"),
      description: t("filters.description"),
      position: "bottom",
    },
    {
      id: "projects-create",
      target: '[data-tour="projects-create"]',
      title: t("create.title"),
      description: t("create.description"),
      position: "left",
    },
    {
      id: "projects-table",
      target: '[data-tour="projects-table"]',
      title: t("table.title"),
      description: t("table.description"),
      position: "top",
    },
    {
      id: "projects-actions",
      target: '[data-tour="projects-actions"]',
      title: t("actions.title"),
      description: t("actions.description"),
      position: "top",
    },
  ]
}

export function getBlocksTourSteps(t: (key: string) => string): TourStep[] {
  return [
    {
      id: "blocks-header",
      target: '[data-tour="blocks-header"]',
      title: t("welcome.title"),
      description: t("welcome.description"),
      position: "bottom",
    },
    {
      id: "blocks-search",
      target: '[data-tour="blocks-search"]',
      title: t("search.title"),
      description: t("search.description"),
      position: "bottom",
    },
    {
      id: "blocks-create",
      target: '[data-tour="blocks-create"]',
      title: t("create.title"),
      description: t("create.description"),
      position: "left",
    },
    {
      id: "blocks-table",
      target: '[data-tour="blocks-table"]',
      title: t("table.title"),
      description: t("table.description"),
      position: "top",
    },
    {
      id: "blocks-actions",
      target: '[data-tour="blocks-actions"]',
      title: t("actions.title"),
      description: t("actions.description"),
      position: "top",
    },
  ]
}

export function getUnitsTourSteps(t: (key: string) => string): TourStep[] {
  return [
    {
      id: "units-header",
      target: '[data-tour="units-header"]',
      title: t("welcome.title"),
      description: t("welcome.description"),
      position: "bottom",
    },
    {
      id: "units-select",
      target: '[data-tour="units-select"]',
      title: t("select.title"),
      description: t("select.description"),
      position: "bottom",
    },
  ]
}

export function getUnitsTableTourSteps(t: (key: string) => string): TourStep[] {
  return [
    {
      id: "units-table-toolbar",
      target: '[data-tour="units-toolbar"]',
      title: t("toolbar.title"),
      description: t("toolbar.description"),
      position: "bottom",
    },
    {
      id: "units-table-grid",
      target: '[data-tour="units-table"]',
      title: t("table.title"),
      description: t("table.description"),
      position: "top",
    },
  ]
}

export function getCatalogsTourSteps(t: (key: string) => string): TourStep[] {
  return [
    {
      id: "catalogs-header",
      target: '[data-tour="catalogs-header"]',
      title: t("welcome.title"),
      description: t("welcome.description"),
      position: "bottom",
    },
    {
      id: "catalogs-types",
      target: '[data-tour="catalogs-types"]',
      title: t("types.title"),
      description: t("types.description"),
      position: "bottom",
    },
    {
      id: "catalogs-list",
      target: '[data-tour="catalogs-list"]',
      title: t("list.title"),
      description: t("list.description"),
      position: "top",
    },
    {
      id: "catalogs-create",
      target: '[data-tour="catalogs-create"]',
      title: t("create.title"),
      description: t("create.description"),
      position: "left",
    },
  ]
}
