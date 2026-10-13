# Graph Report - marketscanprime  (2026-10-13)

## Corpus Check
- 277 files · ~284,441 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 5, .css 3, .example 1)

## Summary
- 2622 nodes · 8405 edges · 110 communities (95 shown, 15 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 304 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Páginas y componentes UI base
- Formularios de bloque y filtros
- Tablas editables y diálogos
- Sistema de toasts
- Motor UI Blocks (parser)
- Columnas dinámicas unitType
- Tipo de cambio Banguat
- Renderizador UI Blocks
- Historial de sync en changelog
- Sesiones y conversaciones Copilot
- Embed del chat Copilot
- Tablas de proyectos y perfiles
- Cliente Strapi: métodos CRUD
- Config y reglas de tamaño
- API de corridas sync y logging
- Sidebar de navegación
- CLI migración: run y dry-run
- Logs de herramientas n8n
- Diff de snapshots
- Medidas, El Salvador e IVA
- Pipeline de migración por bloque
- Markdown profesional del chat
- Historial y semántica de mensajes
- Copiar markdown del chat
- Autenticación y layout principal
- Dominios industrial y changelog
- Puente React-markdown del chat
- Hoja de unidades (datasheet)
- Tipos e interfaces Strapi
- Iconos de archivos del composer
- Regiones y diálogo de corrida
- CLI migración: rollback y status
- Ilustraciones Notion
- Navegador de archivos de corrida
- Parser de tool logs n8n
- Tabla Univer (legado)
- Carrusel
- Layout raíz, i18n y tema
- Formularios (react-hook-form)
- Inputs, selects y ajustes
- Tabla avanzada de proyectos
- Gráficas (charts)
- Financiamiento por bloque
- Tabla Luckysheet (legado)
- Fases de corrida colapsables
- Artefactos y purga de corridas
- Paginación
- Menús desplegables y dashboard
- Arquitectura general (CLAUDE.md)
- Motor de fórmulas de unidades
- Integraciones n8n (manual)
- Operación del backoffice (manual)
- Field, item y button group
- IVA y cuota por país
- Diálogos y nueva corrida
- Fórmulas replicadas (migración)
- Flujo seguro de migración
- Cliente Strapi de migración
- Chrome y hojas del Copilot
- Preproceso UI Blocks compactos
- Toggle y estados vacíos
- Menubar
- Guardado en lote de unidades
- Primitivas shadcn/ui
- Menú contextual
- Generación de códigos únicos
- Proxy Strapi con logging
- Drawer
- Input group y textarea
- Menú de navegación
- Reglas de escritura Strapi v5
- Formulario de unidad
- Multimoneda del proyecto
- Auth cliente y middleware
- Carga liviana de bloques
- Tours guiados
- Visor de código JSON
- Estado de escritura del chat
- Hover card
- Login y token
- Recuperación de contraseña
- Tests UI Blocks
- Aspect ratio
- Configuración PostCSS
- Reporte de bugs (package)
- Engines de Node
- Dependencias npm del backoffice
- Paquete CLI de migración
- Modelo de datos Strapi (manual)
- Configuración shadcn
- Configuración TypeScript
- Dependencias CLI migración
- Dependencias Radix y utilidades
- Dev dependencies y Tailwind
- Scripts npm
- Metadatos del repo
- Changelog: market en bloques
- Changelog: arranque del proyecto
- Changelog: recuperación de contraseña
- Changelog: periodo de recolección
- Push/pull warehouse (manual)
- Módulo de sincronización (manual)
- Alertas y precio promedio m²
- Monedas y financiamiento (manual)
- Oficinas e industrial (unitType)
- Permisos y errores del CRM
- Changelog v0.2.0 (batch sync)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 332 edges
2. `Button()` - 165 edges
3. `react` - 144 edges
4. `lucide-react` - 104 edges
5. `DatasheetUnitsTable()` - 103 edges
6. `strapiClient` - 87 edges
7. `Card()` - 87 edges
8. `next-intl` - 79 edges
9. `Input()` - 75 edges
10. `CardContent()` - 69 edges

## Surprising Connections (you probably didn't know these)
- `Reconciliation tolerance > 0.01` --semantically_similar_to--> `CHANGE_TOLERANCE`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-06-05-units-total-size-rules.md → .migration/src/core/fields.js
- `Región GAM vs Interior` --conceptually_related_to--> `getBlockRegion()`  [INFERRED]
  docs/manual-del-sistema.md → lib/region.ts
- `Tamaños de unidad (frontM2, depthM2, landM2, unitSizeM2, parkingSizeM2, totalSizeM2, habitableConstructionM2)` --conceptually_related_to--> `getVarasFactor()`  [INFERRED]
  docs/manual-del-sistema.md → lib/units/varas.ts
- `Precio sin IVA` --references--> `removeVat()`  [INFERRED]
  docs/manual-del-sistema.md → lib/units/formulas.ts
- `Ingreso requerido` --references--> `syncUnitIncome()`  [INFERRED]
  docs/manual-del-sistema.md → lib/units/formulas.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Reglas por país (GT/SV): dimensión país, departamentos, cuota e IVA por ISO con paridad en la migración** — changelog_country_dimension, changelog_departments_by_country, changelog_installment_by_iso, changelog_vat_by_country_iso, changelog_formula_parity [EXTRACTED 1.00]
- **Pull MySQL → Strapi: fases, resolución por hermano, catálogos referenciados y guarda de vaciado** — changelog_pull_three_phases, changelog_project_sibling_resolution, changelog_catalogs_referenced_not_updated, changelog_emptying_guard, changelog_pull_deletes_units, changelog_sql_projects_picker [EXTRACTED 1.00]
- **Financiamiento del bloque (bancos, FHA, propietario, enganche, plazos)** — docs_manual_del_sistema_componente_financing, docs_manual_del_sistema_tasas_anuales_por_banco, docs_manual_del_sistema_bancos_de_financiamiento, docs_manual_del_sistema_financiamiento_fha, docs_manual_del_sistema_financiamiento_del_propietario, docs_manual_del_sistema_enganche_fraccionado, docs_manual_del_sistema_plazos_maximos_de_credito [EXTRACTED 1.00]
- **Pregunta al Copilot con memoria, herramientas y streaming** — docs_manual_del_sistema_copilot, docs_manual_del_sistema_chat_sessions_api, docs_manual_del_sistema_proxy_copilot_n8n_chat, docs_manual_del_sistema_copilot_ai_agents_2_2, docs_manual_del_sistema_supabase, docs_manual_del_sistema_openai, docs_manual_del_sistema_bloques_ui_directivas [EXTRACTED 1.00]
- **Editar y guardar unidades (hoja, proxy, CRM, generate-code, Block Edit Queue)** — docs_manual_del_sistema_hoja_de_unidades, docs_manual_del_sistema_proxy_api_strapi, docs_manual_del_sistema_strapi_crm, docs_manual_del_sistema_reintento_codigo_duplicado, docs_manual_del_sistema_block_edit_queue, docs_manual_del_sistema_contadores_del_bloque [EXTRACTED 1.00]
- **Flujo de guardado de unidades con reintento de código y recálculo de contadores** — docs_manual_del_sistema_hoja_de_unidades, docs_manual_del_sistema_proxy_api_strapi, docs_manual_del_sistema_crm_strapi, docs_manual_del_sistema_generate_code_unidades, docs_manual_del_sistema_block_edit_queue, docs_manual_del_sistema_redis, docs_manual_del_sistema_contadores_del_bloque [EXTRACTED 1.00]
- **Flujo pull warehouse → CRM en tres fases** — docs_manual_del_sistema_sync_writeback_api, docs_manual_del_sistema_sync_resolve_targets, docs_manual_del_sistema_sync_drainer, docs_manual_del_sistema_sync_pull_block_worker, docs_manual_del_sistema_tres_fases_pull, docs_manual_del_sistema_strapi_crm [EXTRACTED 1.00]
- **Corrida de push al warehouse** — docs_manual_del_sistema_pagina_sync, docs_manual_del_sistema_sync_writeback_api, docs_manual_del_sistema_supabase, docs_manual_del_sistema_resolve_targets, docs_manual_del_sistema_sync_drainer, docs_manual_del_sistema_block_worker, docs_manual_del_sistema_s3, docs_manual_del_sistema_warehouse [EXTRACTED 1.00]
- **Flujo push CRM → warehouse (Writeback API, Resolve Targets, Drainer, Block Worker, S3, warehouse)** — docs_manual_del_sistema_sync_writeback_api, docs_manual_del_sistema_sync_resolve_targets, docs_manual_del_sistema_sync_drainer, docs_manual_del_sistema_sync_block_worker, docs_manual_del_sistema_respaldo_previo_s3, docs_manual_del_sistema_warehouse_mysql, docs_manual_del_sistema_sync_run_blocks [EXTRACTED 1.00]
- **Parámetros de consulta de listados del CRM** — docs_manual_del_sistema_parametro_populate, docs_manual_del_sistema_filtros_strapi, docs_manual_del_sistema_parametro_sort, docs_manual_del_sistema_paginacion_strapi, docs_manual_del_sistema_parametro_fields, docs_manual_del_sistema_envoltura_data_meta [EXTRACTED 1.00]
- **Reglas de escritura en el CRM Strapi v5** — docs_manual_del_sistema_cuerpo_dentro_de_data, docs_manual_del_sistema_relaciones_por_documentid, docs_manual_del_sistema_componentes_sin_id, docs_manual_del_sistema_error_400_validationerror [EXTRACTED 1.00]
- **Safe reversible block-by-block migration run** — migration_readme_dry_run_command, migration_readme_run_command, migration_readme_gate, migration_readme_checkpoint_resume, migration_readme_rollback_command, migration_readme_original_jsonl_backup [EXTRACTED 1.00]
- **Despliegue del sync por tipo de inmueble (Vivienda → Oficinas → Industrial)** — changelog_property_domain_selector, changelog_domain_in_ledger, changelog_action_domain_gate, changelog_domain_mapper_registry, changelog_oficinas_push, changelog_industrial_pull, changelog_industrial_push [INFERRED 0.85]
- **Country ISO-driven unit business rules** — claude_country_block_rules, claude_vat_rule, claude_installment_rule, docs_superpowers_plans_2026_06_10_vat_by_country_sv_zero_vat_placeholder, docs_superpowers_plans_2026_06_10_installment_by_country_installment_by_iso_config, docs_superpowers_plans_2026_06_10_installment_by_country_country_iso_ref [INFERRED 0.85]
- **Formula parity between units grid and migration CLI** — claude_formula_parity_contract, docs_superpowers_plans_2026_06_07_units_migration_cli_formula_engine_copy, migration_readme_parity_test, docs_superpowers_plans_2026_06_10_installment_by_country_installment_parity_case, docs_superpowers_plans_2026_06_10_vat_by_country_vat_parity_case [INFERRED 0.85]

## Communities (110 total, 15 thin omitted)

### Community 0 - "Páginas y componentes UI base"
Cohesion: 0.06
Nodes (140): CatalogKey, CatalogTypeKey, BlocksTableProps, Column, SortDirection, SortField, SeriesKey, StatsCardProps (+132 more)

### Community 1 - "Formularios de bloque y filtros"
Cohesion: 0.06
Nodes (78): BlockFormProps, AdvancedFiltersProps, FieldDefinition, FilterOperator, AmenitiesTabProps, CurrenciesTabProps, FinancingTabProps, GeneralInfoTabProps (+70 more)

### Community 13 - "Tablas editables y diálogos"
Cohesion: 0.14
Nodes (38): CatalogTableProps, CopilotConversationListProps, CellPosition, ColumnDef, FieldType, UnitKindCombo, CatalogTable(), isValidCode() (+30 more)

### Community 14 - "Sistema de toasts"
Cohesion: 0.08
Nodes (39): ToastActionElement, ToastProps, Action, ActionType, State, Toast, ToasterToast, Action (+31 more)

### Community 15 - "Motor UI Blocks (parser)"
Cohesion: 0.08
Nodes (38): BlockMeta, TextVariant, actionFromLabel(), createBlock(), filterBlocks(), flattenBlocks(), generateId(), hiddenFileExtensionHint() (+30 more)

### Community 18 - "Columnas dinámicas unitType"
Cohesion: 0.10
Nodes (35): DynamicZoneFieldDef, DzGridType, DzSegment, ParsedDynamicZoneColumnKey, ResolvedUnitTypeDynamicColumn, getFieldPath(), getNestedValue(), applyUnitTypeDynamicLocalChange() (+27 more)

### Community 19 - "Tipo de cambio Banguat"
Cohesion: 0.09
Nodes (32): ExchangeRateDirection, ExchangeRateSnapshot, JsonApiEnvelope, JsonApiResource, CacheEntry, DELETE(), GET(), comparableRate() (+24 more)

### Community 20 - "Renderizador UI Blocks"
Cohesion: 0.09
Nodes (33): EmailBlock, UIBlocksRendererProps, ButtonItem, HiddenFileAnalysisKind, NoteLevel, UIBlock, BlockRenderer(), BrandGmailIcon() (+25 more)

### Community 21 - "Historial de sync en changelog"
Cohesion: 0.06
Nodes (30): Domain, BlockNames, SEVERITY, Reintento de resolución de nombres mientras la corrida sigue viva, Dominio validado en la ruta y guardado en el ledger, Guarda de vaciado antes de borrar (failed_sanity), Carga única de financiamiento (482 bloques) en vez de Pull, Nombre de unidad desde num_unidad/no_unidad (deja de crecer) (+22 more)

### Community 22 - "Sesiones y conversaciones Copilot"
Cohesion: 0.13
Nodes (27): CopilotContextValue, CopilotConversation, PrimeiqChatSession, PrimeiqChatSessionListResponse, CopilotProvider(), sessionToConversation(), useCopilotConversations(), loadCopilotConversations() (+19 more)

### Community 24 - "Embed del chat Copilot"
Cohesion: 0.11
Nodes (25): CopilotChatEmbedProps, CopilotWelcomeButton, CopilotWelcomeMessageStrings, AttachFooterDisclaimerOptions, ButtonVariant, CopilotChatEmbed(), getCopilotN8nChatProxyWebhookUrl(), getCopilotN8nUpstreamWebhookUrl() (+17 more)

### Community 25 - "Tablas de proyectos y perfiles"
Cohesion: 0.11
Nodes (26): EmptyStateProps, ErrorStateProps, LoadingStateProps, Column, ExchangeRateProfilesTableProps, SortDirection, SortField, Column (+18 more)

### Community 29 - "Config y reglas de tamaño"
Cohesion: 0.09
Nodes (19): CascadeGroupConfig, CascadeRule, DimensionCascadeGroup, DimensionCascadeRule, findCascadeRule(), findDimensionCascadeRule(), DATASHEET_CONFIG, RECONCILE_FIELD_LABELS (+11 more)

### Community 3 - "API de corridas sync y logging"
Cohesion: 0.07
Nodes (61): SyncRunsTableProps, LogParams, ListRunsParams, ReleaseResult, SqlBlock, SqlProject, SyncApiError, SyncDomain (+53 more)

### Community 30 - "Sidebar de navegación"
Cohesion: 0.09
Nodes (27): SidebarContextProps, SidebarContent(), SidebarFooter(), SidebarGroup(), SidebarGroupAction(), SidebarGroupContent(), SidebarGroupLabel(), SidebarHeader() (+19 more)

### Community 31 - "CLI migración: run y dry-run"
Cohesion: 0.15
Nodes (18): DryRun, Run, filterBlocks(), runTimestamp(), filterBlocks(), readJsonIf(), runTimestamp(), createGate() (+10 more)

### Community 33 - "Logs de herramientas n8n"
Cohesion: 0.18
Nodes (27): ToolLogEntry, ToolLogDetailTreeTier, ToolUiKind, detachAssistantReactHostFromBubble(), countWords(), extractToolCallIdsFromAiToolCallsRaw(), isKnownAssistantResponseText(), parseToolLogEntry() (+19 more)

### Community 34 - "Diff de snapshots"
Cohesion: 0.14
Nodes (23): FieldChange, LineState, Row, RowChange, SideLine, SnapshotDiff, TableDiff, DiffCounter() (+15 more)

### Community 35 - "Medidas, El Salvador e IVA"
Cohesion: 0.10
Nodes (23): blockBehavior, vatRatesFor(), OUT_OF_RANGE_FIELDS, BEHAVIOR_BADGE_CLASS, Promedios AVG del bloque (precio y mantenimiento por m²), Etiqueta de comportamiento derivada del motor (lote / vertical / horizontal), País como dimensión (CountryPill, filtros y columna País), Departamentos por país (GT 22, SV 14) (+15 more)

### Community 37 - "Pipeline de migración por bloque"
Cohesion: 0.15
Nodes (21): AbortError, getVatRate(), isLoteBlock(), isVerticalBlock(), blockDir(), fieldChanged(), fmtNum(), numericish() (+13 more)

### Community 40 - "Markdown profesional del chat"
Cohesion: 0.14
Nodes (22): CopilotHljsLanguageId, ProfessionalMarkdownHandle, decodeHtmlEntities(), enhanceCodeBlock(), enhanceImages(), enhanceLinks(), enhanceMessage(), enhanceOneImage() (+14 more)

### Community 41 - "Historial y semántica de mensajes"
Cohesion: 0.15
Nodes (21): AttachMessageSemanticsOptions, PrimeIqMessageTypeAttr, ChatHistoryMessage, applyPrimeIqMessageSemantics(), attachMessageSemantics(), inferEphemeralMessageType(), listMessageBubbles(), normalizeText() (+13 more)

### Community 44 - "Copiar markdown del chat"
Cohesion: 0.17
Nodes (21): BubbleActionLabels, BubbleMessage, RawQueueState, attachBelowActionsWidthSync(), attachCopyMarkdownToBubbles(), attachRawMarkdownFromQueue(), belowHostIsValid(), createCopyButton() (+13 more)

### Community 45 - "Autenticación y layout principal"
Cohesion: 0.23
Nodes (16): AuthContextType, StrapiUser, AuthSession, MainLayout(), isComparisonPayload(), MainLayoutClient(), AuthProvider(), useAuth() (+8 more)

### Community 48 - "Dominios industrial y changelog"
Cohesion: 0.11
Nodes (17): ChangelogEntry, ChangelogSection, CHANGELOG, Recalculo de columnas derivadas (varas² y quetzales) en cada push, Registro de mapper de escritura por tipo de inmueble, Pull de Industrial (MySQL → Strapi), Push de Industrial con mapper de escritura propio, Push de Oficinas (dos direcciones) (+9 more)

### Community 49 - "Puente React-markdown del chat"
Cohesion: 0.18
Nodes (19): AssistantReactMarkdownHandle, N8nChatBubbleChromeOptions, N8nChatRow, attachAssistantReactMarkdownBubbles(), syncHosts(), cleanupOrphanedBubbleChip(), ensureAssistantAboveBubbleHost(), ensureReactHost() (+11 more)

### Community 5 - "Hoja de unidades (datasheet)"
Cohesion: 0.05
Nodes (59): DropdownCellProps, CellDataType, UnitKindViewFilter, StrapiError, StrapiUnitType, IndustrialKind, VatRates, UnitTypeLabels (+51 more)

### Community 50 - "Tipos e interfaces Strapi"
Cohesion: 0.10
Nodes (19): CatalogListResponse, CatalogRequest, CatalogResponse, StrapiAuthResponse, StrapiBlocksResponse, StrapiCategory, StrapiExchangeRateProfilesResponse, StrapiProjectFinancingParam (+11 more)

### Community 51 - "Iconos de archivos del composer"
Cohesion: 0.14
Nodes (19): FileKind, attachComposerFileTypeIcons(), classify(), cleanupChip(), enhanceChip(), fileExtension(), handleRemoved(), scanContainer() (+11 more)

### Community 54 - "Regiones y diálogo de corrida"
Cohesion: 0.15
Nodes (15): BlockIndex, PickerBlock, ProjectRow, Region, BlockRegion, SqlProjectsPage, PasoTitulo(), countryFlag() (+7 more)

### Community 58 - "CLI migración: rollback y status"
Cohesion: 0.20
Nodes (14): Rollback, Status, listBlockDirs(), listRuns(), readJsonl(), runsRoot(), listRuns(), readJsonIf() (+6 more)

### Community 60 - "Ilustraciones Notion"
Cohesion: 0.18
Nodes (13): NotionAvatarProps, InlineNotionIllustrationProps, NotionIllustrationProps, ErrorState(), generateSeed(), NotionAvatarComponent(), useNotionAvatar(), CustomAvatarExample() (+5 more)

### Community 61 - "Navegador de archivos de corrida"
Cohesion: 0.21
Nodes (12): FolderEntry, Summary, SyncRunFile, SyncRunFilesPage, formatBytes(), RunFilesBrowser(), SnapshotViewerDialog(), summarise() (+4 more)

### Community 63 - "Parser de tool logs n8n"
Cohesion: 0.31
Nodes (16): ToolLogDetail, ToolLogOptions, clipText(), extractToolEnvelopeMeta(), looksLikeToolResponse(), normalizeToolName(), parseCallingEvent(), parseNormalizedCallingEvent() (+8 more)

### Community 65 - "Tabla Univer (legado)"
Cohesion: 0.14
Nodes (13): DatasheetUnitsTableProps, HistoryEntry, EditableCellProps, EditableUnitsTableProps, UnitsTableProps, UniverUnitsTableProps, StrapiUnit, getNestedValue() (+5 more)

### Community 66 - "Carrusel"
Cohesion: 0.17
Nodes (14): CarouselApi, CarouselContextProps, CarouselOptions, CarouselPlugin, CarouselProps, UseCarouselParameters, Carousel(), CarouselContent() (+6 more)

### Community 67 - "Layout raíz, i18n y tema"
Cohesion: 0.20
Nodes (8): Locale, RootLayout(), ThemeProvider(), inter, metadata, defaultLocale, locales, Idiomas ES/EN (next-intl por cookie)

### Community 68 - "Formularios (react-hook-form)"
Cohesion: 0.19
Nodes (12): FormFieldContextValue, FormItemContextValue, FormControl(), FormDescription(), FormItem(), FormLabel(), FormMessage(), useFormField() (+4 more)

### Community 7 - "Inputs, selects y ajustes"
Cohesion: 0.15
Nodes (36): BankParticipation, BanksTabProps, UnitGeneralTabProps, UnitSpecificTabProps, Column, SortDirection, SortField, SettingsPage() (+28 more)

### Community 70 - "Tabla avanzada de proyectos"
Cohesion: 0.21
Nodes (11): Column, SortDirection, SortField, getAvailabilityLabel(), getAvailabilityVariant(), ProjectsTable(), SortableColumnHeader(), defaultColumns (+3 more)

### Community 71 - "Gráficas (charts)"
Cohesion: 0.24
Nodes (11): ChartConfig, ChartContextProps, ChartContainer(), ChartLegendContent(), ChartStyle(), ChartTooltipContent(), getPayloadConfigFromPayload(), useChart() (+3 more)

### Community 73 - "Financiamiento por bloque"
Cohesion: 0.20
Nodes (9): Props, BancoKey, BlockFinancing, TasaBanco, plazoDeBanco(), BANCO_LABEL, BANCOS, Financiamiento por bloque (sólo Vivienda) (+1 more)

### Community 74 - "Tabla Luckysheet (legado)"
Cohesion: 0.22
Nodes (8): LuckysheetUnitsTableProps, getFieldPath(), getNestedValue(), LuckysheetUnitsTable(), columnDefs, jquery, luckysheet, Alternate / legacy unit table implementations

### Community 75 - "Fases de corrida colapsables"
Cohesion: 0.35
Nodes (9): RunRowKind, cuenta(), faseDe(), RunPhaseGroups(), Seccion(), Collapsible(), CollapsibleContent(), CollapsibleTrigger() (+1 more)

### Community 78 - "Artefactos y purga de corridas"
Cohesion: 0.24
Nodes (9): Operation, Sección renombrada a Operaciones de datos, direction → operation (push | pull | purge), Archivos de corrida un nivel adentro de cada bloque, Cuatro archivos por intento (strapi-source, mysql-snapshot, written, apply-result), Purga en cascada en Strapi (sin respaldo aún), Artefactos de corrida en S3 (sync-runs/<runId>/blocks/<documentId>/), v1.10.0 — Diff de una corrida (+1 more)

### Community 82 - "Paginación"
Cohesion: 0.28
Nodes (7): PaginationLinkProps, Pagination(), PaginationContent(), PaginationEllipsis(), PaginationLink(), PaginationNext(), PaginationPrevious()

### Community 9 - "Menús desplegables y dashboard"
Cohesion: 0.12
Nodes (34): DashboardItem, DashboardItemId, DashboardItemType, CopilotSidebarConversationPickerProps, ProjectFiltersProps, TopBarProps, AuthLayout(), DashboardPage() (+26 more)

### Community 10 - "Arquitectura general (CLAUDE.md)"
Cohesion: 0.06
Nodes (36): getVarasFactor(), APP_VERSION, LINEAR_VARAS_KEYS, M2_TO_VARAS_SQUARED, M_TO_VARAS, nextConfig, withNextIntl, Batch save with next-available code retry (+28 more)

### Community 11 - "Motor de fórmulas de unidades"
Cohesion: 0.11
Nodes (36): applyVat(), ensureUnitFormulasSynced(), industrialKindOf(), industrialUnitSizeM2(), industrialZone(), maintenanceWithoutVatUsd(), removeVat(), roundTo2() (+28 more)

### Community 12 - "Integraciones n8n (manual)"
Cohesion: 0.08
Nodes (42): forwardUpstreamHeaders(), POST(), dynamic, maxDuration, Amazon S3 (bucket n8n-primeiqlatam), Ruta /api/copilot/n8n-chat, AWS EC2 (servidor de Coolify), Block Edit Queue (block-counter-update + debounce Redis) (+34 more)

### Community 17 - "Operación del backoffice (manual)"
Cohesion: 0.08
Nodes (35): isCopilotChatLoadPreviousSessionEnabled(), isCopilotN8nStreamingEnabled(), AWS App Runner (hosting del CRM), Celdas amarillas, Contadores y promedios automáticos del bloque, Cuenta GitHub Admin-PrimeIQ, Dev Root Studio, devroot.studio (autor y contacto técnico) (+27 more)

### Community 23 - "Field, item y button group"
Cohesion: 0.08
Nodes (29): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup() (+21 more)

### Community 28 - "IVA y cuota por país"
Cohesion: 0.10
Nodes (23): calcInstallmentFromPriceWithoutVAT(), getVatRate(), installmentParamsForIso(), syncUnitInstallment(), GEO_BY_ISO, INSTALLMENT_BY_ISO, VAT_RATE, INSTALLMENT_BY_ISO (+15 more)

### Community 36 - "Diálogos y nueva corrida"
Cohesion: 0.30
Nodes (19): AmenitiesTable(), BanksTable(), CategoriesTable(), ServicesTable(), NewRunDialog(), CommandDialog(), Dialog(), DialogContent() (+11 more)

### Community 38 - "Fórmulas replicadas (migración)"
Cohesion: 0.24
Nodes (22): applyVat(), calcInstallmentFromPriceWithoutVAT(), ensureUnitFormulasSynced(), getVarasFactor(), installmentParamsForIso(), maintenanceWithoutVatUsd(), removeVat(), roundTo2() (+14 more)

### Community 39 - "Flujo seguro de migración"
Cohesion: 0.12
Nodes (14): Parity test cases (vertical, horizontal, lote), Scoped verified rollback, Tee logger (console + run.log + run.ndjson), Installment parity case (GT != SV), VAT-by-country parity case, progress.json checkpoint and --resume, dry-run command (diff without writes), Formula parity test (npm run test:parity) (+6 more)

### Community 43 - "Cliente Strapi de migración"
Cohesion: 0.19
Nodes (21): adminLogin(), adminToken(), authedFetch(), authMode(), blocksListUrl(), env(), listBlocks(), listUnitsForBlock() (+13 more)

### Community 47 - "Chrome y hojas del Copilot"
Cohesion: 0.21
Nodes (15): CopilotsLayout(), CopilotsChrome(), CopilotsChromeInner(), N8nChatStylesheet(), Sheet(), SheetContent(), SheetDescription(), SheetFooter() (+7 more)

### Community 55 - "Preproceso UI Blocks compactos"
Cohesion: 0.20
Nodes (14): CopilotAssistantMarkdownImpl(), CopilotUserAboveBubbleImpl(), formatUserMention(), UIBlocksRenderer(), expandCompactFileOnlyLine(), expandCompactNoteFileDirective(), normalizeAgentFileKeyValueBody(), preprocessAgentCompactUIBlocks() (+6 more)

### Community 56 - "Toggle y estados vacíos"
Cohesion: 0.14
Nodes (15): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), EmptyTitle(), ToggleGroup(), ToggleGroupItem() (+7 more)

### Community 57 - "Menubar"
Cohesion: 0.12
Nodes (13): Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarPortal(), MenubarRadioItem(), MenubarSeparator() (+5 more)

### Community 59 - "Guardado en lote de unidades"
Cohesion: 0.18
Nodes (9): isClientOnlyForeignPriceKey(), sanitizeCurrenciesComponentForWrite(), sanitizeUnitTypeArrayForWrite(), stripClientOnlyForeignPriceKeys(), Retry parchea todas las entradas code (updateUnitBatch last-wins), Errores de guardado con detalle en toast Sileo, Auto-asignación del siguiente code disponible ante duplicado, documentId de Strapi (+1 more)

### Community 6 - "Primitivas shadcn/ui"
Cohesion: 0.05
Nodes (42): AccordionContent(), AccordionItem(), AccordionTrigger(), Avatar(), AvatarFallback(), AvatarImage(), BreadcrumbEllipsis(), CardAction() (+34 more)

### Community 62 - "Menú contextual"
Cohesion: 0.12
Nodes (12): ContextMenu(), ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut() (+4 more)

### Community 64 - "Generación de códigos únicos"
Cohesion: 0.23
Nodes (14): getAdminToken(), POST(), getAdminToken(), POST(), POST /admin/login (token del panel), Rutas /api/blocks|units/generate-code, code (UID generado, p. ej. torre-norte-a-101), Módulo Bloques (/blocks) (+6 more)

### Community 69 - "Proxy Strapi con logging"
Cohesion: 0.24
Nodes (11): DELETE(), GET(), PATCH(), POST(), proxy(), PUT(), resolveUserEmail(), HOP_BY_HOP (+3 more)

### Community 72 - "Drawer"
Cohesion: 0.20
Nodes (8): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerPortal(), DrawerTitle(), vaul

### Community 76 - "Input group y textarea"
Cohesion: 0.25
Nodes (9): InputGroup(), InputGroupAddon(), InputGroupButton(), InputGroupInput(), InputGroupText(), InputGroupTextarea(), Textarea(), inputGroupAddonVariants (+1 more)

### Community 77 - "Menú de navegación"
Cohesion: 0.22
Nodes (10): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), NavigationMenuViewport() (+2 more)

### Community 81 - "Reglas de escritura Strapi v5"
Cohesion: 0.25
Nodes (4): getRelationDocumentId(), mergeUnitTypeWithServer(), List methods keep {data, meta} envelope for pagination, Remote Strapi v5 backend over HTTP

### Community 83 - "Formulario de unidad"
Cohesion: 0.50
Nodes (7): Tabs(), TabsContent(), TabsList(), TabsTrigger(), UnitPricingTab(), UnitRentalTab(), UnitForm()

### Community 84 - "Multimoneda del proyecto"
Cohesion: 0.25
Nodes (5): normalizeProjectCurrenciesFromExchangeProfile(), projectCurrenciesHasConfiguredRate(), Client-only non-USD price fields and maintenanceWithoutVATUSD, Exchange-rate profiles collection, Multi-currency editing against USD pivot

### Community 86 - "Auth cliente y middleware"
Cohesion: 0.29
Nodes (4): config, Client-side JWT auth in localStorage, Server routes validate bearer against Strapi, Fuzzy super-admin role detection

### Community 88 - "Carga liviana de bloques"
Cohesion: 0.33
Nodes (5): getBlocksLite: carga liviana de bloques para el selector, Nombres de bloque en pull resueltos por legacyId (cod_proyecto), Selector de push acotado por tipo de inmueble, v1.14.1 — En un pull la tabla de bloques muestra su nombre, v1.18.1 — Selector de push deja de ofrecer bloques de otro tipo

### Community 89 - "Tours guiados"
Cohesion: 0.40
Nodes (3): TOUR_ENABLED, v0.1.3 — Tours guiados y estilo Notion, v1.26.0 — Tour Guiado desactivado

### Community 90 - "Visor de código JSON"
Cohesion: 0.33
Nodes (5): JsonCodeViewer(), @codemirror/lang-json, @codemirror/language, @codemirror/search, @uiw/react-codemirror

### Community 91 - "Estado de escritura del chat"
Cohesion: 0.60
Nodes (5): attachTypingStatusLabel(), enhanceTypingBody(), ensureStatusSpan(), hideCircles(), scan()

### Community 96 - "Tests UI Blocks"
Cohesion: 0.83
Nodes (3): parseMarkdownToBlocks(), primero(), tipos()

### Community 2 - "Dependencias npm del backoffice"
Cohesion: 0.02
Nodes (88): dependencies, autoprefixer, class-variance-authority, clsx, cmdk, @codemirror/lang-json, @codemirror/language, @codemirror/search (+80 more)

### Community 32 - "Paquete CLI de migración"
Cohesion: 0.08
Nodes (25): bin, migrate, name, oclif, bin, commands, topicSeparator, private (+17 more)

### Community 4 - "Modelo de datos Strapi (manual)"
Cohesion: 0.04
Nodes (66): CATALOG_TYPES, GAM_QUARTERS, Absorción, Absorción (unitAbsorption, absorptionPerM2), Amenidad (api::amenity.amenity), API REST del CRM (Strapi v5), Atributos comerciales del proyecto (muvi, showroom, modelHouse, accessQuantity, imageUrl), Bancos de financiamiento (BAC, BAM, Azteca, Credicorp, Banrural, Bantrab, BI, Inmobiliario, Internacional, INV, Antigua, CHN, Ficohsa, GTC, Promerica, Vivibanco) (+58 more)

### Community 46 - "Configuración shadcn"
Cohesion: 0.10
Nodes (20): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+12 more)

### Community 52 - "Configuración TypeScript"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 79 - "Dependencias CLI migración"
Cohesion: 0.20
Nodes (10): dependencies, chalk, cli-progress, cli-table3, dotenv, @inquirer/prompts, @oclif/core, ora (+2 more)

### Community 8 - "Dependencias Radix y utilidades"
Cohesion: 0.04
Nodes (50): author, description, homepage, keywords, license, name, private, version (+42 more)

### Community 80 - "Dev dependencies y Tailwind"
Cohesion: 0.20
Nodes (10): devDependencies, patch-package, postcss, tailwindcss, @tailwindcss/postcss, tw-animate-css, @types/node, @types/react (+2 more)

### Community 87 - "Scripts npm"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, postinstall, start, test

### Community 99 - "Metadatos del repo"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 16 - "Push/pull warehouse (manual)"
Cohesion: 0.08
Nodes (35): Ruta /api/sync/sql-projects, Block Worker (workflow n8n), Catálogo, Llave cod_proyecto (enlace CRM ↔ warehouse), Corrida de sincronización, CRM (Strapi), Estados de una corrida (resolving, running, completed, completed_with_skips, failed, aborted), legacyId (bloques y unidades del warehouse) (+27 more)

### Community 26 - "Módulo de sincronización (manual)"
Cohesion: 0.10
Nodes (27): GET /api/users/me?populate=role, banking_info (tasas por banco en warehouse), Plugin Config Sync (roles versionados), Financiamiento del bloque (financing.financing), Host del CRM en AWS App Runner, housing_universe (1 fila = 1 bloque), Hito: Liberamos a IT, Mapeo de campos Strapi → warehouse (+19 more)

### Community 42 - "Alertas y precio promedio m²"
Cohesion: 0.10
Nodes (12): Cookie-based next-intl i18n (ES/EN), Average follows active grid currency via buy rate, Avg. price per m2 pill (pricePerM2USD), performSync counter desync regression, Stats pills moved to i18n common namespace, Undo/redo counter desync regression, Out-of-range alert for price and maintenance per m2, gridStats.outOfRange rowKey::field set (+4 more)

### Community 53 - "Monedas y financiamiento (manual)"
Cohesion: 0.11
Nodes (16): Barra lateral de tipo de cambio Banguat, buyRate / sellRate por moneda, Componente (Strapi), Componente currencies.currencies, documentId (identificador estable de Strapi v5), Enganche, FHA, Financiamiento del bloque (+8 more)

### Community 85 - "Oficinas e industrial (unitType)"
Cohesion: 0.32
Nodes (8): Dominio del bloque (housing / office / industrial), Etapa: Oficinas e industrial, Tablas industrial_universe / industrial_units / industrial_amenities, Tablas office_universe / office_units / office_amenities, Tipo industrial (unit-types.industrial), Tipo oficinas (unit-types.offices), Tipo vivienda (unit-types.housing), unitType (zona dinámica de la unidad)

### Community 94 - "Permisos y errores del CRM"
Cohesion: 0.50
Nodes (4): Error 401 UnauthorizedError (sin token o token inválido), Error 403 ForbiddenError (rol sin permiso), Permisos por rol del CRM, Token del CRM (Authorization: Bearer JWT)

### Community 97 - "Changelog v0.2.0 (batch sync)"
Cohesion: 0.67
Nodes (3): Moneda local editable con conversión bidireccional a USD, onCellsEdited alineado con la edición de celda simple, v0.2.0 — Batch sync, IVA de mantenimiento y moneda local editable

## Ambiguous Edges - Review These
- `Units grid features (bulk edit, undo/redo, m2/varas2, currencies)` → `VAT rule by country and usage`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **117 isolated node(s):** `pino-pretty`, `autoprefixer`, `@hookform/resolvers`, `jquery-mousewheel`, `linkify-react` (+112 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 647 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Páginas y componentes UI base` to `Formularios de bloque y filtros`, `Hoja de unidades (datasheet)`, `Primitivas shadcn/ui`, `Inputs, selects y ajustes`, `Dependencias Radix y utilidades`, `Menús desplegables y dashboard`, `Tablas editables y diálogos`, `Sistema de toasts`, `Renderizador UI Blocks`, `Sesiones y conversaciones Copilot`, `Field, item y button group`, `Embed del chat Copilot`, `Tablas de proyectos y perfiles`, `Sidebar de navegación`, `Diff de snapshots`, `Diálogos y nueva corrida`, `Autenticación y layout principal`, `Chrome y hojas del Copilot`, `Iconos de archivos del composer`, `Regiones y diálogo de corrida`, `Preproceso UI Blocks compactos`, `Toggle y estados vacíos`, `Menubar`, `Ilustraciones Notion`, `Navegador de archivos de corrida`, `Menú contextual`, `Tabla Univer (legado)`, `Carrusel`, `Layout raíz, i18n y tema`, `Formularios (react-hook-form)`, `Tabla avanzada de proyectos`, `Gráficas (charts)`, `Drawer`, `Tabla Luckysheet (legado)`, `Fases de corrida colapsables`, `Input group y textarea`, `Menú de navegación`, `Paginación`, `Formulario de unidad`, `Visor de código JSON`, `Hover card`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **What connects `pino-pretty`, `autoprefixer`, `@hookform/resolvers` to the rest of the system?**
  _117 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Páginas y componentes UI base` be split into smaller, more focused modules?**
  _Cohesion score 0.06336683417085427 - nodes in this community are weakly interconnected._
- **Why does `cn()` connect `Primitivas shadcn/ui` to `Páginas y componentes UI base`, `Formularios de bloque y filtros`, `Inputs, selects y ajustes`, `Menús desplegables y dashboard`, `Tablas editables y diálogos`, `Sistema de toasts`, `Renderizador UI Blocks`, `Field, item y button group`, `Embed del chat Copilot`, `Tablas de proyectos y perfiles`, `Sidebar de navegación`, `Diff de snapshots`, `Diálogos y nueva corrida`, `Chrome y hojas del Copilot`, `Preproceso UI Blocks compactos`, `Toggle y estados vacíos`, `Menubar`, `Ilustraciones Notion`, `Menú contextual`, `Carrusel`, `Formularios (react-hook-form)`, `Gráficas (charts)`, `Drawer`, `Input group y textarea`, `Menú de navegación`, `Paginación`, `Formulario de unidad`, `Hover card`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Should `Formularios de bloque y filtros` be split into smaller, more focused modules?**
  _Cohesion score 0.059394631639063396 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `Dependencias npm del backoffice` to `Dependencias Radix y utilidades`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Units grid features (bulk edit, undo/redo, m2/varas2, currencies)` and `VAT rule by country and usage`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._