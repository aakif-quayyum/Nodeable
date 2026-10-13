import Box from '@mui/material/Box'
import { creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'

/**
 * A small square in a role's colour. It is decoration: the role's name is always written next to it, so colour never
 * carries the role alone (NFR-A11Y-02). The colour is the dark value, or the light value when the light scheme is on.
 */
export function RoleSwatch({ role, width = 8, height = 8 }: { role: CreditRoleKey; width?: number | string; height?: number | string }) {
  const { colors } = creditRoleStyles[role]

  return (
    <Box
      component="i"
      aria-hidden="true"
      sx={(theme) => ({
        display: 'inline-block',
        flex: 'none',
        width,
        height,
        borderRadius: '2px',
        backgroundColor: colors.dark,
        ...theme.applyStyles('light', { backgroundColor: colors.light }),
      })}
    />
  )
}
