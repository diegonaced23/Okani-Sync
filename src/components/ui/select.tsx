"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react"

/** Si el Select está abierto. Base UI deja el popup montado (oculto) al cerrarse. */
const OpenContext = React.createContext(false)

function Select<Value, Multiple extends boolean | undefined = false>({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  const [openState, setOpenState] = React.useState(defaultOpen)
  const open = openProp ?? openState
  return (
    <OpenContext.Provider value={open}>
      <SelectPrimitive.Root
        {...props}
        open={open}
        onOpenChange={(next, details) => {
          setOpenState(next)
          onOpenChange?.(next, details)
        }}
      />
    </OpenContext.Provider>
  )
}

/**
 * En móvil, una lista con al menos estas opciones se abre como hoja inferior con
 * buscador, como hace iOS: un menú flotante con 30 bancos obliga a hacer scroll a
 * ciegas en un recuadro pequeño.
 */
const SHEET_MIN_ITEMS = 9

/** Texto buscado en la hoja inferior. Vacío fuera de la hoja o sin búsqueda. */
const SearchContext = React.createContext("")

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/** Texto visible de un nodo de React (ignora íconos y demás elementos sin texto). */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function itemText(props: { label?: unknown; children?: React.ReactNode }) {
  return typeof props.label === "string" ? props.label : textOf(props.children)
}

/** Texto de cada SelectItem entre los hijos, entrando en grupos y fragmentos. */
function collectItemTexts(node: React.ReactNode, out: string[] = []) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ label?: unknown; children?: React.ReactNode }>(child)) return
    if (child.type === SelectItem) out.push(itemText(child.props))
    else collectItemTexts(child.props.children, out)
  })
  return out
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=default]:pointer-coarse:min-h-11 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      {/* Doble chevron: el indicador de los botones desplegables de iOS */}
      <SelectPrimitive.Icon
        render={
          <ChevronsUpDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = false,
  sheet = "auto",
  searchPlaceholder = "Buscar",
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  > & {
    /**
     * "auto": hoja inferior en móvil cuando la lista es larga (SHEET_MIN_ITEMS).
     * true/false fuerzan la hoja o el menú flotante.
     */
    sheet?: boolean | "auto"
    searchPlaceholder?: string
  }) {
  const isMobile = useMediaQuery("(max-width: 767px)")
  const itemTexts = collectItemTexts(children)
  const asSheet = sheet === "auto" ? isMobile && itemTexts.length >= SHEET_MIN_ITEMS : sheet

  if (asSheet) {
    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        {/* La hoja ignora el posicionamiento anclado: los !important le ganan a
            los estilos en línea que calcula Base UI para el menú flotante */}
        <SelectPrimitive.Positioner
          alignItemWithTrigger={false}
          className="isolate z-50 fixed! inset-x-0! top-auto! bottom-0! [transform:none]!"
        >
          <SelectPrimitive.Popup
            data-slot="select-content"
            data-variant="sheet"
            className={cn(
              "os-sheet os-glass-menu relative isolate z-50 flex w-full flex-col overflow-hidden rounded-t-[28px] text-popover-foreground",
              "pb-[max(env(safe-area-inset-bottom),0.75rem)]",
              className,
              "max-h-[85dvh]"
            )}
            {...props}
          >
            <SheetBody itemTexts={itemTexts} searchPlaceholder={searchPlaceholder}>
              {children}
            </SheetBody>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    )
  }

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "os-menu os-glass-menu relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto overscroll-contain rounded-[22px] p-1.5 text-popover-foreground",
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

/** Buscador y lista de la hoja inferior. */
function SheetBody({
  itemTexts,
  searchPlaceholder,
  children,
}: {
  itemTexts: string[]
  searchPlaceholder: string
  children: React.ReactNode
}) {
  const open = React.useContext(OpenContext)
  const [query, setQuery] = React.useState("")
  const [prevOpen, setPrevOpen] = React.useState(open)
  // Cada apertura arranca sin búsqueda. Se limpia al abrir y no al cerrar, para
  // que la lista no se rellene de golpe durante la animación de salida
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setQuery("")
  }
  const needle = normalize(query.trim())
  const searchRef = React.useRef<HTMLDivElement>(null)

  // La hoja conserva la altura que tenía antes de filtrar: si se encogiera, el
  // buscador bajaría con cada letra. Se mide con la primera letra y no al abrir,
  // porque al abrir Base UI todavía no ha quitado el `hidden` del posicionador
  function lockHeight() {
    const popup = searchRef.current?.parentElement
    if (popup && !popup.style.minHeight) popup.style.minHeight = `${popup.getBoundingClientRect().height}px`
  }
  React.useLayoutEffect(() => {
    const popup = searchRef.current?.parentElement
    if (open && popup) popup.style.minHeight = ""
  }, [open])
  const noResults = needle !== "" && !itemTexts.some((t) => normalize(t).includes(needle))

  return (
    <SearchContext.Provider value={needle}>
      <div ref={searchRef} className="flex-shrink-0 px-4 pt-4 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-full bg-foreground/[0.07] px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
          <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => { lockHeight(); setQuery(e.target.value) }}
            // Las teclas de escritura no deben llegar al typeahead del Select, que
            // movería el foco a la opción que empieza por esa letra
            onKeyDown={(e) => {
              if (!["Escape", "ArrowUp", "ArrowDown", "Enter", "Tab"].includes(e.key)) e.stopPropagation()
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>
      <SelectPrimitive.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">
        {children}
      </SelectPrimitive.List>
      {noResults && (
        <p role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">
          Sin resultados para “{query.trim()}”
        </p>
      )}
    </SearchContext.Provider>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  // Mientras se busca, las etiquetas de grupo quedarían sueltas sobre resultados mezclados
  if (React.useContext(SearchContext)) return null
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  const search = React.useContext(SearchContext)
  if (search && !normalize(itemText({ label: props.label, children: children as React.ReactNode })).includes(search)) {
    return null
  }

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-11 w-full cursor-default items-center gap-2.5 rounded-xl py-2 pr-3 pl-9 text-[15px] leading-snug outline-hidden select-none transition-colors",
        "data-highlighted:bg-foreground/[0.07] active:bg-foreground/[0.1] data-selected:font-semibold",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        // Línea fina entre opciones consecutivas, que se oculta junto a la resaltada
        "before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:hidden before:h-px before:bg-border/70",
        "[[data-slot=select-item]+&]:before:block data-highlighted:before:opacity-0 [[data-highlighted]+&]:before:opacity-0",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {/* Check a la izquierda y en el color de acento, como los menús de iOS */}
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center text-primary" />
        }
      >
        <CheckIcon className="pointer-events-none" strokeWidth={2.75} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 items-center gap-2.5 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  if (React.useContext(SearchContext)) return null
  // Separación de sección más gruesa que la línea entre opciones, como en iOS
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1.5 my-1.5 h-2 bg-foreground/[0.05]", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center rounded-t-[16px] bg-popover/90 py-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center rounded-b-[16px] bg-popover/90 py-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
