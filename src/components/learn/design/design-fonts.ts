import { Anton, Bebas_Neue, Caveat, DM_Serif_Display, Lora, Nunito, Pacifico, Playfair_Display, Poppins, Space_Grotesk } from "next/font/google"

/**
 * Loads the design editor's typefaces (ids and CSS variables are listed in
 * `lib/design/fonts.ts`). next/font self-hosts the files, so a design never
 * makes a third-party request, and `preload: false` means a face is only
 * downloaded once something on screen actually uses it.
 */

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-design-poppins", display: "swap", preload: false })
const nunito = Nunito({ subsets: ["latin"], variable: "--font-design-nunito", display: "swap", preload: false })
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-design-space", display: "swap", preload: false })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-design-playfair", display: "swap", preload: false })
const lora = Lora({ subsets: ["latin"], variable: "--font-design-lora", display: "swap", preload: false })
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-design-dm-serif", display: "swap", preload: false })
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-design-bebas", display: "swap", preload: false })
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-design-anton", display: "swap", preload: false })
const caveat = Caveat({ subsets: ["latin"], variable: "--font-design-caveat", display: "swap", preload: false })
const pacifico = Pacifico({ subsets: ["latin"], weight: "400", variable: "--font-design-pacifico", display: "swap", preload: false })

/** Put on any element that renders a design: it defines every `--font-design-*` variable. */
export const designFontVariables = [poppins, nunito, space, playfair, lora, dmSerif, bebas, anton, caveat, pacifico]
  .map((font) => font.variable)
  .join(" ")
