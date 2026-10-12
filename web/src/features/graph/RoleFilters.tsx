import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { creditRoles, creditRoleStyles } from '../../app/creditRoles.ts'
import { useRoleFilters } from '../../stores/roleFilters.ts'

/**
 * One chip per role, which doubles as the colour legend (FR-HUB-03). A chip that is on is filled and has the role's
 * colour; one that is off is only an outline, and `aria-pressed` says which, so the state is not carried by colour
 * alone (NFR-A11Y-02).
 */
export function RoleFilters() {
  const active = useRoleFilters((state) => state.active)
  const toggle = useRoleFilters((state) => state.toggle)
  const reset = useRoleFilters((state) => state.reset)
  const someOff = active.size < creditRoles.length

  return (
    <Box component="section" aria-labelledby="filters-heading">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h3" id="filters-heading" sx={{ fontSize: '1rem', fontWeight: 600 }}>
          Roles
        </Typography>
        {someOff && (
          <Button size="small" onClick={reset}>
            Show all
          </Button>
        )}
      </Box>

      <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, listStyle: 'none', m: 0, p: 0 }}>
        {creditRoles.map((role) => {
          const { Icon, label, colors } = creditRoleStyles[role]
          const on = active.has(role)
          return (
            <li key={role}>
              <Chip
                clickable
                size="small"
                role="button"
                aria-pressed={on}
                variant={on ? 'filled' : 'outlined'}
                icon={<Icon />}
                label={label}
                onClick={() => toggle(role)}
                sx={(theme) => ({
                  opacity: on ? 1 : 0.6,
                  textDecoration: on ? 'none' : 'line-through',
                  borderColor: colors.dark,
                  bgcolor: on ? 'action.selected' : 'transparent',
                  '& .MuiChip-icon': { color: colors.dark },
                  ...theme.applyStyles('light', { borderColor: colors.light, '& .MuiChip-icon': { color: colors.light } }),
                })}
              />
            </li>
          )
        })}
      </Box>
    </Box>
  )
}
