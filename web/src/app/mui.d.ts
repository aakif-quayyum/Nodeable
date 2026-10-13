// LEARN: LG-01 module-augmentation | TypeScript merges declarations of the same interface across files, so importing MUI's augmentation re-opens its Theme interface and adds colorSchemes and a fully typed theme.vars; plain JavaScript has no equivalent because nothing there describes types
import type {} from '@mui/material/themeCssVarsAugmentation'
import type { CSSProperties } from 'react'

// The refresh adds two typography variants and four palette colours that MUI does not know. Declaring them here makes
// `<Typography variant="display">` and `theme.vars.palette.lineStrong` type-check, and a typo is a compile error.
declare module '@mui/material/styles' {
  interface TypographyVariants {
    display: CSSProperties
    kicker: CSSProperties
  }

  interface TypographyVariantsOptions {
    display?: CSSProperties
    kicker?: CSSProperties
  }

  interface Palette {
    /** A raised surface inside a panel. */
    raised: string
    /** The edge of a control: 3:1 against the page. */
    lineStrong: string
    /** Text on a filled light surface. */
    ink: string
    /** The record's black. */
    vinyl: string
  }

  interface PaletteOptions {
    raised?: string
    lineStrong?: string
    ink?: string
    vinyl?: string
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    display: true
    kicker: true
  }
}
