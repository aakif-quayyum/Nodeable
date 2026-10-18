import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import HelpOutlined from '@mui/icons-material/HelpOutlined'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { SloStatus } from './statusModel.ts'

const percent = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

function share(value: number) {
  return `${percent.format(value * 100)}%`
}

/**
 * The five objectives of spec section 11 with their latest daily check. The state is a word and an icon as well as a
 * colour (NFR-A11Y-02), and "not measured yet" is its own state: no data is neither a pass nor a breach.
 */
export function SloStrip({ slos }: { slos: SloStatus[] }) {
  return (
    <Box component="ul" aria-label="Service level objectives" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 1, m: 0, p: 0 }}>
      {slos.map((slo) => {
        const state = slo.observed === null ? 'unmeasured' : slo.breached ? 'breached' : 'met'
        return (
          <Box
            key={slo.slo}
            component="li"
            sx={(theme) => ({ listStyle: 'none', p: 1.5, border: `1px solid ${theme.vars.palette.lineStrong}`, borderRadius: 1 })}
          >
            <Typography color="text.secondary" sx={{ fontSize: 12.5 }}>
              {slo.label}
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 600 }}>{slo.observed === null ? 'not measured yet' : share(slo.observed)}</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 12.5 }}>
              {slo.atLeast ? 'target at least ' : 'limit under '}
              {share(slo.target)}
            </Typography>
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 13, mt: 0.5 }}>
              {state === 'breached' && <ErrorOutlined fontSize="small" color="error" />}
              {state === 'met' && <CheckCircleOutlined fontSize="small" color="success" />}
              {state === 'unmeasured' && <HelpOutlined fontSize="small" />}
              {state === 'breached' ? 'Breached' : state === 'met' ? 'Met' : 'Checked daily at 03:17 UTC'}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}
