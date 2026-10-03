import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Reviews" }

export default function ReviewsPage() {
  return <LearnPage initialView="reviews" />
}
