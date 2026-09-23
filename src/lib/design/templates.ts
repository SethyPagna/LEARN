import type { DesignDoc } from "./document"
import type { DesignFormatGroup, DesignFormatId } from "./formats"
import { designFromSpec } from "./layout"
import type { DesignSpec } from "./spec"
import type { MeasureText } from "./text"

/**
 * Starting points for the design editor. A template is a semantic spec plus a
 * format and theme, not a frozen drawing: it is laid out by the same engine as
 * "Magic design", so it fits any format, re-themes cleanly, and every slot on
 * it can be re-arranged with the layout picker afterwards.
 */

export interface DesignTemplate {
  id: string
  name: string
  description: string
  group: DesignFormatGroup
  format: DesignFormatId
  theme: string
  tags: readonly string[]
  spec: DesignSpec
}

export const DESIGN_TEMPLATES: readonly DesignTemplate[] = [
  {
    id: "lesson",
    name: "Lesson deck",
    description: "Hook, goals, key idea, steps and a quick check",
    group: "presentation",
    format: "presentation",
    theme: "notebook",
    tags: ["class", "teach", "slides"],
    spec: {
      title: "Lesson deck",
      pages: [
        { blocks: [{ type: "title", kicker: "Science · Lesson 4", text: "How plants make food", subtitle: "Photosynthesis in five minutes" }] },
        { blocks: [{ type: "heading", text: "Today you will" }, { type: "bullets", items: ["Name what a plant needs to make sugar", "Explain where the oxygen comes from", "Draw the process as a simple cycle"] }] },
        { blocks: [{ type: "heading", text: "The key idea" }, { type: "definition", term: "Photosynthesis", text: "Plants use light energy to turn water and carbon dioxide into sugar, releasing oxygen." }, { type: "callout", tone: "tip", text: "Remember it as: light + water + air → food + oxygen." }] },
        { blocks: [{ type: "heading", text: "Step by step" }, { type: "steps", items: [{ title: "Catch the light", text: "Chlorophyll in the leaf absorbs sunlight." }, { title: "Split the water", text: "Water breaks into hydrogen and oxygen." }, { title: "Build the sugar", text: "Carbon dioxide is fixed into glucose." }] }] },
        { blocks: [{ type: "heading", text: "Quick check" }, { type: "question", question: "Which gas do plants release?", choices: ["Carbon dioxide", "Oxygen", "Nitrogen", "Helium"], answer: 1, explanation: "Oxygen is released when water is split." }] },
        { blocks: [{ type: "title", text: "Great work!", subtitle: "Next time: how animals use that sugar" }] },
      ],
    },
  },
  {
    id: "pitch",
    name: "Project pitch",
    description: "Problem, idea, numbers and a plan",
    group: "presentation",
    format: "presentation",
    theme: "midnight",
    tags: ["pitch", "project", "group"],
    spec: {
      title: "Project pitch",
      pages: [
        { blocks: [{ type: "title", kicker: "Team Nova", text: "Cleaner school, smarter bins", subtitle: "A recycling project in four weeks" }] },
        { blocks: [{ type: "heading", text: "The problem" }, { type: "text", text: "Half of what goes into our school bins could be recycled, but it ends up in landfill because the bins are confusing." }] },
        { blocks: [{ type: "heading", text: "By the numbers" }, { type: "stats", items: [{ value: "48%", label: "of our waste is recyclable" }, { value: "3", label: "bins per hallway today" }, { value: "12 kg", label: "thrown away every day" }] }] },
        { blocks: [{ type: "heading", text: "Our idea" }, { type: "bullets", items: ["Colour-coded bins with picture labels", "A weekly leaderboard for each class", "Student bin champions at lunch"] }, { type: "image", alt: "Photo of the new bins", caption: "Prototype label" }] },
        { blocks: [{ type: "heading", text: "The plan" }, { type: "timeline", items: [{ label: "Week 1", text: "Survey the bins" }, { label: "Week 2", text: "Design labels" }, { label: "Week 3", text: "Launch in two halls" }, { label: "Week 4", text: "Measure and share" }] }] },
        { blocks: [{ type: "title", text: "Thank you", subtitle: "Questions? Let's make it happen." }] },
      ],
    },
  },
  {
    id: "compare",
    name: "Compare two ideas",
    description: "Side-by-side comparison with a verdict",
    group: "presentation",
    format: "presentation",
    theme: "forest",
    tags: ["versus", "debate"],
    spec: {
      title: "Compare two ideas",
      pages: [
        { blocks: [{ type: "heading", text: "Renewable vs fossil energy" }, { type: "compare", left: { title: "Renewable", items: ["Wind, sun and water", "Never runs out", "Low pollution"] }, right: { title: "Fossil", items: ["Coal, oil and gas", "Will run out", "Releases CO₂"] } }] },
        { blocks: [{ type: "heading", text: "The verdict" }, { type: "quote", text: "The best time to switch was yesterday. The next best time is today.", by: "Our class" }] },
      ],
    },
  },
  {
    id: "study-guide",
    name: "Study guide",
    description: "One printable page of key terms and a self-check",
    group: "document",
    format: "a4",
    theme: "minimal",
    tags: ["revision", "print", "notes"],
    spec: {
      title: "Study guide",
      pages: [
        {
          blocks: [
            { type: "title", kicker: "Unit 2 · Cells", text: "Cell structure", subtitle: "Everything you need for Friday's test" },
            { type: "definition", term: "Nucleus", text: "The control centre that holds the cell's DNA." },
            { type: "definition", term: "Mitochondria", text: "Release energy from food through respiration." },
            { type: "bullets", items: ["Plant cells also have a cell wall and chloroplasts", "Animal cells have no cell wall", "Both have a membrane and cytoplasm"] },
            { type: "callout", tone: "tip", text: "Draw each organelle and label it from memory, then check." },
          ],
        },
        { blocks: [{ type: "heading", text: "Check yourself" }, { type: "question", question: "Which part releases energy?", choices: ["Nucleus", "Mitochondria", "Cell wall", "Vacuole"], answer: 1 }, { type: "question", question: "Name two parts only plant cells have." }] },
      ],
    },
  },
  {
    id: "worksheet",
    name: "Worksheet",
    description: "Questions with space to answer",
    group: "document",
    format: "a4",
    theme: "notebook",
    tags: ["homework", "print", "practice"],
    spec: {
      title: "Worksheet",
      pages: [
        {
          blocks: [
            { type: "title", kicker: "Name: ____________", text: "Fractions practice" },
            { type: "question", question: "What is 1/2 + 1/4?", choices: ["1/6", "2/6", "3/4", "1"], answer: 2 },
            { type: "question", question: "Explain in your own words why 2/4 equals 1/2." },
            { type: "callout", tone: "note", text: "Show your working for every question." },
          ],
        },
      ],
    },
  },
  {
    id: "quiz-carousel",
    name: "Quiz carousel",
    description: "Swipeable quiz cards for your group chat",
    group: "social",
    format: "square",
    theme: "pop",
    tags: ["quiz", "share", "game"],
    spec: {
      title: "Quiz carousel",
      pages: [
        { blocks: [{ type: "title", kicker: "Quiz time", text: "Can you get 3/3?", subtitle: "Swipe to play" }] },
        { blocks: [{ type: "question", question: "What is the largest planet?", choices: ["Earth", "Jupiter", "Mars", "Venus"], answer: 1 }] },
        { blocks: [{ type: "question", question: "How many legs does a spider have?", choices: ["6", "8", "10", "12"], answer: 1 }] },
        { blocks: [{ type: "question", question: "Which gas do we breathe out?", choices: ["Oxygen", "Helium", "Carbon dioxide", "Hydrogen"], answer: 2 }] },
      ],
    },
  },
  {
    id: "flashcards",
    name: "Flashcards",
    description: "Term on the front, meaning on the back",
    group: "fun",
    format: "flashcard",
    theme: "candy",
    tags: ["memorise", "vocab", "cards"],
    spec: {
      title: "Flashcards",
      pages: [
        { blocks: [{ type: "definition", term: "Ecosystem", text: "All the living things in an area and how they interact with their surroundings." }] },
        { blocks: [{ type: "definition", term: "Producer", text: "An organism that makes its own food, like a plant." }] },
        { blocks: [{ type: "definition", term: "Consumer", text: "An organism that eats other organisms for energy." }] },
      ],
    },
  },
  {
    id: "quote-card",
    name: "Quote card",
    description: "A big, bold quote for a post",
    group: "social",
    format: "portrait",
    theme: "sunset",
    tags: ["quote", "post", "motivation"],
    spec: { title: "Quote card", pages: [{ blocks: [{ type: "quote", text: "The expert in anything was once a beginner.", by: "Helen Hayes" }] }] },
  },
  {
    id: "meme",
    name: "Study meme",
    description: "Top text, bottom text — drop in a picture",
    group: "fun",
    format: "meme",
    theme: "meme",
    tags: ["meme", "funny", "chat"],
    spec: { title: "Study meme", pages: [{ blocks: [{ type: "meme", top: "Me: I'll study early this time", bottom: "Also me at 11:58 pm" }] }] },
  },
  {
    id: "story-recap",
    name: "Story recap",
    description: "A vertical recap of what you learned",
    group: "social",
    format: "story",
    theme: "ocean",
    tags: ["story", "recap", "share"],
    spec: {
      title: "Story recap",
      pages: [
        { blocks: [{ type: "title", kicker: "Today I learned", text: "The ocean makes our air", subtitle: "Tap for 3 fast facts" }] },
        { blocks: [{ type: "heading", text: "3 fast facts" }, { type: "stats", items: [{ value: "50%", label: "of Earth's oxygen comes from the ocean" }, { value: "95%", label: "of the ocean is still unexplored" }, { value: "3.7 km", label: "is its average depth" }] }] },
      ],
    },
  },
  {
    id: "timeline-poster",
    name: "Timeline poster",
    description: "A tall infographic of key moments",
    group: "poster",
    format: "infographic",
    theme: "retro",
    tags: ["history", "infographic"],
    spec: {
      title: "Timeline poster",
      pages: [
        {
          blocks: [
            { type: "title", kicker: "History", text: "The race to space" },
            { type: "timeline", items: [{ label: "1957", text: "Sputnik 1 orbits Earth" }, { label: "1961", text: "Yuri Gagarin is the first human in space" }, { label: "1969", text: "Apollo 11 lands on the Moon" }, { label: "1998", text: "The International Space Station begins" }, { label: "2021", text: "A helicopter flies on Mars" }] },
          ],
        },
      ],
    },
  },
  {
    id: "class-poster",
    name: "Class poster",
    description: "Rules, reminders or a big idea for the wall",
    group: "poster",
    format: "poster",
    theme: "chalkboard",
    tags: ["poster", "classroom", "print"],
    spec: {
      title: "Class poster",
      pages: [
        {
          blocks: [
            { type: "title", text: "Growth mindset", subtitle: "Mistakes help your brain grow" },
            { type: "bullets", items: ["I can't do it… yet", "Mistakes help me learn", "I ask for help when I'm stuck", "I try a new strategy"] },
            { type: "callout", tone: "tip", text: "Effort + strategy + help = progress" },
          ],
        },
      ],
    },
  },
  {
    id: "thumbnail",
    name: "Lesson thumbnail",
    description: "A punchy cover for a video or lesson",
    group: "social",
    format: "thumbnail",
    theme: "pop",
    tags: ["cover", "video", "youtube"],
    spec: { title: "Lesson thumbnail", pages: [{ blocks: [{ type: "title", kicker: "In 5 minutes", text: "Fractions made easy" }, { type: "image", alt: "Your picture" }] }] },
  },
]

export function designTemplate(id: string): DesignTemplate | null {
  return DESIGN_TEMPLATES.find((template) => template.id === id) ?? null
}

export interface TemplateDesignOptions {
  measure?: MeasureText
  /** Override the template's theme or format. */
  theme?: string
  format?: DesignFormatId
  name?: string
  pageIdPrefix?: string
}

/** A new design laid out from a template. */
export function designFromTemplate(template: DesignTemplate, options: TemplateDesignOptions = {}): DesignDoc {
  return designFromSpec(template.spec, {
    format: options.format ?? template.format,
    theme: options.theme ?? template.theme,
    name: options.name ?? template.name,
    measure: options.measure,
    pageIdPrefix: options.pageIdPrefix,
  })
}
