// LEARN: LG-01 module-augmentation | TypeScript merges declarations of the same interface across files, so importing MUI's augmentation re-opens its Theme interface and adds colorSchemes and a fully typed theme.vars; plain JavaScript has no equivalent because nothing there describes types
import type {} from '@mui/material/themeCssVarsAugmentation'
