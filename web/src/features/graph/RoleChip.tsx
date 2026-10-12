import Chip from '@mui/material/Chip'
import { creditRoleStyles, roleText } from '../../app/creditRoles.ts'
import type { GraphCredit } from './graphEvents.ts'

/**
 * A role shown as a small outlined chip: the role's icon and colour, and its name in the text colour. Colour is
 * never the only signal (NFR-A11Y-02): the icon and the words say it too.
 */
export function RoleChip({ role, detail = '', prefix }: { role: GraphCredit['role']; detail?: string; prefix?: string }) {
  const { Icon, colors } = creditRoleStyles[role]
  const text = roleText(role, detail)

  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<Icon />}
      label={prefix ? `${prefix} — ${text}` : text}
      sx={(theme) => ({
        // A long credit wraps inside the chip instead of running off a phone's screen.
        height: 'auto',
        maxWidth: '100%',
        '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 },
        // applyStyles runs the block only for that colour scheme, whichever way the scheme is selected.
        borderColor: colors.dark,
        '& .MuiChip-icon': { color: colors.dark },
        ...theme.applyStyles('light', {
          borderColor: colors.light,
          '& .MuiChip-icon': { color: colors.light },
        }),
      })}
    />
  )
}
