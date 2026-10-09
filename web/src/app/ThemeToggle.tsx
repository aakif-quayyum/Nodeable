import DarkMode from '@mui/icons-material/DarkMode'
import LightMode from '@mui/icons-material/LightMode'
import IconButton from '@mui/material/IconButton'
import { useColorScheme } from '@mui/material/styles'

export function ThemeToggle() {
  const { colorScheme, setMode } = useColorScheme()

  // colorScheme is undefined until MUI has read the saved mode on the first render.
  if (!colorScheme) {
    return null
  }

  const switchTo = colorScheme === 'dark' ? 'light' : 'dark'

  return (
    // An icon-only button has no visible text, so the label is what a screen reader announces.
    <IconButton color="inherit" aria-label={`Switch to ${switchTo} theme`} onClick={() => setMode(switchTo)}>
      {colorScheme === 'dark' ? <LightMode /> : <DarkMode />}
    </IconButton>
  )
}
