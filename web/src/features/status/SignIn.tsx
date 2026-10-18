import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

interface SignInProps {
  /** Why the last attempt did not open the page, if it did not. */
  problem: 'rejected' | null
  onSubmit: (password: string) => void
}

/**
 * The operator's sign-in (decision 0023). The page itself holds no data: the password is sent as HTTP Basic with each
 * request for the numbers, and is kept in memory only, so a reload asks again and nothing is left in the browser's storage.
 */
export function SignIn({ problem, onSubmit }: SignInProps) {
  const [password, setPassword] = useState('')

  return (
    <Box
      component="form"
      aria-labelledby="status-sign-in"
      onSubmit={(event) => {
        event.preventDefault()
        if (password !== '') onSubmit(password)
      }}
      sx={{ display: 'grid', gap: 2, maxWidth: 420 }}
    >
      <Typography id="status-sign-in" variant="h2" sx={{ fontSize: 22 }}>
        Operator sign-in
      </Typography>
      <Typography color="text.secondary" sx={{ fontSize: 14 }}>
        These numbers are for the person who runs Nodeable. The password is kept in this tab only and is asked for again after a reload.
      </Typography>

      {problem === 'rejected' && <Alert severity="error">That password was not accepted.</Alert>}

      <TextField
        label="Operator password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="off"
        required
      />
      <Button type="submit" variant="contained" disabled={password === ''}>
        Open status
      </Button>
    </Box>
  )
}
