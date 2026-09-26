"use client"

import { useMemo, useState } from "react"
import { ImageIcon } from "lucide-react"

import { shapePath, maskPath, SHAPE_KINDS, SHAPE_LABELS, isStrokeOnlyShape, type ShapeKind } from "@/lib/design/shapes"
import { IMAGE_MASKS, type ImageMask } from "@/lib/design/style"

import { elementForItem, type DesignDragItem } from "../design-drag"
import type { DesignEditorApi } from "../editor-types"
import { EmptyHint, ItemTile, PanelHeading, PanelSearch } from "./panel-kit"

/**
 * Shapes, picture frames, cards and stickers. Every tile adds its element to
 * the middle of the current page on click, or wherever it is dropped.
 */

const STICKERS: ReadonlyArray<{ group: string; items: ReadonlyArray<[string, string]> }> = [
  {
    group: "Study",
    items: [
      ["📚", "books"], ["✏️", "pencil"], ["📝", "notes memo"], ["📐", "ruler maths"], ["🧪", "test tube science"], ["🔬", "microscope science"],
      ["🧠", "brain think"], ["💡", "idea bulb"], ["🎓", "graduate"], ["🏆", "trophy win"], ["⭐", "star"], ["✅", "check done"],
      ["❌", "cross wrong"], ["❓", "question"], ["❗", "exclamation"], ["📌", "pin"], ["🗓️", "calendar"], ["⏰", "alarm time"],
      ["🎯", "target goal"], ["🧩", "puzzle"], ["🌍", "globe world"], ["🔢", "numbers"], ["🧮", "abacus"], ["🎨", "art palette"],
    ],
  },
  {
    group: "Faces",
    items: [
      ["😀", "smile happy"], ["😂", "laugh"], ["🥹", "touched"], ["😍", "love"], ["🤔", "thinking"], ["😎", "cool"],
      ["🥳", "party"], ["😭", "cry"], ["😤", "determined"], ["🤯", "mind blown"], ["😴", "sleepy"], ["🫠", "melting"],
      ["🙌", "hooray"], ["👏", "clap"], ["👍", "thumbs up"], ["👎", "thumbs down"], ["💪", "strong"], ["🙏", "thanks please"],
      ["👀", "eyes look"], ["🤝", "deal"], ["✌️", "peace"], ["🫶", "heart hands"], ["🤓", "nerd"], ["😅", "phew"],
    ],
  },
  {
    group: "Fun",
    items: [
      ["🔥", "fire lit"], ["✨", "sparkles"], ["🎉", "party popper"], ["💯", "hundred"], ["🚀", "rocket"], ["🌈", "rainbow"],
      ["⚡", "lightning"], ["💥", "boom"], ["🎈", "balloon"], ["🍕", "pizza"], ["🍩", "donut"], ["☕", "coffee"],
      ["🌟", "glowing star"], ["💖", "sparkling heart"], ["🎵", "music"], ["🎮", "game"], ["🐶", "dog"], ["🐱", "cat"],
      ["🦄", "unicorn"], ["🌸", "flower"], ["🍀", "clover luck"], ["🌙", "moon"], ["☀️", "sun"], ["🍿", "popcorn"],
    ],
  },
  {
    group: "Marks",
    items: [
      ["➡️", "arrow right"], ["⬅️", "arrow left"], ["⬆️", "arrow up"], ["⬇️", "arrow down"], ["↗️", "arrow up right"], ["🔁", "repeat"],
      ["✔️", "tick"], ["✖️", "times"], ["➕", "plus"], ["➖", "minus"], ["❤️", "heart"], ["💬", "speech"],
      ["💭", "thought"], ["📣", "announce"], ["🔔", "bell"], ["🏁", "finish"], ["🚩", "flag"], ["⚠️", "warning"],
    ],
  },
]

const FRAME_LABELS: Record<ImageMask, string> = {
  none: "Square frame",
  rounded: "Rounded frame",
  circle: "Circle frame",
  blob: "Blob frame",
  heart: "Heart frame",
  star: "Star frame",
  hexagon: "Hexagon frame",
  arch: "Arch frame",
}

function matches(query: string, ...texts: string[]): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return texts.some((text) => text.toLowerCase().includes(needle))
}

function ShapePreview({ kind, fill, stroke }: { kind: ShapeKind; fill: string; stroke: string }) {
  const wide = kind === "arrow" || kind === "chevron" || kind === "wave" || kind === "pill" || kind === "speech"
  const width = wide ? 44 : 34
  const height = isStrokeOnlyShape(kind) ? 4 : 34
  const path = shapePath(kind, width, height)
  return (
    <svg data-drag-preview="true" width={48} height={48} viewBox={`${-(48 - width) / 2} ${-(48 - height) / 2} 48 48`} aria-hidden="true">
      {isStrokeOnlyShape(kind) ? <path d={path} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round" /> : <path d={path} fill={fill} />}
    </svg>
  )
}

function FramePreview({ mask }: { mask: ImageMask }) {
  const tall = mask === "arch"
  const width = 34
  const height = tall ? 42 : 34
  const path = maskPath(mask, width, height, mask === "rounded" ? 7 : 0) ?? shapePath("rect", width, height)
  return (
    <span data-drag-preview="true" className="relative inline-flex h-12 w-12 items-center justify-center">
      <svg width={48} height={48} viewBox={`${-(48 - width) / 2} ${-(48 - height) / 2} 48 48`} aria-hidden="true" className="absolute inset-0">
        <path d={path} className="fill-muted-foreground/25" />
      </svg>
      <ImageIcon className="relative h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </span>
  )
}

export function ElementsPanel({ api }: { api: DesignEditorApi }) {
  const [query, setQuery] = useState("")
  const { theme } = api
  const pick = (item: DesignDragItem) => {
    api.insertElements([elementForItem(item, api.theme, { width: api.design.width, height: api.design.height }, api.measure)])
  }

  const shapes = useMemo(() => SHAPE_KINDS.filter((kind) => matches(query, SHAPE_LABELS[kind], kind, "shape")), [query])
  const frames = useMemo(() => IMAGE_MASKS.filter((mask) => matches(query, FRAME_LABELS[mask], "frame picture photo image")), [query])
  const stickers = useMemo(
    () => STICKERS.map((group) => ({ ...group, items: group.items.filter(([glyph, name]) => matches(query, name, group.group, glyph, "sticker emoji")) })).filter((group) => group.items.length),
    [query],
  )
  const showCard = matches(query, "card panel box sticky note")
  const nothing = !shapes.length && !frames.length && !stickers.length && !showCard

  return (
    <div>
      <PanelSearch value={query} onChange={setQuery} placeholder="Search shapes, frames, stickers" label="Search elements" />
      {nothing ? <EmptyHint>Nothing matches “{query}”. Try “star”, “frame” or “heart”.</EmptyHint> : null}

      {shapes.length ? (
        <>
          <PanelHeading>Shapes</PanelHeading>
          <div className="grid grid-cols-4 gap-2">
            {shapes.map((kind) => (
              <ItemTile key={kind} item={{ kind: "shape", shape: kind }} label={SHAPE_LABELS[kind]} onPick={pick} className="aspect-square">
                <ShapePreview kind={kind} fill={theme.palette.primary} stroke={theme.palette.text} />
              </ItemTile>
            ))}
          </div>
        </>
      ) : null}

      {showCard ? (
        <>
          <PanelHeading>Cards</PanelHeading>
          <div className="grid grid-cols-2 gap-2">
            <ItemTile item={{ kind: "card" }} label="Card" onPick={pick} className="h-20">
              <span data-drag-preview="true" className="h-12 w-20 rounded-lg shadow-[0_8px_18px_-10px_rgba(15,23,42,0.45)]" style={{ background: theme.palette.surface }} aria-hidden="true" />
            </ItemTile>
            <ItemTile item={{ kind: "shape", shape: "speech" }} label="Speech bubble" onPick={pick} className="h-20">
              <ShapePreview kind="speech" fill={theme.palette.secondary} stroke={theme.palette.text} />
            </ItemTile>
          </div>
        </>
      ) : null}

      {frames.length ? (
        <>
          <PanelHeading>Picture frames</PanelHeading>
          <div className="grid grid-cols-4 gap-2">
            {frames.map((mask) => (
              <ItemTile key={mask} item={{ kind: "frame", mask }} label={FRAME_LABELS[mask]} onPick={pick} className="aspect-square">
                <FramePreview mask={mask} />
              </ItemTile>
            ))}
          </div>

        </>
      ) : null}

      {stickers.map((group) => (
        <div key={group.group}>
          <PanelHeading>{group.group} stickers</PanelHeading>
          <div className="grid grid-cols-6 gap-1.5">
            {group.items.map(([glyph, name]) => (
              <ItemTile key={glyph} item={{ kind: "sticker", glyph }} label={`${name} sticker`} onPick={pick} className="aspect-square text-2xl leading-none" title={name}>
                <span data-drag-preview="true" aria-hidden="true">
                  {glyph}
                </span>
              </ItemTile>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
