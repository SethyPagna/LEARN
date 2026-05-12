"use client"

import { cn } from "@/lib/utils"

interface TopicFilterProps {
  topics: string[]
  selectedTopic: string | null
  onSelectTopic: (topic: string | null) => void
}

export function TopicFilter({
  topics,
  selectedTopic,
  onSelectTopic,
}: TopicFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center mb-8">
      <button
        onClick={() => onSelectTopic(null)}
        className={cn(
          "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
          selectedTopic === null
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        )}
      >
        All Topics
      </button>
      {topics.map((topic) => (
        <button
          key={topic}
          onClick={() => onSelectTopic(topic)}
          className={cn(
            "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
            selectedTopic === topic
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          {topic}
        </button>
      ))}
    </div>
  )
}
