"use client"

import { useEffect, useRef } from "react"
import "maplibre-gl/dist/maplibre-gl.css"

interface ProjectMapProps {
  latitude: number
  longitude: number
  zoom?: number
  draggable?: boolean
  onLocationChange?: (lat: number, lng: number) => void
}

export function ProjectMap({ latitude, longitude, zoom = 14, draggable = false, onLocationChange }: ProjectMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<{ remove: () => void } | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let isMounted = true

    import("maplibre-gl").then((mod) => {
      if (!isMounted || !containerRef.current) return

      const maplibregl = (mod.default ?? mod) as typeof import("maplibre-gl")

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [longitude, latitude],
        zoom,
        attributionControl: false,
      })

      map.on("load", () => {
        const marker = new maplibregl.Marker({ color: "#2563eb", draggable })
          .setLngLat([longitude, latitude])
          .addTo(map)

        if (draggable && onLocationChange) {
          marker.on("dragend", () => {
            const { lat, lng } = marker.getLngLat()
            onLocationChange(lat, lng)
          })
        }
      })

      mapRef.current = map
    })

    return () => {
      isMounted = false
      mapRef.current?.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-border"
      style={{ height: 240 }}
    />
  )
}
