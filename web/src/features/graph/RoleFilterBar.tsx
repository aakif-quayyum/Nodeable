import FilterAlt from '@mui/icons-material/FilterAlt'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { creditRoles, creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'

/** How the filter reads: "showing Producer, Songwriter" when few roles are on, "hiding Mixing" when few are off. */
function describeFilter(active: ReadonlySet<CreditRoleKey>): { verb: 'showing' | 'hiding'; roles: string[] } {
  const on = creditRoles.filter((role) => active.has(role)).map((role) => creditRoleStyles[role].label)
  const off = creditRoles.filter((role) => !active.has(role)).map((role) => creditRoleStyles[role].label)
  return on.length <= off.length || on.length <= 3 ? { verb: 'showing', roles: on } : { verb: 'hiding', roles: off }
}

/**
 * The role filter, said out loud (FR-HUB-03): while any role is off, a bar under the headline names what is filtered,
 * says that the counts, the connectors and the cards follow it, and puts "Show all roles" one click away. The legend
 * chips on the stage carry the filter too, but a state that changes every number on the page should not be only a
 * struck-through chip at the bottom of the stage.
 */
export function RoleFilterBar({ active, onReset }: { active: ReadonlySet<CreditRoleKey>; onReset: () => void }) {
  if (active.size >= creditRoles.length) return null
  const { verb, roles } = describeFilter(active)

  return (
    <Box
      role="status"
      sx={(theme) => ({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px 12px',
        px: 1.5,
        py: 0.75,
        borderRadius: '10px',
        border: `1px solid ${theme.vars.palette.secondary.main}`,
        backgroundColor: `color-mix(in srgb, ${theme.vars.palette.secondary.main} 12%, transparent)`,
        fontSize: 14,
      })}
    >
      <FilterAlt fontSize="small" aria-hidden="true" />
      <Box component="span" sx={{ fontWeight: 800 }}>
        Filtered by role
      </Box>
      <Box component="span">
        {verb} {roles.length === 0 ? 'no roles' : roles.join(', ')}
      </Box>
      <Box component="span" sx={{ color: 'text.secondary' }}>
        · the counts, connectors and cards below only count these credits
      </Box>
      <Button size="small" variant="outlined" onClick={onReset} sx={{ ml: { sm: 'auto' }, py: 0 }}>
        Show all roles
      </Button>
    </Box>
  )
}
